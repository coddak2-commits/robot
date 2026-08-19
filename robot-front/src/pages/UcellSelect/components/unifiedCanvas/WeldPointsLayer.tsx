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
}> = memo(({ points, color, completedColor, transform, onClick, draggingId, dropTargetId, validTargetIds, onMouseDown }) => {
  return (
    <g className="weld-points-layer">
      {points.map((point) => {
        const transformed = transform({ x: point.x, y: point.y });
        const pointColor = point.completed ? completedColor : color;
        const isDragging = draggingId === point.id;
        const isDropTarget = dropTargetId === point.id;
        const isValidTarget = validTargetIds?.includes(point.id) && !isDragging;
        return (
          <g
            key={point.id}
            className="cursor-pointer"
            onClick={() => !draggingId && onClick?.(point)}
            onMouseDown={(e) => onMouseDown?.(point, e)}
          >
            {}
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
              r={isDragging ? 10 : isDropTarget ? 15 : 12}
              fill={isDropTarget ? '#60A5FA' : pointColor}
              stroke="white"
              strokeWidth={2}
              opacity={isDragging ? 0.3 : 0.9}
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
