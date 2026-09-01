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

export interface CenterlinePoint {
  schematic: { x: number; y: number };
  tcp: { x: number; y: number; z: number };
  distance: number;
  segmentIndex: number;
  segmentRatio: number;
  partIndex: number;
  segmentStartPointId: string;
  segmentEndPointId: string;
  orientation: { rx: number; ry: number; rz: number };
  toolNum: number;
  userNum: number;
}
export interface UseSchematicCalculationsProps {
  selectedWidth: number;
  selectedHeight: number | null;
  teachingPoints: TeachingPoint[];
}
export interface UseSchematicCalculationsReturn {
  getSchematicPosition: (pointId: string) => { x: number; y: number };
  centerlinePath: { x: number; y: number }[];
  fiveMMPoints: CenterlinePoint[];
}
export function useSchematicCalculations({
  selectedWidth,
  selectedHeight,
  teachingPoints,
}: UseSchematicCalculationsProps): UseSchematicCalculationsReturn {
  const getSchematicEndpoints = useCallback(() => {
    const halfWidth = (selectedWidth || 600) / 2;
    const halfHeight = (selectedHeight || 550) / 2;
    const margin = 50;
    return {
      p1: { x: -halfWidth - margin, y: halfHeight },
      p3: { x: -halfWidth - margin, y: -halfHeight },
      p4: { x: -halfWidth, y: -halfHeight - margin },
      p6: { x: -margin / 2, y: -halfHeight - margin },
      p7: { x: halfWidth + margin, y: halfHeight },
      p9: { x: halfWidth + margin, y: -halfHeight },
      p10: { x: halfWidth, y: -halfHeight - margin },
      p12: { x: margin / 2, y: -halfHeight - margin },
    };
  }, [selectedWidth, selectedHeight]);
  const getSchematicPosition = useCallback((pointId: string) => {
    const endpoints = getSchematicEndpoints();
    switch (pointId) {
      case 'home': return { x: 0, y: 0 };
      case 'p1': return endpoints.p1;
      case 'p3': return endpoints.p3;
      case 'p4': return endpoints.p4;
      case 'p6': return endpoints.p6;
      case 'p7': return endpoints.p7;
      case 'p9': return endpoints.p9;
      case 'p10': return endpoints.p10;
      case 'p12': return endpoints.p12;
    }
    const calcMiddlePosition = (
      startId: string,
      middleId: string,
      endId: string,
      startPos: { x: number; y: number },
      endPos: { x: number; y: number }
    ): { x: number; y: number } => {
      const startPt = teachingPoints.find(pt => pt.id === startId);
      const middlePt = teachingPoints.find(pt => pt.id === middleId);
      const endPt = teachingPoints.find(pt => pt.id === endId);
      if (!startPt?.tcp || !middlePt?.tcp || !endPt?.tcp) {
        return {
          x: (startPos.x + endPos.x) / 2,
          y: (startPos.y + endPos.y) / 2,
        };
      }
      const d1 = Math.sqrt(
        Math.pow(middlePt.tcp.x - startPt.tcp.x, 2) +
        Math.pow(middlePt.tcp.y - startPt.tcp.y, 2) +
        Math.pow(middlePt.tcp.z - startPt.tcp.z, 2)
      );
      const d2 = Math.sqrt(
        Math.pow(endPt.tcp.x - middlePt.tcp.x, 2) +
        Math.pow(endPt.tcp.y - middlePt.tcp.y, 2) +
        Math.pow(endPt.tcp.z - middlePt.tcp.z, 2)
      );
      const totalDist = d1 + d2;
      const ratio = totalDist > 0 ? d1 / totalDist : 0.5;
      return {
        x: startPos.x + (endPos.x - startPos.x) * ratio,
        y: startPos.y + (endPos.y - startPos.y) * ratio,
      };
    };
    switch (pointId) {
      case 'p2':
        return calcMiddlePosition('p3', 'p2', 'p1', endpoints.p3, endpoints.p1);
      case 'p5':
        return calcMiddlePosition('p4', 'p5', 'p6', endpoints.p4, endpoints.p6);
      case 'p8':
        return calcMiddlePosition('p9', 'p8', 'p7', endpoints.p9, endpoints.p7);
      case 'p11':
        return calcMiddlePosition('p10', 'p11', 'p12', endpoints.p10, endpoints.p12);
      default:
        return { x: 0, y: 0 };
    }
  }, [teachingPoints, getSchematicEndpoints]);
  const { centerlinePath, fiveMMPoints } = useMemo<{
    centerlinePath: { x: number; y: number }[];
    fiveMMPoints: CenterlinePoint[];
  }>(() => {
    const allPaths: { x: number; y: number }[] = [];
    const allPoints: CenterlinePoint[] = [];
    WELDING_PARTS.forEach((part, partIndex) => {
      const partPoints = part.points
        .map(pointId => teachingPoints.find(pt => pt.id === pointId))
        .filter((pt): pt is TeachingPoint =>
          pt !== undefined && pt.isSaved && pt.tcp !== null
        );
      if (partPoints.length < 2) return;
      const firstPartPoint = partPoints[0];
      const partOrientation = {
        rx: firstPartPoint.tcp!.rx,
        ry: firstPartPoint.tcp!.ry,
        rz: firstPartPoint.tcp!.rz,
      };
      const partToolNum = firstPartPoint.toolNum ?? 0;
      const partUserNum = firstPartPoint.userNum ?? 0;
      let partDistance = 0;
      for (let i = 0; i < partPoints.length; i++) {
        const pt = partPoints[i];
        const schematic = getSchematicPosition(pt.id);
        allPaths.push(schematic);
        if (i === 0 && partPoints.length > 1) {
          allPoints.push({
            schematic,
            tcp: { x: pt.tcp!.x, y: pt.tcp!.y, z: pt.tcp!.z },
            distance: 0,
            segmentIndex: 0,
            segmentRatio: 0,
            partIndex,
            segmentStartPointId: pt.id,
            segmentEndPointId: partPoints[1].id,
            orientation: partOrientation,
            toolNum: partToolNum,
            userNum: partUserNum,
          });
        }
      }
      for (let i = 0; i < partPoints.length - 1; i++) {
        const startPt = partPoints[i];
        const endPt = partPoints[i + 1];
        const startTcp = startPt.tcp!;
        const endTcp = endPt.tcp!;
        const startSchem = getSchematicPosition(startPt.id);
        const endSchem = getSchematicPosition(endPt.id);
        const tcpDx = endTcp.x - startTcp.x;
        const tcpDy = endTcp.y - startTcp.y;
        const tcpDz = endTcp.z - startTcp.z;
        const segLength = Math.sqrt(tcpDx * tcpDx + tcpDy * tcpDy + tcpDz * tcpDz);
        const INTERVAL = 5;
        const numPoints = Math.floor(segLength / INTERVAL);
        const startOrientation = { rx: startTcp.rx, ry: startTcp.ry, rz: startTcp.rz };
        const endOrientation = { rx: endTcp.rx, ry: endTcp.ry, rz: endTcp.rz };
        for (let j = 1; j <= numPoints; j++) {
          const ratio = (j * INTERVAL) / segLength;
          const distFromStart = partDistance + j * INTERVAL;
          const tcpX = startTcp.x + tcpDx * ratio;
          const tcpY = startTcp.y + tcpDy * ratio;
          const tcpZ = startTcp.z + tcpDz * ratio;
          const schemX = startSchem.x + (endSchem.x - startSchem.x) * ratio;
          const schemY = startSchem.y + (endSchem.y - startSchem.y) * ratio;
          const interpolatedOrientation = {
            rx: startOrientation.rx + ratio * (endOrientation.rx - startOrientation.rx),
            ry: startOrientation.ry + ratio * (endOrientation.ry - startOrientation.ry),
            rz: startOrientation.rz + ratio * (endOrientation.rz - startOrientation.rz),
          };
          allPoints.push({
            schematic: { x: schemX, y: schemY },
            tcp: { x: tcpX, y: tcpY, z: tcpZ },
            distance: distFromStart,
            segmentIndex: i,
            segmentRatio: ratio,
            partIndex,
            segmentStartPointId: startPt.id,
            segmentEndPointId: endPt.id,
            orientation: interpolatedOrientation,
            toolNum: partToolNum,
            userNum: partUserNum,
          });
        }
        partDistance += segLength;
      }
    });
    return { centerlinePath: allPaths, fiveMMPoints: allPoints };
  }, [teachingPoints, getSchematicPosition]);
  return {
    getSchematicPosition,
    centerlinePath,
    fiveMMPoints,
  };
}
