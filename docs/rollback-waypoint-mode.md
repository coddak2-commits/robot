# 경유점 방식 롤백 기록 (2026-09-29, v1.1.203)

실제 용접의 이동 방식을 아크 트래킹 여부에 따라 나눴다. 되돌릴 때 이 문서를 본다.

## 현재 동작 (v1.1.203~)

`robot-front/src/pages/UcellSelect/hooks/weldingCore/weldingExecution.ts`

```ts
const batchWeaveCode = getWeaveTypeCode(batchPoints[0].weaving_type ?? null);
const batchArcTracking = arcTrackingActive && VERTICAL_WEAVE_CODES.includes(batchWeaveCode);
const WAYPOINT_BLEND_MM = batchArcTracking ? -1 : 50;
const useWaypoints = !batchArcTracking;
...
await batchMoveL(batchPoints, { perPoint: useWaypoints, blendR: WAYPOINT_BLEND_MM });
```

| 조건 | 이동 방식 | 블렌드 | 터치 보정 |
|---|---|---|---|
| 아크 트래킹 ON + 수직 위빙 | 끝점까지 단일 MoveL (`per_point=false`) | -1 (없음) | 끝점만 |
| 그 외 (트래킹 OFF, 수평 등) | 경유점 방식 (`per_point=true`) | 50mm | 포인트마다 |

robot-core 로그로 구분한다.

- 단일 이동: `Skipping N waypoint(s), single MoveL to endpoint with endpoint offset`
- 경유점: `[per_point] queue preload: N points, blendR=...`

## 왜 바꿨나

- 수직 중간 포인트에서 끝 포인트로 넘어갈 때 방향이 꺾여 비드 모양이 바뀌었다 (2026-09-29 현장).
- 모재가 휘어 생기는 편차는 아크 트래킹이 잡는다는 전제다.
- v1.1.149~166이 쓰던 경로와 같다. 그때는 트래킹이 없어서 가운데가 직선으로 지나가 비드가 휘어 보였고, 그 이유로 v1.1.167에서 경유점 방식으로 바꿨다.

## 경유점 방식으로 되돌리기

`useWaypoints`를 항상 true로 두면 된다. 한 줄이다.

```ts
const useWaypoints = true;
```

블렌드는 그대로 두면 트래킹이 걸린 배치만 -1, 나머지는 50이 된다.
트래킹이 걸린 배치도 블렌드 50을 쓰고 싶으면 `WAYPOINT_BLEND_MM`도 `50`으로 고정한다.
단, 2026-09-29 v1.1.198 실측에서 **트래킹 ON + 블렌드 50 조합은 로봇이 시작점에 멈춘 채 MoveL
code=-4(XMLRPC 실행 실패)가 나고 컨트롤러 연결이 끊겼다.** 그 상태에서는 비상정지도 닿지 않고,
큐에 들어간 블렌드 이동은 컨트롤러가 계속 실행해 로봇이 혼자 움직였다. 이 조합은 다시 쓰지 말 것.

## 판단 기준

U셀이 휘지 않은 상태라면 단일 이동 쪽 비드가 더 낫다(2026-09-29 확인).
U셀이 휘어서 중간이 벌어지면 경유점 방식으로 되돌린다.

직선 이동이 실제로 얼마나 벗어나는지는 터치 결과로 계산할 수 있다.
아래·중간·위의 `find-dy` 값을 보고, 아래와 위를 직선으로 이은 중간값과 실측 중간값의 차이가 편차다.

| 런 | 아래 | 중간 | 위 | 직선 보간 중간 | 편차 |
|---|---|---|---|---|---|
| 2026-09-29 14:45 | -13.8 | -20.6 | -23.5 | -18.7 | 약 2.0mm |
| 2026-09-29 15:01 | 13.8 | 16.2 | 20.3 | 17.0 | 약 0.8mm |

2mm를 넘기 시작하면 경유점 방식을 검토한다.

## 관련 값

- `VERTICAL_WEAVE_CODES = [1, 5, 6, 7]` — 수직 계열 위빙 코드. 이 코드일 때만 트래킹을 건다 (v1.1.197).
- `welding_config.arc_tracking_enabled` — 0이면 `arcTrackingActive`가 false라 항상 경유점 방식으로 간다.
