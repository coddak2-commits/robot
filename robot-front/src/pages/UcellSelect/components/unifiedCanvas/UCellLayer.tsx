import React, { memo } from 'react';
import type { UCellConfig, TransformFn } from './types';
const UCellLayer: React.FC<{
  config: UCellConfig;
  color: string;
  transform: TransformFn;
  onSegmentChange?: (bar: 'left' | 'right' | 'bottom', segment: number, value: number) => void;
}> = memo(({ config, color, transform, onSegmentChange: _onSegmentChange }) => {
  void _onSegmentChange;
  const { type, cellName, width, height, thickness } = config;
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const isCollarPlate = type === 'collar_plate' || cellName.includes('Collar');
  const isUCell3 = cellName === 'U-cell (3번)' || cellName === 'U-cell(3번)';
  if (isUCell3) {
    const scale = Math.min(width / 460, height / 420);
    const offsetX = -230 * scale;
    const offsetY = -210 * scale;
    const transformPath = (localX: number, localY: number) => {
      const worldX = offsetX + localX * scale;
      const worldY = offsetY + localY * scale;
      return transform({ x: worldX, y: worldY });
    };
    const p1 = transformPath(104, 40);
    const p2 = transformPath(104, 270);
    const p3 = transformPath(356, 40);
    const p4 = transformPath(356, 270);
    const p5 = transformPath(170, 335);
    const p6 = transformPath(290, 335);
    return (
      <g className="ucell-layer">
        {}
        <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={color} strokeWidth={thickness * 0.8} strokeLinecap="round" />
        {}
        <line x1={p3.x} y1={p3.y} x2={p4.x} y2={p4.y} stroke={color} strokeWidth={thickness * 0.8} strokeLinecap="round" />
        {}
        <path
          d={`M ${p2.x} ${p2.y} Q ${transformPath(180, 270).x} ${transformPath(180, 270).y} ${p5.x} ${p5.y}`}
          stroke={color}
          strokeWidth={thickness * 0.8}
          strokeLinecap="round"
          fill="none"
        />
        {}
        <path
          d={`M ${p4.x} ${p4.y} Q ${transformPath(280, 270).x} ${transformPath(280, 270).y} ${p6.x} ${p6.y}`}
          stroke={color}
          strokeWidth={thickness * 0.8}
          strokeLinecap="round"
          fill="none"
        />
        {}
        <line x1={p5.x} y1={p5.y} x2={p6.x} y2={p6.y} stroke={color} strokeWidth={thickness * 0.8} strokeLinecap="round" />
      </g>
    );
  }
  const topLeft = transform({ x: -halfWidth, y: halfHeight });
  const topRight = transform({ x: halfWidth, y: halfHeight });
  const bottomLeft = transform({ x: -halfWidth, y: -halfHeight });
  const bottomRight = transform({ x: halfWidth, y: -halfHeight });
  const svgThickness = thickness * (topRight.x - topLeft.x) / width;
  return (
    <g className="ucell-layer">
      {isCollarPlate ? (
        <>
          {}
          <line x1={topLeft.x + svgThickness/2} y1={topLeft.y} x2={bottomLeft.x + svgThickness/2} y2={bottomLeft.y} stroke={color} strokeWidth={svgThickness} strokeLinecap="round" />
          <line x1={topRight.x - svgThickness/2} y1={topRight.y} x2={bottomRight.x - svgThickness/2} y2={bottomRight.y} stroke={color} strokeWidth={svgThickness} strokeLinecap="round" />
          <line x1={bottomLeft.x} y1={bottomLeft.y - svgThickness/2} x2={bottomRight.x} y2={bottomRight.y - svgThickness/2} stroke={color} strokeWidth={svgThickness} strokeLinecap="round" />
          {}
          <line
            x1={topLeft.x + (topRight.x - topLeft.x) * 0.6}
            y1={topLeft.y + (bottomLeft.y - topLeft.y) * 0.3}
            x2={topLeft.x + (topRight.x - topLeft.x) * 0.6}
            y2={bottomLeft.y - svgThickness/2}
            stroke={color}
            strokeWidth={svgThickness}
            strokeLinecap="round"
          />
          <line
            x1={topLeft.x + (topRight.x - topLeft.x) * 0.6}
            y1={topLeft.y + (bottomLeft.y - topLeft.y) * 0.3}
            x2={topRight.x - svgThickness/2}
            y2={topLeft.y + (bottomLeft.y - topLeft.y) * 0.3}
            stroke={color}
            strokeWidth={svgThickness}
            strokeLinecap="round"
          />
        </>
      ) : (
        <>
          {}
          <rect
            x={topLeft.x}
            y={topLeft.y}
            width={svgThickness}
            height={bottomLeft.y - topLeft.y}
            fill={color}
          />
          {}
          <rect
            x={topRight.x - svgThickness}
            y={topRight.y}
            width={svgThickness}
            height={bottomRight.y - topRight.y}
            fill={color}
          />
          {}
          <rect
            x={bottomLeft.x}
            y={bottomLeft.y - svgThickness}
            width={bottomRight.x - bottomLeft.x}
            height={svgThickness}
            fill={color}
          />
        </>
      )}
    </g>
  );
});
UCellLayer.displayName = 'UCellLayer';
export { UCellLayer };
