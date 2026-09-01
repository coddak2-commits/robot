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

export interface SecondarySidebarProps {
  selectedType: 'normal' | 'collar_plate' | null;
  selectedHeight: number | null;
  selectedCell: UCellData | null;
  displayCells: UCellData[];
  selectedWidth: number;
  onClose: () => void;
  onHeightChange: (height: number) => void;
  onCellSelect: (cellId: number) => void;
}
export function SecondarySidebar({ selectedType, selectedHeight, selectedCell, displayCells, onClose, onHeightChange, onCellSelect }: SecondarySidebarProps) {
  return (
    <div className="w-64 bg-gray-800/95 backdrop-blur-sm border-r border-gray-700/50 flex-shrink-0">
      <div className="p-4 border-b border-gray-700/50 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">{selectedType === 'normal' ? '일반 U-Cell' : '컬러플레이트 U-Cell'}</h3>
        <button onClick={onClose} className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition">&#x2715;</button>
      </div>
      <div className="p-4 space-y-4">
        <div>
          <label className="block text-sm text-gray-400 mb-2">T-bar 높이 선택</label>
          <select
            className="w-full bg-gray-700 border border-gray-600 text-white rounded-xl px-4 py-3 focus:border-cyan-500 focus:outline-none transition"
            value={selectedHeight?.toString() || ''}
            onChange={e => onHeightChange(parseInt(e.target.value))}
          >
            <option value="" disabled>::높이::</option>
            {HEIGHT_OPTIONS.map(option => (<option key={option.value} value={option.value.toString()}>{option.label}</option>))}
          </select>
        </div>
        {selectedHeight ? (
          <div>
            <label className="block text-sm text-gray-400 mb-3">U-Cell 선택</label>
            <div className="grid grid-cols-2 gap-3">
              {displayCells.map(cell => (
                <button
                  key={cell.id}
                  onClick={() => onCellSelect(cell.id)}
                  className={`p-3 rounded-xl border-2 transition touch-manipulation ${
                    selectedCell?.id === cell.id ? `bg-gradient-to-br ${cell.color} border-white text-white` : 'bg-gray-700/50 border-gray-600 text-gray-300 hover:border-gray-500'
                  }`}
                >
                  <div className="text-xs font-medium">{cell.name.split(' ')[0]}</div>
                  <div className="text-sm font-bold">{cell.name.match(/\(.*\)/)?.[0]}</div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">먼저 높이를 선택해주세요</div>
        )}
      </div>
    </div>
  );
}
