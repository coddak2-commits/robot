import React, { memo, useMemo } from 'react';
import type { RobotPosition, TransformFn } from './types';
const PathLayer: React.FC<{
  pathHistory: RobotPosition[];
  movePathColor: string;
  weldingPathColor: string;
  strokeWidth: number;
  transform: TransformFn;
}> = memo(({ pathHistory, weldingPathColor, strokeWidth, transform }) => {
  const catmullRomToBezier = (
    points: { x: number; y: number }[],
    tension: number = 0.5
  ): string => {
    if (points.length < 2) return '';
    if (points.length === 2) {
      return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y} `;
    }
    let d = `M ${points[0].x} ${points[0].y} `;
    const alpha = 1 - tension;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(points.length - 1, i + 2)];
      const cp1x = p1.x + (p2.x - p0.x) * alpha / 6;
      const cp1y = p1.y + (p2.y - p0.y) * alpha / 6;
      const cp2x = p2.x - (p3.x - p1.x) * alpha / 6;
      const cp2y = p2.y - (p3.y - p1.y) * alpha / 6;
      d += `C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y} `;
    }
    return d;
  };
  const GAP_THRESHOLD = 80;
  const weldingPath = useMemo(() => {
    if (pathHistory.length < 2) return '';
    const segments: { x: number; y: number }[][] = [];
    let currentSegment: { x: number; y: number }[] = [];
    pathHistory.forEach((pos) => {
      const pt = transform({ x: pos.x, y: pos.y });
      const last = currentSegment[currentSegment.length - 1];
      if (last) {
        const dist = Math.sqrt((pt.x - last.x) ** 2 + (pt.y - last.y) ** 2);
        if (dist > GAP_THRESHOLD) {
          if (currentSegment.length > 0) segments.push(currentSegment);
          currentSegment = [];
        }
      }
      currentSegment.push(pt);
    });
    if (currentSegment.length > 0) segments.push(currentSegment);
    return segments.map(seg => catmullRomToBezier(seg)).join(' ');
  }, [pathHistory, transform]);
  return (
    <g className="path-layer">
      <defs>
        <filter id="weldGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      {weldingPath && (
        <>
          <path
            d={weldingPath}
            fill="none"
            stroke={weldingPathColor}
            strokeWidth={strokeWidth * 3}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.3}
            filter="url(#weldGlow)"
          />
          <path
            d={weldingPath}
            fill="none"
            stroke={weldingPathColor}
            strokeWidth={strokeWidth * 1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
    </g>
  );
});
PathLayer.displayName = 'PathLayer';
export { PathLayer };
