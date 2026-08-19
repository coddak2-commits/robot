import { useState, useCallback, useMemo, useRef } from 'react';
import { WELDING_PARTS } from '../..';
import type { WeldPoint, TransformFn } from './types';
interface DragState {
  pointId: string;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  isDragging: boolean;
  point: WeldPoint;
}
export function useDragAndDrop(
  weldPoints: WeldPoint[],
  transform: TransformFn,
  onReorderPoints?: (activeId: string, overId: string) => void,
  onWeldPointClick?: (point: WeldPoint) => void,
) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const validTargetIds = useMemo(() => {
    if (!dragState) return [] as string[];
    const part = WELDING_PARTS.find(p => (p.points as readonly string[]).includes(dragState.pointId));
    return part ? (part.points as readonly string[]).filter(id => id !== dragState.pointId) : [];
  }, [dragState]);
  const getSvgPoint = useCallback((e: React.MouseEvent | MouseEvent) => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const rect = svgRef.current.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }, []);
  const handlePointMouseDown = useCallback((point: WeldPoint, e: React.MouseEvent) => {
    if (!onReorderPoints || point.id === 'home') return;
    e.preventDefault();
    const svgPos = getSvgPoint(e);
    setDragState({
      pointId: point.id,
      startX: svgPos.x,
      startY: svgPos.y,
      currentX: svgPos.x,
      currentY: svgPos.y,
      isDragging: false,
      point,
    });
  }, [onReorderPoints, getSvgPoint]);
  const handleSvgMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragState) return;
    const svgPos = getSvgPoint(e);
    const dx = svgPos.x - dragState.startX;
    const dy = svgPos.y - dragState.startY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const isDragging = dragState.isDragging || dist >= 8;
    setDragState(prev => prev ? { ...prev, currentX: svgPos.x, currentY: svgPos.y, isDragging } : null);
    if (isDragging) {
      let closestId: string | null = null;
      let closestDist = 30;
      for (const targetId of validTargetIds) {
        const targetPoint = weldPoints.find(p => p.id === targetId);
        if (!targetPoint) continue;
        const tPos = transform({ x: targetPoint.x, y: targetPoint.y });
        const tdx = svgPos.x - tPos.x;
        const tdy = svgPos.y - tPos.y;
        const tDist = Math.sqrt(tdx * tdx + tdy * tdy);
        if (tDist < closestDist) {
          closestDist = tDist;
          closestId = targetId;
        }
      }
      setDropTargetId(closestId);
    }
  }, [dragState, validTargetIds, weldPoints, transform, getSvgPoint]);
  const handleSvgMouseUp = useCallback(() => {
    if (!dragState) return;
    if (dragState.isDragging && dropTargetId && onReorderPoints) {
      onReorderPoints(dragState.pointId, dropTargetId);
    } else if (!dragState.isDragging) {
      onWeldPointClick?.(dragState.point);
    }
    setDragState(null);
    setDropTargetId(null);
  }, [dragState, dropTargetId, onReorderPoints, onWeldPointClick]);
  const handleSvgMouseLeave = useCallback(() => {
    if (dragState) {
      setDragState(null);
      setDropTargetId(null);
    }
  }, [dragState]);
  return {
    svgRef,
    dragState,
    dropTargetId,
    validTargetIds,
    handlePointMouseDown,
    handleSvgMouseMove,
    handleSvgMouseUp,
    handleSvgMouseLeave,
  };
}
