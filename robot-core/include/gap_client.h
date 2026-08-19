// gap_client.h - FR3-WMS 갭 시스템 백엔드(Python FastAPI :8000) HTTP 클라이언트
// 헤더 전용 (header-only) — 다른 곳에서 #include 하고 바로 사용
//
// 의존성: httplib.h (이미 include/에 있음), nlohmann/json (이미 vcpkg로 링크됨)
//
// 사용 예:
//   GapClient gc("localhost", 8000);
//   if (!gc.login("admin", "admin1234")) { /* 실패 처리 */ }
//   auto p = gc.lookup_params("vertical", 2.0, 20.0);
//   if (p) { fairino.WeldingSetCurrent(0, p->current_a, ...); }

#ifndef GAP_CLIENT_H_
#define GAP_CLIENT_H_

#include "httplib.h"
#include <nlohmann/json.hpp>
#include <string>
#include <optional>
#include <memory>
#include <mutex>
#include <iostream>

namespace gap {

using json = nlohmann::json;

// 파라미터 조회 결과
struct WeldParam {
    int   id = 0;
    std::string posture;         // "vertical" or "horizontal"
    double gap_mm = 0;
    int   current_a = 0;
    double voltage_v = 0;
    int   speed_cpm = 0;
    int   stickout_mm = 0;
    bool  weave_enabled = true;
    int   weave_type = 0;
    double weave_freq_hz = 1.5;
    double weave_range_mm = 3.0;
    int   weave_left_dwell_ms = 0;
    int   weave_right_dwell_ms = 0;
    double thickness_mm = 0;
    std::string material = "SS400";
    std::string joint_type = "fillet";

    static WeldParam from_json(const json& j) {
        WeldParam p;
        p.id = j.value("id", 0);
        p.posture = j.value("posture", "");
        p.gap_mm = j.value("gap_mm", 0.0);
        p.current_a = j.value("current_a", 0);
        p.voltage_v = j.value("voltage_v", 0.0);
        p.speed_cpm = j.value("speed_cpm", 0);
        p.stickout_mm = j.value("stickout_mm", 20);
        p.weave_enabled = j.value("weave_enabled", true);
        p.weave_type = j.value("weave_type", 0);
        p.weave_freq_hz = j.value("weave_freq_hz", 1.5);
        p.weave_range_mm = j.value("weave_range_mm", 3.0);
        p.weave_left_dwell_ms = j.value("weave_left_dwell_ms", 0);
        p.weave_right_dwell_ms = j.value("weave_right_dwell_ms", 0);
        p.thickness_mm = j.value("thickness_mm", 0.0);
        p.material = j.value("material", std::string("SS400"));
        p.joint_type = j.value("joint_type", std::string("fillet"));
        return p;
    }
};

struct LookupResult {
    bool matched = false;
    int  fallback_level = 0;   // 0=미등록, 1=정확, 2=두께근접, 3=사용자선택필요
    std::string warning;
    std::optional<WeldParam> param;
};

class GapClient {
public:
    GapClient(const std::string& host = "localhost", int port = 8000)
        : host_(host), port_(port), cli_(std::make_unique<httplib::Client>(host, port))
    {
        cli_->set_connection_timeout(5, 0);
        cli_->set_read_timeout(10, 0);
    }

    // 로그인 → JWT 저장
    bool login(const std::string& username, const std::string& password) {
        httplib::Params p;
        p.emplace("username", username);
        p.emplace("password", password);
        auto res = cli_->Post("/api/auth/login", p);
        if (!res || res->status != 200) {
            std::cerr << "[GapClient] login failed status="
                      << (res ? res->status : -1) << "\n";
            return false;
        }
        try {
            auto j = json::parse(res->body);
            std::lock_guard<std::mutex> lk(mu_);
            token_ = j.value("access_token", "");
            return !token_.empty();
        } catch (const std::exception& e) {
            std::cerr << "[GapClient] login parse error: " << e.what() << "\n";
            return false;
        }
    }

    void set_token(const std::string& token) {
        std::lock_guard<std::mutex> lk(mu_);
        token_ = token;
    }

    // 파라미터 조회 (계층적 폴백 포함)
    LookupResult lookup_params(const std::string& posture, double gap_mm, double thickness_mm,
                               const std::string& material = "SS400",
                               const std::string& joint = "fillet") {
        LookupResult r;
        std::string path = "/api/params/lookup?posture=" + posture
                         + "&gap=" + std::to_string(gap_mm)
                         + "&thickness=" + std::to_string(thickness_mm)
                         + "&material=" + material
                         + "&joint=" + joint;
        auto res = cli_->Get(path.c_str(), auth_headers());
        if (!res || res->status != 200) {
            std::cerr << "[GapClient] lookup failed status="
                      << (res ? res->status : -1) << " body="
                      << (res ? res->body : "") << "\n";
            return r;
        }
        try {
            auto j = json::parse(res->body);
            r.matched = j.value("matched", false);
            r.fallback_level = j.value("fallback_level", 0);
            r.warning = j.value("warning", std::string(""));
            if (j.contains("param") && !j["param"].is_null()) {
                r.param = WeldParam::from_json(j["param"]);
            }
        } catch (const std::exception& e) {
            std::cerr << "[GapClient] lookup parse error: " << e.what() << "\n";
        }
        return r;
    }

    // 편차 이벤트 보고 (C++ Robot Core → 백엔드)
    bool report_deviation(int job_id, const std::string& point_code, int level,
                          const std::string& field_name,
                          double command_value, double actual_value,
                          double deviation_pct, double duration_sec,
                          const std::string& action_taken = "logged") {
        json body = {
            {"job_id", job_id},
            {"point_code", point_code},
            {"level", level},
            {"field_name", field_name},
            {"command_value", command_value},
            {"actual_value", actual_value},
            {"deviation_pct", deviation_pct},
            {"duration_sec", duration_sec},
            {"action_taken", action_taken},
        };
        auto h = auth_headers();
        h.emplace("Content-Type", "application/json");
        auto res = cli_->Post("/api/deviations/", h, body.dump(), "application/json");
        return res && res->status == 201;
    }

    // 오버라이드 등록 (작업자 임시 조정 기록)
    bool create_override(int job_id, const std::string& point_code,
                         const std::string& posture, double gap_mm,
                         double thickness_mm,
                         const std::string& field_name,
                         double original_value, double override_value,
                         const std::string& reason = "") {
        json body = {
            {"job_id", job_id},
            {"point_code", point_code},
            {"posture", posture},
            {"gap_mm", gap_mm},
            {"material", "SS400"},
            {"thickness_mm", thickness_mm},
            {"joint_type", "fillet"},
            {"field_name", field_name},
            {"original_value", original_value},
            {"override_value", override_value},
            {"reason", reason},
        };
        auto h = auth_headers();
        h.emplace("Content-Type", "application/json");
        auto res = cli_->Post("/api/overrides/", h, body.dump(), "application/json");
        return res && res->status == 201;
    }

    // 작업 상태 변경
    bool complete_job(int job_id) {
        auto res = cli_->Post(("/api/jobs/" + std::to_string(job_id) + "/complete").c_str(),
                              auth_headers(), "", "application/json");
        return res && res->status == 200;
    }

    // 헬스 체크
    bool health() {
        auto res = cli_->Get("/health");
        return res && res->status == 200;
    }

    // 현재 토큰 여부
    bool authenticated() const {
        std::lock_guard<std::mutex> lk(mu_);
        return !token_.empty();
    }

private:
    httplib::Headers auth_headers() {
        httplib::Headers h;
        std::lock_guard<std::mutex> lk(mu_);
        if (!token_.empty()) {
            h.emplace("Authorization", "Bearer " + token_);
        }
        return h;
    }

    std::string host_;
    int port_;
    std::unique_ptr<httplib::Client> cli_;
    mutable std::mutex mu_;
    std::string token_;
};

// =====================================================================
// SDK 헬퍼: WeldParam을 받아 Fairino SDK 함수들을 순차 호출
// (선택적 사용 - Fairino robot 인스턴스에 대한 참조 필요)
// =====================================================================
// 사용 예:
//   FRRobot robot;
//   ...
//   auto lr = gc.lookup_params("vertical", 2.0, 20.0);
//   if (lr.param) {
//       gap::apply_weld_param(robot, *lr.param, /*aoIndex*/ 0, /*blend*/ 0);
//   }
//
// 매크로로 만들지 않고 template로 두어 헤더에 FRRobot 의존 없이 사용 가능
template <typename FairinoRobot>
int apply_weld_param(FairinoRobot& robot, const WeldParam& p, int aoIndex = 0, int blend = 0) {
    // 전류/전압 세팅
    int r1 = robot.WeldingSetCurrent(0, p.current_a, aoIndex, blend);
    int r2 = robot.WeldingSetVoltage(0, p.voltage_v, aoIndex, blend);
    // 이동 속도
    int r3 = robot.SetSpeed(p.speed_cpm);
    // 위빙 (활성 시)
    int r4 = 0;
    if (p.weave_enabled) {
        r4 = robot.WeaveSetPara(
            /*weaveNum=*/ 0,
            p.weave_type,
            p.weave_freq_hz,
            /*weaveIncStayTime=*/ 0,
            p.weave_range_mm,
            /*weaveLeftRange=*/ p.weave_range_mm / 2,
            /*weaveRightRange=*/ p.weave_range_mm / 2,
            /*additionalStayTime=*/ 0,
            p.weave_left_dwell_ms,
            p.weave_right_dwell_ms,
            /*weaveCircleRadio=*/ 0,
            /*weaveStationary=*/ 0,
            /*weaveYawAngle=*/ 0.0
        );
    }
    if (r1 != 0) return r1;
    if (r2 != 0) return r2;
    if (r3 != 0) return r3;
    if (r4 != 0) return r4;
    return 0;
}

} // namespace gap

#endif // GAP_CLIENT_H_
