import React, { memo } from 'react';
import type { PartToggleConfig, TransformFn } from './types';
const PartToggleLayer: React.FC<{
  partToggles: PartToggleConfig[];
  transform: TransformFn;
  onToggle?: (partIndex: number) => void;
}> = memo(({ partToggles, transform, onToggle }) => {
  return (
    <g className="part-toggle-layer">
      {partToggles.map((part) => {
        const pos = transform(part.position);
        const labelOffset = part.labelOffset || { x: 0, y: 20 };
        const isDisabled = !part.canToggle;
        const isEnabled = isDisabled ? false : part.enabled;
        return (
          <g
            key={part.index}
            className={isDisabled ? 'cursor-not-allowed' : 'cursor-pointer'}
            style={{ opacity: isDisabled ? 0.5 : 1 }}
            onClick={(e) => {
              e.stopPropagation();
              if (!isDisabled) {
                onToggle?.(part.index);
              }
            }}
          >
            {}
            <rect
              x={pos.x + labelOffset.x - 35}
              y={pos.y + labelOffset.y - 12}
              width={70}
              height={24}
              rx={4}
              fill={isEnabled ? 'rgba(34, 197, 94, 0.3)' : 'rgba(107, 114, 128, 0.3)'}
              stroke={isEnabled ? '#22c55e' : '#6b7280'}
              strokeWidth={1.5}
            />
            {}
            <rect
              x={pos.x + labelOffset.x - 30}
              y={pos.y + labelOffset.y - 7}
              width={14}
              height={14}
              rx={2}
              fill={isEnabled ? '#22c55e' : 'transparent'}
              stroke={isEnabled ? '#22c55e' : '#9ca3af'}
              strokeWidth={1.5}
            />
            {isEnabled && (
              <path
                d={`M ${pos.x + labelOffset.x - 27} ${pos.y + labelOffset.y} l 3 3 l 6 -6`}
                stroke="white"
                strokeWidth={2}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
            {}
            {part.executionOrder !== undefined && isEnabled && (
              <>
                <circle
                  cx={pos.x + labelOffset.x - 35 - 10}
                  cy={pos.y + labelOffset.y}
                  r={9}
                  fill="#0891b2"
                  stroke="#06b6d4"
                  strokeWidth={1.5}
                />
                <text
                  x={pos.x + labelOffset.x - 35 - 10}
                  y={pos.y + labelOffset.y + 4}
                  fill="white"
                  fontSize="11"
                  fontWeight="bold"
                  textAnchor="middle"
                >
                  {part.executionOrder + 1}
                </text>
              </>
            )}
            {}
            <text
              x={pos.x + labelOffset.x + 5}
              y={pos.y + labelOffset.y + 4}
              fill={isEnabled ? '#22c55e' : '#9ca3af'}
              fontSize="12"
              fontWeight="bold"
              textAnchor="middle"
            >
              {isEnabled ? '용접' : '패스'}
            </text>
            {isDisabled && (
              <title>포인트 {part.savedPointCount}개 (2개 이상 필요)</title>
            )}
          </g>
        );
      })}
    </g>
  );
});
PartToggleLayer.displayName = 'PartToggleLayer';
export { PartToggleLayer };
