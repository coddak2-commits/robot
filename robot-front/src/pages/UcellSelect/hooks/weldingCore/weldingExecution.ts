import { TeachingPoint, getExecutableParts, flattenExecutableParts, getPartBoundaryInfo } from '../..';
import { enableRobot, RealtimeRobotStatus, endWeave, WeldingLogSegment, arcOff, getRobotSettings, moveToCartesianPosition, getInverseKin, arcTraceControl, batchMoveL, BatchMovePoint, getWeldingPartOrder, clearStopLatch, findDx, pulseWireFeedMs, wireFeedDurationMs, WireDirection, splineMove } from '../../../../lib';
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
// 파트 시작 체류 (v1.1.158). 아크를 켠 자리에서 잠깐 머물러 시작부를 채운다.
// 수평 시작(P4/P10)은 수직 비드와 만나는 지점이라 틈이 남아 수동 보강이 필요했다(2026-09-18 사진).
// 아크 ON 시퀀스 안에 이미 점화 후 500ms 대기가 있으므로 실제 체류는 이 값만큼 더해진다.
// 0으로 두면 체류 없음.
const PART_START_DWELL_MS: Record<string, number> = { p4: 1000, p10: 1000 };
async function dwellAtPartStart(point: TeachingPoint, active: boolean): Promise<void> {
  if (!active) return;
  const ms = PART_START_DWELL_MS[point.id] ?? 0;
  if (ms <= 0) return;
  log_weldingExecution.info(
    'welding.partStart.dwell',
    `파트 시작 체류: ${point.name} ${ms}ms (이동 전 정지 상태로 용착)`,
  );
  await new Promise(resolve => setTimeout(resolve, ms));
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
  let firstWeldPoint = weldingPoints[paramPointIndex] || weldingPoints[0];
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
    firstWeldPoint = weldingPoints[startPointIndex];
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
    const armArcTracking = async () => {
      if (!arcTrackingActive) return;
      try {
        await arcTraceControl({ flag: 1 });
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
    const NEAR_UCELL_CORNER = ['p9', 'p10'];
    const getStartApproachOffsetPos = (pointId: string, offset: number): number[] =>
      NEAR_UCELL_CORNER.includes(pointId.toLowerCase()) ? [0, -offset, 0, 0, 0, 0] : [offset, 0, 0, 0, 0, 0];
    markPointIndex(startPointIndex);
    const startPoint = weldingPoints[startPointIndex];
    const paramPoint = weldingPoints[paramPointIndex];
    if (startFromClosest && closestCenterlineResult) {
      const centerlineTcp = closestCenterlineResult.centerlineTcp;
      const closestTeachingPt = weldingPoints[closestCenterlineResult.closestTeachingPointIndex];
      const distToTeachingPoint = closestTeachingPt?.tcp
        ? Math.sqrt(
            Math.pow(currentTcp![0] - closestTeachingPt.tcp.x, 2) +
              Math.pow(currentTcp![1] - closestTeachingPt.tcp.y, 2) +
              Math.pow(currentTcp![2] - closestTeachingPt.tcp.z, 2),
          )
        : Infinity;
      if (distToTeachingPoint < 5) {
        startPointIndex = closestCenterlineResult.closestTeachingPointIndex;
        paramPointIndex = closestCenterlineResult.closestTeachingPointIndex;
        markPointIndex(startPointIndex);
        firstWeldPoint = weldingPoints[startPointIndex];
      } else {
        const approachSpeed = options?.manualMoveSpeed || 10;
        const { rx, ry, rz } = centerlineTcp;
        const moveLResult = await moveToCartesianPosition(
          { x: centerlineTcp.x, y: centerlineTcp.y, z: centerlineTcp.z, rx, ry, rz },
          approachSpeed,
          100,
          100,
          -1,
          0,
          [0, 0, 0, 0, 0, 0],
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
    await armArcTracking();
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
        await endPartWelding(
          hasWeaving,
          hasWelding,
          simMode && !isWeldingTest,
          safetySettings.gasPostFlowTime,
          weaveTypeCode,
        );
        arcMayBeOn = false;
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
            await startPartWelding(
              point,
              firstWeldPoint,
              hasWeaving,
              hasWelding,
              simMode && !isWeldingTest,
              safetySettings.gasPreFlowTime,
              weaveTypeCode,
            );
            setArcActive?.(true);
            if (hasWelding && !(simMode && !isWeldingTest)) arcMayBeOn = true;
            await armArcTracking();
            await dwellAtPartStart(point, hasWelding && !(simMode && !isWeldingTest));
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
        const isSameSide =
          !!prevPoint?.id && !!point?.id && pointSide(prevPoint.id) === pointSide(point.id);
        // v1.1.174: 횡단 전환 정면 이격 approachOffset -> 100mm 고정. approachOffset(현장 25mm)은 홈에서 MoveJ로 들어가기엔 가까워 쓰지 않는다.
        const CROSS_CLEARANCE_X = 100;
        const CROSS_LIFT_Z = 100;
        if (prevPoint?.tcp && !stopRef.current && isSameSide) {
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
        } else if (prevPoint?.tcp && !stopRef.current) {
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
          const retractResult = await moveToCartesianPosition(
            prevPoint.tcp,
            transitionSpeed,
            100,
            100,
            -1,
            1,
            [crossRetract, 0, 0, 0, 0, 0],
            undefined,
            prevPoint.toolNum ?? 3,
            prevPoint.userNum ?? 0,
            0,
          );
          if (retractResult?.status_code !== 200) throw new Error('파트 전환(횡단) 후퇴 이동 실패');
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
        if (!stopRef.current) {
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
        await startPartWelding(
          point,
          firstWeldPoint,
          hasWeaving,
          hasWelding,
          simMode && !isWeldingTest,
          safetySettings.gasPreFlowTime,
          weaveTypeCode,
        );
        setArcActive?.(true);
        if (hasWelding && !(simMode && !isWeldingTest)) arcMayBeOn = true;
        await armArcTracking();
        await dwellAtPartStart(point, hasWelding && !(simMode && !isWeldingTest));
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
      // v1.1.156: 설정에서 스플라인 이동을 켜면 티칭점을 모두 지나가는 경로로 바꾼다.
      // v1.1.167: 끄면 실제 용접도 드라이런과 같은 경유점 방식(per_point, 블렌드 10mm)으로 간다.
      // 1.1.149~166은 실제 용접만 끝점 보정 단일 MoveL이라 중간점 보정이 빠졌다.
      // 모재가 휘면 양 끝만 맞고 가운데는 직선으로 지나가 비드가 휘어 보였다
      // (2026-09-21 좌측 수직: 직선 보간 dx -0.05 vs P2 실측 dx -6.5, 6.5mm 차이).
      // 경유점 방식은 드라이런에서 매번 돌던 경로라 속도·위빙 조합은 확인된 상태다.
      // v1.1.170: 블렌드 10 -> 50mm. 10mm에서는 경유점(P8)에서 방향이 바뀌는 게 비드에 각지게
      // 드러났다(2026-09-21 사진). 휜 각도 1~2도 기준 경유점에서 벗어나는 거리는 0.2~0.4mm 수준이고,
      // 꺾이는 구간이 약 100mm로 늘어나 완만해진다. 가장 짧은 구간(P5->P6 약 186mm)의 절반 이하.
      const WAYPOINT_BLEND_MM = 50;
      const useSpline = sequenceSettings.splineMoveEnabled && batchPoints.length >= 2;
      log_weldingExecution.info(
        'welding.batch',
        useSpline
          ? `Spline move: ${batchPoints.length}포인트 (type=${sequenceSettings.splineType}, avgTime=${sequenceSettings.splineAverageTime}ms)`
          : `Batch MoveL: ${batchPoints.length}포인트 → 경유점 방식 (블렌드)`,
        {
          indices: batchIndices.map(idx => weldingPoints[idx].id),
        },
      );
      try {
        const batchResult = useSpline
          ? await splineMove(batchPoints, {
              splineType: sequenceSettings.splineType,
              averageTime: sequenceSettings.splineAverageTime,
            })
          : await batchMoveL(batchPoints, { perPoint: true, blendR: WAYPOINT_BLEND_MM });
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
    if (hasWelding && !simMode && !isWeldingTest)
      await arcOff(0, 0, 1000, safetySettings.gasPostFlowTime);
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
        if (retreatResult?.status_code !== 200)
          log_weldingExecution.warn('welding.retract.failed', '최종 후퇴 이동 실패 (용접 자체는 완료됨)', {
            status: retreatResult?.status_code,
          });
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
