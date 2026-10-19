import React, { useState, useEffect, useCallback, memo, useMemo } from 'react';
import { AlertTriangle, Edit3, Trash2, Check, X, Clock, FolderOpen, ChevronLeft, ChevronRight, Target, Shield, Settings, Wrench, History, RefreshCw, Save, Home, Circle, GripVertical, Play, Square, Pause, RotateCcw, Wifi, WifiOff, Zap, MapPin, Navigation, Crosshair, Download } from 'lucide-react';
import { WeldingLogData, getWeldingLogs, deleteWeldingLogs, updateWeldingLog, RealtimeRobotStatus, getRealtimeRobotStatus, getWeldingPartOrder } from '../../../lib';
import Modal from 'react-modal';
import { useAlert } from '../../../contexts';
import { useGapAuth } from '../../../contexts/gapAuth';
import { TeachingPoint, WeaveParams, WEAVING_TYPE_OPTIONS, UCellData, HEIGHT_OPTIONS, getPartConditionPointIds, getBlockName } from '..';
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
// [v1.1.264] 작업내역 CSV 내보내기. 회차(로그) x 포인트 한 줄.
const EXPORT_PAGE_SIZE = 100;
const OPERATION_LABEL: Record<string, string> = {
  welding: '용접',
  dryrun: '드라이런',
  simulation: '시뮬레이션',
  touch_sensing: '터치센싱',
};
const RESULT_LABEL: Record<string, string> = {
  success: '성공',
  failed: '실패',
  stopped: '중지',
  pending: '진행중',
};
const CSV_HEADER = [
  '로그ID', '시작', '종료', '작업명', '작업유형', '결과',
  '파트', '포인트', '조건적용', '갭(mm)', '속도(cm/min)', '전류(A)', '전압(V)',
  '위빙', '주파수(Hz)', '진폭(mm)', '좌진폭(mm)', '우진폭(mm)', '좌정지(ms)', '우정지(ms)',
  '터치dx(mm)', '터치dy(mm)', '터치dz(mm)',
];
const csvCell = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  const str = String(v);
  return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};
const num = (v: unknown, digits?: number): string => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '';
  return digits === undefined ? String(v) : v.toFixed(digits);
};
function buildCsv(logs: WeldingLogData[]): string {
  const conditionIds = getPartConditionPointIds();
  const rows: string[][] = [CSV_HEADER];
  logs.forEach(log => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const points = (log.points_snapshot ?? []) as Record<string, any>[];
    points.filter(pt => pt?.id && pt.id !== 'home').forEach(pt => {
      const wp = (pt.weaveParams ?? {}) as Record<string, unknown>;
      const touch = pt.touchOffset as { dx?: number; dy?: number; dz?: number } | null | undefined;
      const weaving = WEAVING_TYPE_OPTIONS.find(o => o.value === pt.weavingType)?.label ?? (pt.weavingType ?? '');
      const hasWeave = !!pt.weavingType && pt.weavingType !== 'none';
      rows.push([
        String(log.id ?? ''),
        log.started_at ?? '',
        log.completed_at ?? '',
        log.job_name ?? '',
        OPERATION_LABEL[log.operation_type] ?? log.operation_type,
        RESULT_LABEL[log.result_status] ?? log.result_status,
        getBlockName(pt.id),
        String(pt.id).toUpperCase(),
        conditionIds.has(pt.id) ? 'O' : '',
        num(pt.gap),
        num(pt.moveSpeed),
        num(pt.weldCurrent),
        num(pt.weldVoltage),
        weaving,
        hasWeave ? num(wp.weaveFrequency) : '',
        hasWeave ? num(wp.weaveRange) : '',
        hasWeave ? num(wp.weaveLeftRange) : '',
        hasWeave ? num(wp.weaveRightRange) : '',
        hasWeave ? num(wp.weaveLeftStayTime) : '',
        hasWeave ? num(wp.weaveRightStayTime) : '',
        touch ? num(touch.dx, 2) : '',
        touch ? num(touch.dy, 2) : '',
        touch ? num(touch.dz, 2) : '',
      ]);
    });
  });
  return '\uFEFF' + rows.map(r => r.map(csvCell).join(',')).join('\r\n');
}
const pad2 = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
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
  const [exporting, setExporting] = useState(false);
  // [v1.1.265] 내보내기 기간 (양 끝 포함)
  const [exportFrom, setExportFrom] = useState(() => ymd(new Date()));
  const [exportTo, setExportTo] = useState(() => ymd(new Date()));
  const handleExport = async () => {
    if (!exportFrom || !exportTo || exportFrom > exportTo) {
      showAlert('기간을 확인해 주세요. (시작일이 종료일보다 늦습니다)', { type: 'warning' });
      return;
    }
    setExporting(true);
    try {
      const all: WeldingLogData[] = [];
      for (let offset = 0; ; offset += EXPORT_PAGE_SIZE) {
        const result = await getWeldingLogs(EXPORT_PAGE_SIZE, offset, undefined, exportFrom, exportTo);
        all.push(...result.logs);
        if (result.logs.length < EXPORT_PAGE_SIZE || all.length >= result.total) break;
      }
      if (all.length === 0) {
        showAlert(`${exportFrom} ~ ${exportTo} 기간에 작업 내역이 없습니다.`, { type: 'warning' });
        return;
      }
      const blob = new Blob([buildCsv(all)], { type: 'text/csv;charset=utf-8' });
      const name = `작업내역_${exportFrom.replace(/-/g, '')}-${exportTo.replace(/-/g, '')}.csv`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showAlert(`${all.length}건 내보내기 완료 (${name})`, { type: 'success' });
    } catch (error) {
      console.error('작업 내역 내보내기 실패:', error);
      showAlert('작업 내역 내보내기에 실패했습니다.', { type: 'error' });
    } finally {
      setExporting(false);
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
          <input
            type="date"
            value={exportFrom}
            max={exportTo || undefined}
            onChange={e => setExportFrom(e.target.value)}
            className="px-2 py-1 bg-gray-800 border border-gray-600 rounded-lg text-xs text-gray-200 [color-scheme:dark]"
            title="내보내기 시작일"
          />
          <span className="text-xs text-gray-500">~</span>
          <input
            type="date"
            value={exportTo}
            min={exportFrom || undefined}
            onChange={e => setExportTo(e.target.value)}
            className="px-2 py-1 bg-gray-800 border border-gray-600 rounded-lg text-xs text-gray-200 [color-scheme:dark]"
            title="내보내기 종료일"
          />
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/20 text-emerald-400 rounded-lg hover:bg-emerald-500/30 border border-emerald-500/30 text-xs font-medium disabled:opacity-30 disabled:cursor-not-allowed"
            title="선택한 기간의 작업 내역을 포인트별로 CSV(엑셀) 파일로 저장"
          >
            <Download className={`w-3.5 h-3.5 ${exporting ? 'animate-pulse' : ''}`} />
            엑셀 내보내기
          </button>
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
