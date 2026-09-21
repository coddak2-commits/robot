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
        log_touchSensing.info('touchSensing.findDx.center', `${point.name} 以묒븰 ?곗튂 ?쒖옉 (媛濡쒖슜??Base -X)`);
        const dxResult = await findDx(-1);
        if (dxResult?.status_code === 200 && dxResult.data?.delta_x !== undefined) {
          dx = dxResult.data.delta_x;
          log_touchSensing.info(
            'touchSensing.findDx.center.result',
            `以묒븰 ?곗튂 ?꾨즺 (媛濡? depthOffset 誘몄쟻??`,
            { rawDx: dxResult.data.delta_x, dx },
          );
        }
      } else {
        log_touchSensing.info('touchSensing.findDx', `${point.name} 以묒븰 ?곗튂 ?쒖옉 (?몃줈?⑹젒 -X諛⑺뼢)`);
        const dxResult = await findDx(-1);
        if (dxResult?.status_code === 200 && dxResult.data?.delta_x !== undefined) {
          dx = dxResult.data.delta_x + depthOffset;
          log_touchSensing.info('touchSensing.findDx.result', `以묒븰 ?곗튂 ?꾨즺`, {
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
        log_touchSensing.info('touchSensing.findDy.left', `${point.name} 醫뚯륫 ?곗튂 ?쒖옉 (-Y諛⑺뼢)`);
        const dyLeftResult = await findDy(-1);
        if (dyLeftResult?.status_code === 200 && dyLeftResult.data?.delta_y !== undefined) {
          dy = dyLeftResult.data.delta_y + depthOffset;
          log_touchSensing.info('touchSensing.findDy.left.result', `醫뚯륫 ?곗튂 ?꾨즺`, {
            rawDy: dyLeftResult.data.delta_y,
            depthOffset,
            dy,
          });
        }
      }
      if (stopRef.current) return { dx, dy, dz, stopped: true };
      if (hasRight && !stopRef.current) {
        log_touchSensing.info('touchSensing.findDy.right', `${point.name} ?곗륫 ?곗튂 ?쒖옉 (+Y諛⑺뼢)`);
        const dyRightResult = await findDy(1);
        if (dyRightResult?.status_code === 200 && dyRightResult.data?.delta_y !== undefined) {
          const rightDy = dyRightResult.data.delta_y - depthOffset;
          dy = hasLeft ? (dy + rightDy) / 2 : rightDy;
          log_touchSensing.info('touchSensing.findDy.right.result', `?곗륫 ?곗튂 ?꾨즺`, {
            rawDy: dyRightResult.data.delta_y,
            depthOffset,
            dy,
            averaged: hasLeft,
          });
        }
      }
    } else if (hasSide) {
      const sideLabel = sideDirection === -1 ? 'P4 醫뚯륫(Base -Y)' : 'P10 ?곗륫(Base +Y)';
      if (!stopRef.current) {
        log_touchSensing.info('touchSensing.findDy.side', `${point.name} ${sideLabel} ?곗튂 ?쒖옉`);
        const dyResult = await findDy(sideDirection);
        if (dyResult?.status_code === 200 && dyResult.data?.delta_y !== undefined) {
          dy = dyResult.data.delta_y;
          log_touchSensing.info(
            'touchSensing.findDy.side.result',
            `${sideLabel} ?곗튂 ?꾨즺 (媛濡? depthOffset 誘몄쟻??`,
            { rawDy: dyResult.data.delta_y, dy },
          );
        }
      }
    }
    if (stopRef.current) return { dx, dy, dz, stopped: true };
    if (hasTop && !stopRef.current) {
      log_touchSensing.info('touchSensing.findDz.top', `${point.name} ?곷떒 ?곗튂 ?쒖옉 (Base +Z)`);
      const dzResult = await findDz(1);
      if (dzResult?.status_code === 200 && dzResult.data?.delta_z !== undefined) {
        dz = dzResult.data.delta_z;
        log_touchSensing.info('touchSensing.findDz.top.result', `?곷떒 ?곗튂 ?꾨즺`, { dz });
      }
    }
    if (stopRef.current) return { dx, dy, dz, stopped: true };
    if (hasBottomDir && !stopRef.current) {
      log_touchSensing.info('touchSensing.findDz.bottom', `${point.name} ?섎떒 ?곗튂 ?쒖옉 (Base -Z)`);
      const dzResult = await findDz(-1);
      if (dzResult?.status_code === 200 && dzResult.data?.delta_z !== undefined) {
        dz = hasTop ? (dz + dzResult.data.delta_z) / 2 : dzResult.data.delta_z;
        log_touchSensing.info('touchSensing.findDz.bottom.result', `?섎떒 ?곗튂 ?꾨즺`, { dz, averaged: hasTop });
      }
    }
  } catch (error) {
    log_touchSensing.error('touchSensing.point.error', `${point.name} ?곗튂 ?쇱떛 ?ㅻ쪟`, { error: String(error) });
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
  const modeLabel = isDryRun ? '?곗튂 ?뚯뒪?? : '?곗튂 ?쇱떛';
  log_touchSensing.info('touchSensing.start', `${modeLabel} ?쒖옉`, { isDryRun });
  const touchBottom = options?.touchBottom ?? false;
  const suppressAlerts = options?.suppressAlerts ?? false;
  const onUpdatePoint = options?.onUpdatePoint;
  const { sequence: sequenceSettings } = await loadWeldingSettings();
  const depthOffset = options?.depthOffset ?? sequenceSettings.touchOffsetDepth;
  log_touchSensing.info('touchSensing.settings', '?ㅼ젙 濡쒕뱶 ?꾨즺', {
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
    log_touchSensing.warn('touchSensing.noPoints', '??λ맂 ?곗묶 ?ъ씤?멸? ?놁쓬');
    showAlert('??λ맂 ?곗묶 ?ъ씤?멸? ?놁뒿?덈떎. (媛??뚰듃??2媛??댁긽 ?ъ씤???꾩슂)', {
      type: 'warning',
      title: '?ъ씤???놁쓬',
    });
    return [];
  }
  setCurrentPointIndex(0);
  const touchResults: TouchSensingResult[] = [];
  const Z_APPROACH_OFFSET = sequenceSettings.touchApproachOffset;
  // p9/p10: 媛숈? ?꾩튂(?곗륫 ?섑룊 肄붾꼫)???곗묶?섏뼱 ?덇퀬, U? 援ъ“臾쇨낵??媛꾩꽠?쇰줈
  // 濡쒖뺄 +X ?묎렐 ??異⑸룎(code=185) 諛섎났 ?뺤씤?? 濡쒖뺄 -Y濡??묎렐.
  const NEAR_UCELL_CORNER = ['p9', 'p10'];
  const getApproachOffsetPos = (pointId: string, offset: number): number[] =>
    NEAR_UCELL_CORNER.includes(pointId.toLowerCase()) ? [0, -offset, 0, 0, 0, 0] : [offset, 0, 0, 0, 0, 0];
  try {
    if (!robotState?.servo_enabled) {
      log_touchSensing.info('touchSensing.setup', '?쒕낫 ?쒖꽦??以?..');
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
      log_touchSensing.info('touchSensing.point', `[${i + 1}/${savedPoints.length}] ${point.name} ?곗튂 ?쇱떛`);
      const pointIdLower = point.id.toLowerCase();
      const directions = getTouchDirections(
        pointIdLower,
        sequenceSettings,
        touchBottom,
        point.touchBottom,
      );
      const { hasCenter, hasLeft, hasRight, hasTop, hasBottomDir, hasSide } = directions;
      log_touchSensing.info('touchSensing.directions', `${point.name} ?곗튂 諛⑺뼢`, {
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
        log_touchSensing.info('touchSensing.skipPoint', `${point.name} ?뚯뒪?명븷 硫??놁쓬 - ?ъ씤??嫄대꼫?`);
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
            `${point.name} ${NEAR_UCELL_CORNER.includes(pointIdLower) ? '-Y' : '+X'} ?ㅽ봽???꾩튂濡??대룞`,
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
            log_touchSensing.info('touchSensing.approach.stopped', '?묎렐 以??뺤???);
            break;
          }
          if (!approachResult.success) {
            log_touchSensing.error('touchSensing.approach.failed', `${point.name} ?묎렐 ?ㅽ뙣`);
            continue;
          }
        } else {
          // ?댁쟾 ?ъ씤?몄? 媛숈? 醫뚰몴?쇰룄, ?곗튂?쇱떛 ?먯깋+?꾪눜濡??ㅼ젣 ?꾩튂媛 ?곗묶 醫뚰몴?먯꽌
          // 誘몄꽭?섍쾶 踰쀬뼱???덉쓣 ???덉쑝誘濡??ㅽ봽???묎렐(?뺣났)留??앸왂?섍퀬 ?뺥솗 ?꾩튂 ?대룞? ??긽 ?ㅽ뻾?쒕떎.
          log_touchSensing.info(
            'touchSensing.samePosition',
            `${point.name} ?댁쟾 ?ъ씤?몄? ?숈씪 醫뚰몴 - ?ㅽ봽???묎렐 ?앸왂 (?뺥솗 ?꾩튂 ?대룞? ?ㅽ뻾)`,
          );
        }
        log_touchSensing.info('touchSensing.move', `${point.name} ?뺥솗???꾩튂濡??대룞`);
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
          log_touchSensing.info('touchSensing.move.stopped', '?대룞 以??뺤???);
          break;
        }
        if (!moveResult.success) {
          log_touchSensing.error('touchSensing.move.failed', `${point.name} ?대룞 ?ㅽ뙣`);
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
        log_touchSensing.info('touchSensing.stopped', '?곗튂 ?쇱떛 ?뺤???);
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
        log_touchSensing.info('touchSensing.updatePoint', `${point.name} ?곗튂 ?ㅽ봽?????, result);
      }
    }
    log_touchSensing.info('touchSensing.complete', `${modeLabel} ?꾨즺`, { results: touchResults, isDryRun });
    // ?곗튂?쇱떛 ?꾨즺 ????蹂듦? (?뺤? ?곹깭 ?꾨땲怨?home ??λ뤌 ?덉쓣 ?뚮쭔)
    if (!stopRef.current && !options?.skipHomeReturn) {
      const homePoint = teachingPoints.find(
        pt => pt.id === 'home' && pt.isSaved && pt.joints && pt.joints.length > 0,
      );
      if (homePoint?.joints) {
        try {
          if (lastPoint?.tcp) {
            const { x: lx, y: ly, z: lz, rx: lrx, ry: lry, rz: lrz } = lastPoint.tcp;
            log_touchSensing.info('touchSensing.homeReturn.retract', `${lastPoint.name} +X ?ㅽ봽?뗭쑝濡??꾪눜`);
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
          log_touchSensing.info('touchSensing.homeReturn', 'Home?쇰줈 蹂듦?');
          await moveToJointWithStopCheck(
            homePoint.joints,
            homePoint.moveSpeed || 50,
            homePoint.toolNum ?? 3,
            homePoint.userNum ?? 0,
            stopRef,
          );
        } catch (e) {
          log_touchSensing.warn('touchSensing.homeReturn.failed', 'Home 蹂듦? ?ㅽ뙣', { error: String(e) });
        }
      }
    }
    totalTimer.end('touchSensing.complete', `${modeLabel} ?꾨즺`);
    if (!suppressAlerts) {
      if (isDryRun) {
        showAlert(`${touchResults.length}媛??ъ씤???곗튂 ?뚯뒪???꾨즺`, {
          type: 'success',
          title: '?곗튂 ?뚯뒪???꾨즺',
        });
      } else {
        const summary = touchResults
          .map(r => {
            const pt = savedPoints.find(p => p.id === r.pointId);
            const showZ = pt?.touchBottom ?? (r.pointId === 'p1' || touchBottom);
            return `${r.pointId.toUpperCase()}: dx=${r.dx.toFixed(1)}, dy=${r.dy.toFixed(1)}${showZ ? `, dz=${r.dz.toFixed(1)}` : ''}`;
          })
          .join('\n');
        showAlert(summary, { type: 'success', title: '?곗튂 ?쇱떛 ?꾨즺' });
      }
    }
    return touchResults;
  } catch (error) {
    log_touchSensing.error('touchSensing.error', '?곗튂 ?쇱떛 ?ㅻ쪟', { error: String(error) });
    showAlert('?곗튂 ?쇱떛 以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎: ' + String(error), {
      type: 'error',
      title: '?곗튂 ?쇱떛 ?ㅻ쪟',
    });
    return touchResults;
  }
}
