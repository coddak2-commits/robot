import { TeachingPoint, getExecutableParts, flattenExecutableParts, WEAVING_TYPE_OPTIONS, PartWeldEnabled, getPartBoundaryInfo } from '../..';
import { enableRobot, RealtimeRobotStatus, startArc, endArc, endWeave, getWeldingConfig, WeldingConfigData, moveToJointPositionNonBlocking, checkMotionDone, createWeldingLog, WeldingLogData, WeldingLogSegment, wireSearchEnd, findDx, findDy, findDz, setWeaveParams, startWeave, arcOn, arcOff, getRobotSettings, moveToCartesianPosition, getInverseKin, arcTraceControl, batchMoveL, BatchMovePoint, getWeldingPartOrder, isApiSuccess } from '../../../../lib';
import { createLogger } from '../../../../lib';
import React from 'react';
import { setWeldingPartOrder } from '../..';

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
