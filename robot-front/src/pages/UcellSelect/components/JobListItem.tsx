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

export interface JobListItemProps {
  job: {
    id: number;
    name: string;
    cell_name?: string;
    saved_points?: number;
    total_points?: number;
    created_at?: string;
  };
  isSelected: boolean;
  isEditing: boolean;
  editingName: string;
  onSelect: () => void;
  onDelete: () => void;
  onEditStart: () => void;
  onEditChange: (name: string) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  isPendingDelete?: boolean;
  onUndoDelete?: () => void;
}
export function JobListItem({
  job,
  isSelected,
  isEditing,
  editingName,
  onSelect,
  onDelete,
  onEditStart,
  onEditChange,
  onEditSave,
  onEditCancel,
  isPendingDelete,
  onUndoDelete,
}: JobListItemProps) {
  if (isPendingDelete) {
    return (
      <div className="bg-gray-800/30 rounded-xl p-4 border border-red-500/30 flex items-center justify-between gap-3 opacity-70">
        <span className="text-sm text-gray-400 truncate">'{job.name}' 삭제됨</span>
        <button
          onClick={(e) => { e.stopPropagation(); onUndoDelete?.(); }}
          className="shrink-0 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium rounded-lg transition"
        >
          실행취소
        </button>
      </div>
    );
  }
  return (
    <div
      className={`bg-gray-800/50 rounded-xl p-4 border transition ${
        isEditing ? '' : 'cursor-pointer hover:border-cyan-500/50'
      } ${isSelected ? 'border-cyan-500' : 'border-gray-700/50'}`}
      onClick={() => !isEditing && onSelect()}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={editingName}
                onChange={(e) => onEditChange(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onEditSave();
                  if (e.key === 'Escape') onEditCancel();
                }}
                className="flex-1 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm"
                autoFocus
              />
              <button onClick={(e) => { e.stopPropagation(); onEditSave(); }} className="p-1.5 text-green-400 hover:bg-green-500/10 rounded">
                <Check className="w-4 h-4" />
              </button>
              <button onClick={(e) => { e.stopPropagation(); onEditCancel(); }} className="p-1.5 text-gray-400 hover:bg-gray-600 rounded">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <h4 className="font-medium text-white truncate">{job.name}</h4>
          )}
          <div className="flex items-center gap-3 text-xs text-gray-400 mt-1">
            {job.cell_name && <span>{job.cell_name}</span>}
            <span>포인트: {job.total_points ?? job.saved_points ?? 0}개</span>
            {job.created_at && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {new Date(job.created_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
              </span>
            )}
          </div>
        </div>
        {!isEditing && (
          <div className="flex items-center gap-1 ml-2">
            <button onClick={(e) => { e.stopPropagation(); onEditStart(); }} className="p-2 text-gray-500 hover:text-cyan-400 hover:bg-cyan-500/10 rounded-lg">
              <Edit3 className="w-4 h-4" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
export const JobListItem_JobListItem = JobListItem;
