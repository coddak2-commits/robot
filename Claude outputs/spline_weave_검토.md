# SDK 3.9.8 신규 위빙 기능 검토

## 배경
Fairino 컨트롤러 3.9.8 업데이트에 "New Spline Weave Welding" 기능이 추가되었다는 정보 확인 요청.

## 확인된 사실
- Fairino 공식 3.9.8 매뉴얼: "New Spline Weave Welding" 존재. 경로는 Auxiliary Apps → Process Package → Welding Expert Library. "새로운 스플라인 직선-호 전환 기능에 최적화된 위빙 함수"로 설명됨.
- C++ SDK 공식 문서(위빙 함수 페이지) 확인 결과, `WeaveSetPara` / `WeaveOnlineSetPara` / `SetCustomWeaveParameters`의 weaveType은 0~7(삼각파/사인파/원형 계열)뿐이며 spline weave 타입이나 별도 함수는 없음.
- 로컬 SDK 헤더(`robot.h`)도 동일하게 0~7까지만 정의되어 있어 문서 내용과 일치.

## 결론
"New Spline Weave Welding"은 SDK로 노출된 함수가 아니라 펜던트에 내장된 "Welding Expert Library" 앱(템플릿) 기능으로 판단됨. robot-core는 SDK를 직접 호출하는 구조라 이 기능을 그대로 가져다 쓸 수는 없음.

## 대안 (미검증)
SDK에는 다음 두 기능이 이미 존재함:
- `WeaveSetPara`: 위빙 오실레이션
- `NewSplineStart` / `NewSplinePoint` / `NewSplineEnd`: 직선-호 전환 스플라인 이동

이동 경로를 기존 MoveL 대신 NewSpline 계열로 잡고 그 위에 WeaveSetPara를 걸면 3.9.8의 "스플라인 전환 최적화 위빙"과 비슷한 결과를 낼 가능성은 있음.

다만 Fairino가 3.9.8에서 개선했다는 부분은 위빙과 스플라인 보간을 실시간 동기화하는 컨트롤러 펌웨어 내부 로직일 가능성이 높음. 즉 SDK 함수 두 개를 조합해서 흉내는 낼 수 있어도, 실제 정밀도/안정성까지 동일하다는 보장은 없음. 문서나 로그로는 확인 불가하며 실기 테스트 전까지는 동작 여부 불명.

## 판단 필요 사항
직접 구현(NewSpline + WeaveSetPara 조합) 시도 여부 — 용접 모션에 직접 영향을 주는 부분이라 실기 테스트 필요.
