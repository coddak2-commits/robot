import { TeachingPoint, getExecutableParts, flattenExecutableParts, WEAVING_TYPE_OPTIONS, PartWeldEnabled, getPartBoundaryInfo } from '../..';
import { enableRobot, RealtimeRobotStatus, startArc, endArc, endWeave, getWeldingConfig, WeldingConfigData, moveToJointPositionNonBlocking, checkMotionDone, createWeldingLog, WeldingLogData, WeldingLogSegment, wireSearchEnd, findDx, findDy, findDz, setWeaveParams, startWeave, arcOn, arcOff, getRobotSettings, moveToCartesianPosition, getInverseKin, arcTraceControl, batchMoveL, BatchMovePoint, getWeldingPartOrder, isApiSuccess } from '../../../../lib';
import { createLogger } from '../../../../lib';
import React from 'react';
import { setWeldingPartOrder } from '../..';
import { WeldingResult } from './weldingCoreTypes';

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
