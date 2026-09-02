# FR3-WMS 갭 기반 용접 파라미터 시스템

## 프로젝트 경로 / 저장소
- 로컬: `C:\Users\D113964\Desktop\git\robot`
- GitHub: https://github.com/coddak2-commits/robot (private)

## 스택 & 포트
- robot-core (C++, Fairino SDK): 8080 (HTTP), 5555/5556 (ZMQ)
- robot-back (FastAPI): 8000
- robot-front (React): 3000
- MariaDB 11.4 (DB: robot_welding)
- Node.js, Python 3.12.10, Git 설치됨

## 계정
- admin / 1234 (SHA-256 통합)

## 버전 배포 상태
- 1.1.30: 빌드/릴리즈 완료, 노트북(현장) 배포까지 완료

## 서버 실행
- Robot Core: `cd robot-core\build-unity && .\robot_core.exe`
- FastAPI: `cd robot-back && .\venv\Scripts\Activate.ps1 && $env:PYTHONPATH="" && python main.py`
- React: `cd robot-front && npm start`

## 완료 작업 (최근 세션 기준)

### 인프라
- VC++ 재배포 최신판 설치 (Robot Core 실행 위해 필수)
- Chocolatey, CMake, Ninja, VS2022 Build Tools 설치
- MariaDB teaching_jobs/teaching_points 테이블 신규 생성 (`database/teaching_schema.sql`)
- 인증 시스템 통일: robot-back의 security.py를 SHA-256으로 변경, DB 컬럼명 rename (full_name→name, is_active→active, last_login_at→last_login), Login.tsx가 두 백엔드 토큰 동시 획득

### 프론트 - 팬던트 (/pendant)
- 파트별 gap 세그먼트 6개 (1-2, 2-3, 4-6, 7-8, 8-9, 10-12) - 캔버스 위 오버레이, 좌표 offset 세밀 조정 완료
- 숫자 클릭 시 커스텀 숫자 키패드 팝업 (팬던트 환경 대응)
- +/- 버튼은 1씩 증가, 0~6 클램프
- 파트별 "패스" 체크박스 4개 (cell-selection과 같은 초록 pill 스타일, U-셀 안쪽 배치)
- 우측 세로 도크: Dry Run 토글 + 용접시작/계속/비상정지
- Dry Run ON 시 상단 큰 배지 + 시작 버튼 색상 변경
- 포인트 클릭 → 티칭 팝업 (현재 위치 저장 / 여기로 이동)
- 우상단 로그아웃 버튼 + 에러 리셋 버튼 (에러 있을 때만)
- 로그아웃 → /login?redirect=/pendant 자동 복귀

### 프론트 - 용접 파라미터 자동 조회
- 팬던트 용접 시작 시: 파트별 대표 gap → paramApi.lookup(FastAPI) → current/voltage/speed 자동 세팅 → startWelding
- PART_GAP_MAP: 파트1=P4, 파트2=P2, 파트3=P10, 파트4=P8

### 프론트 - Cell-selection
- 좌상단에 현재 작업명 표시 (티칭/작업내역 탭 좌측)
- 이동 속도 UI는 admin만 노출
- 좌측 관리자 버튼 → /settings 이동 (구현 예정 팝업 제거)
- 정밀 조정 → 와이어 조정으로 이름 변경
- 삭제 확인 팝업 중복 제거 (하나만)
- 저장 시 이름 입력 프롬프트 즉시 뜸

### 프론트 - 공통
- 캔버스 하이라이트: 용접 진행 중 currentPointIndex 포인트에 초록 원+애니메이션 링 (WeldPointsLayer 공용 컴포넌트)
- Layout 우측 상단 fixed로 로그아웃 버튼 (모든 페이지)
- 메인 메뉴에 "승격 요청" 카드 추가

### 프론트 - 라우트 권한
- admin 전용: /settings/*, /gap/params, /gap/promotions
- admin+operator: /cell-selection, /jobs, /robot-control, /gap/gap-input, /gap/wire-inching, /pendant
- 모두: /dashboard
- 백엔드 API 인증은 이미 잘 되어있음 (require_admin/operator/get_current_user 데코레이터)

## 미결 사항

### 최우선: Robot Core 재빌드
- 소스 수정 완료: robot_core_all.cpp line 2962에 PATCH 추가
- 재빌드되면: 이름 수정 등 PATCH API 정상 동작
- 막힌 곳: visualstudio2022-workload-vctools 설치 시 회사 방화벽으로 go.microsoft.com 차단
- 해결책: 회사 IT에 방화벽 예외 요청 (go.microsoft.com, download.microsoft.com, download.visualstudio.microsoft.com) 또는 집에서 오프라인 layout 다운로드 후 USB 이동
- 재빌드 명령: `cd robot-core && .\build_unity.bat`

### 설정 - 로봇 설정 탭: 최대 속도 / 안전구역 미구현
- 충돌 감지는 연결 완료: `robot_settings` 테이블에 `collision_detection_enabled` 컬럼 추가됨, `PUT /robot_sdk/settings` 핸들러(`robot_core_all.cpp:5436-5453`)가 변경 시 `robotService.setCollisionDetection()` → SDK `SetAnticollision`(`robot_core_all.cpp:724-730`) 호출. 프론트 `robot-front/src/pages/settings/components/index.tsx:323-330`에 토글 연결됨. 기본 속도/기본 가속도 중복 가짜 필드도 제거됨.
- 최대 속도 / 안전구역 활성화는 여전히 미구현: `PUT /robot_sdk/settings` 핸들러에 해당 필드 없음, 프론트에도 UI 없음(제거된 상태).
  - 최대 속도: DB 컬럼 추가는 쉬우나, 실제로 로봇 속도를 제한하려면 MoveL/SetSpeed 호출 전 clamp 로직을 추가해야 의미가 생김.
  - 안전구역: Fairino SDK에 "구역" 개념 자체가 없음(가장 가까운 게 조인트 소프트리밋 `SetLimitPositive`/`SetLimitNegative`, `robot.h:1041/1048`). 사실상 신규 기능.

### 실제 로봇 관련
- FR3 실물 연결 테스트 (192.168.58.2)
- welding_params 시드 실측값 갱신
- Robot Core /robot_sdk/realtime 60초 timeout 이슈 (실물 미연결 상태)
- 로봇 없이는 티칭·시뮬레이션·하이라이트 검증 불가 (batchMoveL이 실제 로봇 명령)

### 옵션
- 하루 요약 이메일
- 작업 완료 서명
- 관리자 페이지에 사용자 관리 신규 (계정 추가/삭제/비번 재설정/역할 변경)
- 티칭 시 토치 자세 UI 사용 여부 확인 후 유지/제거 (팬던트에선 이미 제거)
- 용접기(Megmeet DEX2-MPR600) 실제 전류/전압 피드백 연동 — 지금은 `setWeldingCurrent`/`setWeldingVoltage`가 AO(아날로그 출력)로 setpoint만 내보내는 구조라 피드백 없음. 갭별 파라미터를 자동으로 검증/보정하는 기능을 만들려면 필요(설정값 대비 실제 출력값, 아크 이상 유무 확인용). 방법 후보: (1) 용접기에 모니터 출력이 있으면 그 선을 로봇 AI에 연결해 `GetAI`로 읽기, (2) DEX2 M시리즈가 지원하는 CANopen 디지털 연동으로 전환(배선/작업량 더 큼). 지금 당장 급한 건 아님.

## 주요 코드 위치
- 팬던트: `robot-front/src/pages/pendant/index.tsx`
- Cell-selection: `robot-front/src/pages/UcellSelect/index.tsx`
- Layout: `robot-front/src/components/layout/index.tsx`
- Router: `robot-front/src/router/index.tsx`
- Robot Core: `robot-core/src/robot_core_all.cpp`
- Backend auth: `robot-back/app/api/auth.py`, `robot-back/app/core/security.py`
- 파트/세그먼트 상수: pendant/index.tsx의 SEGMENTS, PART_CHECKBOXES, PART_GAP_MAP
