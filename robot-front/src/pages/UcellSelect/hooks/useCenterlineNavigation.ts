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
import { CenterlinePoint } from './useSchematicCalculations';
import { executeRetract, executeApproachWithOffset } from './moveHelpers';

const log_useCenterlineNavigation = createLogger('CenterlineNavigation');
const DEFAULT_WEAVE: WeaveParams = {
  weaveFrequency: 2,
  weaveRange: 5,
  weaveLeftRange: 0,
  weaveRightRange: 0,
  weaveLeftStayTime: 0,
  weaveRightStayTime: 0,
  weaveCircleRadio: 0,
  weaveYawAngle: 0,
  weaveRotAngle: 0,
};
interface UseCenterlineNavigationProps {
  teachingRobotState: RealtimeRobotStatus | null;
  teachingPoints: TeachingPoint[];
  manualMoveSpeed: number;
  showAlert: (
    message: string,
    options?: { type?: 'error' | 'warning' | 'info' | 'success' },
  ) => void;
}
export function useCenterlineNavigation({
  teachingRobotState,
  teachingPoints,
  manualMoveSpeed,
  showAlert,
}: UseCenterlineNavigationProps) {
  const stopRef = useRef(false);
  const handleCenterlinePointClick = useCallback(
    async (point: CenterlinePoint) => {
      log_useCenterlineNavigation.info('centerline.pointClick', '센터라인 포인트 클릭 (후퇴 → 목표 뒤쪽 경유 → 정위치)', {
        tcp: `[${point.tcp.x.toFixed(1)}, ${point.tcp.y.toFixed(1)}, ${point.tcp.z.toFixed(1)}]`,
        segmentStartPointId: point.segmentStartPointId,
        segmentEndPointId: point.segmentEndPointId,
        segmentRatio: point.segmentRatio.toFixed(3),
      });
      try {
        let interpolatedOffset: { dx: number; dy: number; dz: number } | null = null;
        const segStartPoint = teachingPoints.find(pt => pt.id === point.segmentStartPointId);
        const segEndPoint = teachingPoints.find(pt => pt.id === point.segmentEndPointId);
        if (
          segStartPoint &&
          segEndPoint &&
          (segStartPoint.touchOffset || segEndPoint.touchOffset)
        ) {
          const so = segStartPoint.touchOffset ?? { dx: 0, dy: 0, dz: 0 };
          const eo = segEndPoint.touchOffset ?? { dx: 0, dy: 0, dz: 0 };
          interpolatedOffset = {
            dx: so.dx + point.segmentRatio * (eo.dx - so.dx),
            dy: so.dy + point.segmentRatio * (eo.dy - so.dy),
            dz: so.dz + point.segmentRatio * (eo.dz - so.dz),
          };
          log_useCenterlineNavigation.info('centerline.touchOffset.interpolated', '보간 터치 오프셋', {
            ratio: point.segmentRatio.toFixed(3),
            offset: `[${interpolatedOffset.dx.toFixed(2)}, ${interpolatedOffset.dy.toFixed(2)}, ${interpolatedOffset.dz.toFixed(2)}]`,
          });
        }
        const toolNum = point.toolNum;
        const userNum = point.userNum;
        const virtualPoint: TeachingPoint = {
          id: `centerline_${point.segmentStartPointId}_${point.segmentRatio.toFixed(3)}`,
          name: `센터라인 (${point.segmentStartPointId?.toUpperCase()}→${point.segmentEndPointId?.toUpperCase()} ${(point.segmentRatio * 100).toFixed(0)}%)`,
          order: 0,
          isSaved: true,
          joints: null,
          tcp: {
            x: point.tcp.x,
            y: point.tcp.y,
            z: point.tcp.z,
            rx: point.orientation.rx,
            ry: point.orientation.ry,
            rz: point.orientation.rz,
          },
          moveSpeed: manualMoveSpeed,
          velMode: 0,
          toolNum,
          userNum,
          weldVoltage: null,
          weldCurrent: null,
          weavingType: null,
          weaveParams: DEFAULT_WEAVE,
          gap: 0,
          touchOffset: interpolatedOffset,
          touchDirection: 1,
          touchBottom: false,
        };
        stopRef.current = false;
        if (!teachingRobotState?.servo_enabled) {
          log_useCenterlineNavigation.info('centerline.enableServo', '서보 활성화');
          await enableRobot();
        }
        const robotJoints = teachingRobotState?.joints;
        const atSavedPoint =
          !!robotJoints &&
          teachingPoints.some(
            pt =>
              pt.id !== 'home' &&
              pt.isSaved &&
              pt.joints != null &&
              pt.joints.length === 6 &&
              pt.joints.every((v, i) => Math.abs(v - robotJoints[i]) <= 0.5),
          );
        if (atSavedPoint) {
          const retractOk = await executeRetract(
            teachingRobotState?.tcp ?? null,
            manualMoveSpeed,
            toolNum,
            userNum,
            stopRef,
          );
          if (!retractOk) {
            showAlert('센터라인 후퇴 중단', { type: 'warning' });
            return;
          }
        }
        const approachOk = await executeApproachWithOffset(
          virtualPoint,
          manualMoveSpeed,
          toolNum,
          userNum,
          stopRef,
        );
        if (!approachOk) {
          showAlert('센터라인 이동 실패', { type: 'error' });
          return;
        }
        log_useCenterlineNavigation.info('centerline.done', '센터라인 이동 완료');
      } catch (error) {
        log_useCenterlineNavigation.error('centerline.moveError', '센터라인 이동 오류', { error: String(error) });
        showAlert(`이동 오류: ${error}`, { type: 'error' });
      }
    },
    [teachingRobotState, teachingPoints, manualMoveSpeed, showAlert],
  );
  return { handleCenterlinePointClick };
}
export type UseCenterlineNavigationReturn = ReturnType<typeof useCenterlineNavigation>;
