import React, { useState, useEffect, useCallback, memo, useMemo } from 'react';
import { AlertTriangle, Edit3, Trash2, Check, X, Clock, FolderOpen, ChevronLeft, ChevronRight, Target, Shield, Settings, Wrench, History, RefreshCw, Save, Home, Circle, GripVertical, Play, Square, Pause, RotateCcw, Wifi, WifiOff, Zap, MapPin, Navigation, Crosshair } from 'lucide-react';
import { WeldingLogData, getWeldingLogs, deleteWeldingLogs, updateWeldingLog, RealtimeRobotStatus, getRealtimeRobotStatus, getWeldingPartOrder } from '../../../lib';
import Modal from 'react-modal';
import { useAlert } from '../../../contexts';
import { useGapAuth } from '../../../contexts/gapAuth';
import { TeachingPoint, WeaveParams, WEAVING_TYPE_OPTIONS, UCellData, HEIGHT_OPTIONS } from '..';
import { Button } from '../../../components/common';
import { RobotMoveData } from '../../../types/RobotData';
import { useSortable, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import type { WeldingPartOrderItem } from '../../../lib';
import { DEFAULT_WORKSPACE, DEFAULT_COLORS } from './unifiedCanvas/types';
import type { PartToggleConfig, UnifiedWorkspaceCanvasProps } from './unifiedCanvas/types';
import { GridLayer } from './unifiedCanvas/GridLayer';
import { UCellLayer } from './unifiedCanvas/UCellLayer';
import { PathLayer } from './unifiedCanvas/PathLayer';
import { CenterlineLayer } from './unifiedCanvas/CenterlineLayer';
import { DimensionLinesLayer } from './unifiedCanvas/DimensionLinesLayer';
import { WeldPointsLayer } from './unifiedCanvas/WeldPointsLayer';
import { PartToggleLayer } from './unifiedCanvas/PartToggleLayer';
import { CurrentPositionLayer } from './unifiedCanvas/CurrentPositionLayer';
import { useDragAndDrop } from './unifiedCanvas/useDragAndDrop';

/* eslint-disable react/prop-types */
const UnifiedWorkspaceCanvasComponent: React.FC<UnifiedWorkspaceCanvasProps> = ({
  ucellConfig,
  workspaceConfig = DEFAULT_WORKSPACE,
  pathHistory = [],
  currentPosition,
  pausedPosition,
  weldPoints = [],
  centerlinePath = [],
  centerlinePoints = [],
  onCenterlinePointClick,
  partWeldEnabled,
  partSavedPointCounts,
  onPartWeldToggle,
  ucellWidth = 600,
  ucellHeight = 550,
  canvasWidth = 600,
  canvasHeight = 450,
  colors = {},
  animated = true,
  onSegmentChange,
  onWeldPointClick,
  onReorderPoints,
  currentPointId,
  className = '',
}) => {
  const mergedColors = { ...DEFAULT_COLORS, ...colors };
  const { bounds: configBounds, showGrid, gridSpacing } = { ...DEFAULT_WORKSPACE, ...workspaceConfig };
  const bounds = useMemo(() => {
    if (pathHistory.length === 0) {
      return configBounds;
    }
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    pathHistory.forEach(p => {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    });
    if (minX >= configBounds.minX && maxX <= configBounds.maxX &&
        minY >= configBounds.minY && maxY <= configBounds.maxY) {
      return configBounds;
    }
    const rangeX = maxX - minX || 100;
    const rangeY = maxY - minY || 100;
    const margin = 0.2;
    return {
      minX: Math.min(configBounds.minX, minX - rangeX * margin),
      maxX: Math.max(configBounds.maxX, maxX + rangeX * margin),
      minY: Math.min(configBounds.minY, minY - rangeY * margin),
      maxY: Math.max(configBounds.maxY, maxY + rangeY * margin),
    };
  }, [pathHistory, configBounds]);
  const transform = useCallback(
    (pos: { x: number; y: number }) => {
      const scaleX = canvasWidth / (bounds.maxX - bounds.minX);
      const scaleY = canvasHeight / (bounds.maxY - bounds.minY);
      return {
        x: (pos.x - bounds.minX) * scaleX,
        y: canvasHeight - (pos.y - bounds.minY) * scaleY,
      };
    },
    [canvasWidth, canvasHeight, bounds]
  );
  const {
    svgRef,
    dragState,
    dropTargetId,
    validTargetIds,
    handlePointMouseDown,
    handleSvgMouseMove,
    handleSvgMouseUp,
    handleSvgMouseLeave,
  } = useDragAndDrop(weldPoints, transform, onReorderPoints, onWeldPointClick);
  const [partOrderMap, setPartOrderMap] = useState<Record<number, number>>({});
  useEffect(() => {
    getWeldingPartOrder().then((order: WeldingPartOrderItem[]) => {
      const map: Record<number, number> = {};
      order.forEach(o => { map[o.part_index] = o.execution_order; });
      setPartOrderMap(map);
    }).catch(() => {});
  }, []);
  const partToggles = useMemo<PartToggleConfig[]>(() => {
    if (!partWeldEnabled) return [];
    const halfWidth = ucellWidth / 2;
    const halfHeight = ucellHeight / 2;
    const getPointCount = (index: number) => partSavedPointCounts?.[index] ?? 0;
    return [
      {
        index: 0, name: '파트1', enabled: partWeldEnabled[0] ?? true,
        position: { x: -halfWidth / 2, y: -halfHeight + 50 }, labelOffset: { x: 0, y: 0 },
        canToggle: getPointCount(0) >= 2, savedPointCount: getPointCount(0),
        executionOrder: partOrderMap[0],
      },
      {
        index: 1, name: '파트2', enabled: partWeldEnabled[1] ?? true,
        position: { x: -halfWidth + 60, y: 0 }, labelOffset: { x: 0, y: 0 },
        canToggle: getPointCount(1) >= 2, savedPointCount: getPointCount(1),
        executionOrder: partOrderMap[1],
      },
      {
        index: 2, name: '파트3', enabled: partWeldEnabled[2] ?? true,
        position: { x: halfWidth / 2, y: -halfHeight + 50 }, labelOffset: { x: 0, y: 0 },
        canToggle: getPointCount(2) >= 2, savedPointCount: getPointCount(2),
        executionOrder: partOrderMap[2],
      },
      {
        index: 3, name: '파트4', enabled: partWeldEnabled[3] ?? true,
        position: { x: halfWidth - 60, y: 0 }, labelOffset: { x: 0, y: 0 },
        canToggle: getPointCount(3) >= 2, savedPointCount: getPointCount(3),
        executionOrder: partOrderMap[3],
      },
    ];
  }, [partWeldEnabled, partSavedPointCounts, ucellWidth, ucellHeight, partOrderMap]);
  return (
    <svg
      ref={svgRef}
      width={canvasWidth}
      height={canvasHeight}
      viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
      className={`drop-shadow-lg ${className}`}
      style={{ background: 'transparent' }}
      onMouseMove={handleSvgMouseMove}
      onMouseUp={handleSvgMouseUp}
      onMouseLeave={handleSvgMouseLeave}
    >
      {}
      {showGrid && (
        <GridLayer
          bounds={bounds}
          spacing={gridSpacing || 100}
          color={mergedColors.grid}
          transform={transform}
        />
      )}
      {}
      {ucellConfig && (
        <UCellLayer
          config={ucellConfig}
          color={mergedColors.ucell}
          transform={transform}
          onSegmentChange={onSegmentChange}
        />
      )}
      {}
      {pathHistory.length > 0 && (
        <PathLayer
          pathHistory={pathHistory}
          movePathColor={mergedColors.movePath}
          weldingPathColor={mergedColors.weldingPath}
          strokeWidth={2}
          transform={transform}
        />
      )}
      {}
      {centerlinePath.length > 0 && (
        <CenterlineLayer
          centerlinePath={centerlinePath}
          centerlinePoints={centerlinePoints}
          color={mergedColors.centerline}
          strokeWidth={1.5}
          transform={transform}
          onPointClick={onCenterlinePointClick}
        />
      )}
      {}
      {weldPoints.length > 0 && (
        <DimensionLinesLayer
          points={weldPoints}
          transform={transform}
        />
      )}
      {}
      {weldPoints.length > 0 && (
        <WeldPointsLayer
          points={weldPoints}
          color={mergedColors.weldPoint}
          completedColor={mergedColors.weldPointCompleted}
          transform={transform}
          onClick={dragState?.isDragging ? undefined : onWeldPointClick}
          draggingId={dragState?.isDragging ? dragState.pointId : null}
          dropTargetId={dropTargetId}
          validTargetIds={dragState?.isDragging ? validTargetIds : undefined}
          onMouseDown={onReorderPoints ? handlePointMouseDown : undefined}
          currentPointId={currentPointId}
        />
      )}
      {}
      {dragState?.isDragging && (
        <g style={{ pointerEvents: 'none' }}>
          <circle
            cx={dragState.currentX}
            cy={dragState.currentY}
            r={14}
            fill={dragState.point.completed ? mergedColors.weldPointCompleted : mergedColors.weldPoint}
            stroke="white"
            strokeWidth={2.5}
            opacity={0.8}
          />
          {dragState.point.order !== undefined && (
            <text
              x={dragState.currentX}
              y={dragState.currentY + 5}
              fill="white"
              fontSize="14"
              fontWeight="bold"
              textAnchor="middle"
            >
              {dragState.point.order}
            </text>
          )}
        </g>
      )}
      {}
      {partToggles.length > 0 && (
        <PartToggleLayer
          partToggles={partToggles}
          transform={transform}
          onToggle={onPartWeldToggle}
        />
      )}
      {}
      {pausedPosition && !currentPosition && (
        <g>
          {(() => {
            const pos = transform(pausedPosition);
            return (
              <>
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={15}
                  fill="none"
                  stroke={mergedColors.pausedPosition}
                  strokeWidth={2}
                  strokeDasharray="4 2"
                  opacity={0.6}
                >
                  <animate
                    attributeName="r"
                    values="12;20;12"
                    dur="2s"
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="opacity"
                    values="0.8;0.3;0.8"
                    dur="2s"
                    repeatCount="indefinite"
                  />
                </circle>
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={8}
                  fill={mergedColors.pausedPosition}
                  stroke="white"
                  strokeWidth={2}
                />
                <rect
                  x={pos.x - 4}
                  y={pos.y - 4}
                  width={2.5}
                  height={8}
                  fill="white"
                  rx={0.5}
                />
                <rect
                  x={pos.x + 1.5}
                  y={pos.y - 4}
                  width={2.5}
                  height={8}
                  fill="white"
                  rx={0.5}
                />
                <text
                  x={pos.x + 15}
                  y={pos.y - 12}
                  fill={mergedColors.pausedPosition}
                  fontSize="11"
                  fontWeight="bold"
                >
                  중단점
                </text>
                <text
                  x={pos.x + 15}
                  y={pos.y + 2}
                  fill="white"
                  fontSize="9"
                  opacity={0.8}
                >
                  ({pausedPosition.x.toFixed(0)}, {pausedPosition.y.toFixed(0)})
                </text>
              </>
            );
          })()}
        </g>
      )}
      {}
      {currentPosition && (
        <CurrentPositionLayer
          position={currentPosition}
          color={mergedColors.currentPosition}
          weldingColor={mergedColors.weldingPath}
          animated={animated}
          transform={transform}
        />
      )}
    </svg>
  );
};
export const UnifiedWorkspaceCanvas = memo(UnifiedWorkspaceCanvasComponent);
