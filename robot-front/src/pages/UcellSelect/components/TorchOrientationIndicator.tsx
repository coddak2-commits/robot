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

const TORCH_CLAMP_ANGLE_DEG = 43.35;
interface TorchOrientationIndicatorProps {
  tcpRotation?: [number, number, number] | null;
  className?: string;
  style?: React.CSSProperties;
}
const Torch: React.FC<{ angle: number; color?: string }> = ({ angle, color = '#fbbf24' }) => (
  <g transform={`rotate(${angle})`}>
    {}
    <rect x="-4" y="-32" width="8" height="40" rx="2" fill={color} opacity="0.85" />
    {}
    <rect x="-3" y="8" width="6" height="14" rx="1" fill="#9ca3af" />
    {}
    <line x1="0" y1="22" x2="0" y2="28" stroke="#fb923c" strokeWidth="1.5" strokeLinecap="round" />
  </g>
);
const Workpiece: React.FC = () => (
  <g>
    <line x1="-40" y1="30" x2="40" y2="30" stroke="#475569" strokeWidth="2" />
    <line x1="-40" y1="32" x2="40" y2="32" stroke="#334155" strokeWidth="2" strokeDasharray="3,2" />
  </g>
);
const SideView: React.FC<{ label: string; angle: number; valueLabel: string }> = ({
  label,
  angle,
  valueLabel,
}) => (
  <div className="flex flex-col items-center">
    <div className="text-[10px] text-gray-400 mb-0.5">{label}</div>
    <svg width="60" height="70" viewBox="-30 -35 60 70" className="bg-gray-900/40 rounded">
      <Workpiece />
      <Torch angle={angle} />
    </svg>
    <div className="text-[30px] leading-tight text-cyan-300 font-mono font-bold mt-1">
      {valueLabel}
    </div>
  </div>
);
const TopView: React.FC<{ angle: number; valueLabel: string }> = ({ angle, valueLabel }) => (
  <div className="flex flex-col items-center">
    <div className="text-[10px] text-gray-400 mb-0.5">위에서</div>
    <svg width="60" height="70" viewBox="-30 -35 60 70" className="bg-gray-900/40 rounded">
      {}
      <rect
        x="-22"
        y="-22"
        width="44"
        height="44"
        fill="none"
        stroke="#475569"
        strokeWidth="1.5"
        strokeDasharray="2,2"
      />
      {}
      <line x1="-25" y1="0" x2="25" y2="0" stroke="#1e293b" strokeWidth="0.5" />
      <line x1="0" y1="-25" x2="0" y2="25" stroke="#1e293b" strokeWidth="0.5" />
      {}
      <g transform={`rotate(${angle})`}>
        <circle cx="0" cy="0" r="3" fill="#fbbf24" />
        <line
          x1="0"
          y1="0"
          x2="0"
          y2="-18"
          stroke="#fbbf24"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <polygon points="0,-22 -3,-16 3,-16" fill="#fbbf24" />
      </g>
    </svg>
    <div className="text-[30px] leading-tight text-cyan-300 font-mono font-bold mt-1">
      {valueLabel}
    </div>
  </div>
);
const TorchOrientationIndicator: React.FC<TorchOrientationIndicatorProps> = ({
  tcpRotation,
  className = '',
  style,
}) => {
  const rx = tcpRotation?.[0] ?? null;
  const ry = tcpRotation?.[1] ?? null;
  const rz = tcpRotation?.[2] ?? null;
  const connected = rx !== null && ry !== null && rz !== null;
  const fmt = (v: number | null) => (v === null ? '--' : `${v >= 0 ? '+' : ''}${v.toFixed(1)}°`);
  return (
    <div
      className={`bg-gray-800/85 backdrop-blur-sm border border-gray-700/60 rounded-xl px-3 py-2 shadow-lg ${className}`}
      style={style}
      title="용접 헤드 자세 (TCP rx/ry/rz)"
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
        <span className="text-[11px] font-medium text-amber-200">토치 자세</span>
        {!connected && <span className="text-[10px] text-red-400 ml-1">미연결</span>}
      </div>
      <div className="flex items-end gap-3">
        {}
        <SideView label="측면(ry)" angle={(ry ?? 0) + TORCH_CLAMP_ANGLE_DEG} valueLabel={fmt(ry)} />
        <SideView label="정면(rx)" angle={rx ?? 0} valueLabel={fmt(rx)} />
        <TopView angle={rz ?? 0} valueLabel={fmt(rz)} />
      </div>
    </div>
  );
};
export const TorchOrientationIndicator_TorchOrientationIndicator = TorchOrientationIndicator;
