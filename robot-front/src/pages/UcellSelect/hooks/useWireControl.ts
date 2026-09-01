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

const WIRE_FORWARD_DURATION_MS = 200;
const WIRE_REVERSE_DURATION_MS = 400;
export interface UseWireControlReturn {
  wireContinuous: boolean;
  setWireContinuous: (v: boolean) => void;
  wireFeeding: 'in' | 'out' | null;
  handleWireIn: () => Promise<void>;
  handleWireOut: () => Promise<void>;
  handleWireStop: () => Promise<void>;
}
export function useWireControl(): UseWireControlReturn {
  const [wireContinuous, setWireContinuous] = useState(false);
  const [wireFeeding, setWireFeeding] = useState<'in' | 'out' | null>(null);
  const handleWireIn = useCallback(async () => {
    try {
      if (wireContinuous) {
        setWireFeeding('in');
        await reverseWireFeed(0, 1);
      } else {
        await reverseWireFeed(0, 1);
        setTimeout(async () => {
          await stopReverseWireFeed(0);
        }, WIRE_REVERSE_DURATION_MS);
      }
    } catch (error) {
      console.error('Wire In 오류:', error);
    }
  }, [wireContinuous]);
  const handleWireOut = useCallback(async () => {
    try {
      if (wireContinuous) {
        setWireFeeding('out');
        await forwardWireFeed(0, 1);
      } else {
        await forwardWireFeed(0, 1);
        setTimeout(async () => {
          await stopForwardWireFeed(0);
        }, WIRE_FORWARD_DURATION_MS);
      }
    } catch (error) {
      console.error('Wire Out 오류:', error);
    }
  }, [wireContinuous]);
  const handleWireStop = useCallback(async () => {
    try {
      if (wireFeeding === 'in') await stopReverseWireFeed(0);
      else if (wireFeeding === 'out') await stopForwardWireFeed(0);
      setWireFeeding(null);
    } catch (error) {
      console.error('Wire Stop 오류:', error);
    }
  }, [wireFeeding]);
  return {
    wireContinuous,
    setWireContinuous,
    wireFeeding,
    handleWireIn,
    handleWireOut,
    handleWireStop,
  };
}
