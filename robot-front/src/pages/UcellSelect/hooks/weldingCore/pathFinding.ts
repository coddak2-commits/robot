import { TeachingPoint, getExecutableParts, flattenExecutableParts, WEAVING_TYPE_OPTIONS, PartWeldEnabled, getPartBoundaryInfo } from '../..';
import { enableRobot, RealtimeRobotStatus, startArc, endArc, endWeave, getWeldingConfig, WeldingConfigData, moveToJointPositionNonBlocking, checkMotionDone, createWeldingLog, WeldingLogData, WeldingLogSegment, wireSearchEnd, findDx, findDy, findDz, setWeaveParams, startWeave, arcOn, arcOff, getRobotSettings, moveToCartesianPosition, getInverseKin, arcTraceControl, batchMoveL, BatchMovePoint, getWeldingPartOrder, isApiSuccess } from '../../../../lib';
import { createLogger } from '../../../../lib';
import React from 'react';
import { setWeldingPartOrder } from '../..';
import { ClosestCenterlineResult } from './weldingCoreTypes';

const log_pathFinding = createLogger('pathFinding');
export const findClosestCenterlinePoint = (
  teachingPoints: TeachingPoint[],
  currentTcp: number[],
  partWeldEnabled?: PartWeldEnabled
): ClosestCenterlineResult | null => {
  const executableParts = getExecutableParts(teachingPoints, partWeldEnabled);
  const weldingPoints = flattenExecutableParts(executableParts);
  if (weldingPoints.length < 2) return null;
  const INTERVAL_MM = 5;
  let minDistance = Infinity;
  let closestCenterlineTcp = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 };
  let closestSegmentIndex = 0;
  let closestDistanceAlongSegment = 0;
  for (let segIdx = 0; segIdx < weldingPoints.length - 1; segIdx++) {
    const startPt = weldingPoints[segIdx];
    const endPt = weldingPoints[segIdx + 1];
    if (!startPt.tcp || !endPt.tcp) continue;
    const dx = endPt.tcp.x - startPt.tcp.x;
    const dy = endPt.tcp.y - startPt.tcp.y;
    const dz = endPt.tcp.z - startPt.tcp.z;
    const segmentLength = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (segmentLength === 0) continue;
    const numPoints = Math.ceil(segmentLength / INTERVAL_MM) + 1;
    for (let i = 0; i < numPoints; i++) {
      const distanceFromStart = Math.min(i * INTERVAL_MM, segmentLength);
      const t = distanceFromStart / segmentLength;
      const pointX = startPt.tcp.x + dx * t;
      const pointY = startPt.tcp.y + dy * t;
      const pointZ = startPt.tcp.z + dz * t;
      const dist = Math.sqrt(
        Math.pow(pointX - currentTcp[0], 2) +
        Math.pow(pointY - currentTcp[1], 2) +
        Math.pow(pointZ - currentTcp[2], 2)
      );
      if (dist < minDistance) {
        minDistance = dist;
        const startRx = startPt.tcp!.rx ?? 0;
        const startRy = startPt.tcp!.ry ?? 0;
        const startRz = startPt.tcp!.rz ?? 0;
        const endRx = endPt.tcp!.rx ?? 0;
        const endRy = endPt.tcp!.ry ?? 0;
        const endRz = endPt.tcp!.rz ?? 0;
        closestCenterlineTcp = {
          x: pointX, y: pointY, z: pointZ,
          rx: startRx + t * (endRx - startRx),
          ry: startRy + t * (endRy - startRy),
          rz: startRz + t * (endRz - startRz),
        };
        closestSegmentIndex = segIdx;
        closestDistanceAlongSegment = distanceFromStart;
      }
    }
  }
  const startPt = weldingPoints[closestSegmentIndex];
  const endPt = weldingPoints[closestSegmentIndex + 1];
  const segmentLength = Math.sqrt(
    Math.pow(endPt.tcp!.x - startPt.tcp!.x, 2) +
    Math.pow(endPt.tcp!.y - startPt.tcp!.y, 2) +
    Math.pow(endPt.tcp!.z - startPt.tcp!.z, 2)
  );
  const closestTeachingPointIndex = closestDistanceAlongSegment < segmentLength / 2
    ? closestSegmentIndex
    : closestSegmentIndex + 1;
  const segmentRatio = segmentLength > 0 ? closestDistanceAlongSegment / segmentLength : 0;
  log_pathFinding.info('findClosestCenterlinePoint', '센터라인에서 가장 가까운 포인트 찾기', {
    centerlineTcp: `[${closestCenterlineTcp.x.toFixed(1)}, ${closestCenterlineTcp.y.toFixed(1)}, ${closestCenterlineTcp.z.toFixed(1)}]`,
    segmentStartIndex: closestSegmentIndex,
    segmentStart: weldingPoints[closestSegmentIndex]?.id,
    segmentEnd: weldingPoints[closestSegmentIndex + 1]?.id,
    segmentRatio: segmentRatio.toFixed(3),
    segmentLength: segmentLength.toFixed(1),
    closestTeachingPointIndex,
    closestTeachingPoint: weldingPoints[closestTeachingPointIndex]?.id,
    distance: minDistance.toFixed(2)
  });
  return {
    centerlineTcp: closestCenterlineTcp,
    segmentStartIndex: closestSegmentIndex,
    closestTeachingPointIndex,
    distance: minDistance,
    segmentRatio,
    segmentLength
  };
};
