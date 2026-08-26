import React, { memo } from 'react';
import type { WeldPoint, TransformFn } from './types';
const WeldPointsLayer: React.FC<{
  points: WeldPoint[];
  color: string;
  completedColor: string;
  transform: TransformFn;
  onClick?: (point: WeldPoint) => void;
  draggingId?: string | null;
  dropTargetId?: string | null;
  validTargetIds?: string[];
  onMouseDown?: (point: WeldPoint, e: React.MouseEvent) => void;
  currentPointId?: string | null;
}> = memo(({ points, color, completedColor, transform, onClick, draggingId, dropTargetId, validTargetIds, onMouseDown, currentPointId }) => {
  return (
    <g className="weld-points-layer">
      {points.map((point) => {
        const transformed = transform({ x: point.x, y: point.y });
        const pointColor = point.completed ? completedColor : color;
        const isDragging = draggingId === point.id;
        const isDropTarget = dropTargetId === point.id;
        const isValidTarget = validTargetIds?.includes(point.id) && !isDragging;
        const isCurrent = currentPointId === point.id;
        return (
          <g
            key={point.id}
            className="cursor-pointer"
            onClick={() => !draggingId && onClick?.(point)}
            onMouseDown={(e) => onMouseDown?.(point, e)}
          >
            {}
            {isCurrent && (
              <>
                <circle
                  cx={transformed.x}
                  cy={transformed.y}
                  r={22}
                  fill="none"
                  stroke="#00FF88"
                  strokeWidth={3}
                  opacity={0.9}
                >
                  <animate attributeName="r" values="18;26;18" dur="1.2s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.9;0.3;0.9" dur="1.2s" repeatCount="indefinite" />
                </circle>
              </>
            )}
            {isValidTarget && (
              <circle
                cx={transformed.x}
                cy={transformed.y}
                r={18}
                fill="none"
                stroke="white"
                strokeWidth={2}
                strokeDasharray="4 3"
                opacity={isDropTarget ? 0.9 : 0.4}
              />
            )}
            {}
            <circle
              cx={transformed.x}
              cy={transformed.y}
              r={isDragging ? 10 : isDropTarget ? 15 : isCurrent ? 15 : 12}
              fill={isDropTarget ? '#60A5FA' : isCurrent ? '#00FF88' : pointColor}
              stroke={isCurrent ? '#00FF88' : 'white'}
              strokeWidth={isCurrent ? 3 : 2}
              opacity={isDragging ? 0.3 : 0.95}
            />
            {}
            {point.order !== undefined && (
              <text
                x={transformed.x}
                y={transformed.y + 5}
                fill="white"
                fontSize="14"
                fontWeight="bold"
                textAnchor="middle"
                opacity={isDragging ? 0.3 : 1}
              >
                {point.order}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
});
WeldPointsLayer.displayName = 'WeldPointsLayer';
export { WeldPointsLayer };
