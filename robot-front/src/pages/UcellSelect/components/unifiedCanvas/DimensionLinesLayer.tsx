import React, { memo } from 'react';
import type { WeldPoint, TransformFn } from './types';
const DimensionLinesLayer: React.FC<{
  points: WeldPoint[];
  transform: TransformFn;
}> = memo(({ points, transform }) => {
  const partSegments = [
    ['p4', 'p5', 'p6'],
    ['p3', 'p2', 'p1'],
    ['p10', 'p11', 'p12'],
    ['p9', 'p8', 'p7'],
  ];
  const pointMap = new Map(points.map(p => [p.id, p]));
  const dimensions: {
    from: { x: number; y: number };
    to: { x: number; y: number };
    distance: number;
    direction: 'horizontal' | 'vertical';
    side: 'outside-bottom' | 'outside-left' | 'outside-right' | 'outside-top';
  }[] = [];
  partSegments.forEach((seg, partIdx) => {
    for (let i = 0; i < seg.length - 1; i++) {
      const fromPt = pointMap.get(seg[i]);
      const toPt = pointMap.get(seg[i + 1]);
      if (!fromPt?.tcp || !toPt?.tcp) continue;
      const fromScreen = transform({ x: fromPt.x, y: fromPt.y });
      const toScreen = transform({ x: toPt.x, y: toPt.y });
      const dx = toPt.tcp.x - fromPt.tcp.x;
      const dy = toPt.tcp.y - fromPt.tcp.y;
      const dz = toPt.tcp.z - fromPt.tcp.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      let side: typeof dimensions[0]['side'];
      if (partIdx === 0) side = 'outside-bottom';
      else if (partIdx === 1) side = 'outside-left';
      else if (partIdx === 2) side = 'outside-bottom';
      else side = 'outside-right';
      dimensions.push({
        from: fromScreen,
        to: toScreen,
        distance: dist,
        direction: (partIdx === 0 || partIdx === 2) ? 'horizontal' : 'vertical',
        side,
      });
    }
  });
  if (dimensions.length === 0) return null;
  const OFFSET = 28;
  const TICK = 6;
  const FONT_SIZE = 10;
  return (
    <g className="dimension-lines-layer" opacity={0.85}>
      {dimensions.map((dim, idx) => {
        let x1: number, y1: number, x2: number, y2: number;
        let textX: number, textY: number;
        let tickD: 'x' | 'y';
        if (dim.side === 'outside-bottom') {
          x1 = dim.from.x; x2 = dim.to.x;
          y1 = y2 = Math.max(dim.from.y, dim.to.y) + OFFSET;
          textX = (x1 + x2) / 2;
          textY = y1 + 14;
          tickD = 'y';
        } else if (dim.side === 'outside-left') {
          y1 = dim.from.y; y2 = dim.to.y;
          x1 = x2 = Math.min(dim.from.x, dim.to.x) - OFFSET;
          textX = x1 - 4;
          textY = (y1 + y2) / 2 + 3;
          tickD = 'x';
        } else {
          y1 = dim.from.y; y2 = dim.to.y;
          x1 = x2 = Math.max(dim.from.x, dim.to.x) + OFFSET;
          textX = x1 + 4;
          textY = (y1 + y2) / 2 + 3;
          tickD = 'x';
        }
        return (
          <g key={`dim-${idx}`}>
            {}
            {tickD === 'y' ? (
              <>
                <line x1={dim.from.x} y1={dim.from.y + 4} x2={dim.from.x} y2={y1 + TICK / 2}
                  stroke="#8899aa" strokeWidth={0.7} strokeDasharray="2 2" />
                <line x1={dim.to.x} y1={dim.to.y + 4} x2={dim.to.x} y2={y2 + TICK / 2}
                  stroke="#8899aa" strokeWidth={0.7} strokeDasharray="2 2" />
              </>
            ) : dim.side === 'outside-left' ? (
              <>
                <line x1={dim.from.x - 4} y1={dim.from.y} x2={x1 - TICK / 2} y2={dim.from.y}
                  stroke="#8899aa" strokeWidth={0.7} strokeDasharray="2 2" />
                <line x1={dim.to.x - 4} y1={dim.to.y} x2={x2 - TICK / 2} y2={dim.to.y}
                  stroke="#8899aa" strokeWidth={0.7} strokeDasharray="2 2" />
              </>
            ) : (
              <>
                <line x1={dim.from.x + 4} y1={dim.from.y} x2={x1 + TICK / 2} y2={dim.from.y}
                  stroke="#8899aa" strokeWidth={0.7} strokeDasharray="2 2" />
                <line x1={dim.to.x + 4} y1={dim.to.y} x2={x2 + TICK / 2} y2={dim.to.y}
                  stroke="#8899aa" strokeWidth={0.7} strokeDasharray="2 2" />
              </>
            )}
            {}
            <line x1={x1} y1={y1} x2={x2} y2={y2}
              stroke="#aabbcc" strokeWidth={1} />
            {}
            {tickD === 'y' ? (
              <>
                <line x1={x1} y1={y1 - TICK / 2} x2={x1} y2={y1 + TICK / 2}
                  stroke="#aabbcc" strokeWidth={1} />
                <line x1={x2} y1={y2 - TICK / 2} x2={x2} y2={y2 + TICK / 2}
                  stroke="#aabbcc" strokeWidth={1} />
              </>
            ) : (
              <>
                <line x1={x1 - TICK / 2} y1={y1} x2={x1 + TICK / 2} y2={y1}
                  stroke="#aabbcc" strokeWidth={1} />
                <line x1={x2 - TICK / 2} y1={y2} x2={x2 + TICK / 2} y2={y2}
                  stroke="#aabbcc" strokeWidth={1} />
              </>
            )}
            {}
            <text
              x={textX}
              y={textY}
              fill="#ccdde8"
              fontSize={FONT_SIZE}
              fontFamily="monospace"
              textAnchor={dim.side === 'outside-left' ? 'end' : dim.side === 'outside-right' ? 'start' : 'middle'}
            >
              {dim.distance.toFixed(1)}mm
            </text>
          </g>
        );
      })}
    </g>
  );
});
DimensionLinesLayer.displayName = 'DimensionLinesLayer';
export { DimensionLinesLayer };
