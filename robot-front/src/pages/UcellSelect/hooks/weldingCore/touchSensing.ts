import { TeachingPoint, getExecutableParts, flattenExecutableParts, WEAVING_TYPE_OPTIONS, PartWeldEnabled, getPartBoundaryInfo } from '../..';
import { enableRobot, RealtimeRobotStatus, startArc, endArc, endWeave, getWeldingConfig, WeldingConfigData, moveToJointPositionNonBlocking, checkMotionDone, createWeldingLog, WeldingLogData, WeldingLogSegment, findDx, findDy, findDz, setWeaveParams, startWeave, arcOn, arcOff, getRobotSettings, moveToCartesianPosition, getInverseKin, arcTraceControl, batchMoveL, BatchMovePoint, getWeldingPartOrder, isApiSuccess } from '../../../../lib';
import { createLogger } from '../../../../lib';
import React from 'react';
import { setWeldingPartOrder } from '../..';
import { WeldingSequenceSettings, TouchSensingOptions, TouchSensingResult } from './weldingCoreTypes';
import { PointTouchResult, performDryRunForPoint } from './touchDryRun';
import { getTouchDirections } from './touchDirections';
import { loadWeldingSettings } from './sequenceSettings';
import { moveToCartesianWithStopCheck, moveToJointWithStopCheck } from './moveStopCheck';

const log_touchSensing = createLogger('weldingCore.touchSensing');
export interface TouchSensingContext {
  stopRef: React.MutableRefObject<boolean>;
  setCurrentPointIndex: (index: number) => void;
  showAlert: (
    message: string,
    options?: { type?: 'error' | 'warning' | 'info' | 'success'; title?: string },
  ) => void;
}
async function performRealTouchSensing(
  point: TeachingPoint,
  sequenceSettings: WeldingSequenceSettings,
  depthOffset: number,
  touchBottom: boolean,
  stopRef: React.MutableRefObject<boolean>,
): Promise<PointTouchResult> {
  const pointIdLower = point.id.toLowerCase();
  const directions = getTouchDirections(
    pointIdLower,
    sequenceSettings,
    touchBottom,
    point.touchBottom,
  );
  const {
    hasCenter,
    hasLeft,
    hasRight,
    hasTop,
    hasBottomDir,
    hasSide,
    sideDirection,
    isHorizontal,
  } = directions;
  let dx = 0,
    dy = 0,
    dz = 0;
  try {
    if (hasCenter && !stopRef.current) {
      if (isHorizontal) {
        log_touchSensing.info('touchSensing.findDx.center', `${point.name} 중앙 터치 시작 (가로용접 Base -X)`);
        const dxResult = await findDx(-1);
        if (dxResult?.status_code === 200 && dxResult.data?.delta_x !== undefined) {
          dx = dxResult.data.delta_x;
          log_touchSensing.info(
            'touchSensing.findDx.center.result',
            `중앙 터치 완료 (가로: depthOffset 미적용)`,
            { rawDx: dxResult.data.delta_x, dx },
          );
        }
      } else {
        log_touchSensing.info('touchSensing.findDx', `${point.name} 중앙 터치 시작 (세로용접 -X방향)`);
        const dxResult = await findDx(-1);
        if (dxResult?.status_code === 200 && dxResult.data?.delta_x !== undefined) {
          dx = dxResult.data.delta_x + depthOffset;
          log_touchSensing.info('touchSensing.findDx.result', `중앙 터치 완료`, {
            rawDx: dxResult.data.delta_x,
            depthOffset,
            dx,
          });
        }
      }
    }
    if (stopRef.current) return { dx, dy, dz, stopped: true };
    if (!isHorizontal) {
      if (hasLeft && !stopRef.current) {
        log_touchSensing.info('touchSensing.findDy.left', `${point.name} 좌측 터치 시작 (-Y방향)`);
        const dyLeftResult = await findDy(-1);
        if (dyLeftResult?.status_code === 200 && dyLeftResult.data?.delta_y !== undefined) {
          dy = dyLeftResult.data.delta_y + depthOffset;
          log_touchSensing.info('touchSensing.findDy.left.result', `좌측 터치 완료`, {
            rawDy: dyLeftResult.data.delta_y,
            depthOffset,
            dy,
          });
        }
      }
      if (stopRef.current) return { dx, dy, dz, stopped: true };
      if (hasRight && !stopRef.current) {
        log_touchSensing.info('touchSensing.findDy.right', `${point.name} 우측 터치 시작 (+Y방향)`);
        const dyRightResult = await findDy(1);
        if (dyRightResult?.status_code === 200 && dyRightResult.data?.delta_y !== undefined) {
          const rightDy = dyRightResult.data.delta_y - depthOffset;
          dy = hasLeft ? (dy + rightDy) / 2 : rightDy;
          log_touchSensing.info('touchSensing.findDy.right.result', `우측 터치 완료`, {
            rawDy: dyRightResult.data.delta_y,
            depthOffset,
            dy,
            averaged: hasLeft,
          });
        }
      }
    } else if (hasSide) {
      const sideLabel = sideDirection === -1 ? 'P4 좌측(Base -Y)' : 'P10 우측(Base +Y)';
      if (!stopRef.current) {
        log_touchSensing.info('touchSensing.findDy.side', `${point.name} ${sideLabel} 터치 시작`);
        const dyResult = await findDy(sideDirection);
        if (dyResult?.status_code === 200 && dyResult.data?.delta_y !== undefined) {
          dy = dyResult.data.delta_y;
          log_touchSensing.info(
            'touchSensing.findDy.side.result',
            `${sideLabel} 터치 완료 (가로: depthOffset 미적용)`,
            { rawDy: dyResult.data.delta_y, dy },
          );
        }
      }
    }
    if (stopRef.current) return { dx, dy, dz, stopped: true };
    if (hasTop && !stopRef.current) {
      log_touchSensing.info('touchSensing.findDz.top', `${point.name} 상단 터치 시작 (Base +Z)`);
      const dzResult = await findDz(1);
      if (dzResult?.status_code === 200 && dzResult.data?.delta_z !== undefined) {
        dz = dzResult.data.delta_z;
        log_touchSensing.info('touchSensing.findDz.top.result', `상단 터치 완료`, { dz });
      }
    }
    if (stopRef.current) return { dx, dy, dz, stopped: true };
    if (hasBottomDir && !stopRef.current) {
      log_touchSensing.info('touchSensing.findDz.bottom', `${point.name} 하단 터치 시작 (Base -Z)`);
      const dzResult = await findDz(-1);
      if (dzResult?.status_code === 200 && dzResult.data?.delta_z !== undefined) {
        dz = hasTop ? (dz + dzResult.data.delta_z) / 2 : dzResult.data.delta_z;
        log_touchSensing.info('touchSensing.findDz.bottom.result', `하단 터치 완료`, { dz, averaged: hasTop });
      }
    }
  } catch (error) {
    log_touchSensing.error('touchSensing.point.error', `${point.name} 터치 센싱 오류`, { error: String(error) });
    return { dx, dy, dz, stopped: false, error: String(error) };
  }
  return { dx, dy, dz, stopped: stopRef.current };
}
export async function executeTouchSensing(
  teachingPoints: TeachingPoint[],
  robotState: RealtimeRobotStatus | null,
  options: TouchSensingOptions | undefined,
  context: TouchSensingContext,
): Promise<TouchSensingResult[]> {
  const { stopRef, setCurrentPointIndex, showAlert } = context;
  stopRef.current = false;
  const totalTimer = log_touchSensing.startTimer();
  const isDryRun = options?.isDryRun ?? false;
  const modeLabel = isDryRun ? '터치 테스트' : '터치 센싱';
  log_touchSensing.info('touchSensing.start', `${modeLabel} 시작`, { isDryRun });
  const touchBottom = options?.touchBottom ?? false;
  const suppressAlerts = options?.suppressAlerts ?? false;
  const onUpdatePoint = options?.onUpdatePoint;
  const { sequence: sequenceSettings } = await loadWeldingSettings();
  const depthOffset = options?.depthOffset ?? sequenceSettings.touchOffsetDepth;
  log_touchSensing.info('touchSensing.settings', '설정 로드 완료', {
    touchSensingEnabled: sequenceSettings.touchSensingEnabled,
    touchSpeed: sequenceSettings.touchSpeed,
    touchDistance: sequenceSettings.touchDistance,
    touchApproachOffset: sequenceSettings.touchApproachOffset,
    touchBottom,
    depthOffset,
  });
  const partWeldEnabled = options?.partWeldEnabled;
  const executableParts = getExecutableParts(teachingPoints, partWeldEnabled);
  const TOUCH_SENSING_ORDER = [
    'p1',
    'p2',
    'p3',
    'p4',
    'p5',
    'p6',
    'p12',
    'p11',
    'p10',
    'p9',
    'p8',
    'p7',
  ];
  const touchRank = (id: string) => {
    const i = TOUCH_SENSING_ORDER.indexOf(id.toLowerCase());
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  const savedPoints = flattenExecutableParts(executableParts).sort(
    (a, b) => touchRank(a.id) - touchRank(b.id),
  );
  if (savedPoints.length === 0) {
    log_touchSensing.warn('touchSensing.noPoints', '저장된 티칭 포인트가 없음');
    showAlert('저장된 티칭 포인트가 없습니다. (각 파트에 2개 이상 포인트 필요)', {
      type: 'warning',
      title: '포인트 없음',
    });
    return [];
  }
  setCurrentPointIndex(0);
  const touchResults: TouchSensingResult[] = [];
  const Z_APPROACH_OFFSET = sequenceSettings.touchApproachOffset;
  // p9/p10: 같은 위치(우측 수평 코너)에 티칭되어 있고, U셀 구조물과의 간섭으로
  // 로컬 +X 접근 시 충돌(code=185) 반복 확인됨. 로컬 -Y로 접근.
  const NEAR_UCELL_CORNER = ['p9', 'p10'];
  const getApproachOffsetPos = (pointId: string, offset: number): number[] =>
    NEAR_UCELL_CORNER.includes(pointId.toLowerCase()) ? [0, -offset, 0, 0, 0, 0] : [offset, 0, 0, 0, 0, 0];
  try {
    if (!robotState?.servo_enabled) {
      log_touchSensing.info('touchSensing.setup', '서보 활성화 중...');
      await enableRobot();
    }
    let lastPoint: TeachingPoint | null = null;
    const isSameTcpPosition = (a: TeachingPoint | null, b: TeachingPoint): boolean => {
      if (!a?.tcp || !b.tcp) return false;
      return (
        a.tcp.x === b.tcp.x &&
        a.tcp.y === b.tcp.y &&
        a.tcp.z === b.tcp.z &&
        a.tcp.rx === b.tcp.rx &&
        a.tcp.ry === b.tcp.ry &&
        a.tcp.rz === b.tcp.rz &&
        (a.toolNum ?? 0) === (b.toolNum ?? 0) &&
        (a.userNum ?? 0) === (b.userNum ?? 0)
      );
    };
    for (let i = 0; i < savedPoints.length; i++) {
      if (stopRef.current) break;
      const point = savedPoints[i];
      setCurrentPointIndex(i);
      log_touchSensing.info('touchSensing.point', `[${i + 1}/${savedPoints.length}] ${point.name} 터치 센싱`);
      const pointIdLower = point.id.toLowerCase();
      const directions = getTouchDirections(
        pointIdLower,
        sequenceSettings,
        touchBottom,
        point.touchBottom,
      );
      const { hasCenter, hasLeft, hasRight, hasTop, hasBottomDir, hasSide } = directions;
      log_touchSensing.info('touchSensing.directions', `${point.name} 터치 방향`, {
        pointId: pointIdLower,
        hasCenter,
        hasLeft,
        hasRight,
        hasTop,
        hasBottomDir,
        hasSide,
      });
      const hasAnyDirection = hasCenter || hasLeft || hasRight || hasTop || hasBottomDir || hasSide;
      if (!hasAnyDirection) {
        log_touchSensing.info('touchSensing.skipPoint', `${point.name} 테스트할 면 없음 - 포인트 건너뜀`);
        continue;
      }
      const samePositionAsPrev = isSameTcpPosition(lastPoint, point);
      lastPoint = point;
      if (point.tcp) {
        const { x: px, y: py, z: pz, rx: prx, ry: pry, rz: prz } = point.tcp;
        const toolNum = point.toolNum ?? 0;
        const userNum = point.userNum ?? 0;
        if (!samePositionAsPrev) {
          const approachOffsetPos = getApproachOffsetPos(point.id, Z_APPROACH_OFFSET);
          log_touchSensing.info(
            'touchSensing.approach',
            `${point.name} ${NEAR_UCELL_CORNER.includes(pointIdLower) ? '-Y' : '+X'} 오프셋 위치로 이동`,
          );
          const approachResult = await moveToCartesianWithStopCheck(
            { x: px, y: py, z: pz, rx: prx, ry: pry, rz: prz },
            sequenceSettings.touchSensingPointSpeed,
            100,
            100,
            -1,
            1,
            approachOffsetPos,
            undefined,
            toolNum,
            userNum,
            stopRef,
          );
          if (approachResult.stopped) {
            log_touchSensing.info('touchSensing.approach.stopped', '접근 중 정지됨');
            break;
          }
          if (!approachResult.success) {
            log_touchSensing.error('touchSensing.approach.failed', `${point.name} 접근 실패`);
            continue;
          }
        } else {
          // 이전 포인트와 같은 좌표라도, 터치센싱 탐색+후퇴로 실제 위치가 티칭 좌표에서
          // 미세하게 벗어나 있을 수 있으므로 오프셋 접근(왕복)만 생략하고 정확 위치 이동은 항상 실행한다.
          log_touchSensing.info(
            'touchSensing.samePosition',
            `${point.name} 이전 포인트와 동일 좌표 - 오프셋 접근 생략 (정확 위치 이동은 실행)`,
          );
        }
        log_touchSensing.info('touchSensing.move', `${point.name} 정확한 위치로 이동`);
        const moveResult = await moveToCartesianWithStopCheck(
          { x: px, y: py, z: pz, rx: prx, ry: pry, rz: prz },
          sequenceSettings.touchSensingPointSpeed,
          100,
          100,
          -1,
          0,
          [0, 0, 0, 0, 0, 0],
          undefined,
          toolNum,
          userNum,
          stopRef,
        );
        if (moveResult.stopped) {
          log_touchSensing.info('touchSensing.move.stopped', '이동 중 정지됨');
          break;
        }
        if (!moveResult.success) {
          log_touchSensing.error('touchSensing.move.failed', `${point.name} 이동 실패`);
          continue;
        }
      }
      let touchResult: PointTouchResult;
      if (isDryRun) {
        touchResult = await performDryRunForPoint(point, sequenceSettings, touchBottom, stopRef);
      } else {
        touchResult = await performRealTouchSensing(
          point,
          sequenceSettings,
          depthOffset,
          touchBottom,
          stopRef,
        );
      }
      if (touchResult.stopped) {
        log_touchSensing.info('touchSensing.stopped', '터치 센싱 정지됨');
        break;
      }
      const result: TouchSensingResult = {
        pointId: point.id,
        dx: touchResult.dx,
        dy: touchResult.dy,
        dz: touchResult.dz,
      };
      touchResults.push(result);
      if (onUpdatePoint) {
        onUpdatePoint(point.id, { dx: touchResult.dx, dy: touchResult.dy, dz: touchResult.dz });
        log_touchSensing.info('touchSensing.updatePoint', `${point.name} 터치 오프셋 저장`, result);
      }
    }
    log_touchSensing.info('touchSensing.complete', `${modeLabel} 완료`, { results: touchResults, isDryRun });
    // 터치센싱 완료 후 홈 복귀 (정지 상태 아니고 home 저장돼 있을 때만)
    if (!stopRef.current && !options?.skipHomeReturn) {
      const homePoint = teachingPoints.find(
        pt => pt.id === 'home' && pt.isSaved && pt.joints && pt.joints.length > 0,
      );
      if (homePoint?.joints) {
        try {
          if (lastPoint?.tcp) {
            const { x: lx, y: ly, z: lz, rx: lrx, ry: lry, rz: lrz } = lastPoint.tcp;
            log_touchSensing.info('touchSensing.homeReturn.retract', `${lastPoint.name} +X 오프셋으로 후퇴`);
            await moveToCartesianWithStopCheck(
              { x: lx, y: ly, z: lz, rx: lrx, ry: lry, rz: lrz },
              sequenceSettings.touchSensingPointSpeed,
              100,
              100,
              -1,
              1,
              [Z_APPROACH_OFFSET, 0, 0, 0, 0, 0],
              undefined,
              lastPoint.toolNum ?? 0,
              lastPoint.userNum ?? 0,
              stopRef,
            );
          }
          log_touchSensing.info('touchSensing.homeReturn', 'Home으로 복귀');
          await moveToJointWithStopCheck(
            homePoint.joints,
            homePoint.moveSpeed || 50,
            homePoint.toolNum ?? 3,
            homePoint.userNum ?? 0,
            stopRef,
          );
        } catch (e) {
          log_touchSensing.warn('touchSensing.homeReturn.failed', 'Home 복귀 실패', { error: String(e) });
        }
      }
    }
    totalTimer.end('touchSensing.complete', `${modeLabel} 완료`);
    if (!suppressAlerts) {
      if (isDryRun) {
        showAlert(`${touchResults.length}개 포인트 터치 테스트 완료`, {
          type: 'success',
          title: '터치 테스트 완료',
        });
      } else {
        const summary = touchResults
          .map(r => {
            const pt = savedPoints.find(p => p.id === r.pointId);
            const showZ = pt?.touchBottom ?? (r.pointId === 'p1' || touchBottom);
            return `${r.pointId.toUpperCase()}: dx=${r.dx.toFixed(1)}, dy=${r.dy.toFixed(1)}${showZ ? `, dz=${r.dz.toFixed(1)}` : ''}`;
          })
          .join('\n');
        showAlert(summary, { type: 'success', title: '터치 센싱 완료' });
      }
    }
    return touchResults;
  } catch (error) {
    log_touchSensing.error('touchSensing.error', '터치 센싱 오류', { error: String(error) });
    showAlert('터치 센싱 중 오류가 발생했습니다: ' + String(error), {
      type: 'error',
      title: '터치 센싱 오류',
    });
    return touchResults;
  }
}
