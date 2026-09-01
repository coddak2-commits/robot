import { TeachingPoint, getExecutableParts, flattenExecutableParts, WEAVING_TYPE_OPTIONS, PartWeldEnabled, getPartBoundaryInfo } from '../..';
import { enableRobot, RealtimeRobotStatus, startArc, endArc, endWeave, getWeldingConfig, WeldingConfigData, moveToJointPositionNonBlocking, checkMotionDone, createWeldingLog, WeldingLogData, WeldingLogSegment, wireSearchEnd, findDx, findDy, findDz, setWeaveParams, startWeave, arcOn, arcOff, getRobotSettings, moveToCartesianPosition, getInverseKin, arcTraceControl, batchMoveL, BatchMovePoint, getWeldingPartOrder, isApiSuccess } from '../../../../lib';
import { createLogger } from '../../../../lib';
import React from 'react';
import { setWeldingPartOrder } from '../..';
import { moveToJointWithStopCheck } from './moveStopCheck';

const log = createLogger('weldingCore.arcTest');
export interface ArcTestContext {
  stopRef: React.MutableRefObject<boolean>;
  setCurrentPointIndex: (index: number) => void;
  showAlert: (message: string, options?: { type?: 'error' | 'warning' | 'info' | 'success'; title?: string }) => void;
}
export async function executeArcTest(
  teachingPoints: TeachingPoint[],
  robotState: RealtimeRobotStatus | null,
  manualSpeed: number,
  isSimulation: boolean,
  context: ArcTestContext
): Promise<void> {
  const { stopRef, setCurrentPointIndex, showAlert } = context;
  const totalTimer = log.startTimer();
  const testType = isSimulation ? '포인트 테스트' : '아크 테스트';
  log.info('arcTest.start', `${testType} 시작`, { manualSpeed, isSimulation });
  const executableParts = getExecutableParts(teachingPoints);
  log.info('arcTest.parts', '파트별 실행 정보', {
    parts: executableParts.map(p => ({
      name: p.name,
      savedCount: p.savedPoints.length,
      savedIds: p.savedPoints.map(pt => pt.id),
      shouldExecute: p.shouldExecute
    }))
  });
  const savedPoints = flattenExecutableParts(executableParts);
  if (savedPoints.length === 0) {
    log.warn('arcTest.noPoints', '저장된 티칭 포인트가 없음');
    showAlert('저장된 티칭 포인트가 없습니다. (각 파트에 2개 이상 포인트 필요)', { type: 'warning', title: '포인트 없음' });
    return;
  }
  setCurrentPointIndex(0);
  if (!robotState?.servo_enabled) {
    log.info('arcTest.setup', '서보 활성화 중...');
    await enableRobot();
  }
  await endWeave().catch(() => {});
  log.info('arcTest.cleanup', '이전 위빙 상태 정리 완료');
  const homePoint = teachingPoints.find(pt => pt.id === 'home' && pt.isSaved && pt.joints && pt.joints.length > 0);
  if (homePoint?.joints) {
    log.info('arcTest.home.start', 'Home 위치로 이동 (비블로킹)', { manualSpeed });
    const homeResult = await moveToJointWithStopCheck(
      homePoint.joints,
      manualSpeed,
      homePoint.toolNum ?? 3,
      homePoint.userNum ?? 0,
      stopRef
    );
    if (homeResult.stopped) {
      log.info('arcTest.home.stopped', 'Home 이동 중 정지됨');
      return;
    }
    if (!homeResult.success) {
      throw new Error('Home 이동 실패');
    }
  }
  if (stopRef.current) return;
  for (let i = 0; i < savedPoints.length; i++) {
    if (stopRef.current) break;
    const point = savedPoints[i];
    setCurrentPointIndex(i);
    if (point.joints && point.joints.length > 0) {
      log.info('arcTest.move', `[${i + 1}/${savedPoints.length}] ${point.name} 이동 (비블로킹)`, { manualSpeed });
      const moveResult = await moveToJointWithStopCheck(
        point.joints,
        manualSpeed,
        point.toolNum ?? 0,
        point.userNum ?? 0,
        stopRef
      );
      if (moveResult.stopped) {
        log.info('arcTest.move.stopped', `${point.name} 이동 중 정지됨`);
        break;
      }
      if (!moveResult.success) {
        throw new Error(`${point.name} 이동 실패`);
      }
    }
    if (stopRef.current) break;
    if (!isSimulation) {
      log.info('arcTest.arc.on', `${point.name} 아크 ON`);
      await startArc(0, 0, 100);
      await new Promise(resolve => setTimeout(resolve, 500));
      if (stopRef.current) {
        await endArc();
        break;
      }
      await endArc();
    } else {
      log.info('arcTest.point.reached', `${point.name} 포인트 도달`);
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  totalTimer.end('arcTest.complete', `${testType} 완료`);
}
