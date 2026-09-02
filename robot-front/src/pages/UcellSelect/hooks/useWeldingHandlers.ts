import { TeachingPoint, WeaveParams, createInitialTeachingPoints, UCELL_POINT_DEFINITIONS, UCellData, NORMAL_CELLS, COLLAR_PLATE_CELLS, PartWeldEnabled, DEFAULT_PART_WELD_ENABLED, DEFAULT_WEAVE_PARAMS, WELDING_PARTS } from '..';
import { moveToJointPositionNonBlocking, moveToCartesianPositionNonBlocking, checkMotionDone, getWeldingConfig, updateTeachingJob, TeachingPointData, RealtimeRobotStatus, enableRobot, createTeachingJob, getTeachingJobs, getTeachingJob, deleteTeachingJob, updateTeachingJobName, TeachingJob, getRealtimeRobotStatus, stopRobotSDK, emergencyStop, pauseRobotMotion, resumeRobotMotion, endArc, endWeave, arcOff, arcTraceControl, wireSearchEnd, forwardWireFeed, reverseWireFeed, stopForwardWireFeed, stopReverseWireFeed } from '../../../lib';
import { getErrorMessage, extractResultCode } from '../../../lib/api';
import { createLogger } from '../../../lib';
import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useAlert } from '../../../contexts';
import { playSaveOkBeep, playErrorBeep } from '../../../lib/audio';
import { RobotPosition } from '../components/index';
import { getBlockPointIds, getBlockName } from '..';
import { TouchSensingOptions, TouchSensingResult, WeldingStartOptions, WeldingResult, ClosestCenterlineResult, UseWeldingOperationsReturn, findClosestCenterlinePoint as findClosestCenterlinePointFn, executeTouchSensing, TouchSensingContext, executeArcTest, ArcTestContext, executeWelding, WeldingExecutionContext } from './weldingCore';

const log_useWeldingHandlers = createLogger('WeldingHandlers');
interface UseWeldingHandlersProps {
  teachingPoints: TeachingPoint[];
  teachingRobotState: RealtimeRobotStatus | null;
  simulationMode: boolean;
  dryRunMode: boolean;
  manualMoveSpeed: number;
  autoTouchSensing: boolean;
  partWeldEnabled: PartWeldEnabled;
  currentJobId: number | null;
  jobList: Array<{ id: number; name: string }>;
  showAlert: (
    message: string,
    options?: { type?: 'error' | 'warning' | 'info' | 'success'; title?: string },
  ) => void;
  startWelding: (
    teachingPoints: TeachingPoint[],
    robotState: RealtimeRobotStatus | null,
    simulationMode: boolean,
    jobId?: number,
    jobName?: string,
    options?: WeldingStartOptions,
  ) => Promise<WeldingResult | null>;
  stopWelding: () => Promise<void>;
  startTouchSensing: (
    teachingPoints: TeachingPoint[],
    robotState: RealtimeRobotStatus | null,
    options?: TouchSensingOptions,
  ) => Promise<TouchSensingResult[]>;
  stopTouchSensing: () => Promise<void>;
  clearAllTouchOffsets: () => void;
  updatePointTouchOffset: (
    pointId: string,
    offset: { dx: number; dy: number; dz: number } | null,
  ) => void;
  updatePointSpeed: (pointId: string, speed: number, velMode?: 0 | 1) => void;
  updatePointWeldParams: (pointId: string, voltage: number | null, current: number | null) => void;
  updatePointGap: (pointId: string, gap: number) => void;
  updatePointWeaveParams: (pointId: string, params: Partial<WeaveParams>) => void;
  updatePointWeavingType: (pointId: string, type: string | null) => void;
  startTracking: (isWelding: boolean) => void;
  stopTracking: () => void;
  clearTrackingPath: () => void;
  wsClearPathHistory: () => void;
}
export function useWeldingHandlers({
  teachingPoints,
  teachingRobotState,
  simulationMode,
  dryRunMode,
  manualMoveSpeed,
  autoTouchSensing,
  partWeldEnabled,
  currentJobId,
  jobList,
  showAlert,
  startWelding,
  stopWelding,
  startTouchSensing,
  stopTouchSensing,
  clearAllTouchOffsets,
  updatePointTouchOffset,
  updatePointSpeed,
  updatePointWeldParams,
  updatePointGap,
  updatePointWeaveParams,
  updatePointWeavingType,
  startTracking,
  stopTracking,
  clearTrackingPath,
  wsClearPathHistory,
}: UseWeldingHandlersProps) {
  const handleStartWelding = useCallback(async () => {
    const isActualWelding = !(simulationMode || dryRunMode);
    if (autoTouchSensing && isActualWelding) {
      log_useWeldingHandlers.info('welding.autoTouch.start', '용접 전 자동 터치센싱 시작');
      clearAllTouchOffsets();
      clearTrackingPath();
      startTracking(false);
      try {
        const touchResult = await startTouchSensing(teachingPoints, teachingRobotState, {
          touchBottom: false,
          depthOffset: 5,
          isDryRun: false,
          manualSpeed: manualMoveSpeed,
          partWeldEnabled,
          suppressAlerts: true,
          skipHomeReturn: true,  // 자동 용접 흐름 - 용접이 끝나면 홈으로 감
          onUpdatePoint: (pointId: string, offset: { dx: number; dy: number; dz: number }) => {
            updatePointTouchOffset(pointId, offset);
          },
        });
        const savedPointsForTouch = teachingPoints.filter(pt => pt.isSaved && pt.id !== 'home');
        if (!touchResult || touchResult.length < savedPointsForTouch.length) {
          showAlert('터치센싱이 완료되지 않아 용접을 중단합니다.', { type: 'warning' });
          stopTracking();
          return;
        }
        log_useWeldingHandlers.info('welding.autoTouch.done', '자동 터치센싱 완료, 용접 진행');
      } catch (error) {
        showAlert(`터치센싱 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`, {
          type: 'error',
        });
        stopTracking();
        return;
      }
      stopTracking();
    }
    clearTrackingPath();
    startTracking(isActualWelding);
    const currentJob = jobList.find(job => job.id === currentJobId);
    try {
      await startWelding(
        teachingPoints,
        teachingRobotState,
        simulationMode || dryRunMode,
        currentJobId ?? undefined,
        currentJob?.name,
        { isDryRun: dryRunMode, partWeldEnabled },
      );
    } finally {
      stopTracking();
    }
  }, [
    teachingPoints,
    teachingRobotState,
    simulationMode,
    dryRunMode,
    manualMoveSpeed,
    autoTouchSensing,
    partWeldEnabled,
    currentJobId,
    jobList,
    showAlert,
    startWelding,
    startTouchSensing,
    clearAllTouchOffsets,
    updatePointTouchOffset,
    startTracking,
    stopTracking,
    clearTrackingPath,
  ]);
  const handleContinueWelding = useCallback(async () => {
    if (!teachingRobotState?.tcp || teachingRobotState.tcp.length < 3) {
      showAlert('로봇 TCP 위치를 가져올 수 없습니다.', { type: 'error' });
      return;
    }
    const isActualWelding = !(simulationMode || dryRunMode);
    startTracking(isActualWelding);
    const currentJob = jobList.find(job => job.id === currentJobId);
    try {
      await startWelding(
        teachingPoints,
        teachingRobotState,
        simulationMode || dryRunMode,
        currentJobId ?? undefined,
        currentJob?.name,
        {
          startFromClosest: true,
          currentTcp: teachingRobotState.tcp,
          manualMoveSpeed,
          isDryRun: dryRunMode,
          partWeldEnabled,
        },
      );
    } finally {
      stopTracking();
    }
  }, [
    teachingPoints,
    teachingRobotState,
    simulationMode,
    dryRunMode,
    manualMoveSpeed,
    currentJobId,
    jobList,
    partWeldEnabled,
    showAlert,
    startWelding,
    startTracking,
    stopTracking,
  ]);
  const handleStartTouchSensing = useCallback(async () => {
    if (!dryRunMode) clearAllTouchOffsets();
    if (dryRunMode) {
      clearTrackingPath();
      wsClearPathHistory();
    } else {
      clearTrackingPath();
      startTracking(false);
    }
    try {
      await startTouchSensing(teachingPoints, teachingRobotState, {
        touchBottom: false,
        depthOffset: 5,
        isDryRun: dryRunMode,
        manualSpeed: manualMoveSpeed,
        partWeldEnabled,
        onUpdatePoint: (pointId: string, offset: { dx: number; dy: number; dz: number }) => {
          updatePointTouchOffset(pointId, offset);
        },
      });
    } finally {
      if (!dryRunMode) {
        stopTracking();
      }
    }
  }, [
    teachingPoints,
    teachingRobotState,
    dryRunMode,
    manualMoveSpeed,
    partWeldEnabled,
    clearAllTouchOffsets,
    updatePointTouchOffset,
    startTouchSensing,
    startTracking,
    stopTracking,
    clearTrackingPath,
    wsClearPathHistory,
  ]);
  const handleGlobalEmergencyStop = useCallback(async () => {
    log_useWeldingHandlers.warn('emergency.globalStop', 'Global emergency stop');
    try {
      stopTracking();
      await emergencyStop().catch(() => {});
      await Promise.all([stopTouchSensing().catch(() => {}), stopWelding().catch(() => {})]);
      showAlert('비상 정지 완료', { type: 'warning' });
    } catch (error) {
      log_useWeldingHandlers.error('emergency.globalStop.error', '비상 정지 중 오류', { error });
    }
  }, [showAlert, stopTouchSensing, stopWelding, stopTracking]);
  const handlePauseRobot = useCallback(async () => {
    try {
      await pauseRobotMotion();
      showAlert('일시 정지되었습니다.', { type: 'success' });
    } catch (error) {
      log_useWeldingHandlers.error('pause.error', '일시 정지 중 오류', { error });
      showAlert('일시 정지 실패', { type: 'error' });
    }
  }, [showAlert]);
  const handleResumeRobot = useCallback(async () => {
    try {
      await resumeRobotMotion();
      showAlert('재개되었습니다.', { type: 'success' });
    } catch (error) {
      log_useWeldingHandlers.error('resume.error', '재개 중 오류', { error });
      showAlert('재개 실패', { type: 'error' });
    }
  }, [showAlert]);
  const applyParamsToAllPoints = useCallback(
    (sourcePointId: string) => {
      const sourcePoint = teachingPoints.find(pt => pt.id === sourcePointId);
      if (!sourcePoint) return;
      teachingPoints.forEach(pt => {
        if (pt.id !== 'home' && pt.id !== sourcePointId) {
          updatePointSpeed(pt.id, sourcePoint.moveSpeed, sourcePoint.velMode);
          updatePointWeldParams(pt.id, sourcePoint.weldVoltage, sourcePoint.weldCurrent);
          updatePointWeavingType(pt.id, sourcePoint.weavingType);
          updatePointWeaveParams(pt.id, sourcePoint.weaveParams);
          updatePointGap(pt.id, sourcePoint.gap);
        }
      });
      showAlert('모든 용접 포인트에 파라미터가 적용되었습니다.', { type: 'success' });
    },
    [
      teachingPoints,
      showAlert,
      updatePointSpeed,
      updatePointWeldParams,
      updatePointWeavingType,
      updatePointWeaveParams,
      updatePointGap,
    ],
  );
  const applyParamsToBlock = useCallback(
    (sourcePointId: string) => {
      const sourcePoint = teachingPoints.find(pt => pt.id === sourcePointId);
      if (!sourcePoint) return;
      const blockPointIds = getBlockPointIds(sourcePointId);
      if (blockPointIds.length === 0) return;
      const blockName = getBlockName(sourcePointId);
      blockPointIds.forEach(pid => {
        if (pid !== sourcePointId) {
          updatePointSpeed(pid, sourcePoint.moveSpeed, sourcePoint.velMode);
          updatePointWeldParams(pid, sourcePoint.weldVoltage, sourcePoint.weldCurrent);
          updatePointWeavingType(pid, sourcePoint.weavingType);
          updatePointWeaveParams(pid, sourcePoint.weaveParams);
          updatePointGap(pid, sourcePoint.gap);
        }
      });
      showAlert(
        `${blockName} (${blockPointIds.map(id => id.toUpperCase()).join(', ')})에 파라미터가 적용되었습니다.`,
        { type: 'success' },
      );
    },
    [
      teachingPoints,
      showAlert,
      updatePointSpeed,
      updatePointWeldParams,
      updatePointWeavingType,
      updatePointWeaveParams,
      updatePointGap,
    ],
  );
  const handleStartWeldingTest = useCallback(async () => {
    clearTrackingPath();
    startTracking(false);
    const currentJob = jobList.find(job => job.id === currentJobId);
    try {
      await startWelding(
        teachingPoints,
        teachingRobotState,
        false,
        currentJobId ?? undefined,
        currentJob?.name,
        { isDryRun: true, partWeldEnabled, isWeldingTest: true },
      );
    } finally {
      stopTracking();
    }
  }, [
    teachingPoints,
    teachingRobotState,
    partWeldEnabled,
    currentJobId,
    jobList,
    startWelding,
    startTracking,
    stopTracking,
    clearTrackingPath,
  ]);
  return {
    handleStartWelding,
    handleStartWeldingTest,
    handleContinueWelding,
    handleStartTouchSensing,
    handleGlobalEmergencyStop,
    handlePauseRobot,
    handleResumeRobot,
    applyParamsToAllPoints,
    applyParamsToBlock,
  };
}
export type UseWeldingHandlersReturn = ReturnType<typeof useWeldingHandlers>;
export type {
  TouchSensingResult,
  TouchSensingOptions,
  ClosestCenterlineResult,
  WeldingStartOptions,
  WeldingResult,
  UseWeldingOperationsReturn,
};
