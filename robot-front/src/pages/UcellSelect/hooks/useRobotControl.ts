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
import { executeRetract, executeMoveJ, executeSafeLift } from './moveHelpers';

const log_useRobotControl = createLogger('useRobotControl');
export interface MoveToPointOptions {
  overrideSpeed?: number;
  skipRetract?: boolean;
}
export interface UseRobotControlReturn {
  isRobotMoving: boolean;
  teachingRobotState: RealtimeRobotStatus | null;
  isTeachingPolling: boolean;
  moveToPoint: (point: TeachingPoint, options?: MoveToPointOptions | number) => Promise<boolean>;
  stopMove: () => Promise<void>;
  startTeachingPolling: () => void;
  stopTeachingPolling: () => void;
  isAtPosition: (
    current: number[] | null | undefined,
    target: number[],
    tolerance?: number,
  ) => boolean;
}
const JOINT_JUMP_WARN_DEG = 45;
export function useRobotControl(): UseRobotControlReturn {
  const [isRobotMoving, setIsRobotMoving] = useState(false);
  const [teachingRobotState, setTeachingRobotState] = useState<RealtimeRobotStatus | null>(null);
  const [isTeachingPolling, setIsTeachingPolling] = useState(false);
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopMoveRef = useRef(false);
  const isAtPosition = useCallback(
    (current: number[] | null | undefined, target: number[], tolerance: number = 0.5): boolean => {
      if (!current || current.length !== target.length) return false;
      return current.every((val, idx) => Math.abs(val - target[idx]) <= tolerance);
    },
    [],
  );
  const startTeachingPolling = useCallback(() => {
    if (pollingIntervalRef.current) return;
    setIsTeachingPolling(true);
    const poll = async () => {
      try {
        const status = await getRealtimeRobotStatus();
        setTeachingRobotState(status);
      } catch (error) {
        console.error('폴링 오류:', error);
      }
    };
    poll();
    pollingIntervalRef.current = setInterval(poll, 200);
  }, []);
  const stopTeachingPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    setIsTeachingPolling(false);
  }, []);
  const moveToPoint = useCallback(
    async (point: TeachingPoint, options?: MoveToPointOptions | number): Promise<boolean> => {
      const opts: MoveToPointOptions =
        typeof options === 'number' ? { overrideSpeed: options } : (options ?? {});
      if (isRobotMoving) {
        log_useRobotControl.warn('moveToPoint.busy', '로봇이 이동 중');
        return false;
      }
      if (!point.joints || point.joints.length < 6) {
        alert('유효한 관절 데이터가 없습니다.');
        return false;
      }
      if (point.joints.every(j => j === 0)) {
        alert('관절 데이터가 모두 0입니다.');
        return false;
      }
      const targetJoints = point.joints;
      const currentJoints = teachingRobotState?.joints;
      if (!isAtPosition(currentJoints, targetJoints)) {
        let confirmMsg = `${point.name ?? point.id} 위치로 이동하시겠습니까?`;
        if (currentJoints && currentJoints.length === targetJoints.length) {
          const diffs = currentJoints.map((v, i) => Math.abs(v - targetJoints[i]));
          const maxDiff = Math.max(...diffs);
          if (maxDiff > JOINT_JUMP_WARN_DEG) {
            const jointIdx = diffs.indexOf(maxDiff) + 1;
            confirmMsg = `⚠ 이동 거리가 큽니다 (J${jointIdx} 관절 약 ${maxDiff.toFixed(1)}도 이동).\n${point.name ?? point.id} 위치로 이동하시겠습니까?`;
          }
        }
        if (!window.confirm(confirmMsg)) {
          return false;
        }
      }
      // 2026-09-04: 수동 이동속도(manualMoveSpeed) 기본값은 터치센싱 접근 속도용으로 40%까지
      // 올려둔 값이라, 포인트 클릭 이동(이 함수)에 그대로 쓰면 관절 이동거리가 큰 포인트에서
      // 너무 빠르게(훅 내려가는 느낌) 움직인다. 터치센싱은 이 함수를 거치지 않으므로,
      // 여기서만 20%로 캡을 걸어 슬라이더 기본값(40%)에는 영향 없이 포인트 이동만 완화한다.
      const speed = Math.min(opts.overrideSpeed ?? point.moveSpeed, 20);
      const totalTimer = log_useRobotControl.startTimer();
      setIsRobotMoving(true);
      stopMoveRef.current = false;
      try {
        if (!teachingRobotState?.servo_enabled) {
          const enableResult = await enableRobot().catch(e => ({ error: e }));
          if ((enableResult as { error?: Error }).error) throw new Error('서보 활성화 실패');
        }
        if (isAtPosition(teachingRobotState?.joints, point.joints)) {
          totalTimer.end('moveToPoint.skip', `${point.name} 이미 위치에 있음`);
          return true;
        }
        log_useRobotControl.info('moveToPoint.start', `${point.name}(으)로 이동 시작`, {
          pointId: point.id,
          speed,
        });
        const toolNum = point.toolNum ?? 0;
        const userNum = point.userNum ?? 0;
        const skipRetract = opts.skipRetract ?? false;
        if (!skipRetract) {
          const retractOk = await executeRetract(
            teachingRobotState?.tcp ?? null,
            speed,
            toolNum,
            userNum,
            stopMoveRef,
          );
          if (!retractOk) return false;
        }
        // 2026-09-04: U셀 전면 판과의 충돌(와이어 휨) 방지 — skipRetract 여부와 무관하게
        // 현재 위치에서 항상 한 번 더 상승 시도 후 관절이동한다.
        await executeSafeLift(
          teachingRobotState?.tcp ?? null,
          teachingRobotState?.joints,
          speed,
          toolNum,
          userNum,
          stopMoveRef,
        );
        const moveJOk = await executeMoveJ(point, speed, toolNum, userNum, stopMoveRef, teachingRobotState?.joints);
        if (!moveJOk) return false;
        totalTimer.end('moveToPoint.done', `${point.name} 이동 완료`);
        return true;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        log_useRobotControl.error('moveToPoint.error', '이동 오류', { error: errorMsg });
        return false;
      } finally {
        setIsRobotMoving(false);
      }
    },
    [isRobotMoving, teachingRobotState, isAtPosition],
  );
  const stopMove = useCallback(async () => {
    stopMoveRef.current = true;
    try {
      await stopRobotSDK();
      log_useRobotControl.info('stopMove', '로봇 정지 완료');
    } catch {
      log_useRobotControl.error('stopMove.error', '정지 오류');
    }
    setIsRobotMoving(false);
  }, []);
  return {
    isRobotMoving,
    teachingRobotState,
    isTeachingPolling,
    moveToPoint,
    stopMove,
    startTeachingPolling,
    stopTeachingPolling,
    isAtPosition,
  };
}
