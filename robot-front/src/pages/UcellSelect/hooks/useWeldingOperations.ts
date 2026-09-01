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

const log_useWeldingOperations = createLogger('useWeldingOperations');
export function useWeldingOperations(): UseWeldingOperationsReturn {
  const [isArcTesting, setIsArcTesting] = useState(false);
  const [isWelding, setIsWelding] = useState(false);
  const [arcActive, setArcActive] = useState(false);
  const [isTouchSensing, setIsTouchSensing] = useState(false);
  const [currentPointIndex, setCurrentPointIndex] = useState(-1);
  const [simulationMode, setSimulationMode] = useState(false);
  const [dryRunMode, setDryRunMode] = useState(false);
  const [lastWeldingResult, setLastWeldingResult] = useState<WeldingResult | null>(null);
  const stopRef = useRef(false);
  const { show: showAlert } = useAlert();
  const startTouchSensing = useCallback(async (
    teachingPoints: TeachingPoint[],
    robotState: RealtimeRobotStatus | null,
    options?: TouchSensingOptions
  ): Promise<TouchSensingResult[]> => {
    if (isArcTesting || isWelding || isTouchSensing) return [];
    setIsTouchSensing(true);
    stopRef.current = false;
    const context: TouchSensingContext = {
      stopRef,
      setCurrentPointIndex,
      showAlert,
    };
    try {
      return await executeTouchSensing(teachingPoints, robotState, options, context);
    } finally {
      setIsTouchSensing(false);
      setCurrentPointIndex(-1);
    }
  }, [isArcTesting, isWelding, isTouchSensing, showAlert]);
  const stopTouchSensing = useCallback(async () => {
    log_useWeldingOperations.warn('touchSensing.stop', '터치 센싱 긴급 정지');
    stopRef.current = true;
    try {
      await emergencyStop().catch(() => {});
      await Promise.all([
        stopRobotSDK().catch(() => {}),
        wireSearchEnd({}).catch(() => {})
      ]);
    } catch {  }
    setIsTouchSensing(false);
    setCurrentPointIndex(-1);
  }, []);
  const startArcTest = useCallback(async (
    teachingPoints: TeachingPoint[],
    robotState: RealtimeRobotStatus | null,
    manualSpeed: number,
    isSimulation: boolean
  ) => {
    if (isArcTesting || isWelding) return;
    setIsArcTesting(true);
    stopRef.current = false;
    setCurrentPointIndex(0);
    const context: ArcTestContext = {
      stopRef,
      setCurrentPointIndex,
      showAlert,
    };
    try {
      await executeArcTest(teachingPoints, robotState, manualSpeed, isSimulation, context);
    } catch (error) {
      const testType = isSimulation ? '포인트 테스트' : '아크 테스트';
      log_useWeldingOperations.error('arcTest.error', `${testType} 오류`, { error: String(error) });
      showAlert(`${testType} 중 오류가 발생했습니다: ${String(error)}`, { type: 'error', title: `${testType} 오류` });
      if (!isSimulation) {
        try { await endArc(); } catch {  }
      }
    } finally {
      setIsArcTesting(false);
      setCurrentPointIndex(-1);
    }
  }, [isArcTesting, isWelding, showAlert]);
  const stopArcTest = useCallback(async () => {
    log_useWeldingOperations.warn('arcTest.stop', '아크 테스트 긴급 정지');
    stopRef.current = true;
    try {
      await emergencyStop().catch(() => {});
      await Promise.all([
        stopRobotSDK().catch(() => {}),
        endArc().catch(() => {}),
        endWeave().catch(() => {})
      ]);
    } catch {  }
    setIsArcTesting(false);
    setCurrentPointIndex(-1);
  }, []);
  const findClosestCenterlinePoint = useCallback((
    teachingPoints: TeachingPoint[],
    currentTcp: number[],
    partWeldEnabled?: PartWeldEnabled
  ): ClosestCenterlineResult | null => {
    return findClosestCenterlinePointFn(teachingPoints, currentTcp, partWeldEnabled);
  }, []);
  const startWelding = useCallback(async (
    teachingPoints: TeachingPoint[],
    robotState: RealtimeRobotStatus | null,
    simMode: boolean,
    jobId?: number,
    jobName?: string,
    options?: WeldingStartOptions
  ): Promise<WeldingResult | null> => {
    if (isArcTesting || isWelding) return null;
    setIsWelding(true);
    stopRef.current = false;
    const context: WeldingExecutionContext = {
      stopRef,
      setCurrentPointIndex,
      showAlert,
      setLastWeldingResult,
      currentPointIndex,
      setArcActive,
    };
    try {
      const result = await executeWelding(
        teachingPoints, robotState, simMode, context, jobId, jobName, options
      );
      return result;
    } finally {
      setIsWelding(false);
      setArcActive(false);
      setCurrentPointIndex(-1);
    }
  }, [isArcTesting, isWelding, currentPointIndex, showAlert]);
  const stopWelding = useCallback(async () => {
    log_useWeldingOperations.warn('welding.stop', '용접 긴급 정지');
    stopRef.current = true;
    try {
      await emergencyStop().catch(() => {});
      await stopRobotSDK().catch(() => {});
      await endWeave().catch(() => {});
      await arcOff(0, 0, 1000, 200).catch(() => {});
      await arcTraceControl({ flag: 0 }).catch(() => {});
    } catch {  }
    setIsWelding(false);
    setArcActive(false);
    setCurrentPointIndex(-1);
  }, []);
  return {
    isArcTesting,
    isWelding,
    arcActive,
    isTouchSensing,
    currentPointIndex,
    simulationMode,
    dryRunMode,
    lastWeldingResult,
    startArcTest,
    stopArcTest,
    startTouchSensing,
    stopTouchSensing,
    startWelding,
    stopWelding,
    setSimulationMode,
    setDryRunMode,
    findClosestCenterlinePoint,
  };
}
