// robot_camera: Orbbec Gemini 435Le 촬영 프로그램 (robot_core 와 별도로 실행)
// HTTP(기본 127.0.0.1:8002) GET /camera/status, POST /camera/capture,
//      GET /camera/captures?limit=N, GET /camera/file?id=N&kind=color|depth|meta
// 설정: 실행 인자 1 = config.ini 경로 (없으면 실행 파일 옆 config.ini). [database] 는 robot_core 와 같이 씀.
#include <httplib.h>
#include <nlohmann/json.hpp>
#include <mysql.h>
#include <libobsensor/ObSensor.hpp>

#include <algorithm>
#include <atomic>
#include <chrono>
#include <cmath>
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
#include <vector>

using json = nlohmann::json;
namespace fs = std::filesystem;

static const char *CAMERA_APP_VERSION = "1.1.282";

struct Settings {
    std::string dbHost = "localhost", dbUser = "root", dbPass, dbName = "robot_welding";
    int dbPort = 3306;
    std::string camIp = "192.168.1.10";
    int camPort = 8090;
    std::string httpHost = "127.0.0.1";
    int httpPort = 8002;
    std::string dataDir;
    int depthW = 1280, depthH = 800, colorW = 1280, colorH = 800, fps = 10, warmup = 5;
};

static std::mutex gLogMx;
static std::ofstream gLogFile;

static std::tm localNow(std::chrono::system_clock::time_point tp, int *ms = nullptr) {
    std::time_t t = std::chrono::system_clock::to_time_t(tp);
    std::tm tm{};
#ifdef _WIN32
    localtime_s(&tm, &t);
#else
    localtime_r(&t, &tm);
#endif
    if (ms) *ms = (int)(std::chrono::duration_cast<std::chrono::milliseconds>(tp.time_since_epoch()).count() % 1000);
    return tm;
}

static std::string fmtTime(std::chrono::system_clock::time_point tp, const char *fmt) {
    std::tm tm = localNow(tp);
    std::ostringstream os;
    os << std::put_time(&tm, fmt);
    return os.str();
}

static void logLine(const std::string &msg) {
    std::lock_guard<std::mutex> lk(gLogMx);
    std::string line = fmtTime(std::chrono::system_clock::now(), "%Y-%m-%d %H:%M:%S") + " " + msg;
    std::cout << line << std::endl;
    if (gLogFile.is_open()) gLogFile << line << std::endl;
}

static std::string trim(const std::string &s) {
    size_t a = s.find_first_not_of(" \t\r\n"), b = s.find_last_not_of(" \t\r\n");
    return a == std::string::npos ? "" : s.substr(a, b - a + 1);
}

static Settings loadSettings(const fs::path &iniPath) {
    Settings s;
    std::map<std::string, std::string> kv;  // "section.key"
    std::ifstream in(iniPath);
    std::string line, sec;
    while (std::getline(in, line)) {
        line = trim(line);
        if (line.empty() || line[0] == '#' || line[0] == ';') continue;
        if (line.front() == '[' && line.back() == ']') { sec = trim(line.substr(1, line.size() - 2)); continue; }
        size_t eq = line.find('=');
        if (eq != std::string::npos) kv[sec + "." + trim(line.substr(0, eq))] = trim(line.substr(eq + 1));
    }
    auto str = [&](const char *k, std::string &v) { auto it = kv.find(k); if (it != kv.end() && !it->second.empty()) v = it->second; };
    auto num = [&](const char *k, int &v) { auto it = kv.find(k); if (it != kv.end() && !it->second.empty()) v = std::atoi(it->second.c_str()); };
    str("database.host", s.dbHost); str("database.user", s.dbUser); str("database.password", s.dbPass);
    str("database.name", s.dbName); num("database.port", s.dbPort);
    str("camera.ip", s.camIp); num("camera.port", s.camPort);
    str("camera.http_host", s.httpHost); num("camera.http_port", s.httpPort);
    str("camera.data_dir", s.dataDir);
    num("camera.depth_width", s.depthW); num("camera.depth_height", s.depthH);
    num("camera.color_width", s.colorW); num("camera.color_height", s.colorH);
    num("camera.fps", s.fps); num("camera.warmup_frames", s.warmup);
    if (s.dataDir.empty()) {
#ifdef _WIN32
        const char *pub = std::getenv("PUBLIC");  // C:\Users\Public (Program Files 는 쓰기 불가)
        s.dataDir = std::string(pub ? pub : "C:\\Users\\Public") + "\\Documents\\RobotCamera";
#else
        const char *home = std::getenv("HOME");
        s.dataDir = home ? std::string(home) + "/vot/camera-data" : "camera-data";
#endif
    }
    return s;
}

// ---------------- DB ----------------
class Db {
public:
    explicit Db(const Settings &s) : s_(s) {}
    bool exec(const std::string &q) {
        std::lock_guard<std::mutex> lk(mx_);
        if (!ensure()) return false;
        if (mysql_query(c_, q.c_str()) != 0) { logLine(std::string("[DB] ") + mysql_error(c_)); return false; }
        return true;
    }
    long long insert(const std::string &q) {
        std::lock_guard<std::mutex> lk(mx_);
        if (!ensure()) return -1;
        if (mysql_query(c_, q.c_str()) != 0) { logLine(std::string("[DB] ") + mysql_error(c_)); return -1; }
        return (long long)mysql_insert_id(c_);
    }
    json rows(const std::string &q) {
        std::lock_guard<std::mutex> lk(mx_);
        json out = json::array();
        if (!ensure() || mysql_query(c_, q.c_str()) != 0) return out;
        MYSQL_RES *r = mysql_store_result(c_);
        if (!r) return out;
        unsigned n = mysql_num_fields(r);
        MYSQL_FIELD *f = mysql_fetch_fields(r);
        while (MYSQL_ROW row = mysql_fetch_row(r)) {
            json o;
            for (unsigned i = 0; i < n; i++) o[f[i].name] = row[i] ? json(row[i]) : json(nullptr);
            out.push_back(o);
        }
        mysql_free_result(r);
        return out;
    }
    std::string esc(const std::string &v) {
        std::lock_guard<std::mutex> lk(mx_);
        if (!ensure()) return "";
        std::string buf(v.size() * 2 + 1, '\0');
        unsigned long n = mysql_real_escape_string(c_, &buf[0], v.c_str(), (unsigned long)v.size());
        buf.resize(n);
        return buf;
    }
    std::string q(const std::string &v) { return "'" + esc(v) + "'"; }

private:
    bool ensure() {
        if (c_ && mysql_ping(c_) == 0) return true;
        if (c_) { mysql_close(c_); c_ = nullptr; }
        c_ = mysql_init(nullptr);
        unsigned int timeout = 3;
        mysql_options(c_, MYSQL_OPT_CONNECT_TIMEOUT, &timeout);
        mysql_options(c_, MYSQL_SET_CHARSET_NAME, "utf8mb4");
        if (!mysql_real_connect(c_, s_.dbHost.c_str(), s_.dbUser.c_str(), s_.dbPass.c_str(), s_.dbName.c_str(),
                                (unsigned)s_.dbPort, nullptr, 0)) {
            logLine(std::string("[DB] 연결 실패: ") + mysql_error(c_));
            mysql_close(c_); c_ = nullptr;
            return false;
        }
        return true;
    }
    const Settings &s_;
    MYSQL *c_ = nullptr;
    std::mutex mx_;
};

static const char *kCreateTable =
    "CREATE TABLE IF NOT EXISTS camera_captures ("
    " id INT AUTO_INCREMENT PRIMARY KEY,"
    " captured_at DATETIME(3) NOT NULL,"
    " trigger_type VARCHAR(16) NOT NULL,"
    " job_id INT NULL, job_name VARCHAR(200) NULL, welding_log_id INT NULL,"
    " gap_actual_mm DOUBLE NULL, part_gaps TEXT NULL,"
    " robot_tcp TEXT NULL, robot_joints TEXT NULL, note VARCHAR(500) NULL,"
    " color_path VARCHAR(500) NULL, depth_path VARCHAR(500) NULL, meta_path VARCHAR(500) NULL,"
    " depth_width INT NULL, depth_height INT NULL, camera_serial VARCHAR(64) NULL,"
    " INDEX idx_cc_time (captured_at), INDEX idx_cc_job (job_id)"
    ") DEFAULT CHARSET=utf8mb4";

// ---------------- Camera ----------------
class Camera {
public:
    explicit Camera(const Settings &s) : s_(s) {
        // IP 직접 연결(createNetDevice)은 기종을 Femto Mega 로 잘못 잡음 -> 네트워크 장치 목록에서 IP 로 골라 연결
        ctx_.enableNetDeviceEnumeration(true);
        ctx_.registerDeviceChangedCallback([this](std::shared_ptr<ob::DeviceList> removed, std::shared_ptr<ob::DeviceList>) {
            std::lock_guard<std::mutex> lk(stateMx_);
            if (!connected_) return;
            for (uint32_t i = 0; i < removed->getCount(); i++) {
                if (serial_ == removed->getSerialNumber(i)) { dropDevice_ = true; connected_ = false; logLine("[CAM] 카메라 끊김: " + serial_); }
            }
        });
    }

    // 연결 안 돼 있으면 접속 시도 (배경 스레드에서 5초마다)
    void tick() {
        std::unique_lock<std::mutex> lk(devMx_, std::try_to_lock);
        if (!lk.owns_lock()) return;  // 촬영 중
        if (dropDevice_.exchange(false)) dev_.reset();
        if (dev_) return;
        try {
            auto list = ctx_.queryDeviceList();
            std::shared_ptr<ob::Device> d;
            for (uint32_t i = 0; i < list->getCount() && !d; i++) {
                const char *ip = nullptr;
                try { ip = list->getIpAddress(i); } catch (...) {}
                if (ip && s_.camIp == ip) d = list->getDevice(i);
            }
            if (!d) { setError("장치 목록에 카메라 없음 (" + s_.camIp + ")"); return; }
            auto info = d->getDeviceInfo();
            std::lock_guard<std::mutex> sl(stateMx_);
            serial_ = info->getSerialNumber();
            firmware_ = info->getFirmwareVersion();
            name_ = info->getName();
            connected_ = true;
            lastError_.clear();
            dev_ = d;
            logLine("[CAM] 연결: " + name_ + " SN " + serial_ + " FW " + firmware_ + " (" + s_.camIp + ")");
        } catch (const ob::Error &e) {
            setError(e.getMessage());
        } catch (const std::exception &e) {
            setError(e.what());
        }
    }

    json status() {
        std::lock_guard<std::mutex> sl(stateMx_);
        return {{"ok", true}, {"version", CAMERA_APP_VERSION}, {"connected", connected_}, {"busy", busy_.load()},
                {"ip", s_.camIp}, {"name", name_}, {"serial", serial_}, {"firmware", firmware_},
                {"last_error", lastError_}, {"data_dir", s_.dataDir}};
    }

    // 깊이(Y16)+컬러(MJPG) 한 쌍을 받아 파일로 저장. 성공 시 저장 정보 반환
    json capture(const std::string &baseNoExt) {
        std::lock_guard<std::mutex> lk(devMx_);
        if (!dev_) throw std::runtime_error("카메라가 연결되어 있지 않습니다");
        busy_ = true;
        struct Busy { std::atomic<bool> &b; ~Busy() { b = false; } } guard{busy_};
        try {
            ob::Pipeline pipe(dev_);
            auto makeCfg = [](uint32_t dw, uint32_t dh, uint32_t cw, uint32_t ch, uint32_t fps) {
                auto cfg = std::make_shared<ob::Config>();
                cfg->enableVideoStream(OB_STREAM_DEPTH, dw, dh, fps, OB_FORMAT_Y16);
                cfg->enableVideoStream(OB_STREAM_COLOR, cw, ch, fps, OB_FORMAT_MJPG);
                cfg->setFrameAggregateOutputMode(OB_FRAME_AGGREGATE_OUTPUT_ALL_TYPE_FRAME_REQUIRE);
                return cfg;
            };
            try {
                pipe.start(makeCfg(s_.depthW, s_.depthH, s_.colorW, s_.colorH, s_.fps));
            } catch (const ob::Error &e) {
                // 설정 해상도가 없으면 카메라 기본 해상도로 다시 시도
                logLine(std::string("[CAM] 설정 해상도 실패, 기본값으로 재시도: ") + e.getMessage());
                pipe.start(makeCfg(OB_WIDTH_ANY, OB_HEIGHT_ANY, OB_WIDTH_ANY, OB_HEIGHT_ANY, OB_FPS_ANY));
            }
            std::shared_ptr<ob::FrameSet> fs;
            int got = 0;
            auto t0 = std::chrono::steady_clock::now();
            while (std::chrono::steady_clock::now() - t0 < std::chrono::seconds(8)) {
                auto f = pipe.waitForFrameset(1000);
                if (f && f->getDepthFrame() && f->getColorFrame()) { fs = f; if (++got > s_.warmup) break; }
            }
            json intr = nullptr;
            try {
                OBCameraParam p = pipe.getCameraParam();
                auto toJ = [](const OBCameraIntrinsic &i) { return json{{"fx", i.fx}, {"fy", i.fy}, {"cx", i.cx}, {"cy", i.cy}, {"width", i.width}, {"height", i.height}}; };
                intr = {{"depth", toJ(p.depthIntrinsic)}, {"color", toJ(p.rgbIntrinsic)}};
            } catch (...) {}
            pipe.stop();
            if (!fs) throw std::runtime_error("8초 안에 깊이·컬러 프레임을 받지 못했습니다");
            json out = saveFrames(fs, baseNoExt);
            out["intrinsics"] = intr;
            out["frames_waited"] = got;
            return out;
        } catch (const ob::Error &e) {
            dev_.reset();  // 다음 tick 에서 다시 연결
            setError(e.getMessage());
            std::lock_guard<std::mutex> sl(stateMx_);
            connected_ = false;
            throw std::runtime_error(std::string("카메라 오류: ") + e.getMessage());
        }
    }

private:
    void setError(const std::string &m) {
        std::lock_guard<std::mutex> sl(stateMx_);
        if (m != lastError_) logLine("[CAM] " + m);
        lastError_ = m;
    }

    json saveFrames(const std::shared_ptr<ob::FrameSet> &fs, const std::string &base) {
        auto color = fs->getColorFrame();
        auto depth = fs->getDepthFrame();
        json out;
        // 컬러: MJPG 그대로 .jpg
        std::string colorPath = base + "_color.jpg";
        if (color->getFormat() != OB_FORMAT_MJPG) throw std::runtime_error("컬러 형식이 MJPG 가 아닙니다");
        { std::ofstream f(colorPath, std::ios::binary); f.write((const char *)color->getData(), color->getDataSize()); }
        // 깊이: mm 단위 16비트 PGM(P5, big-endian). 0 = 측정 안 됨
        uint32_t w = depth->getWidth(), h = depth->getHeight();
        float scale = depth->getValueScale();
        const uint16_t *src = (const uint16_t *)depth->getData();
        std::string depthPath = base + "_depth.pgm";
        std::vector<uint8_t> buf((size_t)w * h * 2);
        size_t valid = 0;
        for (size_t i = 0; i < (size_t)w * h; i++) {
            double mm = std::round(src[i] * scale);
            uint16_t v = (uint16_t)std::min(65535.0, std::max(0.0, mm));
            if (v) valid++;
            buf[i * 2] = (uint8_t)(v >> 8);
            buf[i * 2 + 1] = (uint8_t)(v & 0xFF);
        }
        {
            std::ofstream f(depthPath, std::ios::binary);
            f << "P5\n" << w << " " << h << "\n65535\n";
            f.write((const char *)buf.data(), (std::streamsize)buf.size());
        }
        uint16_t centerMm = (uint16_t)((buf[((h / 2) * w + w / 2) * 2] << 8) | buf[((h / 2) * w + w / 2) * 2 + 1]);
        std::lock_guard<std::mutex> sl(stateMx_);
        out["color_path"] = colorPath;
        out["depth_path"] = depthPath;
        out["color_size"] = {color->getWidth(), color->getHeight()};
        out["depth_size"] = {w, h};
        out["depth_value_scale"] = scale;
        out["depth_valid_ratio"] = (double)valid / ((double)w * h);
        out["depth_center_mm"] = centerMm;
        out["camera_serial"] = serial_;
        out["camera_firmware"] = firmware_;
        return out;
    }

    const Settings &s_;
    ob::Context ctx_;
    std::shared_ptr<ob::Device> dev_;
    std::mutex devMx_, stateMx_;
    std::atomic<bool> busy_{false}, dropDevice_{false};
    bool connected_ = false;
    std::string serial_, firmware_, name_, lastError_;
};

static std::string jsonText(const json &req, const char *key) {
    if (!req.contains(key) || req[key].is_null()) return "NULL";
    return req[key].is_string() ? req[key].get<std::string>() : req[key].dump();
}

int main(int argc, char **argv) {
    fs::path exeDir = fs::absolute(argv[0]).parent_path();
    fs::path iniPath = argc > 1 ? fs::path(argv[1]) : exeDir / "config.ini";
    Settings s = loadSettings(iniPath);
    std::error_code ec;
    fs::create_directories(s.dataDir, ec);
    gLogFile.open(fs::path(s.dataDir) / "robot_camera.log", std::ios::app);
    logLine(std::string("[START] robot_camera ") + CAMERA_APP_VERSION + " config=" + iniPath.string() + " data=" + s.dataDir);

    try {
        ob::Context::setLoggerSeverity(OB_LOG_SEVERITY_ERROR);
        ob::Context::setLoggerToFile(OB_LOG_SEVERITY_WARN, (fs::path(s.dataDir) / "sdk-log").string().c_str());
    } catch (...) {}

    Db db(s);
    if (db.exec(kCreateTable)) logLine("[DB] camera_captures 준비");
    Camera cam(s);

    std::atomic<bool> running{true};
    std::thread worker([&] {
        while (running) {
            cam.tick();
            for (int i = 0; i < 50 && running; i++) std::this_thread::sleep_for(std::chrono::milliseconds(100));
        }
    });

    httplib::Server svr;
    svr.set_default_headers({{"Access-Control-Allow-Origin", "*"},
                             {"Access-Control-Allow-Headers", "Content-Type, Authorization"},
                             {"Access-Control-Allow-Methods", "GET, POST, OPTIONS"}});
    svr.Options(".*", [](const httplib::Request &, httplib::Response &res) { res.status = 204; });
    auto sendJson = [](httplib::Response &res, const json &j, int status = 200) {
        res.status = status;
        res.set_content(j.dump(), "application/json; charset=utf-8");
    };

    svr.Get("/camera/status", [&](const httplib::Request &, httplib::Response &res) { sendJson(res, cam.status()); });

    svr.Post("/camera/capture", [&](const httplib::Request &req, httplib::Response &res) {
        json body = json::object();
        if (!req.body.empty()) {
            body = json::parse(req.body, nullptr, false);
            if (body.is_discarded() || !body.is_object()) return sendJson(res, {{"ok", false}, {"error", "JSON 형식 오류"}}, 400);
        }
        std::string trigger = body.value("trigger", "manual");
        if (trigger != "manual" && trigger != "auto") trigger = "manual";
        auto now = std::chrono::system_clock::now();
        int ms = 0;
        localNow(now, &ms);
        std::ostringstream stamp;
        stamp << fmtTime(now, "%Y%m%d_%H%M%S") << "_" << std::setw(3) << std::setfill('0') << ms;
        fs::path dir = fs::path(s.dataDir) / fmtTime(now, "%Y%m%d");
        fs::create_directories(dir, ec);
        std::string base = (dir / ("cap_" + stamp.str() + "_" + trigger)).string();
        json saved;
        try {
            saved = cam.capture(base);
        } catch (const std::exception &e) {
            logLine(std::string("[CAPTURE] 실패: ") + e.what());
            return sendJson(res, {{"ok", false}, {"error", e.what()}}, 503);
        }
        std::ostringstream at;
        at << fmtTime(now, "%Y-%m-%d %H:%M:%S") << "." << std::setw(3) << std::setfill('0') << ms;
        json meta = body;
        meta["trigger"] = trigger;
        meta["captured_at"] = at.str();
        meta["capture"] = saved;
        std::string metaPath = base + ".json";
        { std::ofstream f(metaPath); f << meta.dump(2); }

        auto numOrNull = [&](const char *k) { return body.contains(k) && body[k].is_number() ? body[k].dump() : std::string("NULL"); };
        auto txt = [&](const char *k) { std::string v = jsonText(body, k); return v == "NULL" ? v : db.q(v); };
        std::ostringstream sql;
        sql << "INSERT INTO camera_captures (captured_at, trigger_type, job_id, job_name, welding_log_id, gap_actual_mm,"
            << " part_gaps, robot_tcp, robot_joints, note, color_path, depth_path, meta_path, depth_width, depth_height, camera_serial) VALUES ("
            << db.q(at.str()) << "," << db.q(trigger) << "," << numOrNull("job_id") << "," << txt("job_name") << ","
            << numOrNull("welding_log_id") << "," << numOrNull("gap_actual_mm") << "," << txt("part_gaps") << ","
            << txt("robot_tcp") << "," << txt("robot_joints") << "," << txt("note") << ","
            << db.q(saved["color_path"].get<std::string>()) << "," << db.q(saved["depth_path"].get<std::string>()) << ","
            << db.q(metaPath) << "," << saved["depth_size"][0] << "," << saved["depth_size"][1] << ","
            << db.q(saved["camera_serial"].get<std::string>()) << ")";
        long long id = db.insert(sql.str());
        logLine("[CAPTURE] " + trigger + " id=" + std::to_string(id) + " " + base + " 유효 깊이 " +
                std::to_string((int)(saved["depth_valid_ratio"].get<double>() * 100)) + "%");
        sendJson(res, {{"ok", true}, {"id", id}, {"db_saved", id > 0}, {"captured_at", at.str()}, {"capture", saved}, {"meta_path", metaPath}});
    });

    svr.Get("/camera/captures", [&](const httplib::Request &req, httplib::Response &res) {
        int limit = req.has_param("limit") ? std::atoi(req.get_param_value("limit").c_str()) : 20;
        limit = std::max(1, std::min(limit, 500));
        json rows = db.rows("SELECT id, captured_at, trigger_type, job_id, job_name, gap_actual_mm, part_gaps, note,"
                            " color_path, depth_path, meta_path FROM camera_captures ORDER BY id DESC LIMIT " + std::to_string(limit));
        sendJson(res, {{"ok", true}, {"items", rows}});
    });

    svr.Get("/camera/file", [&](const httplib::Request &req, httplib::Response &res) {
        long long id = req.has_param("id") ? std::atoll(req.get_param_value("id").c_str()) : 0;
        std::string kind = req.has_param("kind") ? req.get_param_value("kind") : "color";
        const char *col = kind == "depth" ? "depth_path" : kind == "meta" ? "meta_path" : "color_path";
        const char *mime = kind == "depth" ? "image/x-portable-graymap" : kind == "meta" ? "application/json" : "image/jpeg";
        json rows = db.rows(std::string("SELECT ") + col + " AS p FROM camera_captures WHERE id=" + std::to_string(id));
        if (rows.empty() || !rows[0]["p"].is_string()) return sendJson(res, {{"ok", false}, {"error", "기록 없음"}}, 404);
        std::ifstream f(rows[0]["p"].get<std::string>(), std::ios::binary);
        if (!f) return sendJson(res, {{"ok", false}, {"error", "파일 없음"}}, 404);
        std::string data((std::istreambuf_iterator<char>(f)), std::istreambuf_iterator<char>());
        res.set_content(data, mime);
    });

    logLine("[HTTP] " + s.httpHost + ":" + std::to_string(s.httpPort));
    if (!svr.listen(s.httpHost.c_str(), s.httpPort)) logLine("[HTTP] 포트를 열지 못했습니다 (이미 실행 중인지 확인)");
    running = false;
    worker.join();
    return 1;
}
