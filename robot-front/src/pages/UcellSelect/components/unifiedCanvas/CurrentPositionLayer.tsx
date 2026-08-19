import React, { memo } from 'react';
import type { RobotPosition, TransformFn } from './types';
const CurrentPositionLayer: React.FC<{
  position: RobotPosition;
  color: string;
  weldingColor: string;
  animated: boolean;
  transform: TransformFn;
}> = memo(({ position, color, weldingColor, animated, transform }) => {
  const transformed = transform({ x: position.x, y: position.y });
  const displayColor = position.isWelding ? weldingColor : color;
  return (
    <g className="current-position-layer">
      {}
      {animated && (
        <circle
          cx={transformed.x}
          cy={transformed.y}
          r={12}
          fill="none"
          stroke={displayColor}
          strokeWidth={2}
          opacity={0.5}
        >
          <animate attributeName="r" values="8;16;8" dur="1.5s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.8;0.2;0.8" dur="1.5s" repeatCount="indefinite" />
        </circle>
      )}
      {}
      <circle
        cx={transformed.x}
        cy={transformed.y}
        r={6}
        fill={displayColor}
        stroke="white"
        strokeWidth={2}
      />
      {}
      <text
        x={transformed.x + 15}
        y={transformed.y - 10}
        fill="white"
        fontSize="10"
        fontFamily="monospace"
        opacity={0.9}
      >
        ({position.x.toFixed(1)}, {position.y.toFixed(1)})
      </text>
    </g>
  );
});
CurrentPositionLayer.displayName = 'CurrentPositionLayer';
export { CurrentPositionLayer };
