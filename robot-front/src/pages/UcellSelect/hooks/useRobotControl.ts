import { TeachingPoint } from '..';
import { RealtimeRobotStatus, enableRobot, getRealtimeRobotStatus, stopRobotSDK } from '../../../lib';
import { createLogger } from '../../../lib';
import { useCallback, useEffect, useRef, useState } from 'react';
import { executeRetract, executeMoveJ, executeHomeExitRetreat } from './moveHelpers';
import { moveHomeFromVerticalEnd, moveLinToPoint } from './weldingCore/moveStopCheck';

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
      const speed = opts.overrideSpeed ?? point.moveSpeed;
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
        const isHomeTarget = (point.id ?? '').toLowerCase() === 'home';
        if (isHomeTarget) {
          // [v1.1.260] 홈은 어디서든 먼저 짧게 빠진다. moveHelpers.ts executeHomeExitRetreat 참고.
          const exit = await executeHomeExitRetreat(
            teachingRobotState?.tcp ?? null,
            speed,
            toolNum,
            userNum,
            stopMoveRef,
          );
          if (exit === 'stopped') return false;
          if (exit === 'failed') {
            log_useRobotControl.warn('moveToPoint.homeExitFailed', '홈 복귀 전 빠져나오기 전부 거부');
            const goAnyway = window.confirm(
              '뒤로 빼는 이동이 거부되었습니다.\n이 자리에서 바로 홈으로 가면 U셀에 닿을 수 있습니다.\n\n토치 주변을 확인했으면 [확인], 직접 빼낼 거면 [취소]를 누르세요.',
            );
            if (!goAnyway) {
              log_useRobotControl.info('moveToPoint.homeExitCancel', '사용자 취소 - 홈 이동 안 함');
              return false;
            }
            log_useRobotControl.info('moveToPoint.homeExitForce', '사용자 확인 - 빠져나오기 없이 홈 이동');
          }
        } else if (!skipRetract) {
          const retractOk = await executeRetract(
            teachingRobotState?.tcp ?? null,
            speed,
            toolNum,
            userNum,
            stopMoveRef,
          );
          if (!retractOk) return false;
        }
        if (isHomeTarget && point.tcp && point.joints && point.joints.length === 6) {
          // [v1.1.274] 홈 버튼: 빠진 뒤 홈 TCP 로 직선(MoveL) -> 도착 확인 후 홈 관절 MoveJ.
          // 직선이 거부되거나 도중에 멈추면 팔 접기(J1 고정) -> 홈 MoveJ (weldingCore/moveStopCheck.ts).
          // 종전 MoveJ 한 번은 관절이 함께 돌며 와이어 끝(스틱아웃 25mm)이 곡선으로 휩쓸려
          // U셀 판을 긁고 휘었다(2026-10-26 현장, 와이어만 닿아 로봇 충돌 감지·로그에는 안 남음).
          log_useRobotControl.info('moveToPoint.homeLin', '홈 버튼: 홈 TCP 로 직선(MoveL) 복귀');
          const homeResult = await moveHomeFromVerticalEnd({ ...point, moveSpeed: speed }, stopMoveRef);
          if (!homeResult.success) return false;
        } else if (!isHomeTarget && point.tcp) {
          // [v1.1.276] 포인트로 갈 때도 직선(MoveL). moveStopCheck.ts moveLinToPoint 참고.
          const lin = await moveLinToPoint(point, speed, stopMoveRef);
          if (lin === 'stopped' || lin === 'failed') return false;
          if (lin === 'rejected') {
            const goJ = window.confirm(
              `${point.name ?? point.id} 직선 이동이 거부되었거나 도중에 멈췄습니다.\n관절 이동(MoveJ)으로 가면 팔이 U셀 안쪽으로 들어갈 수 있습니다.\n\n주변을 확인했으면 [확인], 멈추려면 [취소]를 누르세요.`,
            );
            if (!goJ) {
              log_useRobotControl.info('moveToPoint.linCancel', '사용자 취소 - 이동 안 함');
              return false;
            }
            log_useRobotControl.info('moveToPoint.linFallbackMoveJ', '사용자 확인 - MoveJ 로 이동');
            const moveJOk = await executeMoveJ(point, speed, toolNum, userNum, stopMoveRef, teachingRobotState?.joints);
            if (!moveJOk) return false;
          }
        } else {
          const moveJOk = await executeMoveJ(point, speed, toolNum, userNum, stopMoveRef, teachingRobotState?.joints);
          if (!moveJOk) return false;
        }
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
  // 화면 이동/언마운트 시 폴링 인터벌이 남아 계속 도는 것을 막는다 (v1.1.135).
  // 기존에는 stop 함수를 명시적으로 부르지 않으면 인터벌이 영영 살아있었다.
  useEffect(() => () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
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
