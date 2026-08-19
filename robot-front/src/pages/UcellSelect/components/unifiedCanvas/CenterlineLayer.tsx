import React, { memo, useMemo } from 'react';
import type { CenterlinePoint, TransformFn } from './types';
const CenterlineLayer: React.FC<{
  centerlinePath: { x: number; y: number }[];
  centerlinePoints: CenterlinePoint[];
  color: string;
  strokeWidth: number;
  transform: TransformFn;
  onPointClick?: (point: CenterlinePoint) => void;
}> = memo(({ centerlinePoints, color, strokeWidth, transform, onPointClick }) => {
  const linePaths = useMemo(() => {
    if (centerlinePoints.length < 2) return [];
    const partGroups: Map<number, CenterlinePoint[]> = new Map();
    centerlinePoints.forEach(pt => {
      const partIdx = pt.partIndex ?? 0;
      if (!partGroups.has(partIdx)) {
        partGroups.set(partIdx, []);
      }
      partGroups.get(partIdx)!.push(pt);
    });
    const paths: string[] = [];
    partGroups.forEach((points) => {
      if (points.length < 2) return;
      const sortedPoints = [...points].sort((a, b) => a.distance - b.distance);
      const transformedPoints = sortedPoints.map(p => transform(p.schematic));
      let pathStr = `M ${transformedPoints[0].x} ${transformedPoints[0].y}`;
      for (let i = 1; i < transformedPoints.length; i++) {
        pathStr += ` L ${transformedPoints[i].x} ${transformedPoints[i].y}`;
      }
      paths.push(pathStr);
    });
    return paths;
  }, [centerlinePoints, transform]);
  return (
    <g className="centerline-layer">
      {}
      {linePaths.map((pathStr, idx) => (
        <path
          key={`centerline-${idx}`}
          d={pathStr}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.8}
        />
      ))}
      {}
      {centerlinePoints.map((point, index) => {
        const transformed = transform(point.schematic);
        return (
          <g
            key={index}
            className="centerline-point"
            style={{ cursor: onPointClick ? 'pointer' : 'default' }}
            onClick={() => onPointClick?.(point)}
          >
            <circle
              cx={transformed.x}
              cy={transformed.y}
              r={8}
              fill="transparent"
            />
            <circle
              cx={transformed.x}
              cy={transformed.y}
              r={3}
              fill={color}
              stroke="#000"
              strokeWidth={0.5}
            />
            <title>{`${point.distance.toFixed(0)}mm - 클릭하여 이동`}</title>
          </g>
        );
      })}
    </g>
  );
});
CenterlineLayer.displayName = 'CenterlineLayer';
export { CenterlineLayer };
