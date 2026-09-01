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

export interface RobotPosition {
  x: number;
  y: number;
  z: number;
  isWelding?: boolean;
  timestamp?: number;
}
export interface RobotPathOverlayProps {
  pathHistory: RobotPosition[];
  currentPosition?: RobotPosition;
  viewBoxWidth?: number;
  viewBoxHeight?: number;
  workArea?: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
  pathColor?: string;
  weldingPathColor?: string;
  currentPositionColor?: string;
  pathStrokeWidth?: number;
  animated?: boolean;
}
const RobotPathOverlayComponent: React.FC<RobotPathOverlayProps> = ({
  pathHistory,
  currentPosition,
  viewBoxWidth = 400,
  viewBoxHeight = 300,
  workArea = { minX: -500, maxX: 500, minY: -500, maxY: 500 },
  pathColor = '#00F9FF',
  weldingPathColor = '#FF6B35',
  currentPositionColor = '#00FF88',
  pathStrokeWidth = 2,
  animated = true,
}) => {
  const transformCoordinate = useMemo(() => {
    const scaleX = viewBoxWidth / (workArea.maxX - workArea.minX);
    const scaleY = viewBoxHeight / (workArea.maxY - workArea.minY);
    return (pos: RobotPosition) => ({
      x: (pos.x - workArea.minX) * scaleX,
      y: viewBoxHeight - (pos.y - workArea.minY) * scaleY,
      isWelding: pos.isWelding,
    });
  }, [viewBoxWidth, viewBoxHeight, workArea]);
  const catmullRomToBezier = (
    points: { x: number; y: number }[],
    tension: number = 0.5
  ): string => {
    if (points.length < 2) return '';
    if (points.length === 2) {
      return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y} `;
    }
    let d = `M ${points[0].x} ${points[0].y} `;
    const alpha = 1 - tension;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(points.length - 1, i + 2)];
      const cp1x = p1.x + (p2.x - p0.x) * alpha / 6;
      const cp1y = p1.y + (p2.y - p0.y) * alpha / 6;
      const cp2x = p2.x - (p3.x - p1.x) * alpha / 6;
      const cp2y = p2.y - (p3.y - p1.y) * alpha / 6;
      d += `C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y} `;
    }
    return d;
  };
  const GAP_THRESHOLD = 25;
  const { movePath, weldingPath } = useMemo(() => {
    if (pathHistory.length < 2) {
      return { movePath: '', weldingPath: '' };
    }
    const moveSegments: { x: number; y: number }[][] = [];
    const weldSegments: { x: number; y: number }[][] = [];
    let currentMoveSegment: { x: number; y: number }[] = [];
    let currentWeldSegment: { x: number; y: number }[] = [];
    const pushAndClear = () => {
      if (currentMoveSegment.length > 0) { moveSegments.push(currentMoveSegment); currentMoveSegment = []; }
      if (currentWeldSegment.length > 0) { weldSegments.push(currentWeldSegment); currentWeldSegment = []; }
    };
    pathHistory.forEach((pos) => {
      const transformed = transformCoordinate(pos);
      const pt = { x: transformed.x, y: transformed.y };
      if (pos.isWelding) {
        if (currentMoveSegment.length > 0) {
          moveSegments.push(currentMoveSegment);
          currentMoveSegment = [];
        }
        const last = currentWeldSegment[currentWeldSegment.length - 1];
        if (last) {
          const dist = Math.sqrt((pt.x - last.x) ** 2 + (pt.y - last.y) ** 2);
          if (dist > GAP_THRESHOLD) {
            weldSegments.push(currentWeldSegment);
            currentWeldSegment = [];
          }
        }
        currentWeldSegment.push(pt);
      } else {
        if (currentWeldSegment.length > 0) {
          weldSegments.push(currentWeldSegment);
          currentWeldSegment = [];
        }
        const last = currentMoveSegment[currentMoveSegment.length - 1];
        if (last) {
          const dist = Math.sqrt((pt.x - last.x) ** 2 + (pt.y - last.y) ** 2);
          if (dist > GAP_THRESHOLD) {
            moveSegments.push(currentMoveSegment);
            currentMoveSegment = [];
          }
        }
        currentMoveSegment.push(pt);
      }
    });
    pushAndClear();
    const movePathStr = moveSegments.map(seg => catmullRomToBezier(seg)).join(' ');
    const weldPathStr = weldSegments.map(seg => catmullRomToBezier(seg)).join(' ');
    return { movePath: movePathStr, weldingPath: weldPathStr };
  }, [pathHistory, transformCoordinate]);
  const currentPosTransformed = useMemo(() => {
    if (!currentPosition) return null;
    return transformCoordinate(currentPosition);
  }, [currentPosition, transformCoordinate]);
  const startPoints = useMemo(() => {
    if (pathHistory.length === 0) return [];
    const points: { x: number; y: number; isWelding: boolean }[] = [];
    let lastWasWelding: boolean | null = null;
    pathHistory.forEach((pos) => {
      const transformed = transformCoordinate(pos);
      if (lastWasWelding !== pos.isWelding) {
        points.push({ ...transformed, isWelding: pos.isWelding || false });
        lastWasWelding = pos.isWelding || false;
      }
    });
    return points;
  }, [pathHistory, transformCoordinate]);
  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ width: '100%', height: '100%' }}
    >
      {}
      <defs>
        <linearGradient id="movePathGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={pathColor} stopOpacity="0.3" />
          <stop offset="100%" stopColor={pathColor} stopOpacity="1" />
        </linearGradient>
        <linearGradient id="weldPathGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={weldingPathColor} stopOpacity="0.3" />
          <stop offset="100%" stopColor={weldingPathColor} stopOpacity="1" />
        </linearGradient>
        {}
        <filter id="weldGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
        {}
        <radialGradient id="currentPosGradient">
          <stop offset="0%" stopColor={currentPositionColor} stopOpacity="1" />
          <stop offset="100%" stopColor={currentPositionColor} stopOpacity="0" />
        </radialGradient>
      </defs>
      {}
      {weldingPath && (
        <>
          {}
          <path
            d={weldingPath}
            fill="none"
            stroke={weldingPathColor}
            strokeWidth={pathStrokeWidth * 3}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.3}
            filter="url(#weldGlow)"
          />
          {}
          <path
            d={weldingPath}
            fill="none"
            stroke={weldingPathColor}
            strokeWidth={pathStrokeWidth * 1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
      {}
      {startPoints.filter(p => p.isWelding).map((point, index) => (
        <circle
          key={`start-${index}`}
          cx={point.x}
          cy={point.y}
          r={4}
          fill={weldingPathColor}
          opacity={0.8}
        />
      ))}
      {}
      {currentPosTransformed && (
        <g>
          {}
          {animated && (
            <circle
              cx={currentPosTransformed.x}
              cy={currentPosTransformed.y}
              r={12}
              fill="none"
              stroke={currentPositionColor}
              strokeWidth={2}
              opacity={0.5}
            >
              <animate
                attributeName="r"
                values="8;16;8"
                dur="1.5s"
                repeatCount="indefinite"
              />
              <animate
                attributeName="opacity"
                values="0.8;0.2;0.8"
                dur="1.5s"
                repeatCount="indefinite"
              />
            </circle>
          )}
          {}
          <circle
            cx={currentPosTransformed.x}
            cy={currentPosTransformed.y}
            r={6}
            fill={currentPosition?.isWelding ? weldingPathColor : currentPositionColor}
            stroke="white"
            strokeWidth={2}
          />
          {}
          {pathHistory.length > 1 && (
            <polygon
              points={`
                ${currentPosTransformed.x},${currentPosTransformed.y - 12}
                ${currentPosTransformed.x - 5},${currentPosTransformed.y - 6}
                ${currentPosTransformed.x + 5},${currentPosTransformed.y - 6}
              `}
              fill={currentPositionColor}
              opacity={0.8}
            />
          )}
        </g>
      )}
      {}
      {currentPosition && currentPosTransformed && (
        <text
          x={currentPosTransformed.x + 15}
          y={currentPosTransformed.y - 10}
          fill="white"
          fontSize="10"
          fontFamily="monospace"
          opacity={0.9}
        >
          ({currentPosition.x.toFixed(1)}, {currentPosition.y.toFixed(1)})
        </text>
      )}
    </svg>
  );
};
export const RobotPathOverlay = memo(RobotPathOverlayComponent);
