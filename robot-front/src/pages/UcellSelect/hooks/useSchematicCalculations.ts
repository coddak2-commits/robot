import { TeachingPoint, PART_ENABLE_GROUPS } from '..';
import { useCallback, useMemo } from 'react';

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
  // [v1.1.228] 도식의 끝점을 새 포인트 역할에 맞춘다.
  // 227 까지는 수직 눈금자가 P1~P3, 바닥 눈금자가 P4~P6 였다. 지금은 모서리(P4)가
  // 수직의 끝이고 수평은 P5 에서 시작하므로,
  //   좌측 수직 눈금자 : P1(위) -> P2 -> P3 -> P4(모서리)
  //   좌측 바닥 눈금자 : P5(모서리) -> P6
  // 로 바뀐다. 우측도 P7 -> P8 -> P9 -> P10 / P11 -> P12.
  // P2·P3 와 P8·P9 는 실제 TCP 거리 비율로 눈금자 위에 보간한다(아래 switch).
  const getSchematicEndpoints = useCallback(() => {
    const halfWidth = (selectedWidth || 600) / 2;
    const halfHeight = (selectedHeight || 550) / 2;
    const margin = 50;
    return {
      p1: { x: -halfWidth - margin, y: halfHeight },
      p4: { x: -halfWidth - margin, y: -halfHeight },
      p5: { x: -halfWidth, y: -halfHeight - margin },
      p6: { x: -margin / 2, y: -halfHeight - margin },
      p7: { x: halfWidth + margin, y: halfHeight },
      p10: { x: halfWidth + margin, y: -halfHeight },
      p11: { x: halfWidth, y: -halfHeight - margin },
      p12: { x: margin / 2, y: -halfHeight - margin },
    };
  }, [selectedWidth, selectedHeight]);
  const getSchematicPosition = useCallback((pointId: string) => {
    const endpoints = getSchematicEndpoints();
    switch (pointId) {
      case 'home': return { x: 0, y: 0 };
      case 'p1': return endpoints.p1;
      case 'p4': return endpoints.p4;
      case 'p5': return endpoints.p5;
      case 'p6': return endpoints.p6;
      case 'p7': return endpoints.p7;
      case 'p10': return endpoints.p10;
      case 'p11': return endpoints.p11;
      case 'p12': return endpoints.p12;
    }
    // [v1.1.228] fallbackRatio 추가. 한 눈금자에 중간점이 둘(P2·P3)이 되면서,
    // 아직 티칭 안 된 상태에서 둘 다 0.5 로 떨어지면 겹쳐 보인다.
    const calcMiddlePosition = (
      startId: string,
      middleId: string,
      endId: string,
      startPos: { x: number; y: number },
      endPos: { x: number; y: number },
      fallbackRatio = 0.5
    ): { x: number; y: number } => {
      const startPt = teachingPoints.find(pt => pt.id === startId);
      const middlePt = teachingPoints.find(pt => pt.id === middleId);
      const endPt = teachingPoints.find(pt => pt.id === endId);
      if (!startPt?.tcp || !middlePt?.tcp || !endPt?.tcp) {
        return {
          x: startPos.x + (endPos.x - startPos.x) * fallbackRatio,
          y: startPos.y + (endPos.y - startPos.y) * fallbackRatio,
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
    // [v1.1.228] 수직 눈금자가 P1 -> P4 로 길어졌고 그 위에 중간점이 둘이다.
    // P3 는 모서리에서 20mm 위라 실제 비율로는 끝에 바짝 붙는다(fallback 0.88).
    switch (pointId) {
      case 'p2':
        return calcMiddlePosition('p1', 'p2', 'p4', endpoints.p1, endpoints.p4, 0.5);
      case 'p3':
        return calcMiddlePosition('p1', 'p3', 'p4', endpoints.p1, endpoints.p4, 0.88);
      case 'p8':
        return calcMiddlePosition('p7', 'p8', 'p10', endpoints.p7, endpoints.p10, 0.5);
      case 'p9':
        return calcMiddlePosition('p7', 'p9', 'p10', endpoints.p7, endpoints.p10, 0.88);
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
    // [v1.1.228] 중심선도 화면 묶음(수평 / 수직+모서리)을 따라 그린다.
    // WELDING_PARTS 는 welding_part_order 가 비었을 때의 실행 기본값이라
    // 모서리 파트가 없다. 그걸로 그리면 P4 가 바닥 선에 끼어 꺾여 보인다.
    PART_ENABLE_GROUPS.forEach((group, partIndex) => {
      const partPoints = group
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
