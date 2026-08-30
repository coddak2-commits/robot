import { TeachingPoint, getExecutableParts, flattenExecutableParts, WEAVING_TYPE_OPTIONS, PartWeldEnabled, getPartBoundaryInfo } from '../..';
import { enableRobot, RealtimeRobotStatus, startArc, endArc, endWeave, getWeldingConfig, WeldingConfigData, moveToJointPositionNonBlocking, checkMotionDone, createWeldingLog, WeldingLogData, WeldingLogSegment, wireSearchEnd, findDx, findDy, findDz, setWeaveParams, startWeave, arcOn, arcOff, getRobotSettings, moveToCartesianPosition, getInverseKin, arcTraceControl, batchMoveL, BatchMovePoint, getWeldingPartOrder, isApiSuccess } from '../../../../lib';
import { createLogger } from '../../../../lib';
import React from 'react';
import { setWeldingPartOrder } from '../..';
const log = createLogger('weldingCore.arcTest');
export interface ArcTestContext {
  stopRef: React.MutableRefObject<boolean>;
  setCurrentPointIndex: (index: number) => void;
  showAlert: (message: string, options?: { type?: 'error' | 'warning' | 'info' | 'success'; title?: string }) => void;
}
export async function executeArcTest(
  teachingPoints: TeachingPoint[],
  robotState: RealtimeRobotStatus | null,
  manualSpeed: number,
  isSimulation: boolean,
  context: ArcTestContext
): Promise<void> {
  const { stopRef, setCurrentPointIndex, showAlert } = context;
  const totalTimer = log.startTimer();
  const testType = isSimulation ? '포인트 테스트' : '아크 테스트';
  log.info('arcTest.start', `${testType} 시작`, { manualSpeed, isSimulation });
  const executableParts = getExecutableParts(teachingPoints);
  log.info('arcTest.parts', '파트별 실행 정보', {
    parts: executableParts.map(p => ({
      name: p.name,
      savedCount: p.savedPoints.length,
      savedIds: p.savedPoints.map(pt => pt.id),
      shouldExecute: p.shouldExecute
    }))
  });
  const savedPoints = flattenExecutableParts(executableParts);
  if (savedPoints.length === 0) {
    log.warn('arcTest.noPoints', '저장된 티칭 포인트가 없음');
    showAlert('저장된 티칭 포인트가 없습니다. (각 파트에 2개 이상 포인트 필요)', { type: 'warning', title: '포인트 없음' });
    return;
  }
  setCurrentPointIndex(0);
  if (!robotState?.servo_enabled) {
    log.info('arcTest.setup', '서보 활성화 중...');
    await enableRobot();
  }
  await endWeave().catch(() => {});
  log.info('arcTest.cleanup', '이전 위빙 상태 정리 완료');
  const homePoint = teachingPoints.find(pt => pt.id === 'home' && pt.isSaved && pt.joints && pt.joints.length > 0);
  if (homePoint?.joints) {
    log.info('arcTest.home.start', 'Home 위치로 이동 (비블로킹)', { manualSpeed });
    const homeResult = await moveToJointWithStopCheck(
      homePoint.joints,
      manualSpeed,
      homePoint.toolNum ?? 3,
      homePoint.userNum ?? 0,
      stopRef
    );
    if (homeResult.stopped) {
      log.info('arcTest.home.stopped', 'Home 이동 중 정지됨');
      return;
    }
    if (!homeResult.success) {
      throw new Error('Home 이동 실패');
    }
  }
  if (stopRef.current) return;
  for (let i = 0; i < savedPoints.length; i++) {
    if (stopRef.current) break;
    const point = savedPoints[i];
    setCurrentPointIndex(i);
    if (point.joints && point.joints.length > 0) {
      log.info('arcTest.move', `[${i + 1}/${savedPoints.length}] ${point.name} 이동 (비블로킹)`, { manualSpeed });
      const moveResult = await moveToJointWithStopCheck(
        point.joints,
        manualSpeed,
        point.toolNum ?? 0,
        point.userNum ?? 0,
        stopRef
      );
      if (moveResult.stopped) {
        log.info('arcTest.move.stopped', `${point.name} 이동 중 정지됨`);
        break;
      }
      if (!moveResult.success) {
        throw new Error(`${point.name} 이동 실패`);
      }
    }
    if (stopRef.current) break;
    if (!isSimulation) {
      log.info('arcTest.arc.on', `${point.name} 아크 ON`);
      await startArc(0, 0, 100);
      await new Promise(resolve => setTimeout(resolve, 500));
      if (stopRef.current) {
        await endArc();
        break;
      }
      await endArc();
    } else {
      log.info('arcTest.point.reached', `${point.name} 포인트 도달`);
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  totalTimer.end('arcTest.complete', `${testType} 완료`);
}
export const defaultSequenceSettings: WeldingSequenceSettings = {
  touchSensingEnabled: true,
  touchSpeed: 10,
  touchDistance: 100,
  touchOffsetDepth: 5,
  touchApproachOffset: 100,
  touchSensingPointSpeed: 50,
  p1TouchCenter: true,
  p1TouchLeft: true,
  p1TouchRight: true,
  p1TouchBottom: false,
  p2TouchCenter: true,
  p2TouchLeft: true,
  p2TouchRight: true,
  p3TouchCenter: true,
  p3TouchLeft: true,
  p3TouchRight: true,
  p3TouchBottom: true,
  p4TouchCenter: true,
  p4TouchTop: true,
  p4TouchBottom: true,
  p4TouchSide: true,
  p5TouchCenter: true,
  p5TouchTop: true,
  p5TouchBottom: true,
  p6TouchCenter: true,
  p6TouchTop: true,
  p6TouchBottom: true,
  p7TouchCenter: true,
  p7TouchLeft: true,
  p7TouchRight: true,
  p8TouchCenter: true,
  p8TouchLeft: true,
  p8TouchRight: true,
  p9TouchCenter: true,
  p9TouchLeft: true,
  p9TouchRight: true,
  p9TouchBottom: true,
  p10TouchCenter: true,
  p10TouchTop: true,
  p10TouchBottom: true,
  p10TouchSide: true,
  p11TouchCenter: true,
  p11TouchTop: true,
  p11TouchBottom: true,
  p12TouchCenter: true,
  p12TouchTop: true,
  p12TouchBottom: true,
  arcTrackingEnabled: false,
  arcTrackingLeftRight: true,
  arcTrackingUpDown: true,
  arcTrackingKlr: 0.06,
  arcTrackingKud: 0.06,
  arcTrackingStepMaxLr: 5.0,
  arcTrackingStepMaxUd: 5.0,
  arcTrackingSumMaxLr: 30.0,
  arcTrackingSumMaxUd: 30.0,
};
export const defaultSafetySettings: SafetySettings = {
  gasPreFlowTime: 500,
  gasPostFlowTime: 2000,
};
export const mapConfigToSequenceSettings = (config: WeldingConfigData): WeldingSequenceSettings => ({
  touchSensingEnabled: config.touch_sensing_enabled,
  touchSpeed: config.touch_speed,
  touchDistance: config.touch_distance,
  touchOffsetDepth: config.touch_offset_depth,
  touchApproachOffset: config.touch_sensing_approach_offset ?? 100,
  touchSensingPointSpeed: config.touch_sensing_point_speed ?? 50,
  p1TouchCenter: config.p1_touch_center ?? true,
  p1TouchLeft: config.p1_touch_left ?? true,
  p1TouchRight: config.p1_touch_right ?? true,
  p1TouchBottom: config.p1_touch_bottom ?? false,
  p2TouchCenter: config.p2_touch_center ?? true,
  p2TouchLeft: config.p2_touch_left ?? true,
  p2TouchRight: config.p2_touch_right ?? true,
  p3TouchCenter: config.p3_touch_center ?? true,
  p3TouchLeft: config.p3_touch_left ?? true,
  p3TouchRight: config.p3_touch_right ?? true,
  p3TouchBottom: config.p3_touch_bottom ?? true,
  p4TouchCenter: config.p4_touch_center ?? true,
  p4TouchTop: config.p4_touch_top ?? true,
  p4TouchBottom: config.p4_touch_bottom ?? true,
  p4TouchSide: config.p4_touch_side ?? true,
  p5TouchCenter: config.p5_touch_center ?? true,
  p5TouchTop: config.p5_touch_top ?? true,
  p5TouchBottom: config.p5_touch_bottom ?? true,
  p6TouchCenter: config.p6_touch_center ?? true,
  p6TouchTop: config.p6_touch_top ?? true,
  p6TouchBottom: config.p6_touch_bottom ?? true,
  p7TouchCenter: config.p7_touch_center ?? true,
  p7TouchLeft: config.p7_touch_left ?? true,
  p7TouchRight: config.p7_touch_right ?? true,
  p8TouchCenter: config.p8_touch_center ?? true,
  p8TouchLeft: config.p8_touch_left ?? true,
  p8TouchRight: config.p8_touch_right ?? true,
  p9TouchCenter: config.p9_touch_center ?? true,
  p9TouchLeft: config.p9_touch_left ?? true,
  p9TouchRight: config.p9_touch_right ?? true,
  p9TouchBottom: config.p9_touch_bottom ?? true,
  p10TouchCenter: config.p10_touch_center ?? true,
  p10TouchTop: config.p10_touch_top ?? true,
  p10TouchBottom: config.p10_touch_bottom ?? true,
  p10TouchSide: config.p10_touch_side ?? true,
  p11TouchCenter: config.p11_touch_center ?? true,
  p11TouchTop: config.p11_touch_top ?? true,
  p11TouchBottom: config.p11_touch_bottom ?? true,
  p12TouchCenter: config.p12_touch_center ?? true,
  p12TouchTop: config.p12_touch_top ?? true,
  p12TouchBottom: config.p12_touch_bottom ?? true,
  arcTrackingEnabled: config.arc_tracking_enabled,
  arcTrackingLeftRight: config.arc_tracking_left_right,
  arcTrackingUpDown: config.arc_tracking_up_down,
  arcTrackingKlr: config.arc_tracking_klr,
  arcTrackingKud: config.arc_tracking_kud,
  arcTrackingStepMaxLr: config.arc_tracking_step_max_lr,
  arcTrackingStepMaxUd: config.arc_tracking_step_max_ud,
  arcTrackingSumMaxLr: config.arc_tracking_sum_max_lr,
  arcTrackingSumMaxUd: config.arc_tracking_sum_max_ud,
});
export const mapConfigToSafetySettings = (config: WeldingConfigData): SafetySettings => ({
  gasPreFlowTime: config.gas_pre_flow_time,
  gasPostFlowTime: config.gas_post_flow_time,
});
export const loadWeldingSettings = async (): Promise<{ sequence: WeldingSequenceSettings; safety: SafetySettings }> => {
  try {
    const config = await getWeldingConfig();
    return {
      sequence: mapConfigToSequenceSettings(config),
      safety: mapConfigToSafetySettings(config),
    };
  } catch (error) {
    console.warn('용접 설정 로드 실패, 기본값 사용:', error);
    return {
      sequence: defaultSequenceSettings,
      safety: defaultSafetySettings,
    };
  }
};
const log_helpers = createLogger('weldingHelpers');
export const moveToJointWithStopCheck = async (
  joints: number[],
  speed: number,
  tool: number,
  user: number,
  stopRef: React.MutableRefObject<boolean>,
  timeout = 300000
): Promise<{ success: boolean; stopped: boolean }> => {
  if (stopRef.current) {
    return { success: false, stopped: true };
  }
  try {
    const result = await moveToJointPositionNonBlocking(joints, speed, 100, 100, tool, user);
    const resultCode = result?.result ?? result?.data?.result;
    if (result?.status_code !== 200 || resultCode !== 0) {
      log_helpers.error('moveToJointWithStopCheck.failed', '이동 명령 실패', { result });
      return { success: false, stopped: false };
    }
    const startTime = Date.now();
    await new Promise(resolve => setTimeout(resolve, 200));
    while (Date.now() - startTime < timeout) {
      if (stopRef.current) {
        log_helpers.info('moveToJointWithStopCheck.stopped', '이동 중 정지 요청 감지');
        return { success: false, stopped: true };
      }
      try {
        const motionResult = await checkMotionDone();
        if (motionResult?.done) {
          return { success: true, stopped: false };
        }
      } catch {
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    log_helpers.warn('moveToJointWithStopCheck.timeout', '이동 타임아웃');
    return { success: false, stopped: false };
  } catch (error) {
    log_helpers.error('moveToJointWithStopCheck.error', '이동 오류', { error: String(error) });
    return { success: false, stopped: false };
  }
};
export const moveToCartesianWithStopCheck = async (
  tcp: { x: number; y: number; z: number; rx: number; ry: number; rz: number },
  vel: number,
  acc: number,
  ovl: number,
  blendT: number,
  offsetFlag: number,
  offsetPos: number[],
  jointPos: number[] | undefined,
  toolNum: number,
  userNum: number,
  stopRef: React.MutableRefObject<boolean>,
  timeout = 300000
): Promise<{ success: boolean; stopped: boolean }> => {
  if (stopRef.current) {
    return { success: false, stopped: true };
  }
  try {
    const { moveToCartesianPositionNonBlocking, checkMotionDone } = await import('../../../../lib/robotApi');
    if (offsetFlag !== 0) {
      log_helpers.info('moveToCartesianWithStopCheck.offset', `TCP 오프셋 이동: flag=${offsetFlag}, pos=[${offsetPos.join(', ')}]`);
    }
    const result = await moveToCartesianPositionNonBlocking(tcp, vel, acc, ovl, toolNum, userNum, offsetFlag, offsetPos);
    const resultCode = result?.data?.result ?? result?.result ?? -1;
    if (result?.status_code !== 200 || resultCode !== 0) {
      log_helpers.error('moveToCartesianWithStopCheck.failed', '이동 명령 실패', { result });
      return { success: false, stopped: false };
    }
    const startTime = Date.now();
    await new Promise(resolve => setTimeout(resolve, 200));
    while (Date.now() - startTime < timeout) {
      if (stopRef.current) {
        log_helpers.info('moveToCartesianWithStopCheck.stopped', '이동 중 정지 요청 감지');
        return { success: false, stopped: true };
      }
      try {
        const motionResult = await checkMotionDone();
        if (motionResult?.done) {
          return { success: true, stopped: false };
        }
      } catch {
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    log_helpers.warn('moveToCartesianWithStopCheck.timeout', '이동 타임아웃');
    return { success: false, stopped: false };
  } catch (error) {
    log_helpers.error('moveToCartesianWithStopCheck.error', '이동 오류', { error: String(error) });
    return { success: false, stopped: false };
  }
};
export const calculateDistance = (
  p1: { x: number; y: number; z: number } | null,
  p2: { x: number; y: number; z: number } | null
): number => {
  if (!p1 || !p2) return Infinity;
  return Math.sqrt(
    Math.pow(p2.x - p1.x, 2) +
    Math.pow(p2.y - p1.y, 2) +
    Math.pow(p2.z - p1.z, 2)
  );
};
export const getMinimumWeavingDistance = (weaveRange: number, configuredMinDistance: number): number => {
  return Math.max(weaveRange, configuredMinDistance);
};
export const getWeaveTypeCode = (weavingType: string | null): number => {
  const option = WEAVING_TYPE_OPTIONS.find(opt => opt.value === weavingType);
  return option ? option.code : -1;
};
export const delay = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));
const log_logging = createLogger('weldingCore.logging');
function toLocalISOString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${y}-${m}-${d}T${h}:${min}:${s}`;
}
export interface PointSnapshot {
  id: string;
  name: string;
  tcp: TeachingPoint['tcp'];
  joints: TeachingPoint['joints'];
  moveSpeed: number | null;
  weldVoltage: number | null;
  weldCurrent: number | null;
  weavingType: string | null;
  weaveParams: TeachingPoint['weaveParams'];
  touchOffset: TeachingPoint['touchOffset'];
  gap: number;
}
export interface SaveWeldingLogParams {
  jobId?: number;
  jobName?: string;
  operationType: 'welding' | 'dryrun' | 'simulation';
  startType: 'start' | 'continue';
  startedAt: Date;
  completedAt: Date;
  totalDistanceMm: number;
  cpm: number;
  expectedDurationSec: number;
  actualDurationSec: number;
  segments: WeldingLogSegment[];
  totalPoints: number;
  completedPoints: number;
  weldingPoints: TeachingPoint[];
  firstWeldPoint?: TeachingPoint;
  resultStatus: 'success' | 'failed' | 'stopped';
  errorMessage?: string;
}
export function getUserIdFromStorage(): string {
  try {
    const token = localStorage.getItem('token');
    if (token) {
      const userData = JSON.parse(token);
      return userData?.username || userData?.user_id || userData?.userId || '';
    }
  } catch {  }
  return '';
}
export function createPointsSnapshot(points: TeachingPoint[]): PointSnapshot[] {
  return points.map(pt => ({
    id: pt.id,
    name: pt.name,
    tcp: pt.tcp,
    joints: pt.joints,
    moveSpeed: pt.moveSpeed,
    weldVoltage: pt.weldVoltage,
    weldCurrent: pt.weldCurrent,
    weavingType: pt.weavingType,
    weaveParams: pt.weaveParams,
    touchOffset: pt.touchOffset,
    gap: pt.gap,
  }));
}
export async function saveWeldingLog(params: SaveWeldingLogParams): Promise<number | null> {
  const {
    jobId,
    jobName,
    operationType,
    startType,
    startedAt,
    completedAt,
    totalDistanceMm,
    cpm,
    expectedDurationSec,
    actualDurationSec,
    segments,
    totalPoints,
    completedPoints,
    weldingPoints,
    firstWeldPoint,
    resultStatus,
    errorMessage,
  } = params;
  try {
    const userId = getUserIdFromStorage();
    const pointsSnapshot = createPointsSnapshot(weldingPoints);
    const logData: Omit<WeldingLogData, 'id' | 'created_at'> = {
      job_id: jobId || null,
      job_name: jobName || '',
      user_id: userId,
      operation_type: operationType,
      start_type: startType,
      started_at: toLocalISOString(startedAt),
      completed_at: toLocalISOString(completedAt),
      total_distance_mm: totalDistanceMm,
      cpm,
      expected_duration_sec: expectedDurationSec,
      actual_duration_sec: actualDurationSec,
      segments,
      total_points: totalPoints,
      completed_points: completedPoints,
      weld_voltage: firstWeldPoint?.weldVoltage ?? undefined,
      weld_current: firstWeldPoint?.weldCurrent ?? undefined,
      weaving_type: firstWeldPoint?.weavingType || undefined,
      weave_params: firstWeldPoint?.weaveParams as unknown as Record<string, unknown> || undefined,
      points_snapshot: pointsSnapshot as unknown as Record<string, unknown>[],
      result_status: resultStatus,
      error_message: errorMessage,
    };
    const savedLog = await createWeldingLog(logData);
    log_logging.info('saveWeldingLog', '용접 로그 저장 완료', { logId: savedLog.id, status: resultStatus });
    return savedLog.id ?? null;
  } catch (logError) {
    log_logging.error('saveWeldingLog.error', '용접 로그 저장 실패', { error: String(logError) });
    return null;
  }
}
export interface SaveStoppedLogParams {
  startedAt: Date;
  segments: WeldingLogSegment[];
  weldingPoints: TeachingPoint[];
  firstWeldPoint?: TeachingPoint;
  completedPointIndex: number;
  jobId?: number;
  jobName?: string;
  simMode: boolean;
  isDryRun: boolean;
  startFromClosest: boolean;
  representativeCpm: number;
  totalExpectedDurationSec: number;
}
export async function saveStoppedLog(params: SaveStoppedLogParams): Promise<WeldingResult | null> {
  const {
    startedAt,
    segments,
    weldingPoints,
    firstWeldPoint,
    completedPointIndex,
    jobId,
    jobName,
    simMode,
    isDryRun,
    startFromClosest,
    representativeCpm,
    totalExpectedDurationSec,
  } = params;
  const stoppedAt = new Date();
  const stoppedDuration = (stoppedAt.getTime() - startedAt.getTime()) / 1000;
  const operationType: 'welding' | 'dryrun' | 'simulation' = simMode
    ? (isDryRun ? 'dryrun' : 'simulation')
    : 'welding';
  const completedPts = Math.max(0, completedPointIndex);
  const completedDistance = segments
    .slice(0, completedPts)
    .reduce((sum, seg) => sum + seg.distance_mm, 0);
  const stoppedResult: WeldingResult = {
    operationType,
    jobId,
    jobName,
    startedAt,
    completedAt: stoppedAt,
    totalDistanceMm: completedDistance,
    cpm: representativeCpm,
    expectedDurationSec: totalExpectedDurationSec,
    actualDurationSec: stoppedDuration,
    timeDifferenceSec: stoppedDuration - totalExpectedDurationSec,
    timeDifferencePercent: totalExpectedDurationSec > 0
      ? ((stoppedDuration - totalExpectedDurationSec) / totalExpectedDurationSec) * 100
      : 0,
    segments,
    totalPoints: weldingPoints.length,
    completedPoints: completedPts,
    resultStatus: 'stopped',
  };
  try {
    const logId = await saveWeldingLog({
      jobId,
      jobName,
      operationType,
      startType: startFromClosest ? 'continue' : 'start',
      startedAt,
      completedAt: stoppedAt,
      totalDistanceMm: completedDistance,
      cpm: representativeCpm,
      expectedDurationSec: totalExpectedDurationSec,
      actualDurationSec: stoppedDuration,
      segments,
      totalPoints: weldingPoints.length,
      completedPoints: completedPts,
      weldingPoints,
      firstWeldPoint,
      resultStatus: 'stopped',
    });
    if (logId) stoppedResult.logId = logId;
  } catch {
    log_logging.error('saveStoppedLog.error', '중단 로그 저장 실패');
  }
  return stoppedResult;
}
const log_pathFinding = createLogger('pathFinding');
export const findClosestCenterlinePoint = (
  teachingPoints: TeachingPoint[],
  currentTcp: number[],
  partWeldEnabled?: PartWeldEnabled
): ClosestCenterlineResult | null => {
  const executableParts = getExecutableParts(teachingPoints, partWeldEnabled);
  const weldingPoints = flattenExecutableParts(executableParts);
  if (weldingPoints.length < 2) return null;
  const INTERVAL_MM = 5;
  let minDistance = Infinity;
  let closestCenterlineTcp = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 };
  let closestSegmentIndex = 0;
  let closestDistanceAlongSegment = 0;
  for (let segIdx = 0; segIdx < weldingPoints.length - 1; segIdx++) {
    const startPt = weldingPoints[segIdx];
    const endPt = weldingPoints[segIdx + 1];
    if (!startPt.tcp || !endPt.tcp) continue;
    const dx = endPt.tcp.x - startPt.tcp.x;
    const dy = endPt.tcp.y - startPt.tcp.y;
    const dz = endPt.tcp.z - startPt.tcp.z;
    const segmentLength = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (segmentLength === 0) continue;
    const numPoints = Math.ceil(segmentLength / INTERVAL_MM) + 1;
    for (let i = 0; i < numPoints; i++) {
      const distanceFromStart = Math.min(i * INTERVAL_MM, segmentLength);
      const t = distanceFromStart / segmentLength;
      const pointX = startPt.tcp.x + dx * t;
      const pointY = startPt.tcp.y + dy * t;
      const pointZ = startPt.tcp.z + dz * t;
      const dist = Math.sqrt(
        Math.pow(pointX - currentTcp[0], 2) +
        Math.pow(pointY - currentTcp[1], 2) +
        Math.pow(pointZ - currentTcp[2], 2)
      );
      if (dist < minDistance) {
        minDistance = dist;
        const startRx = startPt.tcp!.rx ?? 0;
        const startRy = startPt.tcp!.ry ?? 0;
        const startRz = startPt.tcp!.rz ?? 0;
        const endRx = endPt.tcp!.rx ?? 0;
        const endRy = endPt.tcp!.ry ?? 0;
        const endRz = endPt.tcp!.rz ?? 0;
        closestCenterlineTcp = {
          x: pointX, y: pointY, z: pointZ,
          rx: startRx + t * (endRx - startRx),
          ry: startRy + t * (endRy - startRy),
          rz: startRz + t * (endRz - startRz),
        };
        closestSegmentIndex = segIdx;
        closestDistanceAlongSegment = distanceFromStart;
      }
    }
  }
  const startPt = weldingPoints[closestSegmentIndex];
  const endPt = weldingPoints[closestSegmentIndex + 1];
  const segmentLength = Math.sqrt(
    Math.pow(endPt.tcp!.x - startPt.tcp!.x, 2) +
    Math.pow(endPt.tcp!.y - startPt.tcp!.y, 2) +
    Math.pow(endPt.tcp!.z - startPt.tcp!.z, 2)
  );
  const closestTeachingPointIndex = closestDistanceAlongSegment < segmentLength / 2
    ? closestSegmentIndex
    : closestSegmentIndex + 1;
  const segmentRatio = segmentLength > 0 ? closestDistanceAlongSegment / segmentLength : 0;
  log_pathFinding.info('findClosestCenterlinePoint', '센터라인에서 가장 가까운 포인트 찾기', {
    centerlineTcp: `[${closestCenterlineTcp.x.toFixed(1)}, ${closestCenterlineTcp.y.toFixed(1)}, ${closestCenterlineTcp.z.toFixed(1)}]`,
    segmentStartIndex: closestSegmentIndex,
    segmentStart: weldingPoints[closestSegmentIndex]?.id,
    segmentEnd: weldingPoints[closestSegmentIndex + 1]?.id,
    segmentRatio: segmentRatio.toFixed(3),
    segmentLength: segmentLength.toFixed(1),
    closestTeachingPointIndex,
    closestTeachingPoint: weldingPoints[closestTeachingPointIndex]?.id,
    distance: minDistance.toFixed(2)
  });
  return {
    centerlineTcp: closestCenterlineTcp,
    segmentStartIndex: closestSegmentIndex,
    closestTeachingPointIndex,
    distance: minDistance,
    segmentRatio,
    segmentLength
  };
};
export interface TouchDirectionResult {
  hasCenter: boolean;
  hasLeft: boolean;
  hasRight: boolean;
  hasTop: boolean;
  hasBottomDir: boolean;
  hasSide: boolean;
  sideDirection: 1 | -1;
  isHorizontal: boolean;
}
export function getTouchDirections(
  pointIdLower: string,
  sequenceSettings: WeldingSequenceSettings,
  touchBottom: boolean,
  pointTouchBottom?: boolean
): TouchDirectionResult {
  let hasCenter = true, hasLeft = false, hasRight = false, hasTop = false, hasBottomDir = false, hasSide = false;
  let sideDirection: 1 | -1 = -1;
  const isHorizontal = ['p4', 'p5', 'p6', 'p10', 'p11', 'p12'].includes(pointIdLower);
  switch (pointIdLower) {
    case 'p1':
      hasCenter = sequenceSettings.p1TouchCenter;
      hasLeft = sequenceSettings.p1TouchLeft;
      hasRight = sequenceSettings.p1TouchRight;
      hasBottomDir = sequenceSettings.p1TouchBottom && (pointTouchBottom ?? touchBottom);
      break;
    case 'p2':
      hasCenter = sequenceSettings.p2TouchCenter;
      hasLeft = sequenceSettings.p2TouchLeft;
      hasRight = sequenceSettings.p2TouchRight;
      break;
    case 'p3':
      hasCenter = sequenceSettings.p3TouchCenter;
      hasLeft = sequenceSettings.p3TouchLeft;
      hasRight = sequenceSettings.p3TouchRight;
      hasBottomDir = sequenceSettings.p3TouchBottom;
      break;
    case 'p4':
      hasCenter = sequenceSettings.p4TouchCenter;
      hasTop = sequenceSettings.p4TouchTop;
      hasBottomDir = sequenceSettings.p4TouchBottom;
      hasSide = sequenceSettings.p4TouchSide;
      break;
    case 'p5':
      hasCenter = sequenceSettings.p5TouchCenter;
      hasTop = sequenceSettings.p5TouchTop;
      hasBottomDir = sequenceSettings.p5TouchBottom;
      break;
    case 'p6':
      hasCenter = sequenceSettings.p6TouchCenter;
      hasTop = sequenceSettings.p6TouchTop;
      hasBottomDir = sequenceSettings.p6TouchBottom;
      break;
    case 'p7':
      hasCenter = sequenceSettings.p7TouchCenter;
      hasLeft = sequenceSettings.p7TouchLeft;
      hasRight = sequenceSettings.p7TouchRight;
      break;
    case 'p8':
      hasCenter = sequenceSettings.p8TouchCenter;
      hasLeft = sequenceSettings.p8TouchLeft;
      hasRight = sequenceSettings.p8TouchRight;
      break;
    case 'p9':
      hasCenter = sequenceSettings.p9TouchCenter;
      hasLeft = sequenceSettings.p9TouchLeft;
      hasRight = sequenceSettings.p9TouchRight;
      hasBottomDir = sequenceSettings.p9TouchBottom;
      break;
    case 'p10':
      hasCenter = sequenceSettings.p10TouchCenter;
      hasTop = sequenceSettings.p10TouchTop;
      hasBottomDir = sequenceSettings.p10TouchBottom;
      hasSide = sequenceSettings.p10TouchSide;
      sideDirection = 1;
      break;
    case 'p11':
      hasCenter = sequenceSettings.p11TouchCenter;
      hasTop = sequenceSettings.p11TouchTop;
      hasBottomDir = sequenceSettings.p11TouchBottom;
      break;
    case 'p12':
      hasCenter = sequenceSettings.p12TouchCenter;
      hasTop = sequenceSettings.p12TouchTop;
      hasBottomDir = sequenceSettings.p12TouchBottom;
      break;
    default:
      hasCenter = true;
      hasLeft = !isHorizontal;
      hasRight = !isHorizontal;
      hasTop = isHorizontal;
      hasBottomDir = isHorizontal;
  }
  return { hasCenter, hasLeft, hasRight, hasTop, hasBottomDir, hasSide, sideDirection, isHorizontal };
}
const log_touchDryRun = createLogger('weldingCore.touchDryRun');
export interface PointTouchResult {
  dx: number;
  dy: number;
  dz: number;
  stopped: boolean;
  error?: string;
}
export async function performDryRunForPoint(
  point: TeachingPoint,
  sequenceSettings: WeldingSequenceSettings,
  touchBottom: boolean,
  stopRef: React.MutableRefObject<boolean>,
  dryRunSpeed: number = 15
): Promise<PointTouchResult> {
  const dryRunMoveDistance = sequenceSettings.touchDistance;
  const pointIdLower = point.id.toLowerCase();
  const directions = getTouchDirections(pointIdLower, sequenceSettings, touchBottom, point.touchBottom);
  const { hasCenter, hasLeft, hasRight, hasTop, hasBottomDir, hasSide, sideDirection, isHorizontal } = directions;
  let dx = 0, dy = 0, dz = 0;
  log_touchDryRun.info('touchSensing.dryRun.start', `${point.name} DryRun 모드 - 시뮬레이션 이동 시작`, {
    hasCenter, hasLeft, hasRight, hasTop, hasBottomDir, hasSide, isHorizontal, sideDirection
  });
  if (!point.tcp) {
    log_touchDryRun.warn('touchSensing.dryRun.noTcp', `${point.name} TCP 좌표 없음 - 시뮬레이션 스킵`);
    return { dx: 10, dy: 10, dz: hasBottomDir || hasTop ? 10 : 0, stopped: false };
  }
  const tcp = point.tcp;
  const toolNum = point.toolNum ?? 0;
  const userNum = point.userNum ?? 0;
  const joints = point.joints ?? undefined;
  try {
    if (hasCenter && !stopRef.current) {
      const label = isHorizontal ? '가로용접 Base -X' : '세로용접 Base -X';
      log_touchDryRun.info('touchSensing.dryRun.center', `${point.name} 중앙 시뮬레이션 (${label})`);
      const moveResult = await moveToCartesianWithStopCheck(
        tcp, dryRunSpeed, 100, 100, 0,
        1, [-dryRunMoveDistance, 0, 0, 0, 0, 0],
        joints, toolNum, userNum, stopRef, 30000
      );
      if (moveResult.stopped) return { dx: 0, dy: 0, dz: 0, stopped: true };
      await new Promise(r => setTimeout(r, 300));
      const returnResult = await moveToCartesianWithStopCheck(
        tcp, dryRunSpeed, 100, 100, 0,
        0, [0, 0, 0, 0, 0, 0],
        joints, toolNum, userNum, stopRef, 30000
      );
      if (returnResult.stopped) return { dx: 0, dy: 0, dz: 0, stopped: true };
      dx = 10;
    }
    if (stopRef.current) return { dx, dy, dz, stopped: true };
    if (!isHorizontal) {
      if (hasLeft && !stopRef.current) {
        log_touchDryRun.info('touchSensing.dryRun.y.left', `${point.name} 좌측 시뮬레이션 (Base -Y)`);
        const moveResult = await moveToCartesianWithStopCheck(
          tcp, dryRunSpeed, 100, 100, 0,
          1, [0, -dryRunMoveDistance, 0, 0, 0, 0],
          joints, toolNum, userNum, stopRef, 30000
        );
        if (moveResult.stopped) return { dx, dy: 0, dz: 0, stopped: true };
        await new Promise(r => setTimeout(r, 300));
        const returnResult = await moveToCartesianWithStopCheck(
          tcp, dryRunSpeed, 100, 100, 0,
          0, [0, 0, 0, 0, 0, 0],
          joints, toolNum, userNum, stopRef, 30000
        );
        if (returnResult.stopped) return { dx, dy: 0, dz: 0, stopped: true };
        dy = 10;
      }
      if (stopRef.current) return { dx, dy, dz, stopped: true };
      if (hasRight && !stopRef.current) {
        log_touchDryRun.info('touchSensing.dryRun.y.right', `${point.name} 우측 시뮬레이션 (Base +Y)`);
        const moveResult = await moveToCartesianWithStopCheck(
          tcp, dryRunSpeed, 100, 100, 0,
          1, [0, dryRunMoveDistance, 0, 0, 0, 0],
          joints, toolNum, userNum, stopRef, 30000
        );
        if (moveResult.stopped) return { dx, dy, dz: 0, stopped: true };
        await new Promise(r => setTimeout(r, 300));
        const returnResult = await moveToCartesianWithStopCheck(
          tcp, dryRunSpeed, 100, 100, 0,
          0, [0, 0, 0, 0, 0, 0],
          joints, toolNum, userNum, stopRef, 30000
        );
        if (returnResult.stopped) return { dx, dy, dz: 0, stopped: true };
        dy = 10;
      }
    } else if (hasSide && !stopRef.current) {
      const sideLabel = sideDirection === -1 ? 'P4 좌측(Base -Y)' : 'P10 우측(Base +Y)';
      log_touchDryRun.info('touchSensing.dryRun.y.side', `${point.name} ${sideLabel} 시뮬레이션`);
      const moveResult = await moveToCartesianWithStopCheck(
        tcp, dryRunSpeed, 100, 100, 0,
        1, [0, sideDirection * dryRunMoveDistance, 0, 0, 0, 0],
        joints, toolNum, userNum, stopRef, 30000
      );
      if (moveResult.stopped) return { dx, dy: 0, dz: 0, stopped: true };
      await new Promise(r => setTimeout(r, 300));
      const returnResult = await moveToCartesianWithStopCheck(
        tcp, dryRunSpeed, 100, 100, 0,
        0, [0, 0, 0, 0, 0, 0],
        joints, toolNum, userNum, stopRef, 30000
      );
      if (returnResult.stopped) return { dx, dy: 0, dz: 0, stopped: true };
      dy = 10;
    }
    if (stopRef.current) return { dx, dy, dz, stopped: true };
    if (hasTop && !stopRef.current) {
      const zDir = isHorizontal ? 1 : -1;
      log_touchDryRun.info('touchSensing.dryRun.z.top', `${point.name} 상단 시뮬레이션 (Base ${zDir === 1 ? '+Z' : '-Z'})`);
      const moveResult = await moveToCartesianWithStopCheck(
        tcp, dryRunSpeed, 100, 100, 0,
        1, [0, 0, zDir * dryRunMoveDistance, 0, 0, 0],
        joints, toolNum, userNum, stopRef, 30000
      );
      if (moveResult.stopped) return { dx, dy, dz: 0, stopped: true };
      await new Promise(r => setTimeout(r, 300));
      const returnResult = await moveToCartesianWithStopCheck(
        tcp, dryRunSpeed, 100, 100, 0,
        0, [0, 0, 0, 0, 0, 0],
        joints, toolNum, userNum, stopRef, 30000
      );
      if (returnResult.stopped) return { dx, dy, dz: 0, stopped: true };
      dz = 10;
    }
    if (stopRef.current) return { dx, dy, dz, stopped: true };
    if (hasBottomDir && !stopRef.current) {
      log_touchDryRun.info('touchSensing.dryRun.z.bottom', `${point.name} 하단 시뮬레이션 (Base -Z)`);
      const moveResult = await moveToCartesianWithStopCheck(
        tcp, dryRunSpeed, 100, 100, 0,
        1, [0, 0, -dryRunMoveDistance, 0, 0, 0],
        joints, toolNum, userNum, stopRef, 30000
      );
      if (moveResult.stopped) return { dx, dy, dz, stopped: true };
      await new Promise(r => setTimeout(r, 300));
      const returnResult = await moveToCartesianWithStopCheck(
        tcp, dryRunSpeed, 100, 100, 0,
        0, [0, 0, 0, 0, 0, 0],
        joints, toolNum, userNum, stopRef, 30000
      );
      if (returnResult.stopped) return { dx, dy, dz, stopped: true };
      dz = 10;
    }
    log_touchDryRun.info('touchSensing.dryRun.complete', `${point.name} DryRun 시뮬레이션 완료`, { dx, dy, dz });
    return { dx, dy, dz, stopped: false };
  } catch (error) {
    log_touchDryRun.error('touchSensing.dryRun.error', `${point.name} DryRun 시뮬레이션 오류`, { error: String(error) });
    return { dx, dy, dz, stopped: false, error: String(error) };
  }
}
const log_touchSensing = createLogger('weldingCore.touchSensing');
export interface TouchSensingContext {
  stopRef: React.MutableRefObject<boolean>;
  setCurrentPointIndex: (index: number) => void;
  showAlert: (
    message: string,
    options?: { type?: 'error' | 'warning' | 'info' | 'success'; title?: string },
  ) => void;
}
async function performRealTouchSensing(
  point: TeachingPoint,
  sequenceSettings: WeldingSequenceSettings,
  depthOffset: number,
  touchBottom: boolean,
  stopRef: React.MutableRefObject<boolean>,
): Promise<PointTouchResult> {
  const pointIdLower = point.id.toLowerCase();
  const directions = getTouchDirections(
    pointIdLower,
    sequenceSettings,
    touchBottom,
    point.touchBottom,
  );
  const {
    hasCenter,
    hasLeft,
    hasRight,
    hasTop,
    hasBottomDir,
    hasSide,
    sideDirection,
    isHorizontal,
  } = directions;
  let dx = 0,
    dy = 0,
    dz = 0;
  try {
    if (hasCenter && !stopRef.current) {
      if (isHorizontal) {
        log_touchSensing.info('touchSensing.findDx.center', `${point.name} 중앙 터치 시작 (가로용접 Base -X)`);
        const dxResult = await findDx(-1);
        if (dxResult?.status_code === 200 && dxResult.data?.delta_x !== undefined) {
          dx = dxResult.data.delta_x;
          log_touchSensing.info(
            'touchSensing.findDx.center.result',
            `중앙 터치 완료 (가로: depthOffset 미적용)`,
            { rawDx: dxResult.data.delta_x, dx },
          );
        }
      } else {
        log_touchSensing.info('touchSensing.findDx', `${point.name} 중앙 터치 시작 (세로용접 -X방향)`);
        const dxResult = await findDx(-1);
        if (dxResult?.status_code === 200 && dxResult.data?.delta_x !== undefined) {
          dx = dxResult.data.delta_x + depthOffset;
          log_touchSensing.info('touchSensing.findDx.result', `중앙 터치 완료`, {
            rawDx: dxResult.data.delta_x,
            depthOffset,
            dx,
          });
        }
      }
    }
    if (stopRef.current) return { dx, dy, dz, stopped: true };
    if (!isHorizontal) {
      if (hasLeft && !stopRef.current) {
        log_touchSensing.info('touchSensing.findDy.left', `${point.name} 좌측 터치 시작 (-Y방향)`);
        const dyLeftResult = await findDy(-1);
        if (dyLeftResult?.status_code === 200 && dyLeftResult.data?.delta_y !== undefined) {
          dy = dyLeftResult.data.delta_y + depthOffset;
          log_touchSensing.info('touchSensing.findDy.left.result', `좌측 터치 완료`, {
            rawDy: dyLeftResult.data.delta_y,
            depthOffset,
            dy,
          });
        }
      }
      if (stopRef.current) return { dx, dy, dz, stopped: true };
      if (hasRight && !stopRef.current) {
        log_touchSensing.info('touchSensing.findDy.right', `${point.name} 우측 터치 시작 (+Y방향)`);
        const dyRightResult = await findDy(1);
        if (dyRightResult?.status_code === 200 && dyRightResult.data?.delta_y !== undefined) {
          const rightDy = dyRightResult.data.delta_y - depthOffset;
          dy = hasLeft ? (dy + rightDy) / 2 : rightDy;
          log_touchSensing.info('touchSensing.findDy.right.result', `우측 터치 완료`, {
            rawDy: dyRightResult.data.delta_y,
            depthOffset,
            dy,
            averaged: hasLeft,
          });
        }
      }
    } else if (hasSide) {
      const sideLabel = sideDirection === -1 ? 'P4 좌측(Base -Y)' : 'P10 우측(Base +Y)';
      if (!stopRef.current) {
        log_touchSensing.info('touchSensing.findDy.side', `${point.name} ${sideLabel} 터치 시작`);
        const dyResult = await findDy(sideDirection);
        if (dyResult?.status_code === 200 && dyResult.data?.delta_y !== undefined) {
          dy = dyResult.data.delta_y;
          log_touchSensing.info(
            'touchSensing.findDy.side.result',
            `${sideLabel} 터치 완료 (가로: depthOffset 미적용)`,
            { rawDy: dyResult.data.delta_y, dy },
          );
        }
      }
    }
    if (stopRef.current) return { dx, dy, dz, stopped: true };
    if (hasTop && !stopRef.current) {
      log_touchSensing.info('touchSensing.findDz.top', `${point.name} 상단 터치 시작 (Base +Z)`);
      const dzResult = await findDz(1);
      if (dzResult?.status_code === 200 && dzResult.data?.delta_z !== undefined) {
        dz = dzResult.data.delta_z;
        log_touchSensing.info('touchSensing.findDz.top.result', `상단 터치 완료`, { dz });
      }
    }
    if (stopRef.current) return { dx, dy, dz, stopped: true };
    if (hasBottomDir && !stopRef.current) {
      log_touchSensing.info('touchSensing.findDz.bottom', `${point.name} 하단 터치 시작 (Base -Z)`);
      const dzResult = await findDz(-1);
      if (dzResult?.status_code === 200 && dzResult.data?.delta_z !== undefined) {
        dz = hasTop ? (dz + dzResult.data.delta_z) / 2 : dzResult.data.delta_z;
        log_touchSensing.info('touchSensing.findDz.bottom.result', `하단 터치 완료`, { dz, averaged: hasTop });
      }
    }
    await wireSearchEnd({});
  } catch (error) {
    log_touchSensing.error('touchSensing.point.error', `${point.name} 터치 센싱 오류`, { error: String(error) });
    return { dx, dy, dz, stopped: false, error: String(error) };
  }
  return { dx, dy, dz, stopped: stopRef.current };
}
export async function executeTouchSensing(
  teachingPoints: TeachingPoint[],
  robotState: RealtimeRobotStatus | null,
  options: TouchSensingOptions | undefined,
  context: TouchSensingContext,
): Promise<TouchSensingResult[]> {
  const { stopRef, setCurrentPointIndex, showAlert } = context;
  stopRef.current = false;
  const totalTimer = log_touchSensing.startTimer();
  const isDryRun = options?.isDryRun ?? false;
  const modeLabel = isDryRun ? '터치 테스트' : '터치 센싱';
  log_touchSensing.info('touchSensing.start', `${modeLabel} 시작`, { isDryRun });
  const touchBottom = options?.touchBottom ?? false;
  const suppressAlerts = options?.suppressAlerts ?? false;
  const onUpdatePoint = options?.onUpdatePoint;
  const { sequence: sequenceSettings } = await loadWeldingSettings();
  const depthOffset = options?.depthOffset ?? sequenceSettings.touchOffsetDepth;
  log_touchSensing.info('touchSensing.settings', '설정 로드 완료', {
    touchSensingEnabled: sequenceSettings.touchSensingEnabled,
    touchSpeed: sequenceSettings.touchSpeed,
    touchDistance: sequenceSettings.touchDistance,
    touchApproachOffset: sequenceSettings.touchApproachOffset,
    touchBottom,
    depthOffset,
  });
  const partWeldEnabled = options?.partWeldEnabled;
  const executableParts = getExecutableParts(teachingPoints, partWeldEnabled);
  const TOUCH_SENSING_ORDER = [
    'p1',
    'p2',
    'p3',
    'p4',
    'p5',
    'p6',
    'p12',
    'p11',
    'p10',
    'p9',
    'p8',
    'p7',
  ];
  const touchRank = (id: string) => {
    const i = TOUCH_SENSING_ORDER.indexOf(id.toLowerCase());
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  const savedPoints = flattenExecutableParts(executableParts).sort(
    (a, b) => touchRank(a.id) - touchRank(b.id),
  );
  if (savedPoints.length === 0) {
    log_touchSensing.warn('touchSensing.noPoints', '저장된 티칭 포인트가 없음');
    showAlert('저장된 티칭 포인트가 없습니다. (각 파트에 2개 이상 포인트 필요)', {
      type: 'warning',
      title: '포인트 없음',
    });
    return [];
  }
  setCurrentPointIndex(0);
  const touchResults: TouchSensingResult[] = [];
  const Z_APPROACH_OFFSET = sequenceSettings.touchApproachOffset;
  try {
    if (!robotState?.servo_enabled) {
      log_touchSensing.info('touchSensing.setup', '서보 활성화 중...');
      await enableRobot();
    }
    for (let i = 0; i < savedPoints.length; i++) {
      if (stopRef.current) break;
      const point = savedPoints[i];
      setCurrentPointIndex(i);
      log_touchSensing.info('touchSensing.point', `[${i + 1}/${savedPoints.length}] ${point.name} 터치 센싱`);
      const pointIdLower = point.id.toLowerCase();
      const directions = getTouchDirections(
        pointIdLower,
        sequenceSettings,
        touchBottom,
        point.touchBottom,
      );
      const { hasCenter, hasLeft, hasRight, hasTop, hasBottomDir, hasSide } = directions;
      log_touchSensing.info('touchSensing.directions', `${point.name} 터치 방향`, {
        pointId: pointIdLower,
        hasCenter,
        hasLeft,
        hasRight,
        hasTop,
        hasBottomDir,
        hasSide,
      });
      const hasAnyDirection = hasCenter || hasLeft || hasRight || hasTop || hasBottomDir || hasSide;
      if (!hasAnyDirection) {
        log_touchSensing.info('touchSensing.skipPoint', `${point.name} 테스트할 면 없음 - 포인트 건너뜀`);
        continue;
      }
      if (point.tcp) {
        const { x: px, y: py, z: pz, rx: prx, ry: pry, rz: prz } = point.tcp;
        const toolNum = point.toolNum ?? 0;
        const userNum = point.userNum ?? 0;
        log_touchSensing.info('touchSensing.approach', `${point.name} +X 오프셋 위치로 이동`);
        const approachResult = await moveToCartesianWithStopCheck(
          { x: px, y: py, z: pz, rx: prx, ry: pry, rz: prz },
          sequenceSettings.touchSensingPointSpeed,
          100,
          100,
          -1,
          1,
          [Z_APPROACH_OFFSET, 0, 0, 0, 0, 0],
          undefined,
          toolNum,
          userNum,
          stopRef,
        );
        if (approachResult.stopped) {
          log_touchSensing.info('touchSensing.approach.stopped', '접근 중 정지됨');
          break;
        }
        if (!approachResult.success) {
          log_touchSensing.error('touchSensing.approach.failed', `${point.name} 접근 실패`);
          continue;
        }
        log_touchSensing.info('touchSensing.move', `${point.name} 정확한 위치로 이동`);
        const moveResult = await moveToCartesianWithStopCheck(
          { x: px, y: py, z: pz, rx: prx, ry: pry, rz: prz },
          sequenceSettings.touchSensingPointSpeed,
          100,
          100,
          -1,
          0,
          [0, 0, 0, 0, 0, 0],
          undefined,
          toolNum,
          userNum,
          stopRef,
        );
        if (moveResult.stopped) {
          log_touchSensing.info('touchSensing.move.stopped', '이동 중 정지됨');
          break;
        }
        if (!moveResult.success) {
          log_touchSensing.error('touchSensing.move.failed', `${point.name} 이동 실패`);
          continue;
        }
      }
      let touchResult: PointTouchResult;
      if (isDryRun) {
        touchResult = await performDryRunForPoint(point, sequenceSettings, touchBottom, stopRef);
      } else {
        touchResult = await performRealTouchSensing(
          point,
          sequenceSettings,
          depthOffset,
          touchBottom,
          stopRef,
        );
      }
      if (touchResult.stopped) {
        log_touchSensing.info('touchSensing.stopped', '터치 센싱 정지됨');
        break;
      }
      const result: TouchSensingResult = {
        pointId: point.id,
        dx: touchResult.dx,
        dy: touchResult.dy,
        dz: touchResult.dz,
      };
      touchResults.push(result);
      if (onUpdatePoint) {
        onUpdatePoint(point.id, { dx: touchResult.dx, dy: touchResult.dy, dz: touchResult.dz });
        log_touchSensing.info('touchSensing.updatePoint', `${point.name} 터치 오프셋 저장`, result);
      }
    }
    log_touchSensing.info('touchSensing.complete', `${modeLabel} 완료`, { results: touchResults, isDryRun });
    // 터치센싱 완료 후 홈 복귀 (정지 상태 아니고 home 저장돼 있을 때만)
    if (!stopRef.current && !options?.skipHomeReturn) {
      const homePoint = teachingPoints.find(
        pt => pt.id === 'home' && pt.isSaved && pt.joints && pt.joints.length > 0,
      );
      if (homePoint?.joints) {
        log_touchSensing.info('touchSensing.homeReturn', 'Home으로 복귀');
        try {
          await moveToJointWithStopCheck(
            homePoint.joints,
            homePoint.moveSpeed || 50,
            homePoint.toolNum ?? 3,
            homePoint.userNum ?? 0,
            stopRef,
          );
        } catch (e) {
          log_touchSensing.warn('touchSensing.homeReturn.failed', 'Home 복귀 실패', { error: String(e) });
        }
      }
    }
    totalTimer.end('touchSensing.complete', `${modeLabel} 완료`);
    if (!suppressAlerts) {
      if (isDryRun) {
        showAlert(`${touchResults.length}개 포인트 터치 테스트 완료`, {
          type: 'success',
          title: '터치 테스트 완료',
        });
      } else {
        const summary = touchResults
          .map(r => {
            const pt = savedPoints.find(p => p.id === r.pointId);
            const showZ = pt?.touchBottom ?? (r.pointId === 'p1' || touchBottom);
            return `${r.pointId.toUpperCase()}: dx=${r.dx.toFixed(1)}, dy=${r.dy.toFixed(1)}${showZ ? `, dz=${r.dz.toFixed(1)}` : ''}`;
          })
          .join('\n');
        showAlert(summary, { type: 'success', title: '터치 센싱 완료' });
      }
    }
    return touchResults;
  } catch (error) {
    log_touchSensing.error('touchSensing.error', '터치 센싱 오류', { error: String(error) });
    showAlert('터치 센싱 중 오류가 발생했습니다: ' + String(error), {
      type: 'error',
      title: '터치 센싱 오류',
    });
    return touchResults;
  }
}
export interface WeldingSequenceSettings {
  touchSensingEnabled: boolean;
  touchSpeed: number;
  touchDistance: number;
  touchOffsetDepth: number;
  touchApproachOffset: number;
  touchSensingPointSpeed: number;
  p1TouchCenter: boolean;
  p1TouchLeft: boolean;
  p1TouchRight: boolean;
  p1TouchBottom: boolean;
  p2TouchCenter: boolean;
  p2TouchLeft: boolean;
  p2TouchRight: boolean;
  p3TouchCenter: boolean;
  p3TouchLeft: boolean;
  p3TouchRight: boolean;
  p3TouchBottom: boolean;
  p4TouchCenter: boolean;
  p4TouchTop: boolean;
  p4TouchBottom: boolean;
  p4TouchSide: boolean;
  p5TouchCenter: boolean;
  p5TouchTop: boolean;
  p5TouchBottom: boolean;
  p6TouchCenter: boolean;
  p6TouchTop: boolean;
  p6TouchBottom: boolean;
  p7TouchCenter: boolean;
  p7TouchLeft: boolean;
  p7TouchRight: boolean;
  p8TouchCenter: boolean;
  p8TouchLeft: boolean;
  p8TouchRight: boolean;
  p9TouchCenter: boolean;
  p9TouchLeft: boolean;
  p9TouchRight: boolean;
  p9TouchBottom: boolean;
  p10TouchCenter: boolean;
  p10TouchTop: boolean;
  p10TouchBottom: boolean;
  p10TouchSide: boolean;
  p11TouchCenter: boolean;
  p11TouchTop: boolean;
  p11TouchBottom: boolean;
  p12TouchCenter: boolean;
  p12TouchTop: boolean;
  p12TouchBottom: boolean;
  arcTrackingEnabled: boolean;
  arcTrackingLeftRight: boolean;
  arcTrackingUpDown: boolean;
  arcTrackingKlr: number;
  arcTrackingKud: number;
  arcTrackingStepMaxLr: number;
  arcTrackingStepMaxUd: number;
  arcTrackingSumMaxLr: number;
  arcTrackingSumMaxUd: number;
}
export interface SafetySettings {
  gasPreFlowTime: number;
  gasPostFlowTime: number;
}
export interface TouchSensingResult {
  pointId: string;
  dx: number;
  dy: number;
  dz: number;
}
export interface TouchSensingOptions {
  touchBottom?: boolean;
  depthOffset?: number;
  isDryRun?: boolean;
  manualSpeed?: number;
  partWeldEnabled?: PartWeldEnabled;
  suppressAlerts?: boolean;
  onUpdatePoint?: (pointId: string, offset: { dx: number; dy: number; dz: number }) => void;
  skipHomeReturn?: boolean;  // 터치센싱 후 자동 홈복귀 스킵 (자동용접 흐름용)
}
export interface ClosestCenterlineResult {
  centerlineTcp: { x: number; y: number; z: number; rx: number; ry: number; rz: number };
  segmentStartIndex: number;
  closestTeachingPointIndex: number;
  distance: number;
  segmentRatio: number;
  segmentLength: number;
}
export interface WeldingStartOptions {
  startFromClosest?: boolean;
  currentTcp?: number[];
  manualMoveSpeed?: number;
  isDryRun?: boolean;
  isWeldingTest?: boolean;
  partWeldEnabled?: PartWeldEnabled;
}
export interface WeldingResult {
  operationType: 'welding' | 'dryrun' | 'simulation';
  jobId?: number;
  jobName?: string;
  startedAt: Date;
  completedAt: Date;
  totalDistanceMm: number;
  cpm: number;
  expectedDurationSec: number;
  actualDurationSec: number;
  timeDifferenceSec: number;
  timeDifferencePercent: number;
  segments: WeldingLogSegment[];
  totalPoints: number;
  completedPoints: number;
  resultStatus: 'success' | 'failed' | 'stopped';
  errorMessage?: string;
  logId?: number;
}
export interface UseWeldingOperationsReturn {
  isArcTesting: boolean;
  isWelding: boolean;
  arcActive: boolean;
  isTouchSensing: boolean;
  currentPointIndex: number;
  simulationMode: boolean;
  dryRunMode: boolean;
  lastWeldingResult: WeldingResult | null;
  startArcTest: (teachingPoints: TeachingPoint[], robotState: RealtimeRobotStatus | null, manualSpeed: number, isSimulation: boolean) => Promise<void>;
  stopArcTest: () => Promise<void>;
  startTouchSensing: (
    teachingPoints: TeachingPoint[],
    robotState: RealtimeRobotStatus | null,
    options?: TouchSensingOptions
  ) => Promise<TouchSensingResult[]>;
  stopTouchSensing: () => Promise<void>;
  startWelding: (teachingPoints: TeachingPoint[], robotState: RealtimeRobotStatus | null, simulationMode: boolean, jobId?: number, jobName?: string, options?: WeldingStartOptions) => Promise<WeldingResult | null>;
  stopWelding: () => Promise<void>;
  findClosestCenterlinePoint: (teachingPoints: TeachingPoint[], currentTcp: number[], partWeldEnabled?: PartWeldEnabled) => ClosestCenterlineResult | null;
  setSimulationMode: (enabled: boolean) => void;
  setDryRunMode: (enabled: boolean) => void;
}
const log_weaveHelpers = createLogger('weldingCore.weaveHelpers');
export interface WeaveParameters {
  weaveFrequency: number;
  weaveRange: number;
  weaveLeftRange: number;
  weaveRightRange: number;
  weaveLeftStayTime: number;
  weaveRightStayTime: number;
  weaveCircleRadio: number;
  weaveYawAngle: number;
  weaveRotAngle: number;
}
export async function setupAndStartWeave(
  point: TeachingPoint,
  fallbackPoint?: TeachingPoint
): Promise<boolean> {
  const weavingType = point.weavingType || fallbackPoint?.weavingType;
  const weaveParams = point.weaveParams || fallbackPoint?.weaveParams;
  if (!weavingType || weavingType === 'none' || !weaveParams) {
    log_weaveHelpers.info('setupAndStartWeave', '위빙 비활성화 (타입 없음)');
    return false;
  }
  const weaveTypeCode = getWeaveTypeCode(weavingType);
  if (weaveTypeCode < 0) {
    log_weaveHelpers.info('setupAndStartWeave', '위빙 비활성화 (유효하지 않은 타입)', { weavingType });
    return false;
  }
  try {
    await setWeaveParams({
      weave_num: 0,
      weave_type: weaveTypeCode,
      weave_frequency: weaveParams.weaveFrequency,
      weave_range: weaveParams.weaveRange,
      weave_left_range: weaveParams.weaveLeftRange,
      weave_right_range: weaveParams.weaveRightRange,
      weave_left_stay_time: weaveParams.weaveLeftStayTime,
      weave_right_stay_time: weaveParams.weaveRightStayTime,
      weave_circle_radio: weaveParams.weaveCircleRadio,
      weave_yaw_angle: weaveParams.weaveYawAngle,
      weave_rot_angle: weaveParams.weaveRotAngle,
    });
    log_weaveHelpers.info('setupAndStartWeave.params', '위빙 파라미터 설정 완료', {
      type: weavingType,
      frequency: weaveParams.weaveFrequency,
      range: weaveParams.weaveRange,
    });
    await startWeave();
    log_weaveHelpers.info('setupAndStartWeave.started', '위빙 시작');
    return true;
  } catch (error) {
    log_weaveHelpers.error('setupAndStartWeave.error', '위빙 설정 오류', { error: String(error) });
    return false;
  }
}
export async function safeEndWeave(): Promise<void> {
  try {
    await endWeave();
    log_weaveHelpers.info('safeEndWeave', '위빙 종료');
  } catch (error) {
    log_weaveHelpers.warn('safeEndWeave.error', '위빙 종료 오류 (무시됨)', { error: String(error) });
  }
}
export async function safeArcOn(
  current: number,
  voltage: number,
  gasPreFlowMs: number
): Promise<boolean> {
  try {
    log_weaveHelpers.info('safeArcOn', '아크 ON 시퀀스 시작', { current, voltage, gasPreFlowMs });
    const response = await arcOn(
      Math.round(current),
      Math.round(voltage),
      0,
      0,
      10000,
      gasPreFlowMs
    );
    if (!isApiSuccess(response)) {
      log_weaveHelpers.error('safeArcOn.failed', '아크 ON 실패 (응답 오류)', { response });
      return false;
    }
    log_weaveHelpers.info('safeArcOn.done', '아크 ON 완료');
    return true;
  } catch (error) {
    log_weaveHelpers.error('safeArcOn.error', '아크 ON 오류', { error: String(error) });
    return false;
  }
}
export async function safeArcOff(gasPostFlowMs: number): Promise<void> {
  try {
    await arcOff(0, 0, 1000, gasPostFlowMs);
    log_weaveHelpers.info('safeArcOff', '아크 OFF 완료');
  } catch (error) {
    log_weaveHelpers.warn('safeArcOff.error', '아크 OFF 오류 (무시됨)', { error: String(error) });
  }
}
export async function endPartWelding(
  hasWeaving: boolean,
  hasWelding: boolean,
  simMode: boolean,
  gasPostFlowMs: number,
  weaveTypeCode: number
): Promise<void> {
  log_weaveHelpers.info('endPartWelding', '파트 용접 종료 시작');
  if (hasWeaving && weaveTypeCode >= 0) {
    await safeEndWeave();
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  if (hasWelding && !simMode) {
    await safeArcOff(gasPostFlowMs);
  }
  log_weaveHelpers.info('endPartWelding.done', '파트 용접 종료 완료');
}
export async function startPartWelding(
  point: TeachingPoint,
  fallbackPoint: TeachingPoint,
  hasWeaving: boolean,
  hasWelding: boolean,
  simMode: boolean,
  gasPreFlowMs: number,
  weaveTypeCode: number
): Promise<void> {
  log_weaveHelpers.info('startPartWelding', '파트 용접 시작');
  if (hasWelding && !simMode) {
    const current = point.weldCurrent || fallbackPoint.weldCurrent || 100;
    const voltage = point.weldVoltage || fallbackPoint.weldVoltage || 20;
    const arcOnOk = await safeArcOn(current, voltage, gasPreFlowMs);
    if (!arcOnOk) throw new Error(`${point.name}: 아크 ON 실패로 용접을 중단합니다`);
  }
  if (hasWeaving && weaveTypeCode >= 0) {
    await setupAndStartWeave(point, fallbackPoint);
  }
  log_weaveHelpers.info('startPartWelding.done', '파트 용접 시작 완료');
}
const log_weldingExecution = createLogger('weldingCore.weldingExecution');
export interface WeldingExecutionContext {
  stopRef: React.MutableRefObject<boolean>;
  setCurrentPointIndex: (index: number) => void;
  showAlert: (
    message: string,
    options?: { type?: 'error' | 'warning' | 'info' | 'success'; title?: string },
  ) => void;
  setLastWeldingResult: (result: WeldingResult | null) => void;
  currentPointIndex: number;
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
  setCurrentPointIndex(startPointIndex);
  let totalPathDistance = 0;
  let representativeCpm = 0;
  let totalExpectedDurationSec = 0;
  let segments: WeldingLogSegment[] = [];
  let firstWeldPoint = weldingPoints[paramPointIndex] || weldingPoints[0];
  const handleStopped = async (completedPtIdx: number) => {
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
    const CPM_CORRECTION_FACTOR = 0.68;
    let minSegmentDistance = Infinity;
    segments = [];
    for (let i = 0; i < weldingPoints.length - 1; i++) {
      const dist = calculateDistance(weldingPoints[i].tcp, weldingPoints[i + 1].tcp);
      totalPathDistance += dist;
      const isSamePart =
        partBoundaryInfo.pointPartIndices[i] === partBoundaryInfo.pointPartIndices[i + 1];
      if (isSamePart && dist < minSegmentDistance) minSegmentDistance = dist;
      const segmentCpm = weldingPoints[i + 1].moveSpeed || 50;
      const toPoint = weldingPoints[i + 1];
      segments.push({
        from: weldingPoints[i].id,
        to: toPoint.id,
        distance_mm: dist,
        cpm: segmentCpm,
        expected_sec: ((dist * 6) / segmentCpm) * CPM_CORRECTION_FACTOR,
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
    const hasStoredTouchOffsets = weldingPoints.some(pt => pt.touchOffset !== null);
    const approachOffset = sequenceSettings.touchApproachOffset;
    setCurrentPointIndex(startPointIndex);
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
        setCurrentPointIndex(startPointIndex);
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
        log_weldingExecution.info('welding.start.approach', `시작점 +X +${approachOffset}mm 접근`);
        const approachResult = await moveToCartesianPosition(
          startPoint.tcp,
          30,
          100,
          100,
          -1,
          1,
          [approachOffset, 0, 0, 0, 0, 0],
          undefined,
          startPoint.toolNum ?? 3,
          startPoint.userNum ?? 0,
          0,
        );
        if (approachResult?.status_code !== 200) throw new Error('시작점 접근 이동 실패');
      }
    }
    if (stopRef.current) return await handleStopped(0);
    if (sequenceSettings.arcTrackingEnabled && hasWelding && !simMode) {
      await arcTraceControl({
        flag: 1,
        is_left_right: sequenceSettings.arcTrackingLeftRight ? 1 : 0,
        is_up_down: sequenceSettings.arcTrackingUpDown ? 1 : 0,
        klr: sequenceSettings.arcTrackingKlr,
        kud: sequenceSettings.arcTrackingKud,
        step_max_lr: sequenceSettings.arcTrackingStepMaxLr,
        step_max_ud: sequenceSettings.arcTrackingStepMaxUd,
        sum_max_lr: sequenceSettings.arcTrackingSumMaxLr,
        sum_max_ud: sequenceSettings.arcTrackingSumMaxUd,
      });
    }
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
    }
    if (hasWeaving && weaveTypeCode >= 0 && !isStartAtPartEnd)
      await setupAndStartWeave(firstWeldPoint, firstWeldPoint);
    if (!isStartAtPartEnd) setArcActive?.(true);
    const loopStartIndex = startPointIndex + 1;
    let segmentStartTime = Date.now();
    let i = loopStartIndex;
    while (i < weldingPoints.length) {
      if (stopRef.current) break;
      const point = weldingPoints[i];
      setCurrentPointIndex(i);
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
        const prevPoint = weldingPoints[i - 1];
        const transitionSpeed = 30;
        const pointSide = (id: string): 'L' | 'R' => {
          const n = parseInt(id.replace(/\D/g, ''), 10);
          return n >= 1 && n <= 6 ? 'L' : 'R';
        };
        const isSameSide =
          !!prevPoint?.id && !!point?.id && pointSide(prevPoint.id) === pointSide(point.id);
        const CROSS_CLEARANCE_X = 150;
        const CROSS_LIFT_Z = 100;
        if (prevPoint?.tcp && !stopRef.current) {
          const retractOffset = isSameSide
            ? [approachOffset, 0, 0, 0, 0, 0]
            : [CROSS_CLEARANCE_X, 0, CROSS_LIFT_Z, 0, 0, 0];
          log_weldingExecution.info(
            'welding.partTransition.retract',
            isSameSide
              ? `파트 전환 ①: base +X +${approachOffset}mm 후퇴`
              : `파트 전환 ①(횡단): base +X +${CROSS_CLEARANCE_X} / +Z +${CROSS_LIFT_Z}mm 후퇴`,
          );
          const retractResult = await moveToCartesianPosition(
            prevPoint.tcp,
            transitionSpeed,
            100,
            100,
            -1,
            1,
            retractOffset,
            undefined,
            prevPoint.toolNum ?? 3,
            prevPoint.userNum ?? 0,
            0,
          );
          if (retractResult?.status_code !== 200) throw new Error('파트 전환 후퇴 이동 실패');
        }
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
        }
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
        batchPoints.push({
          joints: pt.joints && pt.joints.length === 6 ? pt.joints : undefined,
          tcp: [pt.tcp.x, pt.tcp.y, pt.tcp.z, pt.tcp.rx, pt.tcp.ry, pt.tcp.rz],
          speed: pt.moveSpeed,
          tool: pt.toolNum ?? 3,
          user: pt.userNum ?? 0,
          vel_mode: pt.velMode ?? 1,
          offset_flag: useOffset ? 1 : 0,
          offset,
        });
        batchIndices.push(j);
      }
      if (batchPoints.length === 0) {
        i++;
        continue;
      }
      log_weldingExecution.info(
        'welding.batch',
        `Batch MoveL: ${batchPoints.length}포인트 → 단일 MoveL (경유 스킵)`,
        {
          indices: batchIndices.map(idx => weldingPoints[idx].id),
        },
      );
      try {
        const batchResult = await batchMoveL(batchPoints, { perPoint: isDryRun });
        for (const idx of batchIndices) {
          const segIdx = idx - 1;
          if (segIdx >= 0 && segIdx < segments.length) {
            segments[segIdx].actual_sec = (Date.now() - segmentStartTime) / 1000;
            segmentStartTime = Date.now();
          }
          setCurrentPointIndex(idx);
        }
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
      const stoppedResult = await handleStopped(context.currentPointIndex);
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
    if (sequenceSettings.arcTrackingEnabled && hasWelding && !simMode && !isWeldingTest)
      await arcTraceControl({ flag: 0 });
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
        `총 이동거리: ${totalPathDistance.toFixed(1)} mm`,
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
      completedPoints: context.currentPointIndex >= 0 ? context.currentPointIndex : 0,
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
          `자동발송 — 용접 오류: ${String(error).slice(0, 200)} | 단계: ${context.currentPointIndex}`,
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
const log_weldingPointLoop = createLogger('weldingCore.weldingPointLoop');
export function interpolateOffset(
  startOffset: { dx: number; dy: number; dz: number } | null,
  endOffset: { dx: number; dy: number; dz: number } | null,
  ratio: number
): { dx: number; dy: number; dz: number } {
  const start = startOffset ?? { dx: 0, dy: 0, dz: 0 };
  const end = endOffset ?? { dx: 0, dy: 0, dz: 0 };
  return {
    dx: start.dx + ratio * (end.dx - start.dx),
    dy: start.dy + ratio * (end.dy - start.dy),
    dz: start.dz + ratio * (end.dz - start.dz),
  };
}
export function determinePointTouchOffset(
  point: TeachingPoint,
  pointIndex: number,
  weldingPoints: TeachingPoint[],
  hasStoredTouchOffsets: boolean,
): { offset: number[]; useOffset: boolean; source: 'stored' | 'interpolated' | 'none' } {
  if (point.touchOffset) {
    return {
      offset: [point.touchOffset.dx, point.touchOffset.dy, point.touchOffset.dz, 0, 0, 0],
      useOffset: true,
      source: 'stored',
    };
  }
  if (hasStoredTouchOffsets && weldingPoints.length >= 2) {
    let interpolated: { dx: number; dy: number; dz: number } | null = null;
    const prevWithOffset = weldingPoints.slice(0, pointIndex).reverse().find(p => p.touchOffset);
    const nextWithOffset = weldingPoints.slice(pointIndex + 1).find(p => p.touchOffset);
    if (prevWithOffset && nextWithOffset) {
      const prevIdx = weldingPoints.findIndex(p => p.id === prevWithOffset.id);
      const nextIdx = weldingPoints.findIndex(p => p.id === nextWithOffset.id);
      const ratio = (pointIndex - prevIdx) / (nextIdx - prevIdx);
      interpolated = interpolateOffset(prevWithOffset.touchOffset, nextWithOffset.touchOffset, ratio);
    } else if (prevWithOffset) {
      interpolated = { ...prevWithOffset.touchOffset! };
    } else if (nextWithOffset) {
      interpolated = { ...nextWithOffset.touchOffset! };
    }
    if (interpolated) {
      return {
        offset: [interpolated.dx, interpolated.dy, interpolated.dz, 0, 0, 0],
        useOffset: true,
        source: 'interpolated',
      };
    }
  }
  return { offset: [0, 0, 0, 0, 0, 0], useOffset: false, source: 'none' };
}
export async function moveToWeldingPoint(
  point: TeachingPoint,
  pointIndex: number,
  totalPoints: number,
  isLastPoint: boolean,
  blendR: number,
  pointTouchOffset: number[],
  usePointOffset: boolean,
  offsetSource: string,
  segments: WeldingLogSegment[],
  segmentStartTime: number,
  stopRef: React.MutableRefObject<boolean>,
  waitForDone: boolean = true,
): Promise<{ success: boolean; newSegmentStartTime: number }> {
  log_weldingPointLoop.info('welding.continuous.move', `[${pointIndex + 1}/${totalPoints}] ${point.name} - MoveL`, {
    isLastPoint, blendR, offsetSource, waitForDone,
  });
  if (!point.tcp) {
    const errorMsg = `${point.name}: TCP 좌표가 없습니다. 포인트를 다시 티칭해주세요.`;
    log_weldingPointLoop.error('welding.continuous.noTcp', errorMsg);
    throw new Error(errorMsg);
  }
  try {
    const moveLResult = await moveToCartesianPosition(
      point.tcp, point.moveSpeed, 100, 50, blendR,
      usePointOffset ? 1 : 0, pointTouchOffset,
      undefined, point.toolNum, point.userNum, point.velMode ?? 1
    );
    if (moveLResult?.status_code === 200) {
      if (waitForDone) {
        log_weldingPointLoop.info('welding.continuous.waitMotion', `${point.name} 이동 완료 대기 중...`);
        await new Promise(resolve => setTimeout(resolve, 200));
        let waited = 200;
        const maxWaitTime = isLastPoint ? 120000 : 60000;
        while (waited < maxWaitTime && !stopRef.current) {
          const result = await checkMotionDone();
          if (result.done) {
            log_weldingPointLoop.info('welding.continuous.motionDone', `${point.name} 도달 확인 (${waited}ms 후)`);
            break;
          }
          await new Promise(resolve => setTimeout(resolve, 100));
          waited += 100;
        }
        if (waited >= maxWaitTime) {
          log_weldingPointLoop.warn('welding.continuous.timeout', `${point.name} 완료 대기 타임아웃 (${maxWaitTime}ms)`);
        }
        log_weldingPointLoop.info('welding.continuous.move.done', `${point.name} 도달 완료`);
      } else {
        log_weldingPointLoop.info('welding.continuous.move.blend', `${point.name} MoveL 발행 (블렌딩 통과, 대기 없음)`);
      }
      const segIdx = pointIndex - 1;
      if (segIdx >= 0 && segIdx < segments.length) {
        segments[segIdx].actual_sec = (Date.now() - segmentStartTime) / 1000;
      }
      return { success: true, newSegmentStartTime: Date.now() };
    } else {
      const errorData = moveLResult?.data;
      const errorCode = errorData?.error_code || 'unknown';
      const errorDesc = errorData?.description || moveLResult?.message || '알 수 없는 오류';
      const errorSolution = errorData?.solution || '';
      const errorMsg = `${point.name}: [SDK 에러 ${errorCode}] ${errorDesc}${errorSolution ? ` (해결: ${errorSolution})` : ''}`;
      log_weldingPointLoop.error('welding.continuous.move.failed', errorMsg, {
        status_code: moveLResult?.status_code, error_code: errorCode,
        description: errorDesc, solution: errorSolution, message: moveLResult?.message
      });
      throw new Error(errorMsg);
    }
  } catch (moveError) {
    log_weldingPointLoop.error('welding.continuous.move.error', `${point.name} 이동 오류`, { error: String(moveError) });
    throw moveError;
  }
}
