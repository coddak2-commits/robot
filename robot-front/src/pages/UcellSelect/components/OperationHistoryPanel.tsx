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
import { HistoryItemRow } from './JobUtils';

interface OperationHistoryPanelProps {
  onClose?: () => void;
}
const ITEMS_PER_PAGE = 10;
export function OperationHistoryPanel({ onClose }: OperationHistoryPanelProps) {
  const { show: showAlert } = useAlert();
  const [logs, setLogs] = useState<WeldingLogData[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [editedNames, setEditedNames] = useState<Map<number, string>>(new Map());
  const [saving, setSaving] = useState(false);
  const totalPages = Math.ceil(total / ITEMS_PER_PAGE);
  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getWeldingLogs(ITEMS_PER_PAGE, (page - 1) * ITEMS_PER_PAGE);
      setLogs(result.logs);
      setTotal(result.total);
      setEditedNames(new Map());
    } catch (error) {
      console.error('작업 내역 조회 실패:', error);
      showAlert('작업 내역을 불러오는데 실패했습니다.', { type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [page, showAlert]);
  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);
  const handleSelectAll = () => {
    if (selectedIds.size === logs.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(logs.map(log => log.id!)));
    }
  };
  const handleSelect = (id: number) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };
  const handleDelete = async () => {
    if (selectedIds.size === 0) return;
    const confirmed = window.confirm(`선택한 ${selectedIds.size}개의 작업 내역을 삭제하시겠습니까?`);
    if (!confirmed) return;
    try {
      await deleteWeldingLogs(Array.from(selectedIds));
      showAlert(`${selectedIds.size}개의 작업 내역이 삭제되었습니다.`, { type: 'success' });
      setSelectedIds(new Set());
      fetchLogs();
    } catch (error) {
      console.error('작업 내역 삭제 실패:', error);
      showAlert('작업 내역 삭제에 실패했습니다.', { type: 'error' });
    }
  };
  const handleNameChange = (id: number, value: string) => {
    const original = logs.find(l => l.id === id);
    const originalName = original?.job_name || '';
    const next = new Map(editedNames);
    if (value === originalName) {
      next.delete(id);
    } else {
      next.set(id, value);
    }
    setEditedNames(next);
  };
  const handleSaveNames = async () => {
    if (editedNames.size === 0) return;
    setSaving(true);
    try {
      const promises = Array.from(editedNames.entries()).map(([id, name]) =>
        updateWeldingLog(id, { job_name: name })
      );
      await Promise.all(promises);
      showAlert(`${editedNames.size}건의 작업명이 저장되었습니다.`, { type: 'success' });
      setEditedNames(new Map());
      fetchLogs();
    } catch (error) {
      console.error('작업명 저장 실패:', error);
      showAlert('작업명 저장에 실패했습니다.', { type: 'error' });
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="h-full flex flex-col bg-gray-900/95 rounded-2xl border border-gray-700/50 overflow-hidden">
      {}
      <div className="flex items-center justify-between px-6 py-2.5 border-b border-gray-700/50 bg-gray-800/50">
        <div className="flex items-center gap-3">
          <History className="w-5 h-5 text-cyan-400" />
          <h2 className="text-lg font-bold text-white">작업 내역</h2>
          <span className="text-sm text-gray-400">({total}건)</span>
        </div>
        <div className="flex items-center gap-2">
          {editedNames.size > 0 && (
            <button
              onClick={handleSaveNames}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-500/20 text-cyan-400 rounded-lg hover:bg-cyan-500/30 border border-cyan-500/30 text-xs font-medium disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              저장 ({editedNames.size})
            </button>
          )}
          <button
            onClick={handleDelete}
            disabled={selectedIds.size === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 border border-red-500/30 text-xs font-medium disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Trash2 className="w-3.5 h-3.5" />
            삭제{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
          </button>
          <button
            onClick={fetchLogs}
            disabled={loading}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg disabled:opacity-50"
            title="새로고침"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>
      {}
      <div className="grid grid-cols-[32px,1fr,100px,64px,100px,100px,80px,72px,64px,80px] gap-1 px-4 py-1.5 bg-gray-800/30 text-xs font-medium text-gray-400 border-b border-gray-700/30 items-center">
        <div>
          <input
            type="checkbox"
            checked={logs.length > 0 && selectedIds.size === logs.length}
            onChange={handleSelectAll}
            className="w-3.5 h-3.5 rounded border-gray-600 bg-gray-700 text-cyan-500 focus:ring-cyan-500"
          />
        </div>
        <div>작업명</div>
        <div>작업 유형</div>
        <div>상태</div>
        <div>시작</div>
        <div>종료</div>
        <div>소요</div>
        <div>거리</div>
        <div>포인트</div>
        <div>작업자</div>
      </div>
      {}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-gray-400">
            <RefreshCw className="w-6 h-6 animate-spin mr-2" />
            로딩 중...
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-500">
            <History className="w-12 h-12 mb-2 opacity-50" />
            작업 내역이 없습니다.
          </div>
        ) : (
          logs.map((log, rowIdx) => (
            <HistoryItemRow
              key={log.id}
              log={log}
              rowIdx={rowIdx}
              isSelected={selectedIds.has(log.id!)}
              isExpanded={expandedId === log.id}
              editedName={editedNames.has(log.id!) ? editedNames.get(log.id!)! : undefined}
              onToggleSelect={handleSelect}
              onToggleExpand={(id) => setExpandedId(expandedId === id ? null : id)}
              onNameChange={handleNameChange}
            />
          ))
        )}
      </div>
      {}
      <div className="flex items-center justify-center gap-4 px-6 py-3 border-t border-gray-700/50 bg-gray-800/30">
        <button
          onClick={() => setPage(p => Math.max(1, p - 1))}
          disabled={page === 1}
          className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded disabled:opacity-30"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <span className="text-gray-400">
          {page} / {totalPages || 1} (총 {total}건)
        </span>
        <button
          onClick={() => setPage(p => Math.min(totalPages, p + 1))}
          disabled={page >= totalPages || totalPages <= 1}
          className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded disabled:opacity-30"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
export const OperationHistoryPanel_OperationHistoryPanel = OperationHistoryPanel;
