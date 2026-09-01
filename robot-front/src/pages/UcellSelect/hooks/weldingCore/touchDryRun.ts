import { TeachingPoint, getExecutableParts, flattenExecutableParts, WEAVING_TYPE_OPTIONS, PartWeldEnabled, getPartBoundaryInfo } from '../..';
import { enableRobot, RealtimeRobotStatus, startArc, endArc, endWeave, getWeldingConfig, WeldingConfigData, moveToJointPositionNonBlocking, checkMotionDone, createWeldingLog, WeldingLogData, WeldingLogSegment, wireSearchEnd, findDx, findDy, findDz, setWeaveParams, startWeave, arcOn, arcOff, getRobotSettings, moveToCartesianPosition, getInverseKin, arcTraceControl, batchMoveL, BatchMovePoint, getWeldingPartOrder, isApiSuccess } from '../../../../lib';
import { createLogger } from '../../../../lib';
import React from 'react';
import { setWeldingPartOrder } from '../..';
import { WeldingSequenceSettings } from './weldingCoreTypes';
import { getTouchDirections } from './touchDirections';
import { moveToCartesianWithStopCheck } from './moveStopCheck';

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
