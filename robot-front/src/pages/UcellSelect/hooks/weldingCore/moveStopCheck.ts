import { TeachingPoint, getExecutableParts, flattenExecutableParts, WEAVING_TYPE_OPTIONS, PartWeldEnabled, getPartBoundaryInfo } from '../..';
import { enableRobot, RealtimeRobotStatus, startArc, endArc, endWeave, getWeldingConfig, WeldingConfigData, moveToJointPositionNonBlocking, checkMotionDone, createWeldingLog, WeldingLogData, WeldingLogSegment, wireSearchEnd, findDx, findDy, findDz, setWeaveParams, startWeave, arcOn, arcOff, getRobotSettings, moveToCartesianPosition, getInverseKin, arcTraceControl, batchMoveL, BatchMovePoint, getWeldingPartOrder, isApiSuccess } from '../../../../lib';
import { createLogger } from '../../../../lib';
import React from 'react';
import { setWeldingPartOrder } from '../..';

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
