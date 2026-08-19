import React, { memo, useMemo } from 'react';
import type { WorkspaceConfig, TransformFn } from './types';
const GridLayer: React.FC<{
  bounds: WorkspaceConfig['bounds'];
  spacing: number;
  color: string;
  transform: TransformFn;
}> = memo(({ bounds, spacing, color, transform }) => {
  const lines = useMemo(() => {
    const result: React.ReactElement[] = [];
    for (let x = bounds.minX; x <= bounds.maxX; x += spacing) {
      const start = transform({ x, y: bounds.minY });
      const end = transform({ x, y: bounds.maxY });
      result.push(
        <line
          key={`v-${x}`}
          x1={start.x}
          y1={start.y}
          x2={end.x}
          y2={end.y}
          stroke={color}
          strokeWidth={x === 0 ? 1.5 : 0.5}
          opacity={x === 0 ? 0.6 : 0.3}
        />
      );
    }
    for (let y = bounds.minY; y <= bounds.maxY; y += spacing) {
      const start = transform({ x: bounds.minX, y });
      const end = transform({ x: bounds.maxX, y });
      result.push(
        <line
          key={`h-${y}`}
          x1={start.x}
          y1={start.y}
          x2={end.x}
          y2={end.y}
          stroke={color}
          strokeWidth={y === 0 ? 1.5 : 0.5}
          opacity={y === 0 ? 0.6 : 0.3}
        />
      );
    }
    return result;
  }, [bounds, spacing, color, transform]);
  return <g className="grid-layer">{lines}</g>;
});
GridLayer.displayName = 'GridLayer';
export { GridLayer };
