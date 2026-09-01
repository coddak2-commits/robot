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

export interface LeftSidebarProps {
  selectedType: 'normal' | 'collar_plate' | null;
  onTypeSelect: (type: 'normal' | 'collar_plate') => void;
  onNavigate: (path: string) => void;
  onAdminClick: () => void;
}
export function LeftSidebar({ selectedType, onTypeSelect, onNavigate, onAdminClick }: LeftSidebarProps) {
  return (
    <div className="w-28 md:w-32 bg-gray-800/60 backdrop-blur-sm border-r border-gray-700/50 flex flex-col p-2 gap-2 flex-shrink-0 overflow-y-auto">
      <button
        onClick={() => onTypeSelect('normal')}
        className={`p-3 rounded-xl border-2 transition touch-manipulation flex flex-col items-center justify-center gap-1 ${
          selectedType === 'normal' ? 'bg-cyan-500/20 border-cyan-500 text-cyan-400' : 'bg-gray-700/50 border-gray-600 text-gray-300 hover:border-cyan-500/50 hover:bg-gray-700'
        }`}
      >
        <Target className="w-6 h-6" />
        <span className="text-xs font-medium text-center">U-Cell<br />(일반)</span>
      </button>
      <button
        onClick={() => onTypeSelect('collar_plate')}
        className={`p-3 rounded-xl border-2 transition touch-manipulation flex flex-col items-center justify-center gap-1 ${
          selectedType === 'collar_plate' ? 'bg-orange-500/20 border-orange-500 text-orange-400' : 'bg-gray-700/50 border-gray-600 text-gray-300 hover:border-orange-500/50 hover:bg-gray-700'
        }`}
      >
        <Target className="w-6 h-6" />
        <span className="text-xs font-medium text-center">U-Cell<br />(컬러)</span>
      </button>
      <div className="border-t border-gray-700/50 my-1" />
      <button onClick={() => onNavigate('/settings/welding')} className="p-2 rounded-xl border-2 bg-gray-700/50 border-gray-600 text-gray-300 hover:border-gray-500 hover:bg-gray-700 transition touch-manipulation flex flex-col items-center justify-center gap-1">
        <Wrench className="w-4 h-4" /><span className="text-xs font-medium">용접 설정</span>
      </button>
      <button onClick={() => onNavigate('/settings/robot')} className="p-2 rounded-xl border-2 bg-gray-700/50 border-gray-600 text-gray-300 hover:border-gray-500 hover:bg-gray-700 transition touch-manipulation flex flex-col items-center justify-center gap-1">
        <Settings className="w-4 h-4" /><span className="text-xs font-medium">로봇 설정</span>
      </button>
      <button onClick={onAdminClick} className="p-2 rounded-xl border-2 bg-gray-700/50 border-gray-600 text-gray-300 hover:border-gray-500 hover:bg-gray-700 transition touch-manipulation flex flex-col items-center justify-center gap-1">
        <Shield className="w-4 h-4" /><span className="text-xs font-medium">관리자</span>
      </button>
    </div>
  );
}
