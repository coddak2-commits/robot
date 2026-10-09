import { TeachingPoint, getExecutableParts, flattenExecutableParts, getPartBoundaryInfo, getPartConditionPointId } from '../..';
import { enableRobot, RealtimeRobotStatus, endWeave, WeldingLogSegment, arcOff, getRobotSettings, moveToCartesianPosition, getInverseKin, arcTraceControl, batchMoveL, BatchMovePoint, getWeldingPartOrder, clearStopLatch, findDx, pulseWireFeedMs, wireFeedDurationMs, WireDirection, splineMove, markArcOff, buildCraterFill } from '../../../../lib';
import { createLogger } from '../../../../lib';
import React from 'react';
import { setWeldingPartOrder } from '../..';
import { WeldingResult, WeldingStartOptions, ClosestCenterlineResult } from './weldingCoreTypes';
import { findClosestCenterlinePoint } from './pathFinding';
import { saveStoppedLog, saveWeldingLog } from './loggingHelpers';
import { moveToJointWithStopCheck, getWeaveTypeCode, calculateDistance, getMinimumWeavingDistance } from './moveStopCheck';
import { loadWeldingSettings } from './sequenceSettings';
import { safeArcOn, setupAndStartWeave, endPartWelding, startPartWelding, safeEndWeave, safeArcOff } from './weaveHelpers';
import { determinePointTouchOffset } from './weldingPointLoop';

const log_weldingExecution = createLogger('weldingCore.weldingExecution');

// 파트 전환 와이어 보정 (v1.1.160, 목표 스틱아웃 25mm).
//
// v1.1.153~159: 아크 OFF 후 후퇴 위치에서 한 번에 밀었다. 그 상태로 이동하니
// 길어진 와이어가 기존 수직 비드에 닿아 휘어서 시작부가 불량이었다(2026-09-18 사진).
// v1.1.160: 두 단계로 나눈다.
//   ① 후퇴 위치에서 retractMm 만큼 당긴다 → 짧은 상태로 이동하므로 간섭 없음
//   ② 시작점에 도착한 뒤 feedMm 만큼 민다 → 이동이 끝난 뒤라 닿을 일이 없음
// v1.1.165: 밀기 양을 포인트별로 나눈다. 2026-09-21 현장 실측에서 같은 12mm를 밀었는데도
// 시작 스틱아웃이 P4 약 10mm, P10 약 15mm로 갈렸다. 목표는 20~25mm(중간값 22mm)이므로
// 부족한 만큼을 각각 더한다(P4 +12 → 24mm, P10 +7 → 19mm).
// 당기기 10mm는 이동 중 기존 비드 간섭을 막는 용도라 그대로 둔다. 밀기는 도착 후라
// 길어져도 닿지 않는다.
// 수직 시작(P9)은 이미 정상이라 0으로 둔다. 0이면 그 단계는 실행하지 않는다.
// v1.1.169: 파트 순서를 수평 먼저(4-5-6, 3-2-1, 10-11-12, 9-8-7)로 바꾸면서
// 와이어 당기기/밀기를 전부 끈다(사용자 요청, 효과 확인용). 0이면 실행하지 않는다.
// 되살릴 때 참고: 1.1.165 값은 P4 10/24, P10 10/19, 그 외 수평 10/12.
const HORIZONTAL_WIRE_PLAN: Record<string, { retractMm: number; feedMm: number }> = {
  p4: { retractMm: 0, feedMm: 0 },
  p10: { retractMm: 0, feedMm: 0 },
};
const HORIZONTAL_WIRE_DEFAULT = { retractMm: 0, feedMm: 0 };
const VERTICAL_WIRE_PLAN = { retractMm: 0, feedMm: 0 };
const VERTICAL_POINT_NUMBERS = [1, 2, 3, 7, 8, 9];
// [v1.1.227] 크레이터 채움은 수직 파트 끝에서만 한다(사용자 요청 2026-10-07).
// v1.1.219에서 분기 없이 모든 파트 끝에 넣었던 것을 좁힌다.
// 수평(P4-P6, P10-P12) 끝은 다음 파트와 이어지는 자리라 크레이터가 생기지 않는다.
// 거기서 램프를 돌면 그 자리에 1.6초를 더 머물며 쌓기만 한다.
// buildCraterFill 에 전류를 안 넘기면 undefined 가 되고, robot-core 는
// v1.1.218 과 같은 경로(전류 유지 500ms -> arcEnd -> 번백)로 간다.
//
// [v1.1.228] 판정 기준을 '수직 포인트'에서 '비드가 실제로 끊기는 자리'로 바꾼다.
// 227 의 번호 목록(1,2,3,7,8,9)은 수직 파트가 P1/P7 에서 끝나던 구성에서만 맞았다.
// 모서리 파트(P4->P3, P10->P9)를 넣으면 그 파트 끝 P3/P9 가 목록에 걸려 크레이터가
// 돌고, 수직이 같은 자리에서 바로 이어받는데 거기 1.6초를 더 쌓아 개선선 중간에
// 덩어리가 생긴다. 한 셀에서 비드가 끊기는 자리는 수직 위쪽 끝 둘뿐이다.
//   수평 끝 P6/P12  : 바닥 중앙에서 서로 만난다
//   모서리 끝 P3/P9 : 수직 파트가 같은 자리에서 이어받는다
//   수직 끝 P1/P7   : 여기만 끊긴다
// 파트 구성을 또 바꿀 때는 이 목록만 보면 된다.
const CRATER_END_POINT_IDS = ['p1', 'p7'];
const isCraterEndPointId = (pointId?: string): boolean =>
  CRATER_END_POINT_IDS.includes((pointId ?? '').toLowerCase());
// 파트 시작 체류 (v1.1.158). 아크를 켠 자리에서 잠깐 머물러 시작부를 채운다.
// 수평 시작(P4/P10)은 수직 비드와 만나는 지점이라 틈이 남아 수동 보강이 필요했다(2026-09-18 사진).
// 아크 ON 시퀀스 안에 이미 점화 후 500ms 대기가 있으므로 실제 체류는 이 값만큼 더해진다.
// 0으로 두면 체류 없음.
// v1.1.202: 수직 시작점에도 같은 1초 체류를 넣는다(모서리 메꿈, 사용자 요청).
// 체류는 파트 시작점에서만 실행되므로, 수직 양끝(P1·P3, P7·P9)을 모두 등록해 두면
// 파트 순서가 바뀌어도(3-2-1 이든 1-2-3 이든) 실제 시작점 한 곳에서만 걸린다.
// v1.1.204: 수직 시작 체류를 1000 -> 500ms로 줄인다(사용자 요청). 수평은 1000 유지.
// [v1.1.224] 수직 시작 체류를 0으로 둔다(사용자 요청 2026-10-06).
// 0이면 dwellAtPartStart가 바로 반환하므로 제자리 정지도, 기어가기도 하지 않는다.
// 아크를 켜고 곧바로 배치 이동으로 들어간다. 수평(P4/P10) 1000ms는 그대로다.
// 되돌리려면 p1/p3/p7/p9 를 500으로 되돌리면 된다(그때는 제자리 정지).
// 기어가기까지 되살리려면 아래 PART_START_CREEP_ENABLED 도 같이 켤 것.
// [v1.1.228] 모서리 파트 도입으로 수평 시작점이 P4/P10 -> P5/P11 로 옮겨간다.
// P4/P10 은 1000ms 를 그대로 둔다. 이제 모서리 파트의 시작점이고, 그 자리가 바로
// 채우려는 모서리다. 결과적으로 모서리에는 수평 시작 체류 1초 + 모서리 시작 체류
// 1초가 들어간다. 과하게 쌓이면 P4/P10 쪽을 먼저 줄일 것.
// [v1.1.232] 시작 체류를 전부 뺀다(사용자 요청 2026-10-08).
// 이 체류는 모서리를 채우려고 넣었던 것이다(v1.1.158 수평, v1.1.202 수직).
// v1.1.228 에서 모서리를 별도 파트로 떼면서 그 역할이 모서리 파트로 넘어갔다.
// 같은 자리에 체류까지 겹치면 거기 2초를 머물며 쌓기만 한다.
// 전부 0 이면 dwellAtPartStart 가 바로 반환한다. 아크를 켜고 곧바로 배치 이동으로
// 들어간다. 키는 남겨둔다 — 되살릴 때 값만 넣으면 된다.
// (v1.1.224 에서 수직 0, v1.1.232 에서 수평·모서리 0)
const PART_START_DWELL_MS: Record<string, number> = {
  p1: 0, p3: 0, p7: 0, p9: 0,
  p4: 0, p10: 0,
  p5: 0, p11: 0,
};
// v1.1.205: 체류를 '제자리 정지'에서 '아주 짧은 거리를 아주 느리게 이동'으로 바꾼다.
// 위빙은 이동 궤적에 겹쳐서 나오는 기능이라 정지 상태에서는 위빙 모양이 안 나온다
// (2026-09-29 현장 확인). 다음 포인트 방향으로 이 거리만큼 체류 시간에 걸쳐 기어가면
// 위빙 한 주기(2Hz면 500ms)가 그 구간에 들어간다.
// 속도 모델: 실제 이동속도 = 5.795mm/s x 명령% (v1.1.130에서 실측 확인).
// 거리를 키우거나 체류 시간을 줄이면 명령%가 올라간다. 컨트롤러가 저속을 거부하면
// 이 값을 키울 것. 이동이 실패하면 예전처럼 제자리 정지로 대체한다.
// v1.1.211: 거리 3 -> 12mm, 속도를 '체류시간으로 역산'에서 '용접 속도 대비 비율'로 바꾼다.
// 이전 값은 3mm / 500ms = 6.0mm/s 인데 명령 1%가 5.795mm/s 라, 저속 이동이 아니라
// 사실상 용접 속도 그대로였다. 프런트에서 속도를 Math.round 로 정수화하고 1% 하한을
// 걸어둔 탓이다(robot-core의 clampMotionPercent 는 0.1%까지 받는다).
// 아크를 켠 직후 10~15mm 는 모재가 차가워 비드가 얇게 깔린다. 그 구간을 용접 속도의
// 절반으로 지나가 두껍게 채운다. 2026-09-30 모서리 미충전 사진 대응.
// 수평/수직의 CPM 이 다르므로 고정 시간이 아니라 그 파트의 용접 속도에서 계산한다.
// v1.1.213: 12mm/0.5 -> 5mm/0.7. 아크 트래킹 기준 전류 샘플링과 겹치지 않게 줄인다.
// welding_config.arc_tracking_refer_sample_start_ud = 8 은 위빙 8주기 뒤부터
// 기준 전류를 재라는 뜻이고, 2Hz 위빙이면 아크 ON 후 약 4초 지점이다.
// 12mm/0.5 는 수직 기준 0.23%(1.33mm/s)라 9.0초가 걸려 그 4초를 덮는다.
// 기어가기 중에는 절반 속도라 용융지와 전류가 정상 주행과 다른데, 하필 그 값이
// 기준으로 잡히면 남은 용접 내내 그 조건을 쫓게 된다.
// 5mm/0.7 이면 0.32%(1.86mm/s), 2.7초로 샘플링 시작 전에 끝난다.
// 거리를 다시 늘리려면 arc_tracking_refer_sample_start_ud 도 같이 밀어야 한다.
// (2026-09-30 기준 실측 용접 속도: 수직 0.4597%=2.66mm/s, 수평 0.7471%=4.33mm/s)
// [v1.1.224] 기어가기 해제(사용자 요청 2026-10-06).
// 기어가기는 수직에서만 쓰였는데 위에서 수직 체류를 0으로 뒀으므로 어차피
// 도달하지 않는다. 체류만 되살리고 기어가기는 끈 상태로 두고 싶을 때를 위해
// 플래그를 남긴다. 아래 기어가기 코드도 지우지 않고 그대로 둔다.
// 주의: 정지 상태에서는 위빙 궤적이 안 나온다(2026-09-29 현장 확인).
// 시작점 위빙이 필요해지면 이 값을 다시 켜고, 그때는 아크 트래킹의
// arc_tracking_refer_sample_start_ud 와 겹치지 않는지 같이 볼 것.
const PART_START_CREEP_ENABLED = false;
const PART_START_CREEP_MM = 5;
const PART_START_CREEP_SPEED_RATIO = 0.7;
const SPEED_MM_PER_SEC_PER_PCT = 5.795;
// robot-core 의 WeldBatch 가 쓰는 환산과 같은 값 (v1.1.130 실측).
const WELD_BATCH_SPEED_SCALE = 0.431;
async function dwellAtPartStart(
  point: TeachingPoint,
  nextPoint: TeachingPoint | undefined,
  active: boolean,
): Promise<void> {
  if (!active) return;
  const ms = PART_START_DWELL_MS[point.id] ?? 0;
  if (ms <= 0) return;
  const holdStill = async () => {
    await new Promise(resolve => setTimeout(resolve, ms));
  };
  // v1.1.210: 기어가기는 수직에서만 쓴다. 수평(P4/P10)은 v1.1.204처럼 제자리 정지로
  // 되돌린다. 2026-09-30 15:27 사고에서 기어가기가 수평 블렌드 이동과 겹쳐 모션이
  // 물렸다. v1.1.209에서 수평 블렌드를 없애 조건 자체는 사라졌지만, 시작점에 MoveL을
  // 하나 더 얹는 구조를 검증된 쪽(수직)에만 남긴다. 수직은 같은 기어가기로 정상
  // 동작이 확인된 상태다(2026-09-30 현장).
  if (!PART_START_CREEP_ENABLED) {
    log_weldingExecution.info(
      'welding.partStart.dwell',
      `파트 시작 체류: ${point.name} ${ms}ms (제자리 정지 - 기어가기 해제됨)`,
    );
    await holdStill();
    return;
  }
  const pointNum = parseInt((point.id ?? '').replace(/\D/g, ''), 10);
  if (!VERTICAL_POINT_NUMBERS.includes(pointNum)) {
    log_weldingExecution.info(
      'welding.partStart.dwell',
      `파트 시작 체류: ${point.name} ${ms}ms (수평 - 제자리 정지)`,
    );
    await holdStill();
    return;
  }
  // 보정을 빌려 쓴 포인트(자기 touchOffset이 없는 경우)는 여기서 절대좌표를 다시 만들면
  // 도착 때와 다른 자리로 튈 수 있다. 그럴 때는 기어가지 않고 그냥 멈춘다.
  if (!point.tcp || !nextPoint?.tcp || !point.touchOffset) {
    log_weldingExecution.info(
      'welding.partStart.dwell',
      `파트 시작 체류: ${point.name} ${ms}ms (제자리 정지)`,
    );
    await holdStill();
    return;
  }
  const dx = nextPoint.tcp.x - point.tcp.x;
  const dy = nextPoint.tcp.y - point.tcp.y;
  const dz = nextPoint.tcp.z - point.tcp.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (!Number.isFinite(dist) || dist < PART_START_CREEP_MM * 2) {
    log_weldingExecution.info(
      'welding.partStart.dwell',
      `파트 시작 체류: ${point.name} ${ms}ms (구간이 짧아 제자리 정지)`,
    );
    await holdStill();
    return;
  }
  const k = PART_START_CREEP_MM / dist;
  const offset = [
    point.touchOffset.dx + dx * k,
    point.touchOffset.dy + dy * k,
    point.touchOffset.dz + dz * k,
    0,
    0,
    0,
  ];
  // 그 파트의 용접 속도(명령%)를 배치와 같은 식으로 구한 뒤 비율을 곱한다.
  // 반올림하지 않는다. 정수로 올리면 1%(=5.795mm/s)로 붙어 용접 속도와 같아진다.
  const rawSpeed = point.moveSpeed ?? 15;
  const weldPct = (point.velMode ?? 1) === 1
    ? (rawSpeed / 15) * WELD_BATCH_SPEED_SCALE
    : rawSpeed;
  const speedPct = Math.min(100, Math.max(0.1, weldPct * PART_START_CREEP_SPEED_RATIO));
  const mmPerSec = speedPct * SPEED_MM_PER_SEC_PER_PCT;
  const creepSec = PART_START_CREEP_MM / mmPerSec;
  log_weldingExecution.info(
    'welding.partStart.dwell',
    `파트 시작 체류: ${point.name} ${PART_START_CREEP_MM}mm 저속 이동 `
    + `(용접 ${weldPct.toFixed(2)}% x ${PART_START_CREEP_SPEED_RATIO} = ${speedPct.toFixed(2)}%, `
    + `${mmPerSec.toFixed(2)}mm/s, 약 ${creepSec.toFixed(1)}초)`,
  );
  try {
    const result = await moveToCartesianPosition(
      point.tcp,
      speedPct,
      100,
      100,
      -1,
      1,
      offset,
      undefined,
      point.toolNum ?? 3,
      point.userNum ?? 0,
      0,
    );
    if (result?.status_code !== 200) {
      log_weldingExecution.warn(
        'welding.partStart.dwell.fallback',
        `파트 시작 저속 이동 실패 (status=${result?.status_code}) - 제자리 정지로 대체`,
      );
      await holdStill();
    }
  } catch (error) {
    log_weldingExecution.warn(
      'welding.partStart.dwell.error',
      `파트 시작 저속 이동 오류 - 제자리 정지로 대체`,
      { error: String(error) },
    );
    await holdStill();
  }
}
// 시작점 확인 터치 (v1.1.164, 드라이런 전용).
// 터치 보정을 적용해 시작점에 도착한 뒤, 접합부까지 실제로 얼마나 남았는지 -X로 한 번 더
// 탐색해서 남긴다. 2026-09-21 세트에서 좌우 점화 시간이 1.29/1.36초(좌) vs 1.60/1.58초(우)로
// 갈렸는데, 그게 보정이 덜 먹어서 생긴 위치 차이인지 다른 원인인지 가리기 위한 진단이다.
// 실제 용접에서는 돌지 않는다(드라이런에서만). 코어가 find-dx COMPLETE: delta=..를 로그에
// 남기므로 좌우 값을 비교하면 된다.
// 탐색이 끝나면 접촉점에서 retract_distance(10mm)만큼 물러난 자리에 서므로,
// 같은 좌표·같은 보정으로 다시 이동해 원위치시킨다.
// v1.1.173: 비활성화. 2026-09-22 드라이런에서 P9 확인 터치가 접촉을 감지하지 못하고
// -X 45mm를 밀고 들어가 U셀을 밀었다(code=185). 진단 목적(점화 지연 원인)은 이미 결론이 났다.
const START_GAP_VERIFY_ENABLED = false;
async function verifyStartGap(
  point: TeachingPoint,
  offsetFlag: number,
  offset: number[],
  active: boolean,
): Promise<void> {
  if (!START_GAP_VERIFY_ENABLED || !active || !point.tcp) return;
  log_weldingExecution.info('welding.startGap.begin', `시작점 확인 터치: ${point.name} (-X)`);
  try {
    const result = await findDx(-1);
    const delta = result?.data?.delta_x;
    if (result?.status_code === 200 && delta !== undefined) {
      log_weldingExecution.info(
        'welding.startGap.result',
        `시작점 확인 터치: ${point.name} 남은 거리 ${Math.abs(delta).toFixed(2)}mm`,
        { deltaX: delta },
      );
    } else {
      log_weldingExecution.warn('welding.startGap.failed', `시작점 확인 터치 실패: ${point.name}`, {
        status: result?.status_code,
      });
    }
  } catch (error) {
    log_weldingExecution.warn('welding.startGap.error', `시작점 확인 터치 오류: ${point.name}`, {
      error: String(error),
    });
  }
  const back = await moveToCartesianPosition(
    point.tcp,
    30,
    100,
    100,
    -1,
    offsetFlag,
    offset,
    undefined,
    point.toolNum ?? 3,
    point.userNum ?? 0,
    0,
  );
  if (back?.status_code !== 200) throw new Error('시작점 확인 터치 후 복귀 이동 실패');
}
// v1.1.212: 횡단 전환 후퇴가 도달 불가로 실패하면 거리를 줄여 다시 시도한다.
//
// 2026-09-30 15:59 로그: P1(좌측 상단, z=554)에서 base +X 100mm 후퇴가
//   MoveL() -> code=112 | 직선이동 실패
// 로 거부됐다. 그 4ms 뒤 홈 MoveJ 가 나가면서, 물러나지 않은 자리에서 팔이 움직여
// 와이어가 모재를 스쳤다. 그리고 여기서 예외를 던지는 바람에 용접 사이클도 중단됐다
// (같은 로그에서 16:01 수동 와이어 작업 -> 16:03 터치센싱 재시작).
//
// 그래서 후퇴 거리를 키우면 안 된다. 닿는 거리까지 단계적으로 줄인다.
// 끝까지 안 되면 경고만 남기고 진행한다. 후퇴 실패가 사이클 중단 사유는 아니다.
const CROSS_RETRACT_RATIOS = [1, 0.7, 0.45, 0.25];
const CROSS_RETRACT_MIN_MM = 15;
// v1.1.214: 한 번 성공한 거리를 포인트별로 기억해 다음 사이클부터 바로 쓴다.
// 도달 가능 여부는 그 포인트의 자세가 정하는 값이라 사이클마다 달라지지 않는다.
// 기억이 없으면 종전처럼 큰 거리부터 시도한다. 성공만 기억하고 실패는 안 남긴다
// (티칭을 고치면 다시 늘어날 수 있어야 한다). 새로고침하면 초기화된다.
const crossRetractLearnedMm = new Map<string, number>();
async function retreatBaseX(
  point: TeachingPoint,
  requestedMm: number,
  speed: number,
): Promise<number> {
  if (!point.tcp || requestedMm <= 0) return 0;
  const key = point.id ?? point.name ?? '';
  const learned = crossRetractLearnedMm.get(key);
  const candidates = CROSS_RETRACT_RATIOS
    .map(ratio => Math.round(requestedMm * ratio))
    .filter(mm => mm >= CROSS_RETRACT_MIN_MM);
  const narrowed = learned === undefined
    ? candidates
    : candidates.filter(mm => mm <= learned);
  const tryList = narrowed.length > 0 ? narrowed : candidates;
  if (learned !== undefined && tryList[0] !== candidates[0]) {
    log_weldingExecution.info(
      'welding.partTransition.retract.learned',
      `${key} 이전에 성공한 후퇴 ${learned}mm 부터 시도`,
    );
  }
  for (const mm of tryList) {
    let status: number | undefined;
    let code: unknown;
    try {
      const res = await moveToCartesianPosition(
        point.tcp,
        speed,
        100,
        100,
        -1,
        1,
        [mm, 0, 0, 0, 0, 0],
        undefined,
        point.toolNum ?? 3,
        point.userNum ?? 0,
        0,
      );
      status = res?.status_code;
      code = res?.result;
    } catch (error) {
      code = String(error);
    }
    if (status === 200) {
      crossRetractLearnedMm.set(key, mm);
      return mm;
    }
    log_weldingExecution.warn(
      'welding.partTransition.retract.retry',
      `후퇴 ${mm}mm 실패 (status=${status ?? '-'} code=${String(code)}) - 거리를 줄여 재시도`,
    );
  }
  return 0;
}
// v1.1.215: 용접 중 화면의 "현재 포인트" 표시를 시간으로 따라가게 한다.
//
// 배치 이동은 블로킹 호출 하나라, 시작할 때 첫 포인트를 찍고 끝난 뒤에 나머지를
// 몰아서 갱신했다. 그래서 수직 200초 내내 중간 포인트로 표시되다가 끝나는 순간
// 끝 포인트로 건너뛰었다. v1.1.209 에서 경유점을 없애며 배치 하나가 용접부 전체가
// 되어 더 두드러졌다.
//
// 실제 좌표를 읽어서 맞추는 방법은 안 된다. 블로킹 이동 중에는 getState() 가
// 캐시값을 돌려주므로 ZMQ 로 나가는 위치도 멈춰 있다([AnalogIn] 이 한 값으로
// 고정되는 것과 같은 이유).
//
// 그래서 명령 속도와 포인트 간 거리로 통과 시각을 계산해 타이머로 넘긴다.
// 표시 전용이고 로봇에 아무것도 보내지 않는다. 추정이므로 트래킹 보정이나
// 감속으로 실제와 조금 어긋날 수 있고, 속도 오버라이드(default_ovl)는 반영하지
// 않는다. 정확한 추종이 필요해지면 getState() 락 분리가 전제다.
function tcpDistanceMm(a: number[], b: number[]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
function scheduleBatchPointIndex(
  fromTcp: number[] | null,
  batchPoints: BatchMovePoint[],
  batchIndices: number[],
  weldPct: number,
  mark: (index: number) => void,
): () => void {
  const mmPerSec = weldPct * SPEED_MM_PER_SEC_PER_PCT;
  if (!fromTcp || !(mmPerSec > 0) || batchPoints.length < 2) return () => {};
  const timers: ReturnType<typeof setTimeout>[] = [];
  let acc = 0;
  let from = fromTcp;
  for (let k = 0; k < batchPoints.length - 1; k++) {
    const to = batchPoints[k].tcp;
    acc += tcpDistanceMm(from, to);
    from = to;
    const atMs = (acc / mmPerSec) * 1000;
    if (!Number.isFinite(atMs) || atMs <= 0) continue;
    const nextIndex = batchIndices[k + 1];
    timers.push(setTimeout(() => mark(nextIndex), atMs));
  }
  return () => timers.forEach(t => clearTimeout(t));
}
function partWirePlan(point: TeachingPoint): { retractMm: number; feedMm: number } | null {
  const id = (point.id ?? '').toLowerCase();
  const n = parseInt(id.replace(/\D/g, ''), 10);
  if (!Number.isFinite(n)) return null;
  if (VERTICAL_POINT_NUMBERS.includes(n)) return VERTICAL_WIRE_PLAN;
  return HORIZONTAL_WIRE_PLAN[id] ?? HORIZONTAL_WIRE_DEFAULT;
}
async function runWirePulse(
  direction: WireDirection,
  amountMm: number,
  tag: string,
  detail: string,
): Promise<void> {
  const ms = wireFeedDurationMs(amountMm, direction);
  if (ms <= 0) return;
  log_weldingExecution.info(tag, `${detail} ${direction} ${amountMm}mm (${ms}ms)`);
  const result = await pulseWireFeedMs(direction, ms);
  if (!result.stopped) throw new Error('와이어 송급 정지 실패 - 비상정지로 즉시 멈추세요');
  if (!result.ok) log_weldingExecution.warn(`${tag}.fail`, `와이어 보정 실패: ${result.error ?? ''}`);
}
// ① 후퇴 위치에서 당기기 (이동 중 간섭 방지)
async function retractWireBeforeTransition(point: TeachingPoint): Promise<void> {
  const plan = partWirePlan(point);
  if (!plan || plan.retractMm <= 0) return;
  await runWirePulse('reverse', plan.retractMm, 'welding.partTransition.wireRetract',
    `파트 전환 와이어 당기기: ${point.name}`);
}
// ② 시작점 도착 후 밀기 (아크 ON 직전)
async function feedWireAtPartStart(point: TeachingPoint): Promise<void> {
  const plan = partWirePlan(point);
  if (!plan || plan.feedMm <= 0) return;
  await runWirePulse('forward', plan.feedMm, 'welding.partStart.wireFeed',
    `파트 시작 와이어 밀기: ${point.name}`);
}
export interface WeldingExecutionContext {
  stopRef: React.MutableRefObject<boolean>;
  setCurrentPointIndex: (index: number) => void;
  showAlert: (
    message: string,
    options?: { type?: 'error' | 'warning' | 'info' | 'success'; title?: string },
  ) => void;
  setLastWeldingResult: (result: WeldingResult | null) => void;
  setArcActive?: (active: boolean) => void;
}
export async function executeWelding(
  teachingPoints: TeachingPoint[],
  robotState: RealtimeRobotStatus | null,
  simMode: boolean,
  context: WeldingExecutionContext,
  jobId?: number,
  jobName?: string,
  options?: WeldingStartOptions,
): Promise<WeldingResult | null> {
  const { stopRef, setCurrentPointIndex, showAlert, setLastWeldingResult, setArcActive } = context;
  // setCurrentPointIndex는 React state 갱신이라 이 함수 안에서 즉시 읽을 수 없다.
  // v1.1.133까지는 context.currentPointIndex(호출 시점에 복사된 숫자)를 읽어서,
  // 중단/실패 로그의 completedPoints가 항상 '용접 시작 직전 값'으로 기록됐다.
  // 로컬 변수로 직접 추적한다 (v1.1.134 수정).
  let lastPointIndex = -1;
  const markPointIndex = (index: number) => {
    lastPointIndex = index;
    setCurrentPointIndex(index);
  };
  const startFromClosest = options?.startFromClosest ?? false;
  const currentTcp = options?.currentTcp;
  const isDryRun = options?.isDryRun ?? false;
  const isWeldingTest = options?.isWeldingTest ?? false;
  const totalTimer = log_weldingExecution.startTimer();
  const startedAt = new Date();
  log_weldingExecution.info('welding.start', simMode ? '시뮬레이션 시작' : '용접 시작', {
    simMode,
    startFromClosest,
    hasTcp: !!currentTcp,
  });
  try {
    const partOrder = await getWeldingPartOrder();
    if (partOrder.length > 0) {
      setWeldingPartOrder(partOrder.map(p => ({ part_name: p.part_name, points: p.points })));
      log_weldingExecution.info('welding.partOrder', '용접 파트 순서 로드', {
        order: partOrder.map(p => `${p.execution_order}:${p.part_name}`),
      });
    }
  } catch {
  }
  const homePoint = teachingPoints.find(
    pt => pt.id === 'home' && pt.isSaved && pt.joints && pt.joints.length > 0,
  );
  if (!homePoint && !startFromClosest) {
    showAlert('Home 포인트가 저장되어 있지 않습니다.', { type: 'warning', title: '포인트 없음' });
    return null;
  }
  const partWeldEnabled = options?.partWeldEnabled;
  const executableParts = getExecutableParts(teachingPoints, partWeldEnabled);
  const weldingPoints = flattenExecutableParts(executableParts);
  const partBoundaryInfo = getPartBoundaryInfo(executableParts);
  // [v1.1.237] idx 포인트가 속한 파트의 조건(전류·전압·위빙·속도·트래킹)을 읽을 포인트.
  // 모서리 파트([P3,P4] / [P9,P10])만 P4/P10 을 돌려주고, 그 외에는 idx 포인트 그대로다.
  // 모서리를 위->아래로 돌리면서 시작점 P3/P9 가 수직 파트의 시작점과 같아졌다.
  // 첫 포인트에서 읽으면 모서리가 수직 조건으로 돈다. getPartConditionPointId 참고.
  const conditionPointAt = (idx: number): TeachingPoint | undefined => {
    const pt = weldingPoints[idx];
    const part = executableParts[partBoundaryInfo.pointPartIndices[idx]];
    if (!pt || !part) return pt;
    const condId = getPartConditionPointId(part.pointIds);
    if (!condId || condId === part.pointIds[0]) return pt;
    return part.savedPoints.find(p => p.id === condId) ?? pt;
  };
  if (weldingPoints.length === 0) {
    showAlert('저장된 용접 포인트가 없습니다. (각 파트에 2개 이상 포인트 필요)', {
      type: 'warning',
      title: '포인트 없음',
    });
    return null;
  }
  const endPoint =
    weldingPoints.find(pt => pt.weldVoltage === null) || weldingPoints[weldingPoints.length - 1];
  let startPointIndex = 0;
  let paramPointIndex = 0;
  let closestCenterlineResult: ClosestCenterlineResult | null = null;
  if (startFromClosest && currentTcp) {
    closestCenterlineResult = findClosestCenterlinePoint(
      teachingPoints,
      currentTcp,
      partWeldEnabled,
    );
    if (closestCenterlineResult) {
      startPointIndex = closestCenterlineResult.segmentStartIndex;
      paramPointIndex = closestCenterlineResult.closestTeachingPointIndex;
    }
  }
  markPointIndex(startPointIndex);
  let totalPathDistance = 0;
  // 용접 구간만의 거리(파트 전환 이동 제외).
  let weldPathDistance = 0;
  let representativeCpm = 0;
  let totalExpectedDurationSec = 0;
  let segments: WeldingLogSegment[] = [];
  let firstWeldPoint = conditionPointAt(paramPointIndex) || weldingPoints[0];
  // 아크가 켜져 있을 가능성. 중단/실패 경로에서 아크를 끄기 위한 플래그다.
  // v1.1.143까지 handleStopped()는 로그만 저장했다. 2026-09-15에 용접 중 MoveL이
  // code=-4로 실패했을 때 아크가 66초 동안 켜진 채 남아 모재가 손상됐다. (v1.1.144)
  let arcMayBeOn = false;
  const handleStopped = async (completedPtIdx: number) => {
    if (arcMayBeOn) {
      arcMayBeOn = false;
      log_weldingExecution.warn('welding.stopped.shutdown', '중단 감지 — 아크/위빙 즉시 종료');
      try {
        const { emergencyWeldingShutdown } = await import('../../../../utils');
        await emergencyWeldingShutdown();
      } catch {
        await safeEndWeave();
        await safeArcOff(500);
        await arcTraceControl({ flag: 0 }).catch(() => {});
      }
      setArcActive?.(false);
    }
    const result = await saveStoppedLog({
      startedAt,
      segments,
      weldingPoints,
      firstWeldPoint,
      completedPointIndex: completedPtIdx,
      jobId,
      jobName,
      simMode,
      isDryRun,
      startFromClosest,
      representativeCpm,
      totalExpectedDurationSec,
    });
    if (result) setLastWeldingResult(result);
    return result;
  };
  try {
    // 이전 비상정지/정지의 래치를 해제한다. 해제하지 않으면 robot-core가
    // 아크 ON을 거부한다. (v1.1.145)
    await clearStopLatch().catch(() => {});
    if (!robotState?.servo_enabled) await enableRobot();
    await endWeave().catch(() => {});
    if (!startFromClosest && !simMode) {
      const homeResult = await moveToJointWithStopCheck(
        homePoint!.joints!,
        homePoint!.moveSpeed,
        homePoint!.toolNum ?? 3,
        homePoint!.userNum ?? 0,
        stopRef,
      );
      if (homeResult.stopped) return await handleStopped(0);
      if (!homeResult.success) throw new Error('Home 이동 실패');
    }
    let configuredMinWeavingDistance = 50;
    try {
      const rs = await getRobotSettings();
      configuredMinWeavingDistance = rs.min_weaving_distance || 50;
    } catch {
    }
    firstWeldPoint = conditionPointAt(startPointIndex) ?? weldingPoints[startPointIndex];
    const hasWelding = isWeldingTest
      ? false
      : !!(firstWeldPoint.weldVoltage && firstWeldPoint.weldCurrent);
    const hasWeaving = !!(firstWeldPoint.weavingType && firstWeldPoint.weavingType !== 'none');
    const weaveTypeCode = getWeaveTypeCode(firstWeldPoint.weavingType);
    // v1.1.131: 1.0으로 복원(=보정 없음). 거리 x 6 / cpm 은 mm와 cm/min 사이의
    // 물리적으로 정확한 소요시간 계산이다. 0.68은 CPM 설정값이 실제 이동속도와
    // 어긋나 있던 시절(설정의 41~70%만 실제로 나감) 팝업 숫자를 억지로 맞추려고
    // 넣었던 값으로, v1.1.130에서 WELD_BATCH_SPEED_SCALE을 0.431로 바로잡아
    // CPM이 실제 cm/min과 일치하게 된 지금은 불필요하다.
    // 실측 대조(v1.1.130 DryRun): 수직 예상 117.7초/실제 122.2초, 수평 158.2초/159.7초.
    // 남는 2~4초 차이는 홈 복귀·접근 이동 등 고정 오버헤드.
    const CPM_CORRECTION_FACTOR = 1.0;
    let minSegmentDistance = Infinity;
    segments = [];
    // v1.1.137: 파트 전환 구간(다른 파트로 건너가는 이동)은 용접이 아니라 30% 속도로
    // 몇 초 만에 지나가는데, 예전에는 이 구간까지 용접 속도(cpm)로 환산해 예상 시간에
    // 더하고 있었다. 실측 예: 전환 1506.6mm가 예상에 479초를 얹어 1026.5초로 부풀려짐
    // (실제 546.5초). isSamePart은 이미 계산해두고 최소 위빙 거리 판정에만 쓰고 있었음.
    // 전환 구간은 expected_sec=0으로 두고 is_transition으로 표시한다.
    for (let i = 0; i < weldingPoints.length - 1; i++) {
      const dist = calculateDistance(weldingPoints[i].tcp, weldingPoints[i + 1].tcp);
      totalPathDistance += dist;
      const isSamePart =
        partBoundaryInfo.pointPartIndices[i] === partBoundaryInfo.pointPartIndices[i + 1];
      if (isSamePart && dist < minSegmentDistance) minSegmentDistance = dist;
      if (isSamePart) weldPathDistance += dist;
      const segmentCpm = weldingPoints[i + 1].moveSpeed || 50;
      const toPoint = weldingPoints[i + 1];
      segments.push({
        from: weldingPoints[i].id,
        to: toPoint.id,
        distance_mm: dist,
        cpm: segmentCpm,
        is_transition: !isSamePart,
        expected_sec: isSamePart ? ((dist * 6) / segmentCpm) * CPM_CORRECTION_FACTOR : 0,
        gap: toPoint.gap,
        weld_voltage: toPoint.weldVoltage,
        weld_current: toPoint.weldCurrent,
        weaving_type: toPoint.weavingType,
        weave_params: toPoint.weaveParams as unknown as Record<string, unknown>,
        touch_offset: toPoint.touchOffset,
      });
    }
    totalExpectedDurationSec = segments.reduce((sum, seg) => sum + seg.expected_sec, 0);
    representativeCpm = firstWeldPoint.moveSpeed || 50;
    if (hasWeaving) {
      const minWeavingDist = getMinimumWeavingDistance(
        firstWeldPoint.weaveParams.weaveRange,
        configuredMinWeavingDistance,
      );
      if (minSegmentDistance < minWeavingDist) {
        log_weldingExecution.warn(
          'welding.weaving.shortSegment',
          '포인트 간 거리가 위빙 권장 거리보다 짧음 (위빙 계속 진행)',
          {
            minSegmentDistance: minSegmentDistance.toFixed(1),
            minWeavingDist: minWeavingDist.toFixed(1),
          },
        );
      }
    }
    const { sequence: sequenceSettings, safety: safetySettings } = await loadWeldingSettings();
    // 아크 트래킹은 파트마다 다시 걸어야 한다 (v1.1.139).
    // 기준 전류를 아크 점화 직후 실측으로 잡는 설정(reference_type=0)에서, 파트마다
    // arcOn을 다시 하는데 트래킹을 용접 시작 때 한 번만 켜두면 첫 파트(수직 260A)에서
    // 잡은 기준이 다음 파트(수평 300A)에도 그대로 쓰여 반대 방향으로 보정할 수 있다.
    // 세부 계수는 robot-core가 DB(welding_config)에서 읽으므로 여기서는 flag만 넘긴다.
    // 매뉴얼(FAIRINO 사용설명서 5.7.8.6, p.218)의 아크 추적 파라미터는 보상 시간 단위가
    // cyc(위빙 주기)이고 상하 좌표계 선택지에 '스윙'이 있다. 위빙을 전제로 한 기능으로
    // 보이므로 위빙이 없는 구간에는 걸지 않는다. (v1.1.148)
    // 위빙 없이도 동작하는지는 아직 실측으로 확인되지 않았다. 확인되면 이 조건을 완화할 것.
    const arcTrackingActive =
      sequenceSettings.arcTrackingEnabled && hasWelding && hasWeaving && weaveTypeCode >= 0 &&
      !simMode && !isWeldingTest;
    if (sequenceSettings.arcTrackingEnabled && hasWelding && !simMode && !isWeldingTest &&
        !(hasWeaving && weaveTypeCode >= 0)) {
      log_weldingExecution.warn(
        'welding.arcTrace.skipped',
        '아크 트래킹이 켜져 있지만 위빙이 없어 적용하지 않습니다',
        { hasWeaving, weaveTypeCode },
      );
      showAlert('위빙이 없어 아크 트래킹을 적용하지 않습니다.', {
        type: 'warning',
        title: '아크 트래킹 미적용',
      });
    }
    let arcTrackingWarned = false;
    // 아크 트래킹은 수직 위빙 파트에만 건다. (v1.1.196)
    // 벤더 Lua(Ucell0)는 수직 용접(vl/vr)에만 ArcWeldTraceControl(1)을 걸고
    // 수평(hl/hr)에는 아예 걸지 않는다. 상하 보정이 위빙 궤적을 기준으로 전류를
    // 샘플링하므로 위빙 평면이 다르면 보정 방향이 달라진다.
    // v1.1.169로 파트 순서가 수평 먼저가 되면서 트래킹이 수평 첫 파트에 걸렸고,
    // 그 시작점에서 아크만 켜진 채 정지하는 증상이 났다.
    // 수평 파트에서는 0을 보내 직전 파트의 트래킹을 명시적으로 끈다.
    const VERTICAL_WEAVE_CODES = [1, 5, 6, 7];
    const armArcTracking = async (point: TeachingPoint) => {
      if (!arcTrackingActive) return;
      const weaveCode = getWeaveTypeCode(point.weavingType ?? firstWeldPoint.weavingType);
      const isVertical = VERTICAL_WEAVE_CODES.includes(weaveCode);
      try {
        await arcTraceControl({ flag: isVertical ? 1 : 0 });
        log_weldingExecution.info(
          'welding.arcTrace.set',
          `아크 트래킹 ${isVertical ? 'ON' : 'OFF'}: ${point.name} (위빙 코드 ${weaveCode})`,
        );
      } catch (arcTraceError) {
        log_weldingExecution.error(
          'welding.arcTrace.failed',
          '아크 트래킹을 켜지 못했습니다 — 토치 높이 보정 없이 용접합니다',
          { error: String(arcTraceError) },
        );
        // 보정을 못 켰다고 용접을 중단시킬 이유는 없다. 다만 조용히 넘어가면
        // '켜져 있다'고 오인하므로 한 번은 사용자에게 알린다.
        if (!arcTrackingWarned) {
          arcTrackingWarned = true;
          showAlert('아크 트래킹을 켜지 못했습니다. 토치 높이 보정 없이 진행합니다.', {
            type: 'warning',
            title: '아크 트래킹 미적용',
          });
        }
      }
    };
    const hasStoredTouchOffsets = weldingPoints.some(pt => pt.touchOffset !== null);
    const approachOffset = sequenceSettings.touchApproachOffset;
    // p9/p10: 같은 위치(우측 수평 코너)에 티칭되어 있고, U셀 구조물과의 간섭으로
    // base +X 접근 시 충돌(code=185) 확인됨 (터치센싱에서 확인, 시작점으로 선택될 때도 동일 적용).
    // [v1.1.228] p11 추가. 모서리 파트 도입으로 우측 수평 시작점이 p10 자리로
    // 옮겨간다(p10 은 모서리 파트 시작점이 된다). 그 자리가 충돌 나는 자리이므로
    // 새 시작점 p11 도 -Y 로 접근해야 한다. 빼면 우측 수평 시작에서 185 가 난다.
    // p9 는 모서리에서 20mm 위로 올라가 -Y 가 꼭 필요하진 않으나 그대로 둔다.
    const NEAR_UCELL_CORNER = ['p9', 'p10', 'p11'];
    const getStartApproachOffsetPos = (pointId: string, offset: number): number[] =>
      NEAR_UCELL_CORNER.includes(pointId.toLowerCase()) ? [0, -offset, 0, 0, 0, 0] : [offset, 0, 0, 0, 0, 0];
    markPointIndex(startPointIndex);
    const startPoint = weldingPoints[startPointIndex];
    const paramPoint = weldingPoints[paramPointIndex];
    if (startFromClosest && closestCenterlineResult) {
      const centerlineTcp = closestCenterlineResult.centerlineTcp;
      const closestTeachingPt = weldingPoints[closestCenterlineResult.closestTeachingPointIndex];
      // [v1.1.225] 교시 원좌표가 아니라 터치 보정이 적용된 실제 위치와 비교한다.
      // currentTcp 는 보정된 경로 위에 있으므로 원좌표와 비교하면 보정량만큼
      // 거리가 부풀어, 바로 그 포인트에 서 있어도 5mm 분기에 안 걸린다.
      const closestPtOff = closestTeachingPt?.touchOffset;
      const distToTeachingPoint = closestTeachingPt?.tcp
        ? Math.sqrt(
            Math.pow(currentTcp![0] - (closestTeachingPt.tcp.x + (closestPtOff?.dx ?? 0)), 2) +
              Math.pow(currentTcp![1] - (closestTeachingPt.tcp.y + (closestPtOff?.dy ?? 0)), 2) +
              Math.pow(currentTcp![2] - (closestTeachingPt.tcp.z + (closestPtOff?.dz ?? 0)), 2),
          )
        : Infinity;
      if (distToTeachingPoint < 5) {
        startPointIndex = closestCenterlineResult.closestTeachingPointIndex;
        paramPointIndex = closestCenterlineResult.closestTeachingPointIndex;
        markPointIndex(startPointIndex);
        firstWeldPoint = conditionPointAt(startPointIndex) ?? weldingPoints[startPointIndex];
      } else {
        const approachSpeed = options?.manualMoveSpeed || 10;
        const { rx, ry, rz } = centerlineTcp;
        // [v1.1.225] 복귀 이동에도 용접 본체와 같은 터치 보정을 적용한다.
        // 이전에는 offsetFlag=0, 오프셋 0으로 교시 원좌표에 복귀한 뒤 아크를 켰다.
        // 용접 배치는 offsetFlag=1 로 보정을 적용하므로, 보정이 큰 작업에서는
        // 보정량만큼 떨어진 자리에서 아크가 붙어 비드가 비스듬히 들어갔다.
        // (2026-10-06 현장: 보정 [-12.7, -15.8, 0], 약 20mm 어긋나 불량)
        const cOff = closestCenterlineResult.centerlineOffset;
        const hasCenterlineOffset = cOff.dx !== 0 || cOff.dy !== 0 || cOff.dz !== 0;
        log_weldingExecution.info(
          'welding.continue.approach',
          `센터라인 복귀 이동 (보정 ${hasCenterlineOffset ? `[${cOff.dx.toFixed(1)}, ${cOff.dy.toFixed(1)}, ${cOff.dz.toFixed(1)}]` : '없음'})`,
        );
        const moveLResult = await moveToCartesianPosition(
          { x: centerlineTcp.x, y: centerlineTcp.y, z: centerlineTcp.z, rx, ry, rz },
          approachSpeed,
          100,
          100,
          -1,
          hasCenterlineOffset ? 1 : 0,
          [cOff.dx, cOff.dy, cOff.dz, 0, 0, 0],
          undefined,
          paramPoint.toolNum ?? 3,
          paramPoint.userNum ?? 0,
          0,
        );
        if (moveLResult?.status_code !== 200) throw new Error('센터라인 포인트 접근 실패');
      }
    } else {
      if (startPoint.tcp && !stopRef.current) {
        const startOffsetDir = getStartApproachOffsetPos(startPoint.id, approachOffset);
        const startOffsetPose = [
          startPoint.tcp.x + startOffsetDir[0],
          startPoint.tcp.y + startOffsetDir[1],
          startPoint.tcp.z + startOffsetDir[2],
          startPoint.tcp.rx,
          startPoint.tcp.ry,
          startPoint.tcp.rz,
        ];
        const isNearUcellCorner = NEAR_UCELL_CORNER.includes(startPoint.id.toLowerCase());
        const startOffsetLabel = isNearUcellCorner ? '-Y' : '+X';
        let startApproachJoints: number[] | null = null;
        // p9/p10은 U셀 구조물과 가까워 MoveJ의 곡선 경로가 U셀에 닿을 수 있음 (2026-09-14 실제 발생).
        // 따라서 이 두 포인트는 IK 관절 이동을 쓰지 않고 항상 직선(MoveL)으로 접근한다.
        if (!isNearUcellCorner && startPoint.joints && startPoint.joints.length === 6) {
          startApproachJoints = await getInverseKin(startOffsetPose, startPoint.joints);
        }
        if (startApproachJoints) {
          log_weldingExecution.info(
            'welding.start.approachJoint',
            `시작점 ${startOffsetLabel} ${approachOffset}mm 접근 (IK 관절 이동, 특이점 회피)`,
          );
          const jointResult = await moveToJointWithStopCheck(
            startApproachJoints,
            30,
            startPoint.toolNum ?? 3,
            startPoint.userNum ?? 0,
            stopRef,
          );
          if (jointResult.stopped) stopRef.current = true;
          else if (!jointResult.success) throw new Error('시작점 접근 이동 실패');
        } else {
          log_weldingExecution.info(
            'welding.start.approach',
            `시작점 ${startOffsetLabel} ${approachOffset}mm 접근${isNearUcellCorner ? ' (U셀 간섭 회피, 직선 이동)' : ''}`,
          );
          const approachResult = await moveToCartesianPosition(
            startPoint.tcp,
            30,
            100,
            100,
            -1,
            1,
            startOffsetDir,
            undefined,
            startPoint.toolNum ?? 3,
            startPoint.userNum ?? 0,
            0,
          );
          if (approachResult?.status_code !== 200) throw new Error('시작점 접근 이동 실패');
        }
      }
    }
    if (stopRef.current) return await handleStopped(0);
    if (!startFromClosest && startPoint.tcp && !stopRef.current) {
      let startTouchOffset: number[] = [0, 0, 0, 0, 0, 0];
      let useStartOffset = false;
      if (startPoint.touchOffset) {
        startTouchOffset = [
          startPoint.touchOffset.dx,
          startPoint.touchOffset.dy,
          startPoint.touchOffset.dz,
          0,
          0,
          0,
        ];
        useStartOffset = true;
      }
      log_weldingExecution.info('welding.finalDescent', '최종 하강', { useOffset: useStartOffset });
      const descentResult = await moveToCartesianPosition(
        startPoint.tcp,
        30,
        100,
        100,
        -1,
        useStartOffset ? 1 : 0,
        startTouchOffset,
        undefined,
        startPoint.toolNum ?? 3,
        startPoint.userNum ?? 0,
        0,
      );
      if (descentResult?.status_code !== 200) throw new Error('최종 하강 이동 실패');
      await verifyStartGap(
        startPoint,
        useStartOffset ? 1 : 0,
        startTouchOffset,
        isDryRun && !stopRef.current,
      );
    }
    if (stopRef.current) return await handleStopped(0);
    const isStartAtPartEnd = partBoundaryInfo.partEndIndices.includes(startPointIndex);
    // v1.1.200: 순서를 벤더 문서(FR Robot-Welder Arc Tracking User Guide 4.3.1)에 맞춘다.
    // 예제 프로그램이 ArcWeldTraceControl(1) -> ARCStart -> WeaveStart -> Lin 순이다.
    // v1.1.198에서 아크 뒤로 미뤘던 것을 되돌린다. 근거는 추정이었고 문서가 반대였다.
    // 시작점 도착 후, 아크 ON 직전에 건다.
    await armArcTracking(firstWeldPoint);
    if (hasWelding && !simMode && !isStartAtPartEnd && !isWeldingTest) {
      const arcOnOk = await safeArcOn(
        firstWeldPoint.weldCurrent!,
        firstWeldPoint.weldVoltage!,
        safetySettings.gasPreFlowTime,
      );
      if (!arcOnOk) throw new Error('아크 ON 실패로 용접을 중단합니다');
      arcMayBeOn = true;
    }
    if (hasWeaving && weaveTypeCode >= 0 && !isStartAtPartEnd)
      await setupAndStartWeave(firstWeldPoint, firstWeldPoint);
    if (!isStartAtPartEnd) setArcActive?.(true);
    await dwellAtPartStart(
      firstWeldPoint,
      weldingPoints[startPointIndex + 1],
      hasWelding && !simMode && !isStartAtPartEnd && !isWeldingTest,
    );
    const loopStartIndex = startPointIndex + 1;
    let segmentStartTime = Date.now();
    let i = loopStartIndex;
    while (i < weldingPoints.length) {
      if (stopRef.current) break;
      const point = weldingPoints[i];
      markPointIndex(i);
      const isPartStart = partBoundaryInfo.partStartIndices.includes(i);
      const currentPartIndex = partBoundaryInfo.pointPartIndices[i];
      const prevPartIndex = partBoundaryInfo.pointPartIndices[i - 1];
      if (isPartStart && currentPartIndex !== prevPartIndex) {
        setArcActive?.(false);
        // v1.1.219: 방금 끝낸 파트의 용접 조건으로 크레이터를 채운다.
        // [v1.1.228] 비드가 끊기는 자리(P1/P7)에서만. 그 외는 전류를 안 넘겨 끈다.
        const endedPt = weldingPoints[i - 1];
        const craterOnPartEnd = isCraterEndPointId(endedPt?.id);
        log_weldingExecution.info(
          'welding.partEnd.crater',
          `파트 종료: ${endedPt?.id ?? '?'} 크레이터 ${craterOnPartEnd ? '적용' : '생략(이어짐)'}`,
        );
        await endPartWelding(
          hasWeaving,
          hasWelding,
          simMode && !isWeldingTest,
          safetySettings.gasPostFlowTime,
          weaveTypeCode,
          craterOnPartEnd ? (endedPt?.weldCurrent ?? firstWeldPoint?.weldCurrent) : undefined,
          craterOnPartEnd ? (endedPt?.weldVoltage ?? firstWeldPoint?.weldVoltage) : undefined,
        );
        arcMayBeOn = false;
        // v1.1.201: 파트 종료 직후 트래킹을 끈다. 문서 4.3.1 예제와 예전 Lua 모두
        // ARCEnd 바로 뒤에 ArcWeldTraceControl(0)을 건다. 지금까지는 다음 파트를
        // 시작할 때 다시 걸면서 정리해, 파트 사이 이동 구간에는 아크가 없는데도
        // 트래킹이 켜진 채로 남았다. v1.1.195에서 로봇이 멈췄던 조건이 그것이다.
        if (arcTrackingActive) await arcTraceControl({ flag: 0 }).catch(() => {});
        const prevPoint = weldingPoints[i - 1];
        const transitionSpeed = 30;
        if (prevPoint?.id === 'p6' && point?.id === 'p9' && point.joints && point.joints.length === 6) {
          const P6P9_RETRACT_DIST = 30;
          if (prevPoint.tcp && !stopRef.current) {
            log_weldingExecution.info(
              'welding.partTransition.retract',
              `파트 전환(p6→p9): base +X +${P6P9_RETRACT_DIST}mm 후퇴 (시험 적용)`,
            );
            const retractResult = await moveToCartesianPosition(
              prevPoint.tcp,
              transitionSpeed,
              100,
              100,
              -1,
              1,
              [P6P9_RETRACT_DIST, 0, 0, 0, 0, 0],
              undefined,
              prevPoint.toolNum ?? 3,
              prevPoint.userNum ?? 0,
              0,
            );
            if (retractResult?.status_code !== 200) throw new Error('파트 전환(p6→p9) 후퇴 이동 실패');
          }
          if (hasWelding && !(simMode && !isWeldingTest) && !stopRef.current)
            await retractWireBeforeTransition(point);
          if (point.tcp && !stopRef.current) {
            // v1.1.154: 다른 파트 전환 ③과 같이 P9 터치 보정값을 적용한다.
            const p9Offset = point.touchOffset
              ? [point.touchOffset.dx, point.touchOffset.dy, point.touchOffset.dz, 0, 0, 0]
              : [0, 0, 0, 0, 0, 0];
            const useP9Offset = !!point.touchOffset;
            log_weldingExecution.info(
              'welding.partTransition.lin',
              `파트 전환(p6→p9): 후퇴 후 직선(MoveL)으로 ${point.name} 이동${useP9Offset ? ` (touchOffset 적용 ${p9Offset.slice(0, 3).map(v => v.toFixed(1)).join(',')})` : ''}`,
            );
            const linResult = await moveToCartesianPosition(
              point.tcp,
              transitionSpeed,
              100,
              100,
              -1,
              useP9Offset ? 1 : 0,
              p9Offset,
              undefined,
              point.toolNum ?? 3,
              point.userNum ?? 0,
              0,
            );
            if (linResult?.status_code !== 200) throw new Error('파트 전환(p6→p9) 직선 이동 실패');
            await verifyStartGap(point, useP9Offset ? 1 : 0, p9Offset, isDryRun && !stopRef.current);
          }
          if (hasWelding && !(simMode && !isWeldingTest) && !stopRef.current)
            await feedWireAtPartStart(point);
          if (!stopRef.current) {
            const condPoint = conditionPointAt(i) ?? point;
            await armArcTracking(condPoint);
            await startPartWelding(
              condPoint,
              firstWeldPoint,
              hasWeaving,
              hasWelding,
              simMode && !isWeldingTest,
              safetySettings.gasPreFlowTime,
              weaveTypeCode,
            );
            setArcActive?.(true);
            if (hasWelding && !(simMode && !isWeldingTest)) arcMayBeOn = true;
            await dwellAtPartStart(point, weldingPoints[i + 1], hasWelding && !(simMode && !isWeldingTest));
          }
          const ptSegIdx = i - 1;
          if (ptSegIdx >= 0 && ptSegIdx < segments.length)
            segments[ptSegIdx].actual_sec = (Date.now() - segmentStartTime) / 1000;
          segmentStartTime = Date.now();
          i++;
          continue;
        }
        const pointSide = (id: string): 'L' | 'R' => {
          const n = parseInt(id.replace(/\D/g, ''), 10);
          return n >= 1 && n <= 6 ? 'L' : 'R';
        };
        // [v1.1.230] 목표가 U셀 코너 포인트면 '같은 쪽 전환'으로 치지 않는다.
        // 아래 ②에서 isSameSide 분기가 NEAR_UCELL_CORNER 분기보다 먼저 걸리기 때문에,
        // 같은 쪽 전환이면 코너여도 base +X 로 진입한다. 227 까지는 p10 진입이
        // p1->p10 횡단뿐이라 그 경로를 안 탔는데, v1.1.228 에서 수평을 앞으로 빼면서
        // p12->p10 이 같은 쪽 전환이 됐다. 703행 주석대로 p10 의 +X 진입은 code=185 다.
        // 여기서 빼면 p12->p10 과 p9->p9 가 '후퇴 -> 홈 경유 -> -Y 직선 진입'으로 가는데,
        // 둘 다 227 에서 실제로 돌던 경로다(p10 은 횡단 진입, p9 는 시작점 진입).
        // 홈을 두 번 더 들르므로 셀당 사이클이 조금 늘어난다.
        // [v1.1.232] 앞 파트가 끝난 자리에서 다음 파트가 바로 시작하면 전환 이동이
        // 필요 없다. 로봇이 이미 그 자리에 있다.
        // v1.1.228 의 모서리 파트는 끝점(P3/P9)이 수직 파트의 시작점이라 좌표가 같다.
        // 그런데 230 에서 코너 목표를 '같은 쪽 전환'에서 빼면서, P9->P9 가 횡단 경로로
        // 떨어져 후퇴 -> 홈 -> -Y 재진입까지 돌았다. 제자리에서 홈을 갔다 오는 꼴이다.
        // (P3->P9 가 아니라 P3->P3 인 좌측은 코너 목록에 없어서 같은 쪽 전환으로
        //  짧게 끝났다. 그래서 우측만 홈을 들렀다.)
        // 좌표가 같으면 ①후퇴와 ②접근을 둘 다 건너뛴다. 아크만 끄고 다시 켠다.
        const SAME_SPOT_TOLERANCE_MM = 1.0;
        const isSameSpotTransition =
          !!prevPoint?.tcp && !!point?.tcp
          && Math.abs(prevPoint.tcp.x - point.tcp.x) < SAME_SPOT_TOLERANCE_MM
          && Math.abs(prevPoint.tcp.y - point.tcp.y) < SAME_SPOT_TOLERANCE_MM
          && Math.abs(prevPoint.tcp.z - point.tcp.z) < SAME_SPOT_TOLERANCE_MM;
        if (isSameSpotTransition) {
          log_weldingExecution.info(
            'welding.partTransition.sameSpot',
            `파트 전환 생략: ${prevPoint?.name ?? '?'} -> ${point.name} 같은 자리라 이동 없이 이어간다`,
          );
        }
        const targetNeedsCornerApproach =
          NEAR_UCELL_CORNER.includes((point?.id ?? '').toLowerCase());
        const isSameSide =
          !!prevPoint?.id && !!point?.id
          && pointSide(prevPoint.id) === pointSide(point.id)
          && !targetNeedsCornerApproach;
        // v1.1.174: 횡단 전환 정면 이격 approachOffset -> 100mm 고정. approachOffset(현장 25mm)은 홈에서 MoveJ로 들어가기엔 가까워 쓰지 않는다.
        const CROSS_CLEARANCE_X = 100;
        const CROSS_LIFT_Z = 100;
        if (prevPoint?.tcp && !stopRef.current && !isSameSpotTransition && isSameSide) {
          log_weldingExecution.info(
            'welding.partTransition.retract',
            `파트 전환 ①: base +X +${approachOffset}mm 후퇴`,
          );
          const retractResult = await moveToCartesianPosition(
            prevPoint.tcp,
            transitionSpeed,
            100,
            100,
            -1,
            1,
            [approachOffset, 0, 0, 0, 0, 0],
            undefined,
            prevPoint.toolNum ?? 3,
            prevPoint.userNum ?? 0,
            0,
          );
          if (retractResult?.status_code !== 200) throw new Error('파트 전환 후퇴 이동 실패');
        } else if (prevPoint?.tcp && !stopRef.current && !isSameSpotTransition) {
          // v1.1.171: 횡단 전환(좌 <-> 우) 후퇴를 바꾼다.
          // 1.1.170까지는 이전 점에서 base +X150 / +Z100 으로 물러났다. 옛 순서의 횡단은
          // 바닥 높이(P6->P9, 전용 분기)뿐이라 문제가 없었는데, 수평 우선 순서(4-5-6, 3-2-1,
          // 10-11-12, 9-8-7)에서는 P1(좌측 상단, 높이 약 554mm) -> P10 이 횡단이 된다.
          // P1에서 위로 100mm 더 올린 자리는 도달 불가라 code=112로 거부됐다(2026-09-21 드라이런).
          // v1.1.172: 1.1.171의 토치 축 -Z 100mm 후퇴도 P1에서 code=112(도달 불가)로 거부됐다
          // (2026-09-22). 용접 종료 후퇴는 옛 순서에서 P12(바닥)에서만 쓰였고 상단에서는 검증된 적이 없었다.
          // 상단에서 실제로 동작이 확인된 것은 터치센싱 종료 시 P7(우측 상단)의
          //   base +X touchHomeRetractOffset 후퇴 -> 홈 MoveJ
          // 이고, P1도 터치센싱 접근 때 base +X 오프셋 자리에 매번 도달한다. 그 방식을 그대로 쓴다.
          //   base +X 후퇴 -> 홈 MoveJ -> (아래 ②) 목표 앞 상공 IK MoveJ -> 하강 -> ③ 진입.
          // 홈을 거치므로 팔이 U셀 안을 가로지르지 않는다.
          const crossRetract = sequenceSettings.touchHomeRetractOffset;
          log_weldingExecution.info(
            'welding.partTransition.retract',
            `파트 전환 ①(횡단): ${prevPoint.name} base +X ${crossRetract}mm 후퇴 -> 홈 경유`,
          );
          // v1.1.212: 도달 불가면 거리를 줄여 재시도한다. 위 retreatBaseX 주석 참고.
          const retractedMm = await retreatBaseX(prevPoint, crossRetract, transitionSpeed);
          if (retractedMm === 0) {
            log_weldingExecution.warn(
              'welding.partTransition.retract.none',
              `파트 전환(횡단): ${prevPoint.name} 후퇴 실패 - 그 자리에서 홈으로 간다. `
              + `와이어가 모재에 닿을 수 있으니 티칭 자세를 확인할 것`,
            );
          } else if (retractedMm !== crossRetract) {
            log_weldingExecution.info(
              'welding.partTransition.retract.reduced',
              `파트 전환(횡단): ${prevPoint.name} 후퇴 ${crossRetract}mm -> ${retractedMm}mm 로 축소 적용`,
            );
          }
          if (homePoint?.joints && !stopRef.current) {
            const homeResult = await moveToJointWithStopCheck(
              homePoint.joints,
              homePoint.moveSpeed || 50,
              homePoint.toolNum ?? 3,
              homePoint.userNum ?? 0,
              stopRef,
            );
            if (homeResult.stopped) stopRef.current = true;
            else if (!homeResult.success) throw new Error('파트 전환(횡단) 홈 경유 실패');
          }
        }
        if (hasWelding && !(simMode && !isWeldingTest) && !stopRef.current)
          await retractWireBeforeTransition(point);
        if (!stopRef.current && !isSameSpotTransition) {
          if (isSameSide && point.tcp) {
            log_weldingExecution.info(
              'welding.partTransition.approachSameSide',
              `파트 전환 ②: ${point.name} 같은 쪽 → +X +${approachOffset}mm 정면 이격 (③ 직선 진입)`,
            );
            const sameSideResult = await moveToCartesianPosition(
              point.tcp,
              transitionSpeed,
              100,
              100,
              -1,
              1,
              [approachOffset, 0, 0, 0, 0, 0],
              undefined,
              point.toolNum ?? 3,
              point.userNum ?? 0,
              0,
            );
            if (sameSideResult?.status_code !== 200) throw new Error('파트 전환(같은 쪽) 접근 이동 실패');
          } else if (point.tcp && NEAR_UCELL_CORNER.includes((point.id ?? '').toLowerCase())) {
            // v1.1.175: 횡단 전환 목표가 P9/P10(우측 바닥 코너)이면 시작점 접근과 같은 방식을 쓴다.
            // 홈에서 -Y approachOffset 자리로 직선(MoveL) 이동 -> ③ 정위치 진입.
            // 1.1.174의 IK 상공 MoveJ + 하강 두 단계를 없앤다. (+X 접근은 code=185, MoveJ 곡선은 U셀 접촉 이력)
            const cornerOffset = getStartApproachOffsetPos(point.id, approachOffset);
            log_weldingExecution.info(
              'welding.partTransition.approachCorner',
              `파트 전환 ②(횡단): ${point.name} -Y ${approachOffset}mm 직선 접근 (U셀 코너, 시작점 접근 방식)`,
            );
            const cornerResult = await moveToCartesianPosition(
              point.tcp,
              transitionSpeed,
              100,
              100,
              -1,
              1,
              cornerOffset,
              undefined,
              point.toolNum ?? 3,
              point.userNum ?? 0,
              0,
            );
            if (cornerResult?.status_code !== 200) throw new Error('파트 전환(횡단, U셀 코너) 접근 이동 실패');
          } else if (point.joints && point.joints.length === 6) {
            let liftedJoints: number[] | null = null;
            if (point.tcp) {
              const liftedPose = [
                point.tcp.x + CROSS_CLEARANCE_X,
                point.tcp.y,
                point.tcp.z + CROSS_LIFT_Z,
                point.tcp.rx,
                point.tcp.ry,
                point.tcp.rz,
              ];
              liftedJoints = await getInverseKin(liftedPose, point.joints);
            }
            if (liftedJoints) {
              log_weldingExecution.info(
                'welding.partTransition.approachJ.ik',
                `파트 전환 ②(횡단): ${point.name} IK 정면+상승(+X${CROSS_CLEARANCE_X}/+Z${CROSS_LIFT_Z}) 관절로 MoveJ`,
              );
              const mjResult = await moveToJointWithStopCheck(
                liftedJoints,
                transitionSpeed,
                point.toolNum ?? 3,
                point.userNum ?? 0,
                stopRef,
              );
              if (mjResult.stopped) stopRef.current = true;
              else if (!mjResult.success) throw new Error('파트 전환(횡단) IK 접근 이동 실패');
              if (point.tcp && !stopRef.current) {
                log_weldingExecution.info(
                  'welding.partTransition.descend',
                  `파트 전환 ②.5(횡단): ${point.name} 정면 이격면(+X${CROSS_CLEARANCE_X})으로 하강`,
                );
                const descendResult = await moveToCartesianPosition(
                  point.tcp,
                  transitionSpeed,
                  100,
                  100,
                  -1,
                  1,
                  [CROSS_CLEARANCE_X, 0, 0, 0, 0, 0],
                  undefined,
                  point.toolNum ?? 3,
                  point.userNum ?? 0,
                  0,
                );
                if (descendResult?.status_code !== 200) throw new Error('파트 전환(횡단) 하강 이동 실패');
              }
            } else {
              log_weldingExecution.warn(
                'welding.partTransition.approachJ.fallback',
                `파트 전환 ②: ${point.name} 횡단 IK 실패 → 기존 MoveJ 정위치 폴백`,
              );
              const mjResult = await moveToJointWithStopCheck(
                point.joints,
                transitionSpeed,
                point.toolNum ?? 3,
                point.userNum ?? 0,
                stopRef,
              );
              if (mjResult.stopped) stopRef.current = true;
              else if (!mjResult.success) throw new Error('파트 전환(횡단) MoveJ 폴백 이동 실패');
            }
          } else if (point.tcp) {
            log_weldingExecution.info(
              'welding.partTransition.approach',
              `파트 전환 ②: ${point.name} 목표 +X +${approachOffset}mm 접근 (joints 없음 → MoveL 폴백)`,
            );
            const fallbackResult = await moveToCartesianPosition(
              point.tcp,
              transitionSpeed,
              100,
              100,
              -1,
              1,
              [approachOffset, 0, 0, 0, 0, 0],
              undefined,
              point.toolNum ?? 3,
              point.userNum ?? 0,
              0,
            );
            if (fallbackResult?.status_code !== 200) throw new Error('파트 전환(MoveL 폴백) 접근 이동 실패');
          }
        }
        if (point.tcp && !stopRef.current) {
          let pointTouchOffset: number[] = [0, 0, 0, 0, 0, 0];
          let usePointOffset = false;
          if (point.touchOffset) {
            pointTouchOffset = [
              point.touchOffset.dx,
              point.touchOffset.dy,
              point.touchOffset.dz,
              0,
              0,
              0,
            ];
            usePointOffset = true;
          }
          log_weldingExecution.info(
            'welding.partTransition.final',
            `파트 전환 ③: ${point.name} 정위치${usePointOffset ? ' (touchOffset 적용)' : ''}`,
          );
          const finalResult = await moveToCartesianPosition(
            point.tcp,
            transitionSpeed,
            100,
            100,
            -1,
            usePointOffset ? 1 : 0,
            pointTouchOffset,
            undefined,
            point.toolNum ?? 3,
            point.userNum ?? 0,
            0,
          );
          if (finalResult?.status_code !== 200) throw new Error('파트 전환 정위치 이동 실패');
          await verifyStartGap(
            point,
            usePointOffset ? 1 : 0,
            pointTouchOffset,
            isDryRun && !stopRef.current,
          );
        }
        if (hasWelding && !(simMode && !isWeldingTest) && !stopRef.current)
          await feedWireAtPartStart(point);
        // [v1.1.237] 아크 조건과 트래킹은 파트의 조건 포인트에서 읽는다(모서리는 P4/P10).
        const condPoint = conditionPointAt(i) ?? point;
        if (condPoint !== point) {
          log_weldingExecution.info(
            'welding.partStart.conditionPoint',
            `파트 조건을 ${condPoint.name} 에서 읽는다 (시작점 ${point.name})`,
          );
        }
        await armArcTracking(condPoint);
        await startPartWelding(
          condPoint,
          firstWeldPoint,
          hasWeaving,
          hasWelding,
          simMode && !isWeldingTest,
          safetySettings.gasPreFlowTime,
          weaveTypeCode,
        );
        setArcActive?.(true);
        if (hasWelding && !(simMode && !isWeldingTest)) arcMayBeOn = true;
        await dwellAtPartStart(point, weldingPoints[i + 1], hasWelding && !(simMode && !isWeldingTest));
        const ptSegIdx = i - 1;
        if (ptSegIdx >= 0 && ptSegIdx < segments.length)
          segments[ptSegIdx].actual_sec = (Date.now() - segmentStartTime) / 1000;
        segmentStartTime = Date.now();
        i++;
        continue;
      }
      const batchPoints: BatchMovePoint[] = [];
      const batchIndices: number[] = [];
      for (let j = i; j < weldingPoints.length; j++) {
        if (
          j > i &&
          partBoundaryInfo.partStartIndices.includes(j) &&
          partBoundaryInfo.pointPartIndices[j] !== partBoundaryInfo.pointPartIndices[j - 1]
        )
          break;
        const pt = weldingPoints[j];
        if (!pt.tcp) throw new Error(`${pt.name}: TCP 좌표가 없습니다.`);
        const { offset, useOffset } = determinePointTouchOffset(
          pt,
          j,
          weldingPoints,
          hasStoredTouchOffsets,
        );
        // robot-core는 배치 첫 포인트의 weaving_type만 읽어 WELD_BATCH_SPEED_SCALE의
        // 수직(0.30)/수평(0.175)을 결정한다. 지금까지 이 필드를 보내지 않아 core가
        // 항상 "" → 수평 계수로 판정, 수직 용접이 의도 대비 1.71배 느렸음 (v1.1.129 수정).
        // 실제 위빙은 startPartWelding이 point.weavingType || firstWeldPoint.weavingType
        // 순서로 거는 것과 동일하게 맞춘다.
        const ptWeavingType = pt.weavingType || firstWeldPoint.weavingType || undefined;
        batchPoints.push({
          joints: pt.joints && pt.joints.length === 6 ? pt.joints : undefined,
          tcp: [pt.tcp.x, pt.tcp.y, pt.tcp.z, pt.tcp.rx, pt.tcp.ry, pt.tcp.rz],
          speed: pt.moveSpeed,
          tool: pt.toolNum ?? 3,
          user: pt.userNum ?? 0,
          vel_mode: pt.velMode ?? 1,
          offset_flag: useOffset ? 1 : 0,
          offset,
          weaving_type: ptWeavingType,
        });
        batchIndices.push(j);
      }
      if (batchPoints.length === 0) {
        i++;
        continue;
      }
      // [v1.1.230] 배치 첫 포인트의 speed/vel_mode 를 '그 파트의 첫 포인트' 값으로 맞춘다.
      // robot-core 의 WeldBatch 는 배치 첫 포인트의 speed 만 읽는다(robot_core_all.cpp
      // 의 `float speedRaw = firstPt.value("speed", ...)`). 그런데 파트 시작점은 위쪽
      // 전환 분기에서 따로 처리하고 i++ 하므로, 배치는 항상 파트의 '두 번째' 포인트부터
      // 만들어진다. 즉 아크 조건(전류·전압·위빙)은 파트 첫 포인트에서, 이동 속도는
      // 두 번째 포인트에서 읽히고 있었다.
      // 파트 안의 포인트가 모두 같은 속도면(갭 조회가 파트 단위로 넣으므로 보통 그렇다)
      // 아무것도 바뀌지 않는다. 다를 때만 의도대로 돈다.
      //
      // v1.1.228 의 모서리 파트([P4,P3])에서 이게 드러났다. 배치가 [P3] 하나뿐인데
      // P3 는 수직 파트의 시작점이기도 해서 갭 조회가 수직 파라미터를 넣는다. 그래서
      // P4 에 모서리용 느린 속도를 넣어도 안 먹고 모서리 20mm 가 수직 속도로 돌았다.
      //
      // weaving_type 은 건드리지 않는다. robot-core 가 그걸로 고르는 두 계수
      // (WELD_BATCH_SPEED_SCALE_VERTICAL / _HORIZONTAL)가 지금 둘 다 0.431 로 같다.
      let partStartIdx = i;
      while (
        partStartIdx > 0 &&
        partBoundaryInfo.pointPartIndices[partStartIdx - 1] === partBoundaryInfo.pointPartIndices[i]
      ) {
        partStartIdx--;
      }
      // [v1.1.237] 파트 첫 포인트 -> 파트 조건 포인트. 모서리([P3,P4])는 배치 첫
      // 포인트가 곧 조건 포인트 P4 라 교정이 일어나지 않는다. 첫 포인트(P3)로
      // 덮으면 모서리가 수직 속도로 돈다.
      const partFirstPoint = conditionPointAt(partStartIdx) ?? weldingPoints[partStartIdx];
      if (partFirstPoint && weldingPoints[batchIndices[0]]?.id !== partFirstPoint.id) {
        const prevSpeed = batchPoints[0].speed;
        batchPoints[0].speed = partFirstPoint.moveSpeed;
        batchPoints[0].vel_mode = partFirstPoint.velMode ?? 1;
        if (prevSpeed !== partFirstPoint.moveSpeed) {
          log_weldingExecution.info(
            'welding.batch.speedFromPartStart',
            `배치 속도를 파트 시작점 기준으로 교정: ${weldingPoints[batchIndices[0]]?.id ?? '?'} `
            + `${prevSpeed} -> ${partFirstPoint.id} ${partFirstPoint.moveSpeed}`,
          );
        }
      }
      // v1.1.156: 설정에서 스플라인 이동을 켜면 티칭점을 모두 지나가는 경로로 바꾼다.
      // v1.1.167: 끄면 실제 용접도 드라이런과 같은 경유점 방식(per_point, 블렌드 10mm)으로 간다.
      // 1.1.149~166은 실제 용접만 끝점 보정 단일 MoveL이라 중간점 보정이 빠졌다.
      // 모재가 휘면 양 끝만 맞고 가운데는 직선으로 지나가 비드가 휘어 보였다
      // (2026-09-21 좌측 수직: 직선 보간 dx -0.05 vs P2 실측 dx -6.5, 6.5mm 차이).
      // 경유점 방식은 드라이런에서 매번 돌던 경로라 속도·위빙 조합은 확인된 상태다.
      // v1.1.170: 블렌드 10 -> 50mm. 10mm에서는 경유점(P8)에서 방향이 바뀌는 게 비드에 각지게
      // 드러났다(2026-09-21 사진). 휜 각도 1~2도 기준 경유점에서 벗어나는 거리는 0.2~0.4mm 수준이고,
      // 꺾이는 구간이 약 100mm로 늘어나 완만해진다. 가장 짧은 구간(P5->P6 약 186mm)의 절반 이하.
      // v1.1.199: 아크 트래킹이 걸리는 배치에서만 블렌드를 끈다(-1).
      // 2026-09-29 v1.1.198 실측: 트래킹 ON + blendR=50에서 로봇이 시작점에 멈춘 채
      // 10.7초 뒤 MoveL code=-4(XMLRPC 실행 실패)가 나고 컨트롤러 연결이 끊겼다.
      // 그 시점에는 비상정지도 닿지 않는데, 큐에 이미 들어간 블렌드 이동은 컨트롤러가
      // 계속 실행하므로 로봇이 혼자 움직였다. 예전 펜던트 Lua는 용접 이동을 전부
      // blend -1로 돌렸다. 트래킹 검증 동안만 같은 조건으로 맞춘다.
      // 트래킹을 끈 평소 운전은 50을 그대로 쓴다(v1.1.170의 경유점 각짐 대책).
      // v1.1.209: 수평도 블렌드를 끈다(-1). 2026-09-30 15:27 현장 사고.
      // v1.1.205의 시작점 기어가기(별도 MoveL) 직후 블렌드 이동이 겹쳐 들어가면서
      // 모션 파이프라인이 물렸다. 로봇은 끝점까지 정상 이동했는데 마지막 MoveL이
      // 반환되지 않아 아크 OFF가 나가지 못했고, 2분 넘게 제자리 용접했다.
      // 그 뒤 emergencyStop()=-1 / stopMotion()=-2 로 컨트롤러 연결이 끊겨
      // 화면 비상정지가 닿지 않았다.
      // 블렌드 이동만 완료를 기다리지 않고 바로 반환하므로, 앞 이동이 아직
      // 안 끝난 상태에서 다음 명령이 겹칠 수 있는 경로는 블렌드뿐이다.
      // 블렌드 -1인 수직(트래킹 ON)은 같은 기어가기로 정상 동작했다.
      const batchWeaveCode = getWeaveTypeCode(batchPoints[0].weaving_type ?? null);
      const batchArcTracking = arcTrackingActive && VERTICAL_WEAVE_CODES.includes(batchWeaveCode);
      const WAYPOINT_BLEND_MM = -1;
      // v1.1.203: 아크 트래킹이 걸리는 배치는 중간 경유점을 지나지 않고
      // 끝점까지 단일 MoveL로 간다(per_point=false). 중간점에서 방향이 꺾여
      // 비드 모양이 바뀌던 문제를 없앤다. 모재가 휘어 생기는 편차는 트래킹이 잡는다.
      // v1.1.149~166이 쓰던 경로와 같다. 끝점의 터치 보정만 적용된다.
      // v1.1.209: 수평도 끝점 단일 이동으로 통일한다.
      // 블렌드를 -1로 두고 경유점을 유지하면 경유점마다 정지·출발이라 열이 몰린다.
      // 수평 U셀의 휨은 2026-09-30 15:26 터치 실측으로 약 1.1mm였다
      // (426mm 구간, contact 절대좌표 기준 x 0.81mm / z 0.72mm). 위빙 폭 안이다.
      // 수평은 위빙이 평면 삼각파(코드 0)라 좌우 보정 조건에 안 맞아 트래킹을 못 켠다.
      // 즉 중간 편차를 잡아주는 것이 없으므로, 휨이 커지면 이 판단을 다시 봐야 한다.
      const useWaypoints = false;
      const useSpline = sequenceSettings.splineMoveEnabled && batchPoints.length >= 2;
      log_weldingExecution.info(
        'welding.batch',
        useSpline
          ? `Spline move: ${batchPoints.length}포인트 (type=${sequenceSettings.splineType}, avgTime=${sequenceSettings.splineAverageTime}ms)`
          : useWaypoints
            ? `Batch MoveL: ${batchPoints.length}포인트 → 경유점 방식 (블렌드 ${WAYPOINT_BLEND_MM}mm)`
            : `Batch MoveL: ${batchPoints.length}포인트 → 끝점 단일 이동 (아크 트래킹 ${batchArcTracking ? 'ON' : 'OFF'})`,
        {
          indices: batchIndices.map(idx => weldingPoints[idx].id),
        },
      );
      // v1.1.215: 배치가 도는 동안 화면 표시를 시간으로 넘긴다. 표시 전용이다.
      const batchFromPoint = i > 0 ? weldingPoints[i - 1] : undefined;
      const batchFromTcp = batchFromPoint?.tcp
        ? [batchFromPoint.tcp.x, batchFromPoint.tcp.y, batchFromPoint.tcp.z]
        : null;
      const batchRawSpeed = batchPoints[0].speed ?? 15;
      const batchWeldPct = (batchPoints[0].vel_mode ?? 1) === 1
        ? (batchRawSpeed / 15) * WELD_BATCH_SPEED_SCALE
        : batchRawSpeed;
      const cancelBatchIndexTimers = scheduleBatchPointIndex(
        batchFromTcp,
        batchPoints,
        batchIndices,
        batchWeldPct,
        markPointIndex,
      );
      try {
        const batchResult = useSpline
          ? await splineMove(batchPoints, {
              splineType: sequenceSettings.splineType,
              averageTime: sequenceSettings.splineAverageTime,
            })
          : await batchMoveL(batchPoints, { perPoint: useWaypoints, blendR: WAYPOINT_BLEND_MM });
        // 배치는 블로킹 호출 1번이라 구간별 실측이 불가능하다. v1.1.133까지는 반환 후
        // 루프를 돌며 경과시간을 넣어, 첫 구간이 배치 전체 시간을 먹고 나머지는 0이 됐다.
        // 배치 안에서는 명령 속도가 동일하므로 거리 비율로 배분한다 (v1.1.134 수정).
        // 실측이 아니라 배분값이므로 구간 단위 정밀 비교에는 쓰지 말 것.
        const batchElapsedSec = (Date.now() - segmentStartTime) / 1000;
        const batchSegIdxs = batchIndices
          .map(idx => idx - 1)
          .filter(segIdx => segIdx >= 0 && segIdx < segments.length);
        const batchDistance = batchSegIdxs.reduce(
          (sum, segIdx) => sum + (segments[segIdx].distance_mm || 0), 0);
        for (const segIdx of batchSegIdxs) {
          segments[segIdx].actual_sec = batchDistance > 0
            ? batchElapsedSec * ((segments[segIdx].distance_mm || 0) / batchDistance)
            : batchElapsedSec / batchSegIdxs.length;
        }
        segmentStartTime = Date.now();
        for (const idx of batchIndices) markPointIndex(idx);
        if (batchResult.data?.stopped || batchResult.status_code !== 200) {
          log_weldingExecution.warn('welding.batch.stopped', 'Batch 중단', batchResult.data);
          stopRef.current = true;
          break;
        }
      } catch (batchError) {
        log_weldingExecution.error('welding.batch.error', 'Batch MoveL 실패', { error: String(batchError) });
        throw batchError;
      } finally {
        cancelBatchIndexTimers();
      }
      i += batchPoints.length;
    }
    if (stopRef.current) {
      const stoppedResult = await handleStopped(lastPointIndex);
      const opName = simMode ? (isDryRun ? 'DryRun' : '시뮬레이션') : '용접';
      showAlert(`${opName}이(가) 중단되었습니다.`, { type: 'warning', title: `${opName} 중단` });
      return stoppedResult;
    }
    setArcActive?.(false);
    if (hasWeaving && weaveTypeCode >= 0) {
      await endWeave();
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    if (hasWelding && !simMode && !isWeldingTest) {
      // v1.1.219: 마지막 파트도 전류 다운슬로프로 크레이터를 채운다.
      // [v1.1.228] 비드가 끊기는 자리(P1/P7)에서만.
      const lastPt = weldingPoints[weldingPoints.length - 1];
      const craterOnFinal = isCraterEndPointId(lastPt?.id);
      log_weldingExecution.info(
        'welding.final.crater',
        `전체 종료: ${lastPt?.id ?? '?'} 크레이터 ${craterOnFinal ? '적용' : '생략(이어짐)'}`,
      );
      await arcOff(
        0,
        0,
        1000,
        safetySettings.gasPostFlowTime,
        craterOnFinal
          ? buildCraterFill(
              lastPt?.weldCurrent ?? firstWeldPoint?.weldCurrent,
              lastPt?.weldVoltage ?? firstWeldPoint?.weldVoltage,
            )
          : undefined,
      );
      markArcOff();  // v1.1.218: 수동 송급 프로파일 선택용 시각
    }
    arcMayBeOn = false;
    if (arcTrackingActive) await arcTraceControl({ flag: 0 }).catch(() => {});
    if (!stopRef.current) {
      const lastWeldPoint = weldingPoints[weldingPoints.length - 1];
      if (lastWeldPoint?.tcp) {
        log_weldingExecution.info('welding.retract', 'TCP Z -100mm 후퇴');
        const retreatResult = await moveToCartesianPosition(
          lastWeldPoint.tcp,
          30,
          100,
          100,
          -1,
          2,
          [0, 0, -100, 0, 0, 0],
          undefined,
          lastWeldPoint.toolNum ?? 3,
          lastWeldPoint.userNum ?? 0,
          0,
        );
        // v1.1.217: 토치축 -Z 100mm 가 거부되면 base +X 로 거리를 줄여가며 다시 시도한다.
        //
        // 2026-10-01 15:03 로그: 수직 끝점(P1, z=539.7)에서
        //   MoveL() -> code=112 | 직선이동 실패
        // 가 나고 경고만 남긴 채 홈으로 MoveJ 했다. 물러나지 않은 자리에서 팔이
        // 움직이니 와이어가 모재를 스친다(현장 확인).
        // 토치축 -Z 100mm 는 2026-09-22 에도 P1 에서 같은 112 로 거부된 방향이다.
        // P1 에서 실제로 도달하는 것은 base +X 쪽이고, 터치센싱 접근이 매 사이클
        // 그 자리를 쓴다. v1.1.212 의 파트 전환 후퇴와 같은 사다리를 여기에도 쓴다.
        //
        // 토치축 -Z 가 되는 끝점(P7/P12 등)은 종전대로 그쪽을 쓴다. 실패했을 때만
        // 대체 경로로 넘어간다.
        if (retreatResult?.status_code !== 200) {
          log_weldingExecution.warn(
            'welding.retract.failed',
            `최종 후퇴(토치축 -Z 100mm) 실패 (status=${retreatResult?.status_code}) - base +X 로 재시도`,
          );
          const fallbackMm = await retreatBaseX(
            lastWeldPoint,
            sequenceSettings.touchHomeRetractOffset,
            30,
          );
          if (fallbackMm === 0) {
            log_weldingExecution.warn(
              'welding.retract.none',
              `최종 후퇴 실패 - 그 자리에서 홈으로 간다. 와이어가 모재에 닿을 수 있다`,
            );
          } else {
            log_weldingExecution.info(
              'welding.retract.fallback',
              `최종 후퇴: base +X ${fallbackMm}mm 적용`,
            );
          }
        }
      }
    }
    if (!stopRef.current && homePoint?.joints) {
      log_weldingExecution.info('welding.homeReturn', 'Home으로 복귀');
      await moveToJointWithStopCheck(
        homePoint.joints,
        homePoint.moveSpeed || 50,
        homePoint.toolNum ?? 3,
        homePoint.userNum ?? 0,
        stopRef,
      );
    }
    const completedAt = new Date();
    const actualDurationSec = (completedAt.getTime() - startedAt.getTime()) / 1000;
    const timeDifferenceSec = actualDurationSec - totalExpectedDurationSec;
    const timeDifferencePercent =
      totalExpectedDurationSec > 0 ? (timeDifferenceSec / totalExpectedDurationSec) * 100 : 0;
    const operationType: 'welding' | 'dryrun' | 'simulation' = simMode
      ? isDryRun
        ? 'dryrun'
        : 'simulation'
      : 'welding';
    const result: WeldingResult = {
      operationType,
      jobId,
      jobName,
      startedAt,
      completedAt,
      totalDistanceMm: totalPathDistance,
      cpm: representativeCpm,
      expectedDurationSec: totalExpectedDurationSec,
      actualDurationSec,
      timeDifferenceSec,
      timeDifferencePercent,
      segments,
      totalPoints: weldingPoints.length,
      completedPoints: weldingPoints.length,
      resultStatus: 'success',
    };
    const logId = await saveWeldingLog({
      jobId,
      jobName,
      operationType,
      startType: startFromClosest ? 'continue' : 'start',
      startedAt,
      completedAt,
      totalDistanceMm: totalPathDistance,
      cpm: representativeCpm,
      expectedDurationSec: totalExpectedDurationSec,
      actualDurationSec,
      segments,
      totalPoints: weldingPoints.length,
      completedPoints: weldingPoints.length,
      weldingPoints,
      firstWeldPoint,
      resultStatus: 'success',
    });
    if (logId) result.logId = logId;
    setLastWeldingResult(result);
    totalTimer.end('welding.complete', '용접 완료');
    const operationName =
      operationType === 'welding' ? '용접' : operationType === 'dryrun' ? 'DryRun' : '시뮬레이션';
    showAlert(
      [
        `${operationName} 완료`,
        ``,
        `용접 거리: ${weldPathDistance.toFixed(1)} mm (전환 이동 ${(totalPathDistance - weldPathDistance).toFixed(1)} mm 별도)`,
        `속도(CPM): ${representativeCpm} cm/min`,
        `예상: ${totalExpectedDurationSec.toFixed(1)}초 / 실제: ${actualDurationSec.toFixed(1)}초`,
        `차이: ${timeDifferenceSec >= 0 ? '+' : ''}${timeDifferenceSec.toFixed(1)}초 (${timeDifferencePercent >= 0 ? '+' : ''}${timeDifferencePercent.toFixed(1)}%)`,
      ].join('\n'),
      { type: 'success', title: `${operationName} 완료` },
    );
    return result;
  } catch (error) {
    log_weldingExecution.error('welding.error', '용접 오류', { error: String(error) });
    const failedAt = new Date();
    const failedDuration = (failedAt.getTime() - startedAt.getTime()) / 1000;
    const failedOpType: 'welding' | 'dryrun' | 'simulation' = simMode
      ? isDryRun
        ? 'dryrun'
        : 'simulation'
      : 'welding';
    await saveWeldingLog({
      jobId,
      jobName,
      operationType: failedOpType,
      startType: startFromClosest ? 'continue' : 'start',
      startedAt,
      completedAt: failedAt,
      totalDistanceMm: totalPathDistance || 0,
      cpm: representativeCpm || 0,
      expectedDurationSec: totalExpectedDurationSec || 0,
      actualDurationSec: failedDuration,
      segments: segments || [],
      totalPoints: weldingPoints?.length || 0,
      completedPoints: lastPointIndex >= 0 ? lastPointIndex : 0,
      weldingPoints: weldingPoints || [],
      firstWeldPoint,
      resultStatus: 'failed',
      errorMessage: String(error),
    }).catch(() => {});
    showAlert('용접 중 오류가 발생했습니다: ' + String(error), {
      type: 'error',
      title: '용접 오류',
    });
    try {
      if (
        typeof window !== 'undefined' &&
        localStorage.getItem('vot.diagnosticLogs.autoSendOnError') === '1'
      ) {
        const recipient =
          localStorage.getItem('vot.diagnosticLogs.recipient') || 'the@aeokorea.com';
        const { sendDiagnosticLogsEmail } = await import('../../../../lib/robotApi');
        sendDiagnosticLogsEmail(
          recipient,
          1,
          `자동발송 — 용접 오류: ${String(error).slice(0, 200)} | 단계: ${lastPointIndex}`,
          1,
        )
          .then(r => log_weldingExecution.info('welding.autoLogSend', '진단 로그 자동 발송', { ok: r.ok }))
          .catch(() => {});
      }
    } catch {
    }
    try {
      const { emergencyWeldingShutdown } = await import('../../../../utils');
      await emergencyWeldingShutdown();
      log_weldingExecution.info('welding.emergencyShutdown', '서버 비상 종료 API 호출 성공');
    } catch {
      log_weldingExecution.warn('welding.emergencyShutdown.fallback', '서버 비상 종료 실패, 개별 호출로 폴백');
      await safeEndWeave();
      await safeArcOff(500);
      await arcTraceControl({ flag: 0 }).catch(() => {});
    }
    return null;
  }
}
