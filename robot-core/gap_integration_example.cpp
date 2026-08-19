// gap_integration_example.cpp
// 갭 시스템 백엔드 연동 최소 예제 (기존 robot_core_all.cpp에 어떻게 붙이는지 참고용)
//
// 빌드는 안 함 (예제 코드). 실제 통합은 robot_core_all.cpp의 용접 실행 흐름에 추가.
//
// 표준 시나리오:
//   1) 서버 시작 시 백엔드에 로그인 (1회)
//   2) 작업 시작 시 각 포인트별 갭 값을 이미 백엔드에 저장돼 있어야 함
//      (프론트에서 POST /api/jobs/{id}/point-gaps로 미리 저장)
//   3) 각 용접 지점 이동 전에 gc.lookup_params() 호출 → 파라미터 로드
//   4) gap::apply_weld_param() 호출 → SDK 함수 순차 실행
//   5) robot.MoveL() 호출 → 이동+용접
//   6) 편차 감지 시 gc.report_deviation()

#include "gap_client.h"
#include "robot.h"      // Fairino SDK
#include <iostream>

int main() {
    // 1) 백엔드 로그인
    gap::GapClient gc("localhost", 8000);
    if (!gc.login("service", "service_pw")) {
        std::cerr << "백엔드 로그인 실패\n";
        return 1;
    }

    // 2) Fairino 로봇 연결
    FRRobot robot;
    if (robot.RPC("192.168.58.2") != 0) {
        std::cerr << "로봇 연결 실패\n";
        return 2;
    }

    // 3) 예: 특정 지점 정보 (실제로는 DB/작업 정보에서 가져옴)
    int job_id = 123;
    std::string point_code = "P10";
    std::string posture = "vertical";     // 3G
    double gap_mm = 2.0;                   // 사용자 입력 갭
    double thickness_mm = 20.0;            // 판두께

    // 4) 파라미터 조회 (계층적 폴백 포함)
    auto lr = gc.lookup_params(posture, gap_mm, thickness_mm);
    if (!lr.param) {
        std::cerr << "파라미터 없음, 관리자 등록 필요: " << lr.warning << "\n";
        return 3;
    }
    if (lr.fallback_level > 1) {
        std::cerr << "경고: " << lr.warning << "\n";
    }
    std::cout << "[GAP] loaded: I=" << lr.param->current_a
              << "A V=" << lr.param->voltage_v
              << " S=" << lr.param->speed_cpm << "cpm\n";

    // 5) SDK에 파라미터 세팅
    int rc = gap::apply_weld_param(robot, *lr.param);
    if (rc != 0) {
        std::cerr << "SDK 세팅 실패 code=" << rc << "\n";
        return 4;
    }

    // 6) 이동 + 용접
    DescPose target = { 500, -100, 300, 180, 0, 0 };
    int tool = 0, user = 0;
    // MoveL 호출은 프로젝트 헬퍼 함수에 맞춰서 사용
    // ...

    // 7) 편차 감지 예 (실제로는 실측 로직에서 호출)
    // gc.report_deviation(job_id, point_code, /*level=*/ 2, "current_a",
    //                     /*command=*/ lr.param->current_a, /*actual=*/ 210, /*pct=*/ 5.0, /*sec=*/ 3.5);

    // 8) 작업 완료
    // gc.complete_job(job_id);

    robot.CloseRPC();
    return 0;
}
