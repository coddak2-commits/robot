import { TeachingPoint, WeaveParams, PartWeldEnabled } from '..';
import { RealtimeRobotStatus, emergencyStop } from '../../../lib';
import { createLogger } from '../../../lib';
import { useCallback } from 'react';
import { getBlockPointIds, getBlockName, getPartStartPointIds } from '..';
import { TouchSensingOptions, TouchSensingResult, WeldingStartOptions, WeldingResult, ClosestCenterlineResult, UseWeldingOperationsReturn } from './weldingCore';

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
      // [v1.1.228] 이어지는 자리의 포인트는 두 파트에 함께 들어간다(모서리 파트의
      // 끝점 P3/P9 가 수직 파트의 시작점이다). 파트의 용접 조건은 그 파트 첫
      // 포인트에서 읽히므로, 다른 파트의 시작점을 덮으면 그 파트 전체가 엉뚱한
      // 조건으로 돈다. 예: P4 에서 모서리 블록을 적용하면 P3 도 모서리 조건이 되어
      // 수직 파트가 모서리 조건으로 돌아버린다. 그 자리는 건너뛴다.
      // 자기 블록의 시작점은 당연히 적용 대상이다.
      const partStartIds = getPartStartPointIds();
      const skipped: string[] = [];
      blockPointIds.forEach(pid => {
        if (pid !== sourcePointId && pid !== blockPointIds[0] && partStartIds.has(pid)) {
          skipped.push(pid.toUpperCase());
          return;
        }
        if (pid !== sourcePointId) {
          updatePointSpeed(pid, sourcePoint.moveSpeed, sourcePoint.velMode);
          updatePointWeldParams(pid, sourcePoint.weldVoltage, sourcePoint.weldCurrent);
          updatePointWeavingType(pid, sourcePoint.weavingType);
          updatePointWeaveParams(pid, sourcePoint.weaveParams);
          updatePointGap(pid, sourcePoint.gap);
        }
      });
      const applied = blockPointIds
        .filter(id => !skipped.includes(id.toUpperCase()))
        .map(id => id.toUpperCase())
        .join(', ');
      showAlert(
        skipped.length > 0
          ? `${blockName} (${applied})에 파라미터가 적용되었습니다.\n`
            + `${skipped.join(', ')}은(는) 다른 파트의 시작점이라 건너뛰었습니다.`
          : `${blockName} (${applied})에 파라미터가 적용되었습니다.`,
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
