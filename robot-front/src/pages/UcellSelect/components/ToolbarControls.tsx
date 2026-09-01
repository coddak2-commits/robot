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

export interface ToolbarControlsProps {
  wsConnected: boolean;
  isTracking: boolean;
  robotPathHistoryLength: number;
  wireFeeding: 'in' | 'out' | null;
  wireContinuous: boolean;
  autoTouchSensing: boolean;
  selectedWidth: number;
  selectedHeight: number | null;
  onToggleWsConnection: () => void;
  onClearPathHistory: () => void;
  onWireIn: () => void;
  onWireOut: () => void;
  onWireStop: () => void;
  onWireContinuousChange: (checked: boolean) => void;
  onAutoTouchSensingChange: (checked: boolean) => void;
  onWidthChange: (value: string) => void;
  onHeightChange: (value: string) => void;
}
export function ToolbarControls({
  wsConnected,
  isTracking,
  robotPathHistoryLength,
  wireFeeding,
  wireContinuous,
  autoTouchSensing,
  selectedWidth,
  selectedHeight,
  onToggleWsConnection,
  onClearPathHistory,
  onWireIn,
  onWireOut,
  onWireStop,
  onWireContinuousChange,
  onAutoTouchSensingChange,
  onWidthChange,
  onHeightChange,
}: ToolbarControlsProps) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onToggleWsConnection}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition ${
          wsConnected || isTracking
            ? 'bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30'
            : 'bg-gray-700/50 text-gray-400 border border-gray-600 hover:bg-gray-700'
        }`}
      >
        {wsConnected || isTracking ? (
          <Wifi className="w-3.5 h-3.5" />
        ) : (
          <WifiOff className="w-3.5 h-3.5" />
        )}
        {wsConnected || isTracking ? '경로 추적 중' : '경로 추적'}
      </button>
      {robotPathHistoryLength > 0 && (
        <button
          onClick={onClearPathHistory}
          className="px-2 py-1 rounded-lg text-xs font-medium bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition"
          title="경로 초기화"
        >
          경로 지우기
        </button>
      )}
      <button
        onClick={wireFeeding === 'in' ? onWireStop : onWireIn}
        className={`px-2 py-1 rounded-lg text-xs font-medium transition ${
          wireFeeding === 'in'
            ? 'bg-blue-500 text-white border border-blue-400 animate-pulse'
            : 'bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30'
        }`}
        title={wireContinuous ? '와이어 집어넣기 (연속)' : '와이어 집어넣기 (5mm)'}
      >
        {wireFeeding === 'in' ? '■ Stop' : 'Wire In'}
      </button>
      <button
        onClick={wireFeeding === 'out' ? onWireStop : onWireOut}
        className={`px-2 py-1 rounded-lg text-xs font-medium transition ${
          wireFeeding === 'out'
            ? 'bg-orange-500 text-white border border-orange-400 animate-pulse'
            : 'bg-orange-500/20 text-orange-400 border border-orange-500/30 hover:bg-orange-500/30'
        }`}
        title={wireContinuous ? '와이어 내보내기 (연속)' : '와이어 내보내기 (5mm)'}
      >
        {wireFeeding === 'out' ? '■ Stop' : 'Wire Out'}
      </button>
      <label className="flex items-center gap-1 text-xs text-gray-400 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={wireContinuous}
          onChange={e => onWireContinuousChange(e.target.checked)}
          className="w-3.5 h-3.5 rounded border-gray-600 bg-gray-700 text-cyan-500 focus:ring-cyan-500 focus:ring-offset-0"
        />
        연속
      </label>
      <button
        onClick={() => window.open('/gap/wire-inching', '_blank', 'width=900,height=750')}
        className="px-2 py-1 rounded-lg text-xs font-medium bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/30 transition"
        title="와이어 조정 (스틱아웃 세팅)"
      >
        와이어 조정
      </button>
      <div className="w-px h-4 bg-gray-600" />
      <label
        className="flex items-center gap-1.5 text-xs text-yellow-400 cursor-pointer select-none"
        title="용접 시작 전 터치센싱을 자동으로 수행합니다"
      >
        <input
          type="checkbox"
          checked={autoTouchSensing}
          onChange={e => onAutoTouchSensingChange(e.target.checked)}
          className="w-3.5 h-3.5 rounded border-gray-600 bg-gray-700 text-yellow-500 focus:ring-yellow-500 focus:ring-offset-0"
        />
        용접전 터치센싱
      </label>
      <div className="w-px h-4 bg-gray-600" />
      <div className="flex items-center gap-2">
        <span className="text-gray-400 text-xs">폭:</span>
        <input
          type="number"
          value={selectedWidth}
          onChange={e => onWidthChange(e.target.value)}
          className="w-16 bg-gray-700 border border-gray-600 text-white text-center rounded-lg px-1.5 py-0.5 text-xs focus:border-cyan-500 focus:outline-none"
          min="1"
        />
        <span className="text-gray-400 text-xs">높이:</span>
        <input
          type="number"
          value={selectedHeight || ''}
          onChange={e => onHeightChange(e.target.value)}
          className="w-16 bg-gray-700 border border-gray-600 text-white text-center rounded-lg px-1.5 py-0.5 text-xs focus:border-cyan-500 focus:outline-none"
          min="1"
          placeholder="---"
        />
        <span className="text-gray-400 text-xs">mm</span>
      </div>
    </div>
  );
}
export const ToolbarControls_ToolbarControls = ToolbarControls;
