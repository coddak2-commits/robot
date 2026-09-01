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
import { WeaveParamsEditor } from './WeaveParamsEditor';

const getPostureFromPointId = (pointId: string): 'vertical' | 'horizontal' => {
  const m = pointId.match(/^P(\d+)$/i);
  if (!m) return 'vertical';
  const n = Number(m[1]);
  if ((n >= 4 && n <= 6) || (n >= 10 && n <= 12)) return 'horizontal';
  return 'vertical';
};
export interface PointItemProps {
  point: TeachingPoint;
  isSelected: boolean;
  isRunning: boolean;
  isTeachingPolling: boolean;
  teachingRobotConnected: boolean;
  isDraggable?: boolean;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
  onSelect: () => void;
  onSavePosition: () => void;
  onClearPoint: () => void;
  onMoveToPoint: () => void;
  onUpdateSpeed: (speed: number, velMode?: 0 | 1) => void;
  onUpdateWeldParams: (voltage: number | null, current: number | null) => void;
  onUpdateGap: (gap: number) => void;
  gapThicknessMm: number;
  onUpdateWeaveParams: (params: Partial<WeaveParams>) => void;
  onUpdateWeavingType: (type: string | null) => void;
  onApplyParamsToBlock: () => void;
  onApplyParamsToAll: () => void;
  onSaveJob: () => void;
}
export function PointItem({
  point,
  isSelected,
  isRunning,
  isTeachingPolling,
  teachingRobotConnected,
  isDraggable = false,
  dragHandleProps,
  onSelect,
  onSavePosition,
  onClearPoint,
  onMoveToPoint,
  onUpdateSpeed,
  onUpdateWeldParams,
  onUpdateGap,
  gapThicknessMm,
  onUpdateWeaveParams,
  onUpdateWeavingType,
  onApplyParamsToBlock,
  onApplyParamsToAll,
  onSaveJob,
}: PointItemProps) {
  return (
    <div
      onClick={onSelect}
      className={`rounded-lg py-1 px-2 border cursor-pointer transition ${
        isSelected
          ? 'bg-purple-500/20 border-purple-500'
          : point.isSaved
            ? 'bg-green-500/10 border-green-500/30 hover:border-green-500/50'
            : 'bg-gray-800/50 border-gray-700/50 hover:border-gray-600'
      }`}
    >
      <div className="flex items-center gap-1.5">
        {}
        {isDraggable && (
          <div
            {...dragHandleProps}
            onClick={e => e.stopPropagation()}
            className="cursor-grab active:cursor-grabbing p-0.5 -ml-1 text-gray-500 hover:text-gray-300"
            title="드래그하여 순서 변경"
          >
            <GripVertical className="w-3 h-3" />
          </div>
        )}
        {point.id === 'home' ? (
          <Home className={`w-3 h-3 ${point.isSaved ? 'text-green-400' : 'text-gray-500'}`} />
        ) : (
          <Circle className={`w-3 h-3 ${point.isSaved ? 'text-green-400' : 'text-gray-500'}`} />
        )}
        <span className={`text-sm ${point.isSaved ? 'text-white' : 'text-gray-400'}`}>
          {point.name}
        </span>
        {point.isSaved && (
          <span className="text-[10px] text-green-400 bg-green-500/20 px-1 py-0.5 rounded leading-none">
            저장됨
          </span>
        )}
      </div>
      {}
      {isSelected && (
        <div className="mt-2 pt-2 border-t border-gray-700/50 space-y-2">
          {}
          {point.isSaved && point.tcp && (
            <div className="text-xs text-gray-500 font-mono bg-gray-800/50 rounded px-2 py-1.5">
              [{point.tcp.x.toFixed(1)}, {point.tcp.y.toFixed(1)}, {point.tcp.z.toFixed(1)},{' '}
              {point.tcp.rx.toFixed(1)}, {point.tcp.ry.toFixed(1)}, {point.tcp.rz.toFixed(1)}]
            </div>
          )}
          {}
          {}
          <div className={`grid gap-2 ${point.id !== 'home' ? 'grid-cols-5' : 'grid-cols-1'}`}>
            {point.id !== 'home' && (
              <div className="space-y-1">
                <label className="block text-xs text-gray-400">GAP (mm)</label>
                <input
                  type="number"
                  min="0"
                  max="6"
                  step="0.1"
                  value={point.gap ? point.gap : ''}
                  placeholder="0"
                  onChange={async e => {
                    e.stopPropagation();
                    const raw = e.target.value;
                    const newGap = raw === '' ? 0 : Math.min(6, Math.max(0, Number(raw)));
                    onUpdateGap(newGap);
                    if (newGap > 0 && typeof localStorage !== 'undefined' && localStorage.getItem('gap_token')) {
                      try {
                        const mod = await import('../../../lib/gapApi');
                        const res = await mod.paramApi.lookup({
                          posture: getPostureFromPointId(point.id),
                          gap: newGap,
                          thickness: gapThicknessMm,
                          material: 'SS400',
                          joint: 'fillet',
                        });
                        if (res.param) {
                          onUpdateWeldParams(Number(res.param.voltage_v), res.param.current_a);
                          onUpdateSpeed(res.param.speed_cpm, 1);
                        }
                      } catch (err) {
                        console.warn('[gap] auto-load failed:', err);
                      }
                    }
                  }}
                  onClick={e => e.stopPropagation()}
                  onFocus={e => e.target.select()}
                  className="w-full px-2 py-1.5 bg-gray-900 border border-gray-600 rounded text-white text-sm focus:outline-none focus:border-cyan-500"
                  title="갭 입력 시 갭 시스템에 로그인되어 있으면 전류/전압/속도가 자동 로드됩니다"
                />
              </div>
            )}
            <div className="space-y-1">
              <label className="block text-xs text-gray-400">
                속도 ({point.id === 'home' ? '%' : 'CPM'})
              </label>
              {point.id === 'home' ? (
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="1"
                    max="100"
                    value={point.moveSpeed}
                    onChange={e => {
                      e.stopPropagation();
                      onUpdateSpeed(Number(e.target.value), 0);
                    }}
                    onClick={e => e.stopPropagation()}
                    className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                  />
                  <span className="text-xs text-cyan-400 font-mono w-8 text-right">
                    {point.moveSpeed}%
                  </span>
                </div>
              ) : (
                <input
                  type="number"
                  min="1"
                  max="200"
                  value={point.moveSpeed}
                  onChange={e => {
                    e.stopPropagation();
                    onUpdateSpeed(Number(e.target.value), 1);
                  }}
                  onClick={e => e.stopPropagation()}
                  onFocus={e => e.target.select()}
                  className="w-full px-2 py-1.5 bg-gray-900 border border-gray-600 rounded text-white text-sm focus:outline-none focus:border-cyan-500"
                />
              )}
            </div>
            {point.id !== 'home' && (
              <>
                <div className="space-y-1">
                  <label className="block text-xs text-gray-400">전류 (A)</label>
                  <input
                    type="number"
                    min="50"
                    max="400"
                    value={point.weldCurrent ?? 220}
                    onChange={e => {
                      e.stopPropagation();
                      onUpdateWeldParams(point.weldVoltage, Number(e.target.value));
                    }}
                    onClick={e => e.stopPropagation()}
                    onFocus={e => e.target.select()}
                    className="w-full px-2 py-1.5 bg-gray-900 border border-gray-600 rounded text-white text-sm focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs text-gray-400">전압 (V)</label>
                  <input
                    type="number"
                    min="10"
                    max="40"
                    step="0.1"
                    value={point.weldVoltage ?? 24}
                    onChange={e => {
                      e.stopPropagation();
                      onUpdateWeldParams(Number(e.target.value), point.weldCurrent);
                    }}
                    onClick={e => e.stopPropagation()}
                    onFocus={e => e.target.select()}
                    className="w-full px-2 py-1.5 bg-gray-900 border border-gray-600 rounded text-white text-sm focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs text-gray-400">위빙</label>
                  <select
                    value={point.weavingType ?? 'none'}
                    onChange={e => {
                      e.stopPropagation();
                      onUpdateWeavingType(e.target.value);
                    }}
                    onClick={e => e.stopPropagation()}
                    className="w-full px-2 py-1.5 bg-gray-900 border border-gray-600 rounded text-white text-sm focus:outline-none focus:border-cyan-500"
                  >
                    {WEAVING_TYPE_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>
          {}
          {point.id !== 'home' && point.weavingType && point.weavingType !== 'none' && (
            <WeaveParamsEditor point={point} onUpdateWeaveParams={onUpdateWeaveParams} />
          )}
          {}
          <div className="flex gap-2 pt-2 border-t border-gray-700/50">
            {isTeachingPolling && teachingRobotConnected && (
              <button
                onClick={e => {
                  e.stopPropagation();
                  onSavePosition();
                }}
                className="flex-1 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium rounded flex items-center justify-center gap-1"
              >
                <Save className="w-3.5 h-3.5" />
                위치저장
              </button>
            )}
            {point.id !== 'home' && (
              <>
                <button
                  onClick={e => {
                    e.stopPropagation();
                    onApplyParamsToBlock();
                  }}
                  className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded"
                >
                  블록저장
                </button>
                <button
                  onClick={e => {
                    e.stopPropagation();
                    onApplyParamsToAll();
                  }}
                  className="flex-1 py-2 bg-orange-600 hover:bg-orange-500 text-white text-xs font-medium rounded"
                >
                  전체적용
                </button>
                <button
                  onClick={e => {
                    e.stopPropagation();
                    onSaveJob();
                  }}
                  className="flex-1 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium rounded"
                >
                  모두저장
                </button>
              </>
            )}
            {point.isSaved && (
              <button
                onClick={e => {
                  e.stopPropagation();
                  onClearPoint();
                }}
                className="py-2 px-3 bg-red-600/80 hover:bg-red-500 text-white text-xs font-medium rounded flex items-center justify-center gap-1"
                title="포인트 삭제"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
export const PointItem_PointItem = PointItem;
