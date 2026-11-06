// robot_blackfly: Blackfly S(BFS-U3-50S5C) 용접 중 촬영 프로그램 (robot_core 와 별도로 실행, 과제용)
// HTTP(기본 127.0.0.1:8003)
//   GET  /blackfly/status
//   POST /blackfly/start  {"run_id","part","job_name"}  아크 ON 때 화면이 호출 -> 촬영 시작
//   POST /blackfly/stop                                   아크 OFF 때 화면이 호출 -> 촬영 정지
//   POST /blackfly/snap   {"note"}                        시험 촬영 1장 (노출 맞출 때)
//   POST /blackfly/config {"exposure_us","gain_db","fps","scale","jpeg_quality"}  실행 중 값 변경(저장 안 됨)
// 설정: 실행 인자 1 = config.ini 경로 (없으면 실행 파일 옆 config.ini). [blackfly] 섹션, 없으면 기본값.
// 저장: <data_dir>/YYYYMMDD/bf_<run_id>/HHMMSS_mmm_<part>.jpg + frames.csv. DB 는 쓰지 않음.
// 남은 용량이 min_free_mb 아래면 저장하지 않음. 정지 신호가 안 와도 max_record_sec 지나면 스스로 멈춤.
#include <httplib.h>
#include <nlohmann/json.hpp>
#include <Spinnaker.h>
#include <SpinGenApi/SpinnakerGenApi.h>

#include <algorithm>
#include <atomic>
#include <cctype>
#include <chrono>
#include <condition_variable>
#include <cstdlib>
#include <ctime>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <map>
#include <mutex>
#include <sstream>
#include <string>
#include <thread>

using json = nlohmann::json;
namespace fs = std::filesystem;
using namespace Spinnaker;
using namespace Spinnaker::GenApi;

static const char *BLACKFLY_APP_VERSION = "1.1.288";
using Clock = std::chrono::steady_clock;

struct Settings {
    std::string httpHost = "127.0.0.1", dataDir, serial;
    int httpPort = 8003, scale = 2, jpegQuality = 85, minFreeMb = 2048, maxRecordSec = 900;
    double exposureUs = 1000, gainDb = 0, fps = 1.0;
};

static std::mutex gLogMx;
static std::ofstream gLogFile;

static std::string fmtNow(const char *fmt, bool withMs = false) {
    auto tp = std::chrono::system_clock::now();
    std::time_t t = std::chrono::system_clock::to_time_t(tp);
    std::tm tm{};
#ifdef _WIN32
    localtime_s(&tm, &t);
#else
    localtime_r(&t, &tm);
#endif
    std::ostringstream os;
    os << std::put_time(&tm, fmt);
    if (withMs) os << "_" << std::setw(3) << std::setfill('0')
                   << (std::chrono::duration_cast<std::chrono::milliseconds>(tp.time_since_epoch()).count() % 1000);
    return os.str();
}

static void logLine(const std::string &msg) {
    std::lock_guard<std::mutex> lk(gLogMx);
    std::string line = fmtNow("%Y-%m-%d %H:%M:%S") + " " + msg;
    std::cout << line << std::endl;
    if (gLogFile.is_open()) gLogFile << line << std::endl;
}

static std::string trim(const std::string &s) {
    size_t a = s.find_first_not_of(" \t\r\n"), b = s.find_last_not_of(" \t\r\n");
    return a == std::string::npos ? "" : s.substr(a, b - a + 1);
}

// 파일 이름에 쓸 수 있는 글자만 남김
static std::string safeName(const std::string &s) {
    std::string o;
    for (char c : s) o += (std::isalnum((unsigned char)c) || c == '-' || c == '_') ? c : '_';
    return o.empty() ? "x" : o.substr(0, 40);
}

static Settings loadSettings(const fs::path &iniPath) {
    Settings s;
    std::map<std::string, std::string> kv;
    std::ifstream in(iniPath);
    std::string line, sec;
    while (std::getline(in, line)) {
        line = trim(line);
        if (line.empty() || line[0] == '#' || line[0] == ';') continue;
        if (line.front() == '[' && line.back() == ']') { sec = trim(line.substr(1, line.size() - 2)); continue; }
        size_t eq = line.find('=');
        if (eq != std::string::npos) kv[sec + "." + trim(line.substr(0, eq))] = trim(line.substr(eq + 1));
    }
    auto get = [&](const char *k) -> const std::string * { auto it = kv.find(std::string("blackfly.") + k); return it != kv.end() && !it->second.empty() ? &it->second : nullptr; };
    if (auto v = get("http_host")) s.httpHost = *v;
    if (auto v = get("http_port")) s.httpPort = std::atoi(v->c_str());
    if (auto v = get("data_dir")) s.dataDir = *v;
    if (auto v = get("serial")) s.serial = *v;
    if (auto v = get("exposure_us")) s.exposureUs = std::atof(v->c_str());
    if (auto v = get("gain_db")) s.gainDb = std::atof(v->c_str());
    if (auto v = get("fps")) s.fps = std::atof(v->c_str());
    if (auto v = get("scale")) s.scale = std::atoi(v->c_str());
    if (auto v = get("jpeg_quality")) s.jpegQuality = std::atoi(v->c_str());
    if (auto v = get("min_free_mb")) s.minFreeMb = std::atoi(v->c_str());
    if (auto v = get("max_record_sec")) s.maxRecordSec = std::atoi(v->c_str());
    if (s.dataDir.empty()) {
#ifdef _WIN32
        const char *pub = std::getenv("PUBLIC");
        s.dataDir = std::string(pub ? pub : "C:\\Users\\Public") + "\\Documents\\RobotCamera";
#else
        const char *home = std::getenv("HOME");
        s.dataDir = home ? std::string(home) + "/vot/camera-data" : "camera-data";
#endif
    }
    return s;
}

// ---------------- GenICam 노드 설정 (없거나 못 쓰면 건너뜀) ----------------
static bool setEnum(INodeMap &nm, const char *name, const char *entry) {
    CEnumerationPtr p = nm.GetNode(name);
    if (!IsAvailable(p) || !IsWritable(p)) return false;
    CEnumEntryPtr e = p->GetEntryByName(entry);
    if (!IsAvailable(e) || !IsReadable(e)) return false;
    p->SetIntValue(e->GetValue());
    return true;
}
static bool setFloat(INodeMap &nm, const char *name, double v) {
    CFloatPtr p = nm.GetNode(name);
    if (!IsAvailable(p) || !IsWritable(p)) return false;
    p->SetValue(std::min(p->GetMax(), std::max(p->GetMin(), v)));
    return true;
}
static bool setBool(INodeMap &nm, const char *name, bool v) {
    CBooleanPtr p = nm.GetNode(name);
    if (!IsAvailable(p) || !IsWritable(p)) return false;
    p->SetValue(v);
    return true;
}
static std::string getStr(INodeMap &nm, const char *name) {
    CValuePtr p = nm.GetNode(name);
    return IsAvailable(p) && IsReadable(p) ? std::string(p->ToString().c_str()) : std::string();
}

// ---------------- 카메라 (모든 카메라 호출은 worker 스레드에서만) ----------------
class Blackfly {
public:
    explicit Blackfly(Settings s) : s_(std::move(s)) { proc_.SetColorProcessing(SPINNAKER_COLOR_PROCESSING_ALGORITHM_HQ_LINEAR); }

    void startRec(const std::string &runId, const std::string &part, const std::string &jobName) {
        std::lock_guard<std::mutex> lk(mx_);
        std::string rid = safeName(runId.empty() ? fmtNow("%Y%m%d_%H%M%S") : runId);
        if (rid != runId_) {
            runId_ = rid;
            runDir_ = (fs::path(s_.dataDir) / fmtNow("%Y%m%d") / ("bf_" + rid)).string();
            runFrames_ = 0;
            std::error_code ec;
            fs::create_directories(runDir_, ec);
            std::ofstream(fs::path(runDir_) / "run.json") << json{{"run_id", rid}, {"job_name", jobName}, {"started_at", fmtNow("%Y-%m-%d %H:%M:%S")}}.dump(2);
            logLine("[RUN] 새 용접 " + rid + " -> " + runDir_);
        }
        part_ = safeName(part);
        recording_ = true;
        recStart_ = Clock::now();
        logLine("[REC] 시작 " + rid + " " + part_);
    }
    void stopRec(const std::string &why) {
        std::lock_guard<std::mutex> lk(mx_);
        if (recording_) logLine("[REC] 정지 (" + why + ") 이 용접 누적 " + std::to_string(runFrames_) + "장");
        recording_ = false;
    }
    json snap(const std::string &note) {
        std::unique_lock<std::mutex> lk(mx_);
        snapNote_ = note;
        snapResult_ = nullptr;
        snapPending_ = true;
        if (!snapCv_.wait_for(lk, std::chrono::seconds(10), [&] { return !snapPending_; }))
            return {{"ok", false}, {"error", "10초 안에 사진을 받지 못했습니다"}};
        return snapResult_;
    }
    json applyConfig(const json &b) {
        std::lock_guard<std::mutex> lk(mx_);
        if (b.contains("exposure_us") && b["exposure_us"].is_number()) s_.exposureUs = b["exposure_us"].get<double>();
        if (b.contains("gain_db") && b["gain_db"].is_number()) s_.gainDb = b["gain_db"].get<double>();
        if (b.contains("fps") && b["fps"].is_number()) s_.fps = std::max(0.2, std::min(10.0, b["fps"].get<double>()));
        if (b.contains("scale") && b["scale"].is_number()) s_.scale = std::max(1, std::min(4, b["scale"].get<int>()));
        if (b.contains("jpeg_quality") && b["jpeg_quality"].is_number()) s_.jpegQuality = std::max(30, std::min(100, b["jpeg_quality"].get<int>()));
        configDirty_ = true;
        logLine("[CONFIG] 노출 " + std::to_string(s_.exposureUs) + "us 게인 " + std::to_string(s_.gainDb) + "dB fps " + std::to_string(s_.fps));
        return settingsJson();
    }
    json status() {
        std::lock_guard<std::mutex> lk(mx_);
        std::error_code ec;
        auto sp = fs::space(s_.dataDir, ec);
        return {{"ok", true}, {"version", BLACKFLY_APP_VERSION}, {"connected", connected_}, {"model", model_}, {"serial", serial_},
                {"firmware", firmware_}, {"recording", recording_}, {"acquiring", acquiring_}, {"run_id", runId_}, {"part", part_},
                {"run_frames", runFrames_}, {"last_saved", lastSaved_}, {"disk_free_mb", ec ? -1 : (long long)(sp.available / (1024 * 1024))},
                {"disk_low", diskLow_}, {"last_error", lastError_}, {"settings", settingsJson()}};
    }

    // worker 스레드 반복 호출
    void loop(const std::atomic<bool> &running) {
        auto lastTry = Clock::now() - std::chrono::seconds(10);
        while (running) {
            try {
                if (!cam_) {
                    if (Clock::now() - lastTry < std::chrono::seconds(3)) { std::this_thread::sleep_for(std::chrono::milliseconds(200)); failSnapIfPending("카메라가 연결되어 있지 않습니다"); continue; }
                    lastTry = Clock::now();
                    connect();
                    if (!cam_) { failSnapIfPending("카메라가 연결되어 있지 않습니다"); continue; }
                }
                bool rec, snapReq, dirty;
                {
                    std::lock_guard<std::mutex> lk(mx_);
                    if (recording_ && Clock::now() - recStart_ > std::chrono::seconds(s_.maxRecordSec)) {
                        recording_ = false;
                        logLine("[REC] 정지 신호 없이 " + std::to_string(s_.maxRecordSec) + "초가 지나 스스로 멈춤");
                    }
                    rec = recording_; snapReq = snapPending_; dirty = configDirty_; configDirty_ = false;
                }
                if (dirty) applyCamera();
                if ((rec || snapReq) && !acquiring_) { cam_->BeginAcquisition(); setAcq(true); }
                if (!rec && !snapReq) {
                    if (acquiring_) { cam_->EndAcquisition(); setAcq(false); }
                    std::this_thread::sleep_for(std::chrono::milliseconds(100));
                    continue;
                }
                ImagePtr img = cam_->GetNextImage(3000);
                if (img->IsIncomplete()) { img->Release(); continue; }
                handleImage(img, rec, snapReq);
                img->Release();
            } catch (const Spinnaker::Exception &e) {
                if (e == SPINNAKER_ERR_TIMEOUT) { setError("3초 안에 사진이 오지 않음 (노출·초당 장수 확인)"); continue; }
                setError(std::string("카메라 오류: ") + e.what());
                drop();
            } catch (const std::exception &e) {
                setError(std::string("오류: ") + e.what());
            }
        }
        drop();
        if (sys_) { sys_->ReleaseInstance(); }
    }

private:
    json settingsJson() const {
        return {{"exposure_us", s_.exposureUs}, {"gain_db", s_.gainDb}, {"fps", s_.fps}, {"scale", s_.scale},
                {"jpeg_quality", s_.jpegQuality}, {"min_free_mb", s_.minFreeMb}, {"max_record_sec", s_.maxRecordSec}};
    }
    void setError(const std::string &m) {
        std::lock_guard<std::mutex> lk(mx_);
        if (m != lastError_) logLine("[CAM] " + m);
        lastError_ = m;
    }
    void setAcq(bool v) { std::lock_guard<std::mutex> lk(mx_); acquiring_ = v; }
    void failSnapIfPending(const std::string &err) {
        std::lock_guard<std::mutex> lk(mx_);
        if (!snapPending_) return;
        snapResult_ = {{"ok", false}, {"error", err}};
        snapPending_ = false;
        snapCv_.notify_all();
    }

    void connect() {
        if (!sys_) sys_ = System::GetInstance();
        CameraList list = sys_->GetCameras();
        CameraPtr found;
        for (unsigned i = 0; i < list.GetSize() && !found; i++) {
            CameraPtr c = list.GetByIndex(i);
            std::string sn = getStr(c->GetTLDeviceNodeMap(), "DeviceSerialNumber");
            if (s_.serial.empty() || s_.serial == sn) found = c;
        }
        list.Clear();
        if (!found) { setError("카메라 없음"); return; }
        found->Init();
        cam_ = found;
        INodeMap &tl = cam_->GetTLDeviceNodeMap();
        {
            std::lock_guard<std::mutex> lk(mx_);
            model_ = getStr(tl, "DeviceModelName");
            serial_ = getStr(tl, "DeviceSerialNumber");
            firmware_ = getStr(cam_->GetNodeMap(), "DeviceFirmwareVersion");
            connected_ = true;
            lastError_.clear();
        }
        logLine("[CAM] 연결: " + model_ + " SN " + serial_ + " FW " + firmware_ + " 속도 " + getStr(tl, "DeviceCurrentSpeed"));
        INodeMap &nm = cam_->GetNodeMap();
        setEnum(nm, "AcquisitionMode", "Continuous");
        setEnum(nm, "PixelFormat", "BayerRG8");
        setEnum(cam_->GetTLStreamNodeMap(), "StreamBufferHandlingMode", "NewestOnly");
        applyCamera();
    }
    // 노출·게인 고정(아크 빛 때문에 자동 노출 안 씀), 초당 장수 제한
    void applyCamera() {
        Settings s;
        { std::lock_guard<std::mutex> lk(mx_); s = s_; }
        INodeMap &nm = cam_->GetNodeMap();
        setEnum(nm, "ExposureAuto", "Off");
        setEnum(nm, "ExposureMode", "Timed");
        setFloat(nm, "ExposureTime", s.exposureUs);
        setEnum(nm, "GainAuto", "Off");
        setFloat(nm, "Gain", s.gainDb);
        setBool(nm, "AcquisitionFrameRateEnable", true);
        setFloat(nm, "AcquisitionFrameRate", s.fps);
    }
    void drop() {
        try { if (cam_ && acquiring_) cam_->EndAcquisition(); } catch (...) {}
        try { if (cam_) cam_->DeInit(); } catch (...) {}
        cam_ = nullptr;
        std::lock_guard<std::mutex> lk(mx_);
        if (connected_) logLine("[CAM] 연결 해제");
        connected_ = false;
        acquiring_ = false;
    }

    // 컬러 변환 -> (scale 만큼 축소) -> JPG 저장
    void handleImage(const ImagePtr &raw, bool rec, bool snapReq) {
        Settings s;
        std::string runDir, part, note;
        { std::lock_guard<std::mutex> lk(mx_); s = s_; runDir = runDir_; part = part_; note = snapNote_; }
        std::error_code ec;
        auto sp = fs::space(s.dataDir, ec);
        bool low = !ec && sp.available < (uintmax_t)s.minFreeMb * 1024 * 1024;
        {
            std::lock_guard<std::mutex> lk(mx_);
            if (low && !diskLow_) logLine("[DISK] 남은 용량 " + std::to_string(sp.available / (1024 * 1024)) + "MB, 저장 중지");
            diskLow_ = low;
        }
        if (low) {
            if (snapReq) failSnapIfPending("저장 공간 부족");
            return;
        }
        ImagePtr bgr = proc_.Convert(raw, PixelFormat_BGR8);
        ImagePtr out = s.scale > 1 ? ImageUtility::CreateScaled(bgr, SPINNAKER_IMAGE_SCALING_ALGORITHM_NEAREST_NEIGHBOR, 1.0 / s.scale) : bgr;
        JPEGOption opt;
        opt.quality = (unsigned)s.jpegQuality;
        std::string stamp = fmtNow("%H%M%S", true);
        if (snapReq) {
            fs::path dir = fs::path(s.dataDir) / fmtNow("%Y%m%d");
            fs::create_directories(dir, ec);
            std::string path = (dir / ("bf_test_" + stamp + ".jpg")).string();
            out->Save(path.c_str(), opt);
            std::lock_guard<std::mutex> lk(mx_);
            snapResult_ = {{"ok", true}, {"path", path}, {"width", out->GetWidth()}, {"height", out->GetHeight()},
                           {"exposure_us", s.exposureUs}, {"gain_db", s.gainDb}, {"note", note}};
            snapPending_ = false;
            snapCv_.notify_all();
            logLine("[SNAP] " + path);
        }
        if (rec && !runDir.empty()) {
            std::string file = stamp + "_" + part + ".jpg";
            out->Save((fs::path(runDir) / file).string().c_str(), opt);
            std::ofstream(fs::path(runDir) / "frames.csv", std::ios::app)
                << file << "," << fmtNow("%Y-%m-%d %H:%M:%S", true) << "," << part << "," << raw->GetFrameID() << "," << s.exposureUs << "," << s.gainDb << "\n";
            std::lock_guard<std::mutex> lk(mx_);
            runFrames_++;
            lastSaved_ = file;
        }
    }

    Settings s_;
    SystemPtr sys_;
    CameraPtr cam_;
    ImageProcessor proc_;
    std::mutex mx_;
    std::condition_variable snapCv_;
    bool connected_ = false, acquiring_ = false, recording_ = false, snapPending_ = false, configDirty_ = false, diskLow_ = false;
    std::string model_, serial_, firmware_, lastError_, runId_, runDir_, part_, lastSaved_, snapNote_;
    long long runFrames_ = 0;
    json snapResult_;
    Clock::time_point recStart_;
};

int main(int argc, char **argv) {
    fs::path exeDir = fs::absolute(argv[0]).parent_path();
    fs::path iniPath = argc > 1 ? fs::path(argv[1]) : exeDir / "config.ini";
    Settings s = loadSettings(iniPath);
    std::error_code ec;
    fs::create_directories(s.dataDir, ec);
    gLogFile.open(fs::path(s.dataDir) / "robot_blackfly.log", std::ios::app);
    logLine(std::string("[START] robot_blackfly ") + BLACKFLY_APP_VERSION + " config=" + iniPath.string() + " data=" + s.dataDir);

    Blackfly cam(s);
    std::atomic<bool> running{true};
    std::thread worker([&] { cam.loop(running); });

    httplib::Server svr;
    svr.set_default_headers({{"Access-Control-Allow-Origin", "*"},
                             {"Access-Control-Allow-Headers", "Content-Type, Authorization"},
                             {"Access-Control-Allow-Methods", "GET, POST, OPTIONS"}});
    svr.Options(".*", [](const httplib::Request &, httplib::Response &res) { res.status = 204; });
    auto sendJson = [](httplib::Response &res, const json &j, int status = 200) {
        res.status = status;
        res.set_content(j.dump(), "application/json; charset=utf-8");
    };
    auto body = [](const httplib::Request &req) {
        json b = req.body.empty() ? json::object() : json::parse(req.body, nullptr, false);
        return b.is_object() ? b : json::object();
    };

    svr.Get("/blackfly/status", [&](const httplib::Request &, httplib::Response &res) { sendJson(res, cam.status()); });
    svr.Post("/blackfly/start", [&](const httplib::Request &req, httplib::Response &res) {
        json b = body(req);
        cam.startRec(b.value("run_id", ""), b.value("part", "part"), b.value("job_name", ""));
        sendJson(res, {{"ok", true}});
    });
    svr.Post("/blackfly/stop", [&](const httplib::Request &, httplib::Response &res) {
        cam.stopRec("화면 요청");
        sendJson(res, {{"ok", true}});
    });
    svr.Post("/blackfly/snap", [&](const httplib::Request &req, httplib::Response &res) {
        json r = cam.snap(body(req).value("note", ""));
        sendJson(res, r, r.value("ok", false) ? 200 : 503);
    });
    svr.Post("/blackfly/config", [&](const httplib::Request &req, httplib::Response &res) {
        sendJson(res, {{"ok", true}, {"settings", cam.applyConfig(body(req))}});
    });

    logLine("[HTTP] " + s.httpHost + ":" + std::to_string(s.httpPort));
    if (!svr.listen(s.httpHost.c_str(), s.httpPort)) logLine("[HTTP] 포트를 열지 못했습니다 (이미 실행 중인지 확인)");
    running = false;
    worker.join();
    return 1;
}
