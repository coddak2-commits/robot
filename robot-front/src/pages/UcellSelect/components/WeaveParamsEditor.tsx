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

export interface WeaveParamsEditorProps {
  point: TeachingPoint;
  onUpdateWeaveParams: (params: Partial<WeaveParams>) => void;
}
export function WeaveParamsEditor({ point, onUpdateWeaveParams }: WeaveParamsEditorProps) {
  return (
    <div className="border-t border-gray-700/50 pt-3">
      <h5 className="text-xs font-medium text-cyan-400 mb-2">
        위빙 세부 설정 ({WEAVING_TYPE_OPTIONS.find(opt => opt.value === point.weavingType)?.label})
      </h5>
      <div className="grid grid-cols-2 gap-2">
        {}
        <div className="space-y-1">
          <label className="block text-xs text-gray-500">주파수 (Hz)</label>
          <input
            type="number"
            min="0.5"
            max="10"
            step="0.1"
            value={point.weaveParams.weaveFrequency}
            onChange={e => { e.stopPropagation(); onUpdateWeaveParams({ weaveFrequency: Number(e.target.value) }); }}
            onClick={e => e.stopPropagation()}
            onFocus={e => e.target.select()}
            className="w-full px-2 py-1 bg-gray-900 border border-gray-600 rounded text-white text-xs focus:outline-none focus:border-cyan-500"
          />
        </div>
        {}
        <div className="space-y-1">
          <label className="block text-xs text-gray-500">범위/진폭 (mm)</label>
          <input
            type="number"
            min="0"
            max="20"
            step="0.5"
            value={point.weaveParams.weaveRange}
            onChange={e => { e.stopPropagation(); onUpdateWeaveParams({ weaveRange: Number(e.target.value) }); }}
            onClick={e => e.stopPropagation()}
            onFocus={e => e.target.select()}
            className="w-full px-2 py-1 bg-gray-900 border border-gray-600 rounded text-white text-xs focus:outline-none focus:border-cyan-500"
          />
        </div>
        {}
        <div className="space-y-1">
          <label className="block text-xs text-gray-500">좌측 체류 (ms)</label>
          <input
            type="number"
            min="0"
            max="1000"
            step="10"
            value={point.weaveParams.weaveLeftStayTime}
            onChange={e => { e.stopPropagation(); onUpdateWeaveParams({ weaveLeftStayTime: Number(e.target.value) }); }}
            onClick={e => e.stopPropagation()}
            onFocus={e => e.target.select()}
            className="w-full px-2 py-1 bg-gray-900 border border-gray-600 rounded text-white text-xs focus:outline-none focus:border-cyan-500"
          />
        </div>
        {}
        <div className="space-y-1">
          <label className="block text-xs text-gray-500">우측 체류 (ms)</label>
          <input
            type="number"
            min="0"
            max="1000"
            step="10"
            value={point.weaveParams.weaveRightStayTime}
            onChange={e => { e.stopPropagation(); onUpdateWeaveParams({ weaveRightStayTime: Number(e.target.value) }); }}
            onClick={e => e.stopPropagation()}
            onFocus={e => e.target.select()}
            className="w-full px-2 py-1 bg-gray-900 border border-gray-600 rounded text-white text-xs focus:outline-none focus:border-cyan-500"
          />
        </div>
        {}
        {point.weavingType === 'vertical_triangle' && (
          <>
            <div className="space-y-1">
              <label className="block text-xs text-gray-500">좌측 현길이 (mm)</label>
              <input
                type="number"
                min="0"
                max="20"
                step="0.5"
                value={point.weaveParams.weaveLeftRange}
                onChange={e => { e.stopPropagation(); onUpdateWeaveParams({ weaveLeftRange: Number(e.target.value) }); }}
                onClick={e => e.stopPropagation()}
                onFocus={e => e.target.select()}
                className="w-full px-2 py-1 bg-gray-900 border border-gray-600 rounded text-white text-xs focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs text-gray-500">우측 현길이 (mm)</label>
              <input
                type="number"
                min="0"
                max="20"
                step="0.5"
                value={point.weaveParams.weaveRightRange}
                onChange={e => { e.stopPropagation(); onUpdateWeaveParams({ weaveRightRange: Number(e.target.value) }); }}
                onClick={e => e.stopPropagation()}
                onFocus={e => e.target.select()}
                className="w-full px-2 py-1 bg-gray-900 border border-gray-600 rounded text-white text-xs focus:outline-none focus:border-cyan-500"
              />
            </div>
          </>
        )}
        {}
        {(point.weavingType === 'circle_cw' || point.weavingType === 'circle_ccw') && (
          <div className="space-y-1">
            <label className="block text-xs text-gray-500">회전비율 (%)</label>
            <input
              type="number"
              min="0"
              max="100"
              step="5"
              value={point.weaveParams.weaveCircleRadio}
              onChange={e => { e.stopPropagation(); onUpdateWeaveParams({ weaveCircleRadio: Number(e.target.value) }); }}
              onClick={e => e.stopPropagation()}
              onFocus={e => e.target.select()}
              className="w-full px-2 py-1 bg-gray-900 border border-gray-600 rounded text-white text-xs focus:outline-none focus:border-cyan-500"
            />
          </div>
        )}
      </div>
    </div>
  );
}
export const WeaveParamsEditor_WeaveParamsEditor = WeaveParamsEditor;
