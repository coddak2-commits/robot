import { TeachingPoint, getExecutableParts, flattenExecutableParts, WEAVING_TYPE_OPTIONS, PartWeldEnabled, getPartBoundaryInfo } from '../..';
import { enableRobot, RealtimeRobotStatus, startArc, endArc, endWeave, getWeldingConfig, WeldingConfigData, moveToJointPositionNonBlocking, checkMotionDone, createWeldingLog, WeldingLogData, WeldingLogSegment, wireSearchEnd, findDx, findDy, findDz, setWeaveParams, startWeave, arcOn, arcOff, getRobotSettings, moveToCartesianPosition, getInverseKin, arcTraceControl, batchMoveL, BatchMovePoint, getWeldingPartOrder, isApiSuccess } from '../../../../lib';
import { createLogger } from '../../../../lib';
import React from 'react';
import { setWeldingPartOrder } from '../..';
import { WeldingSequenceSettings } from './weldingCoreTypes';

export interface TouchDirectionResult {
  hasCenter: boolean;
  hasLeft: boolean;
  hasRight: boolean;
  hasTop: boolean;
  hasBottomDir: boolean;
  hasSide: boolean;
  sideDirection: 1 | -1;
  isHorizontal: boolean;
}
export function getTouchDirections(
  pointIdLower: string,
  sequenceSettings: WeldingSequenceSettings,
  touchBottom: boolean,
  pointTouchBottom?: boolean
): TouchDirectionResult {
  let hasCenter = true, hasLeft = false, hasRight = false, hasTop = false, hasBottomDir = false, hasSide = false;
  let sideDirection: 1 | -1 = -1;
  const isHorizontal = ['p4', 'p5', 'p6', 'p10', 'p11', 'p12'].includes(pointIdLower);
  switch (pointIdLower) {
    case 'p1':
      hasCenter = sequenceSettings.p1TouchCenter;
      hasLeft = sequenceSettings.p1TouchLeft;
      hasRight = sequenceSettings.p1TouchRight;
      hasBottomDir = sequenceSettings.p1TouchBottom && (pointTouchBottom ?? touchBottom);
      break;
    case 'p2':
      hasCenter = sequenceSettings.p2TouchCenter;
      hasLeft = sequenceSettings.p2TouchLeft;
      hasRight = sequenceSettings.p2TouchRight;
      break;
    case 'p3':
      hasCenter = sequenceSettings.p3TouchCenter;
      hasLeft = sequenceSettings.p3TouchLeft;
      hasRight = sequenceSettings.p3TouchRight;
      hasBottomDir = sequenceSettings.p3TouchBottom;
      break;
    case 'p4':
      hasCenter = sequenceSettings.p4TouchCenter;
      hasTop = sequenceSettings.p4TouchTop;
      hasBottomDir = sequenceSettings.p4TouchBottom;
      hasSide = sequenceSettings.p4TouchSide;
      break;
    case 'p5':
      hasCenter = sequenceSettings.p5TouchCenter;
      hasTop = sequenceSettings.p5TouchTop;
      hasBottomDir = sequenceSettings.p5TouchBottom;
      break;
    case 'p6':
      hasCenter = sequenceSettings.p6TouchCenter;
      hasTop = sequenceSettings.p6TouchTop;
      hasBottomDir = sequenceSettings.p6TouchBottom;
      break;
    case 'p7':
      hasCenter = sequenceSettings.p7TouchCenter;
      hasLeft = sequenceSettings.p7TouchLeft;
      hasRight = sequenceSettings.p7TouchRight;
      break;
    case 'p8':
      hasCenter = sequenceSettings.p8TouchCenter;
      hasLeft = sequenceSettings.p8TouchLeft;
      hasRight = sequenceSettings.p8TouchRight;
      break;
    case 'p9':
      hasCenter = sequenceSettings.p9TouchCenter;
      hasLeft = sequenceSettings.p9TouchLeft;
      hasRight = sequenceSettings.p9TouchRight;
      hasBottomDir = sequenceSettings.p9TouchBottom;
      break;
    case 'p10':
      hasCenter = sequenceSettings.p10TouchCenter;
      hasTop = sequenceSettings.p10TouchTop;
      hasBottomDir = sequenceSettings.p10TouchBottom;
      hasSide = sequenceSettings.p10TouchSide;
      sideDirection = 1;
      break;
    case 'p11':
      hasCenter = sequenceSettings.p11TouchCenter;
      hasTop = sequenceSettings.p11TouchTop;
      hasBottomDir = sequenceSettings.p11TouchBottom;
      break;
    case 'p12':
      hasCenter = sequenceSettings.p12TouchCenter;
      hasTop = sequenceSettings.p12TouchTop;
      hasBottomDir = sequenceSettings.p12TouchBottom;
      break;
    default:
      hasCenter = true;
      hasLeft = !isHorizontal;
      hasRight = !isHorizontal;
      hasTop = isHorizontal;
      hasBottomDir = isHorizontal;
  }
  return { hasCenter, hasLeft, hasRight, hasTop, hasBottomDir, hasSide, sideDirection, isHorizontal };
}
