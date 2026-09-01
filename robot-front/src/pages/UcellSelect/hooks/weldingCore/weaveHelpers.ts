import { TeachingPoint, getExecutableParts, flattenExecutableParts, WEAVING_TYPE_OPTIONS, PartWeldEnabled, getPartBoundaryInfo } from '../..';
import { enableRobot, RealtimeRobotStatus, startArc, endArc, endWeave, getWeldingConfig, WeldingConfigData, moveToJointPositionNonBlocking, checkMotionDone, createWeldingLog, WeldingLogData, WeldingLogSegment, wireSearchEnd, findDx, findDy, findDz, setWeaveParams, startWeave, arcOn, arcOff, getRobotSettings, moveToCartesianPosition, getInverseKin, arcTraceControl, batchMoveL, BatchMovePoint, getWeldingPartOrder, isApiSuccess } from '../../../../lib';
import { createLogger } from '../../../../lib';
import React from 'react';
import { setWeldingPartOrder } from '../..';
import { getWeaveTypeCode } from './moveStopCheck';

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
