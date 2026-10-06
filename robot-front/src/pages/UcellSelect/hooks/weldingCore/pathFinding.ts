import { TeachingPoint, getExecutableParts, flattenExecutableParts, PartWeldEnabled } from '../..';
import { createLogger } from '../../../../lib';
import React from 'react';
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
  // [v1.1.225] 5 -> 1mm. 샘플 간격만큼 복귀 지점이 뒤로 밀릴 수 있어 줄였다.
  const INTERVAL_MM = 1;
  const ZERO_OFFSET = { dx: 0, dy: 0, dz: 0 };
  let minDistance = Infinity;
  let closestCenterlineTcp = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 };
  let closestCenterlineOffset = { dx: 0, dy: 0, dz: 0 };
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
    // [v1.1.225] 거리 비교를 '교시선'이 아니라 '실제 개선선(교시+터치보정)'과 한다.
    // currentTcp 는 보정이 적용된 경로 위에 있으므로, 교시선과 비교하면 최소거리가
    // 보정량만큼 부풀고 가까운 세그먼트 판정도 틀어진다. 2026-10-06 현장에서는
    // 보정이 약 20mm였고, 그만큼 떨어진 자리로 복귀해 아크를 켜 불량이 났다.
    const startOff = startPt.touchOffset ?? ZERO_OFFSET;
    const endOff = endPt.touchOffset ?? ZERO_OFFSET;
    const numPoints = Math.ceil(segmentLength / INTERVAL_MM) + 1;
    for (let i = 0; i < numPoints; i++) {
      const distanceFromStart = Math.min(i * INTERVAL_MM, segmentLength);
      const t = distanceFromStart / segmentLength;
      const pointX = startPt.tcp.x + dx * t;
      const pointY = startPt.tcp.y + dy * t;
      const pointZ = startPt.tcp.z + dz * t;
      const offDx = startOff.dx + (endOff.dx - startOff.dx) * t;
      const offDy = startOff.dy + (endOff.dy - startOff.dy) * t;
      const offDz = startOff.dz + (endOff.dz - startOff.dz) * t;
      const dist = Math.sqrt(
        Math.pow(pointX + offDx - currentTcp[0], 2) +
        Math.pow(pointY + offDy - currentTcp[1], 2) +
        Math.pow(pointZ + offDz - currentTcp[2], 2)
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
        closestCenterlineOffset = { dx: offDx, dy: offDy, dz: offDz };
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
    centerlineOffset: `[${closestCenterlineOffset.dx.toFixed(1)}, ${closestCenterlineOffset.dy.toFixed(1)}, ${closestCenterlineOffset.dz.toFixed(1)}]`,
    distance: minDistance.toFixed(2)
  });
  return {
    centerlineTcp: closestCenterlineTcp,
    centerlineOffset: closestCenterlineOffset,
    segmentStartIndex: closestSegmentIndex,
    closestTeachingPointIndex,
    distance: minDistance,
    segmentRatio,
    segmentLength
  };
};
