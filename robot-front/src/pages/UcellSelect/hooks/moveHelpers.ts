import { TeachingPoint, WeaveParams, createInitialTeachingPoints, UCELL_POINT_DEFINITIONS, UCellData, NORMAL_CELLS, COLLAR_PLATE_CELLS, PartWeldEnabled, DEFAULT_PART_WELD_ENABLED, DEFAULT_WEAVE_PARAMS, WELDING_PARTS } from '..';
import { moveToJointPositionNonBlocking, moveToCartesianPositionNonBlocking, checkMotionDone, getWeldingConfig, updateTeachingJob, TeachingPointData, RealtimeRobotStatus, enableRobot, createTeachingJob, getTeachingJobs, getTeachingJob, deleteTeachingJob, updateTeachingJobName, TeachingJob, getRealtimeRobotStatus, stopRobotSDK, emergencyStop, endArc, endWeave, arcOff, arcTraceControl, wireSearchEnd, forwardWireFeed, reverseWireFeed, stopForwardWireFeed, stopReverseWireFeed } from '../../../lib';
import { getErrorMessage, extractResultCode } from '../../../lib/api';
import { createLogger } from '../../../lib';
import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useAlert } from '../../../contexts';
import { playSaveOkBeep, playErrorBeep } from '../../../lib/audio';
import { RobotPosition } from '../components/index';
import { getBlockPointIds, getBlockName } from '..';
import { TouchSensingOptions, TouchSensingResult, WeldingStartOptions, WeldingResult, ClosestCenterlineResult, UseWeldingOperationsReturn, findClosestCenterlinePoint as findClosestCenterlinePointFn, executeTouchSensing, TouchSensingContext, executeArcTest, ArcTestContext, executeWelding, WeldingExecutionContext } from './weldingCore';

const log = createLogger('moveToPointLogic');
export async function waitForMotionComplete(
  stopMoveRef: React.MutableRefObject<boolean>,
  timeout: number,
  logPrefix: string,
): Promise<boolean> {
  const startTime = Date.now();
  await new Promise(resolve => setTimeout(resolve, 200));
  while (Date.now() - startTime < timeout) {
    if (stopMoveRef.current) {
      log.info(`${logPrefix}.stopped`, '이동 중 중단됨');
      return false;
    }
    try {
      const motionResult = await checkMotionDone();
      if (motionResult?.done) {
        log.info(`${logPrefix}.done`, '이동 완료');
        return true;
      }
    } catch {
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  return true;
}
export async function executeRetract(
  currentTcp: number[] | null,
  speed: number,
  toolNum: number,
  userNum: number,
  stopMoveRef: React.MutableRefObject<boolean>,
): Promise<boolean> {
  if (!currentTcp || currentTcp.length < 6) {
    log.info('retract.noTcp', 'TCP 데이터 없음, 후퇴 스킵');
    return true;
  }
  let approachOffset = 100;
  try {
    const config = await getWeldingConfig();
    if (config) approachOffset = config.touch_sensing_approach_offset ?? 100;
  } catch {
    log.warn('retract.configError', '설정 로드 실패, 기본값 사용');
  }
  const [px, py, pz, prx, pry, prz] = currentTcp;
  log.info('retract.start', `직교좌표계 +X 방향 후퇴 (dx=+${approachOffset}mm)`);
  const retractResult = await moveToCartesianPositionNonBlocking(
    { x: px, y: py, z: pz, rx: prx, ry: pry, rz: prz },
    speed,
    100,
    100,
    toolNum,
    userNum,
    1,
    [approachOffset, 0, 0, 0, 0, 0],
  );
  const retractResultCode = extractResultCode(retractResult);
  if (retractResult?.status_code !== 200 || retractResultCode !== 0) {
    log.warn('retract.failed', 'TCP 후퇴 실패, MoveJ로 직접 이동');
    return true;
  }
  return await waitForMotionComplete(stopMoveRef, 30000, 'retract');
}
export async function executeApproachWithOffset(
  point: TeachingPoint,
  speed: number,
  toolNum: number,
  userNum: number,
  stopMoveRef: React.MutableRefObject<boolean>,
): Promise<boolean> {
  const { x: destX, y: destY, z: destZ, rx: destRx, ry: destRy, rz: destRz } = point.tcp!;
  let approachOffset = 100;
  try {
    const config = await getWeldingConfig();
    if (config) approachOffset = config.touch_sensing_approach_offset ?? 100;
  } catch {
    log.warn('approach.configError', '설정 로드 실패, 기본값 사용');
  }
  log.info(
    'approach.offset',
    `${point.name} 목표 +X 오프셋 위치로 이동 (dx=+${approachOffset}mm)`,
  );
  const approachResult = await moveToCartesianPositionNonBlocking(
    { x: destX, y: destY, z: destZ, rx: destRx, ry: destRy, rz: destRz },
    speed,
    100,
    100,
    toolNum,
    userNum,
    1,
    [approachOffset, 0, 0, 0, 0, 0],
  );
  const approachResultCode = extractResultCode(approachResult);
  if (approachResult?.status_code !== 200 || approachResultCode !== 0) {
    const errorMsg = getErrorMessage(approachResultCode);
    log.error('approach.offset.failed', `${point.name} 오프셋 위치 이동 실패`, { errorMsg });
    alert(`${point.name} 오프셋 접근 실패: ${errorMsg}`);
    return false;
  }
  if (!(await waitForMotionComplete(stopMoveRef, 300000, 'approach.offset'))) return false;
  log.info('approach.final', `${point.name} 정확한 목표 위치로 접근`);
  const finalResult = await moveToCartesianPositionNonBlocking(
    { x: destX, y: destY, z: destZ, rx: destRx, ry: destRy, rz: destRz },
    speed,
    100,
    100,
    toolNum,
    userNum,
    0,
    [0, 0, 0, 0, 0, 0],
  );
  const finalResultCode = extractResultCode(finalResult);
  if (finalResult?.status_code !== 200 || finalResultCode !== 0) {
    const errorMsg = getErrorMessage(finalResultCode);
    log.error('approach.final.failed', `${point.name} 최종 위치 이동 실패`, { errorMsg });
    alert(`${point.name} 최종 접근 실패: ${errorMsg}`);
    return false;
  }
  return await waitForMotionComplete(stopMoveRef, 300000, 'approach.final');
}
export async function executeHomeSafeApproach(
  currentTcp: number[] | null,
  homePoint: TeachingPoint,
  speed: number,
  stopMoveRef: React.MutableRefObject<boolean>,
): Promise<boolean> {
  const toolNum = homePoint.toolNum ?? 0;
  const userNum = homePoint.userNum ?? 0;
  if (currentTcp && currentTcp.length >= 6) {
    const [px, py, pz, prx, pry, prz] = currentTcp;
    log.info('home.baseZUp', '현재 위치 base Z+100mm 상승 (모재 위로 이탈)');
    const riseResult = await moveToCartesianPositionNonBlocking(
      { x: px, y: py, z: pz, rx: prx, ry: pry, rz: prz },
      Math.min(speed, 30),
      50,
      50,
      toolNum,
      userNum,
      1,
      [0, 0, 100, 0, 0, 0],
    );
    const rc = extractResultCode(riseResult);
    if (riseResult?.status_code !== 200 || rc !== 0) {
      log.warn('home.baseZUp.failed', '고도 상승 실패 — MoveJ로 진행', { code: rc });
      return true;
    }
    if (!(await waitForMotionComplete(stopMoveRef, 30000, 'home.baseZUp'))) return false;
  }
  return true;
}
// 저장된 관절값을 현재 관절 기준 최단 경로로 정규화 (±360° wrap, 손목 360도 회전 방지)
function normalizeJointsToShortest(target: number[], current: number[] | null | undefined): number[] {
  if (!current || current.length !== target.length) return target;
  return target.map((t, i) => {
    let v = t;
    let diff = v - current[i];
    while (diff > 180) { v -= 360; diff -= 360; }
    while (diff < -180) { v += 360; diff += 360; }
    return v;
  });
}

export async function executeMoveJ(
  point: TeachingPoint,
  speed: number,
  toolNum: number,
  userNum: number,
  stopMoveRef: React.MutableRefObject<boolean>,
  currentJoints?: number[] | null,
): Promise<boolean> {
  log.info('moveJ', `${point.name} TCP 없음, MoveJ로 이동`);
  const normalized = normalizeJointsToShortest(point.joints!, currentJoints);
  const wrapped = normalized.some((v, i) => Math.abs(v - point.joints![i]) > 1e-6);
  if (wrapped) {
    log.info('moveJ.normalize', `${point.name} 관절 최단경로 정규화 적용`, {
      original: point.joints,
      normalized,
    });
  }
  const result = await moveToJointPositionNonBlocking(
    normalized,
    speed,
    100,
    100,
    toolNum,
    userNum,
  );
  const moveResult = extractResultCode(result);
  if (result?.status_code !== 200 || moveResult !== 0) {
    const errorMsg = getErrorMessage(moveResult);
    log.error('moveJ.failed', `${point.name} 이동 명령 실패`, { errorMsg });
    alert(`${point.name} 이동 실패: ${errorMsg}`);
    return false;
  }
  return await waitForMotionComplete(stopMoveRef, 300000, 'moveJ');
}
