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
import { CenterlinePoint } from './useSchematicCalculations';

export interface PathPoint_usePathVisualization {
  x: number;
  y: number;
  z: number;
  isWelding: boolean;
  timestamp: number;
}
export interface CurrentPosition_usePathVisualization {
  x: number;
  y: number;
  z: number;
  isWelding: boolean;
}
export interface UsePathVisualizationProps {
  isTracking: boolean;
  trackingPathHistory: PathPoint_usePathVisualization[];
  trackingCurrentPosition: CurrentPosition_usePathVisualization | null;
  wsPathHistory: PathPoint_usePathVisualization[];
  wsRobotState: {
    tcp_position?: number[];
    is_welding?: boolean;
  } | null;
  fiveMMPoints: CenterlinePoint[];
}
export interface UsePathVisualizationReturn {
  robotPathHistory: RobotPosition[];
  currentRobotPosition: RobotPosition | undefined;
}
const MAX_CENTERLINE_DIST = 50;
const WEAVE_SCALE = 3.0;
const MAX_WEAVE_OFFSET = 15;
function findClosestCenterlinePoint(
  tcpX: number,
  tcpY: number,
  tcpZ: number,
  centerlinePoints: CenterlinePoint[]
): { point: CenterlinePoint; distance: number; perpOffset: number } | null {
  if (centerlinePoints.length === 0) return null;
  let bestPoint = centerlinePoints[0];
  let bestDist = Infinity;
  let bestPerpOffset = 0;
  for (const pt of centerlinePoints) {
    const dx = tcpX - pt.tcp.x;
    const dy = tcpY - pt.tcp.y;
    const dz = tcpZ - pt.tcp.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist < bestDist) {
      bestDist = dist;
      bestPoint = pt;
      bestPerpOffset = Math.abs(dx) > Math.abs(dy)
        ? (Math.abs(dx) > Math.abs(dz) ? dx : dz)
        : (Math.abs(dy) > Math.abs(dz) ? dy : dz);
    }
  }
  return { point: bestPoint, distance: bestDist, perpOffset: bestPerpOffset };
}
function tcpToSchematic(
  tcpX: number,
  tcpY: number,
  tcpZ: number,
  centerlinePoints: CenterlinePoint[],
  isWelding: boolean,
  timestamp?: number,
  skipDistanceCheck?: boolean
): RobotPosition | null {
  const result = findClosestCenterlinePoint(tcpX, tcpY, tcpZ, centerlinePoints);
  if (!result) return null;
  const { point, distance, perpOffset } = result;
  if (!skipDistanceCheck && distance > MAX_CENTERLINE_DIST) {
    return null;
  }
  let schemX = point.schematic.x;
  let schemY = point.schematic.y;
  const startPt = centerlinePoints.find(p => p.segmentStartPointId === point.segmentStartPointId && p.segmentRatio === 0);
  const endPt = centerlinePoints.find(p => p.segmentEndPointId === point.segmentEndPointId && p.segmentRatio === 1);
  if (startPt && endPt) {
    const segDx = endPt.schematic.x - startPt.schematic.x;
    const segDy = endPt.schematic.y - startPt.schematic.y;
    const segLen = Math.sqrt(segDx * segDx + segDy * segDy);
    if (segLen > 0.1) {
      const perpX = -segDy / segLen;
      const perpY = segDx / segLen;
      let weaveOffset = perpOffset * WEAVE_SCALE;
      weaveOffset = Math.max(-MAX_WEAVE_OFFSET, Math.min(MAX_WEAVE_OFFSET, weaveOffset));
      schemX += weaveOffset * perpX;
      schemY += weaveOffset * perpY;
    }
  } else {
    let weaveOffset = perpOffset * WEAVE_SCALE;
    weaveOffset = Math.max(-MAX_WEAVE_OFFSET, Math.min(MAX_WEAVE_OFFSET, weaveOffset));
    if (point.partIndex === 0 || point.partIndex === 2) {
      schemY += weaveOffset;
    } else {
      schemX += weaveOffset;
    }
  }
  return {
    x: schemX,
    y: schemY,
    z: tcpZ,
    isWelding,
    timestamp,
  };
}
interface MoveDirection {
  firstTcp: { x: number; y: number; z: number };
  dirX: number; dirY: number; dirZ: number;
  schemStartX: number; schemStartY: number;
  schemEndX: number; schemEndY: number;
  schemDx: number; schemDy: number; schemLen: number;
  schemPerpX: number; schemPerpY: number;
  totalTcpDist: number;
}
export function usePathVisualization({
  isTracking,
  trackingPathHistory,
  trackingCurrentPosition,
  wsPathHistory,
  wsRobotState,
  fiveMMPoints,
}: UsePathVisualizationProps): UsePathVisualizationReturn {
  const moveDirRef = useRef<MoveDirection | null>(null);
  useEffect(() => { if (!isTracking) moveDirRef.current = null; }, [isTracking]);
  const mapTcpToSchematic = useCallback((tcpX: number, tcpY: number, tcpZ: number, dir: MoveDirection): { x: number; y: number } => {
    const dx = tcpX - dir.firstTcp.x;
    const dy = tcpY - dir.firstTcp.y;
    const dz = tcpZ - dir.firstTcp.z;
    const proj = dx * dir.dirX + dy * dir.dirY + dz * dir.dirZ;
    const ratio = Math.max(0, Math.min(1.1, proj / dir.totalTcpDist));
    const px = dx - proj * dir.dirX;
    const py = dy - proj * dir.dirY;
    const pz = dz - proj * dir.dirZ;
    const perpDist = Math.sqrt(px * px + py * py + pz * pz);
    const sign = (px * (-dir.dirY) + py * dir.dirX) > 0 ? 1 : -1;
    const weave = Math.max(-MAX_WEAVE_OFFSET, Math.min(MAX_WEAVE_OFFSET, perpDist * sign * WEAVE_SCALE));
    return {
      x: dir.schemStartX + ratio * dir.schemDx + weave * dir.schemPerpX,
      y: dir.schemStartY + ratio * dir.schemDy + weave * dir.schemPerpY,
    };
  }, []);
  const robotPathHistory = useMemo<RobotPosition[]>(() => {
    const pathData = (isTracking || trackingPathHistory.length > 0) ? trackingPathHistory : wsPathHistory;
    if (pathData.length < 3 || fiveMMPoints.length === 0) return [];
    const fp = pathData[0];
    const lp = pathData[pathData.length - 1];
    const tcpDx = lp.x - fp.x; const tcpDy = lp.y - fp.y; const tcpDz = lp.z - fp.z;
    const tcpLen = Math.sqrt(tcpDx * tcpDx + tcpDy * tcpDy + tcpDz * tcpDz);
    if (tcpLen < 3) return [];
    const fcl = findClosestCenterlinePoint(fp.x, fp.y, fp.z, fiveMMPoints);
    const lcl = findClosestCenterlinePoint(lp.x, lp.y, lp.z, fiveMMPoints);
    if (!fcl || !lcl) return [];
    const sdx = lcl.point.schematic.x - fcl.point.schematic.x;
    const sdy = lcl.point.schematic.y - fcl.point.schematic.y;
    const slen = Math.sqrt(sdx * sdx + sdy * sdy);
    if (slen < 1) return [];
    const dir: MoveDirection = {
      firstTcp: { x: fp.x, y: fp.y, z: fp.z },
      dirX: tcpDx / tcpLen, dirY: tcpDy / tcpLen, dirZ: tcpDz / tcpLen,
      schemStartX: fcl.point.schematic.x, schemStartY: fcl.point.schematic.y,
      schemEndX: lcl.point.schematic.x, schemEndY: lcl.point.schematic.y,
      schemDx: sdx, schemDy: sdy, schemLen: slen,
      schemPerpX: -sdy / slen, schemPerpY: sdx / slen,
      totalTcpDist: tcpLen,
    };
    moveDirRef.current = dir;
    return pathData.map(p => {
      const s = mapTcpToSchematic(p.x, p.y, p.z, dir);
      return { x: s.x, y: s.y, z: 0, isWelding: p.isWelding ?? true, timestamp: p.timestamp };
    });
  }, [isTracking, trackingPathHistory, wsPathHistory, fiveMMPoints, mapTcpToSchematic]);
  const currentRobotPosition = useMemo<RobotPosition | undefined>(() => {
    let tcpPos: { x: number; y: number; z: number; isWelding: boolean } | null = null;
    if (isTracking && trackingCurrentPosition) {
      tcpPos = {
        x: trackingCurrentPosition.x,
        y: trackingCurrentPosition.y,
        z: trackingCurrentPosition.z,
        isWelding: trackingCurrentPosition.isWelding,
      };
    } else if (wsRobotState?.tcp_position && wsRobotState.tcp_position.length >= 3) {
      tcpPos = {
        x: wsRobotState.tcp_position[0],
        y: wsRobotState.tcp_position[1],
        z: wsRobotState.tcp_position[2],
        isWelding: wsRobotState.is_welding ?? false,
      };
    }
    if (!tcpPos || fiveMMPoints.length === 0) return undefined;
    const dir = moveDirRef.current;
    if (dir) {
      const s = mapTcpToSchematic(tcpPos.x, tcpPos.y, tcpPos.z, dir);
      return { x: s.x, y: s.y, z: 0, isWelding: tcpPos.isWelding };
    }
    const cl = findClosestCenterlinePoint(tcpPos.x, tcpPos.y, tcpPos.z, fiveMMPoints);
    if (cl) return { x: cl.point.schematic.x, y: cl.point.schematic.y, z: 0, isWelding: tcpPos.isWelding };
    return undefined;
  }, [isTracking, trackingCurrentPosition, trackingPathHistory, wsPathHistory, wsRobotState, fiveMMPoints]);
  return {
    robotPathHistory,
    currentRobotPosition,
  };
}
