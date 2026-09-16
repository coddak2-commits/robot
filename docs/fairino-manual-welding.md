# FAIRINO 매뉴얼 용접 관련 조사 결과 (2026-09-16)

출처: `FAIRINO-사용설명서-V1.1-KOR(20240604)` (489쪽, DRM 해제본).
쪽번호는 문서 하단 인쇄 번호. PDF 뷰어 페이지 번호 = 인쇄 번호 + 2.
원본 PDF는 회사 DRM(BMS DocuRay) 암호화본이면 Claude가 읽지 못함 → "_Copied" 해제본을 사용할 것.

## 1. 매뉴얼 수록 여부

| 항목 | 수록 | 위치 | 핵심 |
|---|---|---|---|
| 어프로치 | "어프로치" 용어 없음. "안전점"으로 존재 | 5.9.14 용접 전문가 풀 p.278, p.280 | 시작점 / 시작점 안전점 / 아크 전환점 / 종점 / 종점 안전점을 각각 티칭 |
| 와이어 서치 (W-Search) | 있음 | 5.7.8.5 p.216–217, 5.13.6.5 p.370–372 | 서치 시작 → LIN 2개(방향) → 서치 종료 → 오프셋 계산 → 전체 오프셋으로 용접 모션에 적용 |
| 아크 추적 (Weld-Trc) | 있음 | 5.7.8.6 p.218–219, 5.13.6.6 p.373 | 상하 보상 / 좌우 보상 / 기준 전류(피드백·상수) |
| 자세 교정 (Adjust) | 있음 | 5.7.8.7 p.219, 5.13.6.7 p.374 | PosA/B/C 3자세 티칭 후 이동 방향에 따라 토치 자세 자동 교정 |
| 와이어 송급 | ON/OFF만 | p.362–363, p.401, p.405 | 정방향/역방향 송급 ON/OFF. 기본 DO11 조그 송급, DO12 역방향 송급 |
| 용접 중 와이어 조절 | 없음 | – | 매뉴얼에 언급 없음 |
| 아크 중단 감지·복구 | 있음 | 1.3.7.3.3 p.405–406 | 감지 활성화, 확인 30ms, 중첩 거리 5mm, 속도 30%, 운동 방식 PTP (그림 예시값) |
| 아크 추적 전류 피드백 AI 채널 설정 | 매뉴얼에 없음 | – | SDK `ArcWeldTraceAIChannelCurrent`, `ArcWeldTraceCurrentPara`로만 확인 |

W-Search 파라미터(p.370): 기준 위치(업데이트 안함/업데이트), 서치 속도 0~100, 서치 거리 0~1000, 자동 복귀 여부, 자동 복귀 속도/거리, 서치 방법(티칭 포인트/오프셋).

아크 추적 노드 파라미터(p.373): 지연 시간(ms, 기준 50), 편차 보상 on/off, 조정 계수 0~300, 보상 시간(cyc), 매번 최대 보상(mm), 총 최대 보상(mm), 상하 좌표계 선택(선택지: 스윙), 기준 전류 방식(피드백/상수), 기준 전류(A).

## 2. 아크 추적: 매뉴얼 예시값 vs 현재 코드

매뉴얼 그림 3.7-8-7-1(p.218) 기준.

| 항목 | 매뉴얼 예시 | 현재 (`welding_config`) |
|---|---|---|
| 상하 좌표계 | 스윙 (0) | 1 (툴) |
| 상하 조정 계수 | -0.06 | +0.04 |
| 보상 시작 | 5 cyc | 5 |
| 매번 최대 보상 | 5 mm | 1.0 mm |
| 총 최대 보상 | 300 mm | 10.0 mm |
| 기준 전류 샘플링 시작/횟수 | 4 / 1 cyc | 10 / 10 |
| 지연 시간 | 50 ms | 0 |

주의:
- kud 부호가 반대. 매뉴얼에 부호 의미 설명 없음 → 실측으로 결정.
- 시간 단위 cyc와 좌표계 선택지(스윙)로 보아 위빙 전제일 가능성 있음(추정, 매뉴얼 명시 아님). 위빙 없는 구간에서 동작하는지 실측 필요.

## 3. 구현 제안 (미적용)

### ① 어프로치: 계산 오프셋 대신 티칭 안전점
HANDOFF §3-7의 code=38(계산된 후퇴 좌표의 특이점) 문제 회피 목적. 안전점이 없으면 기존 +X/-Y 오프셋 로직 유지.

```ts
// weldingExecution.ts 시작점 접근부
if (startPoint.safeJoints) {
  const r = await moveToJointWithStopCheck(startPoint.safeJoints, approachSpeed, stopCheck);
  if (!r.success) throw new Error('시작점 안전점 이동 실패');
  const plunge = await moveToCartesianPosition(toPose(startPoint.tcp), 0, 0, plungeSpeed, 0, [0,0,0,0,0,0]);
  if (plunge?.status_code !== 200) throw new Error('시작점 진입 실패');
} else {
  // 기존 오프셋 접근 유지
}
```
필요: `teaching_points`에 `safe_joints`, `safe_tcp` 컬럼, 팬던트 티칭 팝업에 "안전점 저장".

### ② 아크 추적: 매뉴얼 기준 정렬 + 위빙 시에만 활성
```ts
const arcTrackingActive =
  sequenceSettings.arcTrackingEnabled && hasWelding && hasWeaving && !simMode && !isWeldingTest;
```
```sql
UPDATE welding_config SET
  arc_tracking_axis_select = 0,
  arc_tracking_delay_time = 50,
  arc_tracking_refer_sample_start_ud = 4,
  arc_tracking_refer_sample_count_ud = 1;
-- kud 부호는 실측 후 결정. step 1mm / sum 10mm 안전 제한은 유지 권장
```
추가 확인: 코드에 `ArcWeldTraceAIChannelCurrent` / `ArcWeldTraceCurrentPara` 호출이 없음. 로봇 WebApp에서 설정돼 있지 않으면 보정이 안 걸릴 수 있음.

### ③ 용접 중 와이어: 수동 송급 차단 유지 + 아크 중단 복구
매뉴얼에 용접 중 송급 기능이 없으므로 v1.1.138 차단 유지. 와이어 소모로 아크가 끊기는 경우는 아래로 대응.

```cpp
int RobotService::configArcBreakRecovery(int checkMs, double overlapMm, double velPct, int moveType) {
    std::lock_guard<std::mutex> lock(m_mutex);
    if (!m_connected) return -1;
    int r = m_robot.WeldingSetCheckArcInterruptionParam(1, checkMs);             // 30
    if (r != 0) return r;
    return m_robot.WeldingSetReWeldAfterBreakOffParam(1, overlapMm, velPct, moveType); // 5, 30, 1(PTP)
}
```
중단 경고 시 UI "복구" → `WeldingStartReWeldAfterBreakOff()`, "종료" → `WeldingAbortWeldAfterBreakOff()`.

## 4. 터치센싱 서치 거리 / 어프로치 오프셋 (2026-09-16 확인)

매뉴얼 W-Search의 "서치 거리"(p.370, 0~1000, 단위 mm) = 이 프로젝트의 `touch_distance`.
접촉을 찾으며 밀고 들어가는 최대 거리. 이 거리 안에 접촉이 없으면 탐색 실패.
코드(`robot_core_all.cpp` 터치센싱부, v1.1.147)에서 10~100mm로 clamp.

| 설정 | 의미 |
|---|---|
| `touch_sensing_approach_offset` | 티칭 포인트에서 이만큼 떨어진 곳까지 먼저 이동 (탐색 시작 위치) |
| `touch_distance` | 그 위치부터 접촉을 찾는 최대 거리 |

필드 PC(MariaDB 12.3) 현재값: `touch_sensing_approach_offset = 50`, `touch_distance = 50`
(`touch_distance`는 사용자가 이전에 50으로 직접 변경함).

문제: 두 값이 같아 탐색이 티칭 포인트에서 정확히 끝남. 실제 모재가 티칭 위치보다 안쪽이면 닿기 전에 탐색 종료 → 실패 가능.
v1.1.147 권장값: approach_offset 50 / touch_distance 80 (티칭 포인트 너머 30mm 여유).
단, 접촉이 없으면 티칭 포인트보다 최대 30mm 더 밀고 들어가므로 포인트 뒤 지그·U셀까지 여유 확인 필요.

```powershell
& "C:/Program Files/MariaDB 12.3/bin/mysql.exe" -u root -p robot_welding -e "UPDATE welding_config SET touch_distance = 80 WHERE id = 1;"
```
적용 여부: 미정 (위 명령 아직 실행 안 함).

참고: 매뉴얼의 "최대 탐사 거리 0~100mm"는 W-Search가 아니라 FT_FindSurface(힘/토크 센서 표면 포지셔닝, p.380, p.449)의 값. 힘 센서가 필요하고 현재 코드에서 사용하지 않음.

## 5. 관련 코드 위치
- 시작점 접근 / 파트 전환: `robot-front/src/pages/UcellSelect/hooks/weldingCore/weldingExecution.ts`
- 아크 추적 호출: 같은 파일 `armArcTracking()`, 핸들러 `robot_core_all.cpp` `POST /welding/arc-trace/control`
- 와이어 버튼: `robot-front/src/pages/UcellSelect/hooks/useWireControl.ts`
- SDK: `fairino-cpp-sdk-main/windows/libfairino/include/robot.h`
- 아크 추적 설명: `docs/arc-tracking.md`
