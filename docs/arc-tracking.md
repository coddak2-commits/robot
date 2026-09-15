# 아크 트래킹 (Arc Tracking)

## 무엇인가

용접 전류로 토치 높이를 재서 자동으로 보정하는 기능이다.

토치가 모재에 가까워지면 와이어가 튀어나온 길이(스틱아웃)가 짧아지고,
짧아진 만큼 저항이 줄어 전류가 올라간다. 반대로 멀어지면 전류가 내려간다.
즉 **전류값이 곧 거리계**다.

로봇은 용접 중 전류를 계속 읽어서 이렇게 움직인다.

- 전류가 기준보다 높다 → 너무 가까움 → 토치를 들어올림
- 전류가 기준보다 낮다 → 너무 멂 → 토치를 내림

사람이 눈으로 보고 와이어를 밀고 당기던 것을 로봇이 초당 수십 번 자동으로 한다.

## 설정값

| 항목 | DB 컬럼 | 현재 값 | 뜻 |
|---|---|---|---|
| 사용 여부 | `arc_tracking_enabled` | 1 | 아크 트래킹 on/off |
| 좌우 보정 | `arc_tracking_left_right` | - | 좌우(위빙 방향) 보정 사용 여부 |
| 상하 보정 | `arc_tracking_up_down` | - | 상하(토치 높이) 보정 사용 여부 |
| 기준 전류 방식 | `arc_tracking_reference_type` | 0 | 0 = 피드백 샘플링, 1 = 고정값 |
| 기준 전류 | `arc_tracking_reference_current` | 0 | `reference_type = 1`일 때만 사용 |
| 보정 축 | `arc_tracking_axis_select` | 1 | 0 = 위빙, 1 = 툴 좌표, 2 = 베이스 좌표 |
| 보정 계수 (상하) | `arc_tracking_kud` | 0.04 | 전류 오차 → 이동량 변환 비율 |
| 보정 계수 (좌우) | `arc_tracking_klr` | - | 좌우 방향의 같은 계수 |
| 1회 최대 보정 (상하) | `arc_tracking_step_max_ud` | 1.0 mm | 한 주기에 움직일 수 있는 최대량 |
| 누적 최대 보정 (상하) | `arc_tracking_sum_max_ud` | 10.0 mm | 용접 전체에서 움직일 수 있는 최대량 |
| 보정 시작 지연 | `arc_tracking_delay_time` | 0 | 아크 발생 후 보정 시작까지 대기 시간 |
| 보정 시작 시점 | `arc_tracking_t_start_ud` / `_lr` | 5.0 | 보정 로직이 개입하기 시작하는 시점 |
| 샘플링 시작 | `arc_tracking_refer_sample_start_ud` | 10 | 기준 전류 샘플링을 시작할 지점 |
| 샘플링 횟수 | `arc_tracking_refer_sample_count_ud` | 10 | 기준 전류를 몇 번 측정해 평균낼지 |

## 왜 이렇게 설정했나

### 기준 전류 방식 = 0 (피드백 샘플링)

U셀마다 갭이 다르고 수직·수평 용접의 전류도 다르다.
고정값(1번)을 쓰면 시작부터 틀린 기준으로 보정하게 된다.

0번은 용접 시작 직후 실제 전류를 측정해 그것을 기준으로 삼는다.
어떤 조건에서 시작하든 목표가 "처음 상태 유지"가 되므로
갭이나 자세가 달라져도 그대로 쓸 수 있다.

### 보정 축 = 1 (툴 좌표)

토치가 향한 방향을 기준으로 상하 보정한다.
베이스 좌표(2번)를 쓰면 토치가 기울어진 경우 실제 스틱아웃 방향과
보정 방향이 어긋난다.

### 1회 1.0 mm / 누적 10.0 mm

안전장치다. 스패터나 아크 불안정으로 전류가 순간 튀어도
토치가 한 번에 1 mm 넘게 움직이지 않고, 용접 전체를 통틀어도
10 mm를 넘지 않는다.

## 동작 조건

아크 트래킹은 **실제 용접(아크 온) 중에만** 켜진다.

- DryRun은 `simMode = true`로 실행되므로 아크 트래킹이 켜지지 않는다
- 시뮬레이션, 용접 테스트에서도 켜지지 않는다
- 따라서 DryRun 로그에 `ArcWeldTraceControl`이 안 나오는 것이 정상이다

정상 동작 확인은 실제 용접 중 robot-core 콘솔에서 다음 로그로 한다.

```
[RobotService] ArcWeldTraceControl: flag=1 ...
```

## 구현 위치

- 프론트 호출: `robot-front/src/lib/robotApi/index.ts` → `arcTraceControl()`
- 용접 시퀀스 연결: `robot-front/src/pages/UcellSelect/hooks/weldingCore/weldingExecution.ts` → `armArcTracking()`
- 백엔드 핸들러: `robot-core/src/robot_core_all.cpp` → `POST /welding/arc-trace/control`
- SDK 함수: `Robot::ArcWeldTraceControl()` (fairino SDK)
- DB 컬럼 추가: `database/migrations/007_add_arc_tracking_params.sql`

프론트가 값을 보내지 않은 항목은 robot-core가 DB(`welding_config`)에서 읽어 채운다.

## 남은 작업

- 현장에서 `kud` 계수 튜닝 (0.04는 검증되지 않은 초기값)
- 설정 화면(`ArcTrackingSection.tsx`)에 신규 파라미터 8개 노출 (현재는 SQL로 직접 수정)
