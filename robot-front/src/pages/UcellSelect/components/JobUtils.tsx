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

export type {
  WeldPoint,
  UCellConfig,
  WorkspaceConfig,
  CenterlinePoint,
  PartToggleConfig,
  UnifiedWorkspaceCanvasProps,
} from './unifiedCanvas/types';
export const statusConfig: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  success: { icon: <span className="w-4 h-4 text-green-400">&#10004;</span>, color: 'text-green-400', label: '완료' },
  failed: { icon: <span className="w-4 h-4 text-red-400">&#10008;</span>, color: 'text-red-400', label: '실패' },
  stopped: { icon: <span className="w-4 h-4 text-orange-400">&#9646;</span>, color: 'text-orange-400', label: '중단' },
  pending: { icon: <span className="w-4 h-4 text-yellow-400">&#9888;</span>, color: 'text-yellow-400', label: '진행중' },
};
export const operationTypeLabels: Record<string, string> = {
  welding: '용접',
  dryrun: 'DryRun',
  simulation: '시뮬레이션',
  touch_sensing: '터치센싱',
};
export const weavingTypeLabels: Record<string, string> = {
  none: '없음',
  plane_triangle: '평면 삼각파',
  vertical_l_triangle: '수직 L형 삼각파',
  circle_cw: '원형 (시계)',
  circle_ccw: '원형 (반시계)',
  plane_sine: '평면 사인파',
  vertical_l_sine: '수직 L형 사인파',
  vertical_triangle: '수직 삼각파',
  vertical_sine: '수직 사인파',
};
export const startTypeLabels: Record<string, string> = {
  start: '시작',
  continue: '계속',
};
export const formatDate = (dateStr?: string, compact = false) => {
  if (!dateStr) return '-';
  try {
    const date = new Date(dateStr);
    if (compact) {
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      const h = String(date.getHours()).padStart(2, '0');
      const min = String(date.getMinutes()).padStart(2, '0');
      return `${m}-${d} ${h}:${min}`;
    }
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const h = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    const s = String(date.getSeconds()).padStart(2, '0');
    return `${y}-${m}-${d} ${h}:${min}:${s}`;
  } catch {
    return dateStr;
  }
};
export const formatWeaveParams = (wp?: Record<string, unknown> | null) => {
  if (!wp) return '';
  const parts: string[] = [];
  if (wp.weaveFrequency != null) parts.push(`${wp.weaveFrequency}Hz`);
  if (wp.weaveRange != null) parts.push(`범위${wp.weaveRange}mm`);
  if (wp.weaveLeftRange != null) parts.push(`좌${wp.weaveLeftRange}mm`);
  if (wp.weaveRightRange != null) parts.push(`우${wp.weaveRightRange}mm`);
  if (wp.weaveLeftStayTime != null) parts.push(`좌대기${wp.weaveLeftStayTime}ms`);
  if (wp.weaveRightStayTime != null) parts.push(`우대기${wp.weaveRightStayTime}ms`);
  return parts.join(', ');
};
export const formatDuration = (seconds?: number) => {
  if (!seconds || seconds <= 0) return '-';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return mins > 0 ? `${mins}분 ${secs}초` : `${secs}초`;
};
interface HistoryItemRowProps {
  log: WeldingLogData;
  rowIdx: number;
  isSelected: boolean;
  isExpanded: boolean;
  editedName?: string;
  onToggleSelect: (id: number) => void;
  onToggleExpand: (id: number) => void;
  onNameChange: (id: number, value: string) => void;
}
export const HistoryItemRow: React.FC<HistoryItemRowProps> = ({
  log,
  rowIdx,
  isSelected,
  isExpanded,
  editedName,
  onToggleSelect,
  onToggleExpand,
  onNameChange,
}) => {
  const status = statusConfig[log.result_status] || statusConfig.pending;
  const rowBg = isSelected ? 'bg-cyan-500/10' : rowIdx % 2 === 1 ? 'bg-gray-800/25' : '';
  return (
    <div className="border-b border-gray-700/30">
      <div
        className={`grid grid-cols-[32px,1fr,100px,64px,100px,100px,80px,72px,64px,80px] gap-1 px-4 py-1 items-center hover:bg-gray-800/50 cursor-pointer transition text-xs ${rowBg}`}
        onClick={() => onToggleExpand(log.id!)}
      >
        <div onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelect(log.id!)}
            className="w-3.5 h-3.5 rounded border-gray-600 bg-gray-700 text-cyan-500 focus:ring-cyan-500"
          />
        </div>
        <div>
          <input
            type="text"
            value={editedName !== undefined ? editedName : (log.job_name || '')}
            placeholder={`작업 #${log.job_id || log.id}`}
            onChange={(e) => onNameChange(log.id!, e.target.value)}
            onMouseDown={(e) => {
              e.currentTarget.dataset.editing = document.activeElement === e.currentTarget ? '1' : '';
            }}
            onClick={(e) => {
              if (e.currentTarget.dataset.editing) e.stopPropagation();
            }}
            className={`w-full bg-transparent border-b text-xs text-white px-0.5 py-0.5 focus:outline-none transition ${
              editedName !== undefined ? 'border-cyan-500/50' : 'border-transparent hover:border-gray-600'
            }`}
          />
        </div>
        <div>
          <span className={`px-1.5 py-0.5 rounded text-xs ${
            log.operation_type === 'welding' ? 'bg-green-500/20 text-green-400' :
            log.operation_type === 'dryrun' ? 'bg-blue-500/20 text-blue-400' :
            'bg-gray-500/20 text-gray-400'
          }`}>
            {operationTypeLabels[log.operation_type] || log.operation_type}
            {log.start_type && ` (${startTypeLabels[log.start_type] || log.start_type})`}
          </span>
        </div>
        <div className={`flex items-center gap-0.5 ${status.color}`}>
          {status.icon}
          <span>{status.label}</span>
        </div>
        <div className="text-gray-400">{formatDate(log.started_at, true)}</div>
        <div className="text-gray-400">{formatDate(log.completed_at, true)}</div>
        <div className="text-gray-400">{formatDuration(log.actual_duration_sec)}</div>
        <div className="text-gray-400">{log.total_distance_mm?.toFixed(1) || '0'}mm</div>
        <div className="text-gray-400">{log.completed_points || 0}/{log.total_points || 0}</div>
        <div className="text-gray-400 truncate">{log.user_id || '-'}</div>
      </div>
      {}
      {isExpanded && (
        <div className="px-6 py-3 bg-gray-800/20 border-t border-gray-700/30">
          {log.error_message && (
            <div className="mb-3 p-2 bg-red-500/10 rounded text-red-400 text-sm">
              <AlertTriangle className="w-4 h-4 inline mr-1" />
              {log.error_message}
            </div>
          )}
          {}
          {log.segments && log.segments.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500 border-b border-gray-700/30">
                    <th className="py-1.5 px-2 text-left">구간</th>
                    <th className="py-1.5 px-2 text-right">거리</th>
                    <th className="py-1.5 px-2 text-right">속도</th>
                    <th className="py-1.5 px-2 text-right">GAP</th>
                    <th className="py-1.5 px-2 text-right">전압</th>
                    <th className="py-1.5 px-2 text-right">전류</th>
                    <th className="py-1.5 px-2 text-left">위빙</th>
                    <th className="py-1.5 px-2 text-right">예상</th>
                    <th className="py-1.5 px-2 text-right">실제</th>
                  </tr>
                </thead>
                <tbody>
                  {log.segments.map((seg, idx) => (
                    <tr key={idx} className="border-b border-gray-700/20 hover:bg-gray-700/20">
                      <td className="py-1.5 px-2 text-gray-300 font-mono">
                        {seg.from?.toUpperCase()}{'\u2192'}{seg.to?.toUpperCase()}
                      </td>
                      <td className="py-1.5 px-2 text-right text-gray-300">{seg.distance_mm?.toFixed(1)}mm</td>
                      <td className="py-1.5 px-2 text-right text-gray-300">{seg.cpm}</td>
                      <td className="py-1.5 px-2 text-right text-gray-300">{seg.gap ?? '-'}</td>
                      <td className="py-1.5 px-2 text-right text-gray-300">{seg.weld_voltage != null ? `${seg.weld_voltage}V` : '-'}</td>
                      <td className="py-1.5 px-2 text-right text-gray-300">{seg.weld_current != null ? `${seg.weld_current}A` : '-'}</td>
                      <td className="py-1.5 px-2 text-gray-300">
                        {seg.weaving_type && seg.weaving_type !== 'none' ? (
                          <span>{weavingTypeLabels[seg.weaving_type] || seg.weaving_type}
                            {seg.weave_params && (
                              <span className="text-gray-500 ml-1">({formatWeaveParams(seg.weave_params)})</span>
                            )}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="py-1.5 px-2 text-right text-gray-400">{seg.expected_sec?.toFixed(1)}s</td>
                      <td className="py-1.5 px-2 text-right text-white">{seg.actual_sec != null ? `${seg.actual_sec.toFixed(1)}s` : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
