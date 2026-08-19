import React, { useState, useEffect, useCallback, memo, useMemo } from 'react';
import { AlertTriangle, Edit3, Trash2, Check, X, Clock, FolderOpen, ChevronLeft, ChevronRight, Target, Shield, Settings, Wrench, History, RefreshCw, Save, Home, Circle, GripVertical, Play, Square, Pause, RotateCcw, Wifi, WifiOff, Zap, MapPin, Navigation, Crosshair } from 'lucide-react';
import { WeldingLogData, getWeldingLogs, deleteWeldingLogs, updateWeldingLog, RealtimeRobotStatus, getRealtimeRobotStatus, getWeldingPartOrder } from '../../../lib';
import Modal from 'react-modal';
import { useAlert } from '../../../contexts';
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
// 포인트 id로 용접 자세 자동 매핑 (P1-3, P7-9: 수직 / P4-6, P10-12: 수평)
const getPostureFromPointId = (pointId: string): 'vertical' | 'horizontal' => {
  const m = pointId.match(/^P(\d+)$/i);
  if (!m) return 'vertical';
  const n = Number(m[1]);
  if ((n >= 4 && n <= 6) || (n >= 10 && n <= 12)) return 'horizontal';
  return 'vertical';
};
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
}: JobListItemProps) {
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
export interface JobListModalProps {
  isOpen: boolean;
  jobList: Array<{
    id: number;
    name: string;
    cell_name?: string;
    saved_points?: number;
    total_points?: number;
    created_at?: string;
  }>;
  currentJobId: number | null;
  jobListPage: number;
  editingJobId: number | null;
  editingJobName: string;
  JOBS_PER_PAGE: number;
  onClose: () => void;
  onLoadJob: (id: number) => void;
  onDeleteJob: (id: number, name: string) => void;
  onEditJobId: (id: number | null) => void;
  onEditJobName: (name: string) => void;
  onSaveJobName: (id: number) => void;
  onPageChange: (page: number) => void;
}
export function JobListModal({
  isOpen,
  jobList,
  currentJobId,
  jobListPage,
  editingJobId,
  editingJobName,
  JOBS_PER_PAGE,
  onClose,
  onLoadJob,
  onDeleteJob,
  onEditJobId,
  onEditJobName,
  onSaveJobName,
  onPageChange,
}: JobListModalProps) {
  const paginatedJobs = jobList.slice((jobListPage - 1) * JOBS_PER_PAGE, jobListPage * JOBS_PER_PAGE);
  const totalPages = Math.ceil(jobList.length / JOBS_PER_PAGE);
  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onClose}
      className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-gray-800 rounded-2xl border border-gray-700 p-6 max-w-lg w-full max-h-[80vh] overflow-hidden"
      overlayClassName="fixed inset-0 bg-black/70 z-50"
    >
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-cyan-400" />
            저장된 작업 목록
            {jobList.length > 0 && <span className="text-sm font-normal text-gray-400">({jobList.length}개)</span>}
          </h3>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto space-y-2">
          {jobList.length === 0 ? (
            <div className="text-center py-8 text-gray-500">저장된 작업이 없습니다.</div>
          ) : (
            paginatedJobs.map((job) => (
              <JobListItem
                key={job.id}
                job={job}
                isSelected={currentJobId === job.id}
                isEditing={editingJobId === job.id}
                editingName={editingJobName}
                onSelect={() => { onLoadJob(job.id); onClose(); }}
                onDelete={() => onDeleteJob(job.id, job.name)}
                onEditStart={() => { onEditJobId(job.id); onEditJobName(job.name); }}
                onEditChange={onEditJobName}
                onEditSave={() => onSaveJobName(job.id)}
                onEditCancel={() => onEditJobId(null)}
              />
            ))
          )}
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-4 pt-4 border-t border-gray-700">
            <button onClick={() => onPageChange(Math.max(1, jobListPage - 1))} disabled={jobListPage === 1} className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg disabled:opacity-30">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="text-sm text-gray-400">{jobListPage} / {totalPages}</span>
            <button onClick={() => onPageChange(Math.min(totalPages, jobListPage + 1))} disabled={jobListPage >= totalPages} className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg disabled:opacity-30">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        )}
        <div className="mt-4 pt-4 border-t border-gray-700">
          <button onClick={onClose} className="w-full py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-xl">
            닫기
          </button>
        </div>
      </div>
    </Modal>
  );
}
export const JobListModal_JobListModal = JobListModal;
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
interface RobotControlPanelProps {
  isRobotMoving: boolean;
  isArcTesting: boolean;
  isPaused: boolean;
  isTeachingPolling: boolean;
  teachingRobotState: RealtimeRobotStatus | null;
  manualMoveSpeed: number;
  simulationMode: boolean;
  hasResumableSession: boolean;
  onStartArcTest: () => void;
  onStopArcTest: () => void;
  onStartWelding: () => void;
  onStopRobot: () => void;
  onPauseRobot: () => void;
  onResumeRobot: () => void;
  onDismissResumable: () => void;
  onStartPolling: () => void;
  onStopPolling: () => void;
  onManualMoveSpeedChange: (speed: number) => void;
  onSimulationModeChange: (enabled: boolean) => void;
}
const RobotControlPanel: React.FC<RobotControlPanelProps> = memo(({
  isRobotMoving,
  isArcTesting,
  isPaused,
  isTeachingPolling,
  teachingRobotState,
  manualMoveSpeed,
  simulationMode,
  hasResumableSession,
  onStartArcTest,
  onStopArcTest,
  onStartWelding,
  onStopRobot,
  onPauseRobot,
  onResumeRobot,
  onDismissResumable,
  onStartPolling,
  onStopPolling,
  onManualMoveSpeedChange,
  onSimulationModeChange,
}) => {
  const isRunning = isRobotMoving || isArcTesting;
  return (
    <div className="space-y-4">
      {}
      <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
        <div className="flex items-center gap-2">
          {isTeachingPolling ? (
            <Wifi className="w-4 h-4 text-green-400" />
          ) : (
            <WifiOff className="w-4 h-4 text-gray-500" />
          )}
          <span className="text-sm text-gray-300">
            {isTeachingPolling ? '실시간 연결됨' : '연결 안됨'}
          </span>
        </div>
        <button
          onClick={isTeachingPolling ? onStopPolling : onStartPolling}
          className={`px-3 py-1 text-xs rounded transition ${
            isTeachingPolling
              ? 'bg-gray-600 hover:bg-gray-500 text-gray-300'
              : 'bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400'
          }`}
        >
          {isTeachingPolling ? '연결 해제' : '연결'}
        </button>
      </div>
      {}
      {teachingRobotState && (
        <div className="p-3 bg-gray-800/50 rounded-lg space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">서보</span>
            <span className={teachingRobotState.servo_enabled ? 'text-green-400' : 'text-red-400'}>
              {teachingRobotState.servo_enabled ? '활성화' : '비활성화'}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">모드</span>
            <span className={teachingRobotState.robot_mode === 1 ? 'text-orange-400' : 'text-cyan-400'}>
              {teachingRobotState.robot_mode === 1 ? '수동' : '자동'}
            </span>
          </div>
          {teachingRobotState.error_code !== 0 && (
            <div className="text-xs text-red-400 bg-red-400/10 p-2 rounded">
              에러: {teachingRobotState.error_message || `코드 ${teachingRobotState.error_code}`}
            </div>
          )}
        </div>
      )}
      {}
      <div className="p-3 bg-gray-800/50 rounded-lg">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-300">이동 속도</span>
          <span className="text-sm text-cyan-400 font-medium">{manualMoveSpeed}%</span>
        </div>
        <input
          type="range"
          min="1"
          max="100"
          value={manualMoveSpeed}
          onChange={e => onManualMoveSpeedChange(Number(e.target.value))}
          className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
        />
      </div>
      {}
      <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
        <div className="flex items-center gap-2">
          <Zap className={`w-4 h-4 ${simulationMode ? 'text-yellow-400' : 'text-gray-500'}`} />
          <span className="text-sm text-gray-300">시뮬레이션 모드</span>
        </div>
        <button
          onClick={() => onSimulationModeChange(!simulationMode)}
          className={`px-3 py-1 text-xs rounded transition ${
            simulationMode
              ? 'bg-yellow-500/20 text-yellow-400'
              : 'bg-gray-600 text-gray-400'
          }`}
        >
          {simulationMode ? 'ON' : 'OFF'}
        </button>
      </div>
      {}
      {hasResumableSession && !isRunning && (
        <div className="p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg">
          <p className="text-sm text-orange-400 mb-2">이전에 중단된 작업이 있습니다.</p>
          <div className="flex gap-2">
            <button
              onClick={onResumeRobot}
              className="flex-1 px-3 py-1.5 bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 rounded text-sm transition"
            >
              이어서 진행
            </button>
            <button
              onClick={onDismissResumable}
              className="px-3 py-1.5 bg-gray-600 hover:bg-gray-500 text-gray-300 rounded text-sm transition"
            >
              무시
            </button>
          </div>
        </div>
      )}
      {}
      <div className="grid grid-cols-2 gap-2">
        {}
        {!isArcTesting ? (
          <button
            onClick={onStartArcTest}
            disabled={isRunning}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Play className="w-5 h-5" />
            <span>아크 테스트</span>
          </button>
        ) : (
          <button
            onClick={onStopArcTest}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition"
          >
            <Square className="w-5 h-5" />
            <span>테스트 중지</span>
          </button>
        )}
        {}
        {!isRobotMoving ? (
          <button
            onClick={onStartWelding}
            disabled={isRunning}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Zap className="w-5 h-5" />
            <span>용접 시작</span>
          </button>
        ) : (
          <button
            onClick={onStopRobot}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition"
          >
            <Square className="w-5 h-5" />
            <span>정지</span>
          </button>
        )}
        {}
        {isRobotMoving && !isPaused && (
          <button
            onClick={onPauseRobot}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 rounded-lg transition col-span-2"
          >
            <Pause className="w-5 h-5" />
            <span>일시정지</span>
          </button>
        )}
        {}
        {isPaused && (
          <button
            onClick={onResumeRobot}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg transition col-span-2"
          >
            <RotateCcw className="w-5 h-5" />
            <span>재개</span>
          </button>
        )}
      </div>
    </div>
  );
});
RobotControlPanel.displayName = 'RobotControlPanel';
export const RobotControlPanel_RobotControlPanel = RobotControlPanel;
interface ChildProps {
  robotJoints: RobotMoveData[];
  addJoint: (joint: RobotMoveData) => void;
  resetJoints: () => void;
}
export const RobotJoint = ({ robotJoints, addJoint, resetJoints }: ChildProps) => {
  const { show: showAlert } = useAlert();
  const handleJointsAdd = async () => {
    const status = await getRealtimeRobotStatus();
    if (!status.connected || !status.joints || !status.tcp) {
      showAlert('로봇 연결 상태를 확인해주세요.', { type: 'error' });
      console.log('로봇 상태 조회 실패');
      return;
    }
    const data = {
      joints: {
        j1: status.joints[0] || 0,
        j2: status.joints[1] || 0,
        j3: status.joints[2] || 0,
        j4: status.joints[3] || 0,
        j5: status.joints[4] || 0,
        j6: status.joints[5] || 0,
      },
      tcf: {
        x: status.tcp[0] || 0,
        y: status.tcp[1] || 0,
        z: status.tcp[2] || 0,
        rx: status.tcp[3] || 0,
        ry: status.tcp[4] || 0,
        rz: status.tcp[5] || 0,
      },
      speed: '10',
      acc: '180',
      ovl: '100',
    };
    console.log(data);
    addJoint(data);
  };
  const handleJointRemove = () => {
    return '';
  };
  const handleJointReset = () => {
    if (robotJoints.length === 0) {
      showAlert('초기화할 데이터가 없습니다.', { type: 'warning' });
      return;
    }
    showAlert('모든 작업 목록을 초기화하시겠습니까?', {
      type: 'warning',
      title: '초기화 확인',
      onConfirm: () => {
        resetJoints();
      },
    });
  };
  return (
    <div>
      <div className={`p-2 h-22 bg-[#000] overflow-auto`}>
        <ul className={`text-white`}>
          {robotJoints.map((step, index) => (
            <li key={index}>
              <strong>Step {index + 1}</strong>
              <div>
                J1: {step.joints.j1}, J2: {step.joints.j2}, J3: {step.joints.j3}
              </div>
              <div>
                J4: {step.joints.j4}, J5: {step.joints.j5}, J6: {step.joints.j6}
              </div>
              <div>
                TCF: x={step.tcf.x}, y={step.tcf.y}, z={step.tcf.z}, rx={step.tcf.rx}, ry=
                {step.tcf.ry}, rz={step.tcf.rz}
              </div>
              <div>
                Speed: {step.speed}, Acc: {step.acc}, OVL: {step.ovl}
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className={`mt-3`}>
        <div className={`flex justify-between mt-3`}>
          <Button className={`flex-1 mr-1`} onClick={() => handleJointsAdd()}>
            추가
          </Button>
          <Button className={`flex-1`} onClick={() => handleJointRemove()}>
            삭제
          </Button>
        </div>
        <div className={`mt-2`}>
          <Button variant="destructive" className={`w-full`} onClick={() => handleJointReset()}>
            초기화
          </Button>
        </div>
      </div>
    </div>
  );
};
export interface RobotPosition {
  x: number;
  y: number;
  z: number;
  isWelding?: boolean;
  timestamp?: number;
}
export interface RobotPathOverlayProps {
  pathHistory: RobotPosition[];
  currentPosition?: RobotPosition;
  viewBoxWidth?: number;
  viewBoxHeight?: number;
  workArea?: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
  pathColor?: string;
  weldingPathColor?: string;
  currentPositionColor?: string;
  pathStrokeWidth?: number;
  animated?: boolean;
}
const RobotPathOverlayComponent: React.FC<RobotPathOverlayProps> = ({
  pathHistory,
  currentPosition,
  viewBoxWidth = 400,
  viewBoxHeight = 300,
  workArea = { minX: -500, maxX: 500, minY: -500, maxY: 500 },
  pathColor = '#00F9FF',
  weldingPathColor = '#FF6B35',
  currentPositionColor = '#00FF88',
  pathStrokeWidth = 2,
  animated = true,
}) => {
  const transformCoordinate = useMemo(() => {
    const scaleX = viewBoxWidth / (workArea.maxX - workArea.minX);
    const scaleY = viewBoxHeight / (workArea.maxY - workArea.minY);
    return (pos: RobotPosition) => ({
      x: (pos.x - workArea.minX) * scaleX,
      y: viewBoxHeight - (pos.y - workArea.minY) * scaleY,
      isWelding: pos.isWelding,
    });
  }, [viewBoxWidth, viewBoxHeight, workArea]);
  const catmullRomToBezier = (
    points: { x: number; y: number }[],
    tension: number = 0.5
  ): string => {
    if (points.length < 2) return '';
    if (points.length === 2) {
      return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y} `;
    }
    let d = `M ${points[0].x} ${points[0].y} `;
    const alpha = 1 - tension;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(points.length - 1, i + 2)];
      const cp1x = p1.x + (p2.x - p0.x) * alpha / 6;
      const cp1y = p1.y + (p2.y - p0.y) * alpha / 6;
      const cp2x = p2.x - (p3.x - p1.x) * alpha / 6;
      const cp2y = p2.y - (p3.y - p1.y) * alpha / 6;
      d += `C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y} `;
    }
    return d;
  };
  const GAP_THRESHOLD = 25;
  const { movePath, weldingPath } = useMemo(() => {
    if (pathHistory.length < 2) {
      return { movePath: '', weldingPath: '' };
    }
    const moveSegments: { x: number; y: number }[][] = [];
    const weldSegments: { x: number; y: number }[][] = [];
    let currentMoveSegment: { x: number; y: number }[] = [];
    let currentWeldSegment: { x: number; y: number }[] = [];
    const pushAndClear = () => {
      if (currentMoveSegment.length > 0) { moveSegments.push(currentMoveSegment); currentMoveSegment = []; }
      if (currentWeldSegment.length > 0) { weldSegments.push(currentWeldSegment); currentWeldSegment = []; }
    };
    pathHistory.forEach((pos) => {
      const transformed = transformCoordinate(pos);
      const pt = { x: transformed.x, y: transformed.y };
      if (pos.isWelding) {
        if (currentMoveSegment.length > 0) {
          moveSegments.push(currentMoveSegment);
          currentMoveSegment = [];
        }
        const last = currentWeldSegment[currentWeldSegment.length - 1];
        if (last) {
          const dist = Math.sqrt((pt.x - last.x) ** 2 + (pt.y - last.y) ** 2);
          if (dist > GAP_THRESHOLD) {
            weldSegments.push(currentWeldSegment);
            currentWeldSegment = [];
          }
        }
        currentWeldSegment.push(pt);
      } else {
        if (currentWeldSegment.length > 0) {
          weldSegments.push(currentWeldSegment);
          currentWeldSegment = [];
        }
        const last = currentMoveSegment[currentMoveSegment.length - 1];
        if (last) {
          const dist = Math.sqrt((pt.x - last.x) ** 2 + (pt.y - last.y) ** 2);
          if (dist > GAP_THRESHOLD) {
            moveSegments.push(currentMoveSegment);
            currentMoveSegment = [];
          }
        }
        currentMoveSegment.push(pt);
      }
    });
    pushAndClear();
    const movePathStr = moveSegments.map(seg => catmullRomToBezier(seg)).join(' ');
    const weldPathStr = weldSegments.map(seg => catmullRomToBezier(seg)).join(' ');
    return { movePath: movePathStr, weldingPath: weldPathStr };
  }, [pathHistory, transformCoordinate]);
  const currentPosTransformed = useMemo(() => {
    if (!currentPosition) return null;
    return transformCoordinate(currentPosition);
  }, [currentPosition, transformCoordinate]);
  const startPoints = useMemo(() => {
    if (pathHistory.length === 0) return [];
    const points: { x: number; y: number; isWelding: boolean }[] = [];
    let lastWasWelding: boolean | null = null;
    pathHistory.forEach((pos) => {
      const transformed = transformCoordinate(pos);
      if (lastWasWelding !== pos.isWelding) {
        points.push({ ...transformed, isWelding: pos.isWelding || false });
        lastWasWelding = pos.isWelding || false;
      }
    });
    return points;
  }, [pathHistory, transformCoordinate]);
  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ width: '100%', height: '100%' }}
    >
      {}
      <defs>
        <linearGradient id="movePathGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={pathColor} stopOpacity="0.3" />
          <stop offset="100%" stopColor={pathColor} stopOpacity="1" />
        </linearGradient>
        <linearGradient id="weldPathGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={weldingPathColor} stopOpacity="0.3" />
          <stop offset="100%" stopColor={weldingPathColor} stopOpacity="1" />
        </linearGradient>
        {}
        <filter id="weldGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
        {}
        <radialGradient id="currentPosGradient">
          <stop offset="0%" stopColor={currentPositionColor} stopOpacity="1" />
          <stop offset="100%" stopColor={currentPositionColor} stopOpacity="0" />
        </radialGradient>
      </defs>
      {}
      {weldingPath && (
        <>
          {}
          <path
            d={weldingPath}
            fill="none"
            stroke={weldingPathColor}
            strokeWidth={pathStrokeWidth * 3}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.3}
            filter="url(#weldGlow)"
          />
          {}
          <path
            d={weldingPath}
            fill="none"
            stroke={weldingPathColor}
            strokeWidth={pathStrokeWidth * 1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
      {}
      {startPoints.filter(p => p.isWelding).map((point, index) => (
        <circle
          key={`start-${index}`}
          cx={point.x}
          cy={point.y}
          r={4}
          fill={weldingPathColor}
          opacity={0.8}
        />
      ))}
      {}
      {currentPosTransformed && (
        <g>
          {}
          {animated && (
            <circle
              cx={currentPosTransformed.x}
              cy={currentPosTransformed.y}
              r={12}
              fill="none"
              stroke={currentPositionColor}
              strokeWidth={2}
              opacity={0.5}
            >
              <animate
                attributeName="r"
                values="8;16;8"
                dur="1.5s"
                repeatCount="indefinite"
              />
              <animate
                attributeName="opacity"
                values="0.8;0.2;0.8"
                dur="1.5s"
                repeatCount="indefinite"
              />
            </circle>
          )}
          {}
          <circle
            cx={currentPosTransformed.x}
            cy={currentPosTransformed.y}
            r={6}
            fill={currentPosition?.isWelding ? weldingPathColor : currentPositionColor}
            stroke="white"
            strokeWidth={2}
          />
          {}
          {pathHistory.length > 1 && (
            <polygon
              points={`
                ${currentPosTransformed.x},${currentPosTransformed.y - 12}
                ${currentPosTransformed.x - 5},${currentPosTransformed.y - 6}
                ${currentPosTransformed.x + 5},${currentPosTransformed.y - 6}
              `}
              fill={currentPositionColor}
              opacity={0.8}
            />
          )}
        </g>
      )}
      {}
      {currentPosition && currentPosTransformed && (
        <text
          x={currentPosTransformed.x + 15}
          y={currentPosTransformed.y - 10}
          fill="white"
          fontSize="10"
          fontFamily="monospace"
          opacity={0.9}
        >
          ({currentPosition.x.toFixed(1)}, {currentPosition.y.toFixed(1)})
        </text>
      )}
    </svg>
  );
};
export const RobotPathOverlay = memo(RobotPathOverlayComponent);
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
type SortablePointItemProps = Omit<PointItemProps, 'isDraggable' | 'dragHandleProps'>;
export function SortablePointItem(props: SortablePointItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.point.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : undefined,
  };
  return (
    <div ref={setNodeRef} style={style}>
      <PointItem
        {...props}
        isDraggable={true}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
}
export const SortablePointItem_SortablePointItem = SortablePointItem;
interface TeachingPointPanelProps {
  teachingPoints: TeachingPoint[];
  selectedPointId: string | null;
  isRobotMoving: boolean;
  onSelectPoint: (pointId: string) => void;
  onSavePoint: (pointId: string) => void;
  onClearPoint: (pointId: string) => void;
  onMoveToPoint: (point: TeachingPoint) => void;
  onUpdateSpeed: (pointId: string, speed: number, velMode?: 0 | 1) => void;
  onUpdateWeldParams: (pointId: string, voltage: number | null, current: number | null) => void;
  onUpdateWeavingType: (pointId: string, type: string | null) => void;
}
const TeachingPointPanel: React.FC<TeachingPointPanelProps> = memo(
  ({
    teachingPoints,
    selectedPointId,
    isRobotMoving,
    onSelectPoint,
    onSavePoint,
    onClearPoint,
    onMoveToPoint,
    onUpdateSpeed,
    onUpdateWeldParams,
    onUpdateWeavingType,
  }) => {
    const selectedPoint = teachingPoints.find(pt => pt.id === selectedPointId);
    return (
      <div className="flex flex-col h-full">
        {}
        <div className="flex-1 overflow-y-auto space-y-1 pr-1">
          {teachingPoints.map(point => (
            <div
              key={point.id}
              onClick={() => onSelectPoint(point.id)}
              className={`
              flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all
              ${
                selectedPointId === point.id
                  ? 'bg-cyan-500/20 border border-cyan-500/50'
                  : 'bg-gray-800/50 border border-transparent hover:bg-gray-700/50'
              }
            `}
            >
              <div className="flex items-center gap-2">
                {point.id === 'home' ? (
                  <Home
                    className={`w-4 h-4 ${point.isSaved ? 'text-green-400' : 'text-gray-500'}`}
                  />
                ) : (
                  <Circle
                    className={`w-4 h-4 ${point.isSaved ? 'text-cyan-400' : 'text-gray-500'}`}
                  />
                )}
                <span className={`text-sm ${point.isSaved ? 'text-white' : 'text-gray-500'}`}>
                  {point.name}
                </span>
              </div>
              <div className="flex items-center gap-1">
                {point.isSaved && (
                  <span className="text-xs text-green-400 bg-green-400/10 px-1.5 py-0.5 rounded">
                    저장됨
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
        {}
        {selectedPoint && (
          <div className="mt-3 p-3 bg-gray-800/80 rounded-lg border border-gray-700 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                <MapPin className="w-4 h-4 text-cyan-400" />
                {selectedPoint.name}
              </h4>
              <div className="flex gap-1">
                <button
                  onClick={() => onSavePoint(selectedPoint.id)}
                  className="p-1.5 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded transition"
                  title="현재 위치 저장"
                >
                  <Save className="w-4 h-4" />
                </button>
                {selectedPoint.isSaved && (
                  <>
                    <button
                      onClick={() => onMoveToPoint(selectedPoint)}
                      disabled={isRobotMoving}
                      className="p-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 rounded transition disabled:opacity-50"
                      title="이 위치로 이동"
                    >
                      <Navigation className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onClearPoint(selectedPoint.id)}
                      className="p-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded transition"
                      title="포인트 삭제"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            </div>
            {}
            {selectedPoint.isSaved && selectedPoint.tcp && (
              <div className="text-xs text-gray-400 space-y-1">
                <div className="grid grid-cols-3 gap-2">
                  <span>X: {selectedPoint.tcp.x.toFixed(2)}</span>
                  <span>Y: {selectedPoint.tcp.y.toFixed(2)}</span>
                  <span>Z: {selectedPoint.tcp.z.toFixed(2)}</span>
                </div>
              </div>
            )}
            {}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 w-16">이동속도</span>
                <div className="flex-1 flex items-center gap-2">
                  {}
                  <div className="flex bg-gray-700 rounded overflow-hidden">
                    <button
                      onClick={() =>
                        onUpdateSpeed(
                          selectedPoint.id,
                          selectedPoint.velMode === 1 ? 20 : selectedPoint.moveSpeed,
                          0,
                        )
                      }
                      className={`px-2 py-0.5 text-xs transition ${
                        selectedPoint.velMode === 0
                          ? 'bg-cyan-500 text-white'
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      %
                    </button>
                    <button
                      onClick={() =>
                        onUpdateSpeed(
                          selectedPoint.id,
                          selectedPoint.velMode === 0 ? 30 : selectedPoint.moveSpeed,
                          1,
                        )
                      }
                      className={`px-2 py-0.5 text-xs transition ${
                        selectedPoint.velMode === 1
                          ? 'bg-cyan-500 text-white'
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      CPM
                    </button>
                  </div>
                  {}
                  {selectedPoint.velMode === 0 ? (
                    <>
                      <input
                        type="range"
                        min="1"
                        max="100"
                        value={selectedPoint.moveSpeed}
                        onChange={e => onUpdateSpeed(selectedPoint.id, Number(e.target.value), 0)}
                        className="flex-1 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                      />
                      <span className="text-xs text-cyan-400 w-12 text-right">
                        {selectedPoint.moveSpeed}%
                      </span>
                    </>
                  ) : (
                    <>
                      <input
                        type="number"
                        min="1"
                        max="200"
                        value={selectedPoint.moveSpeed}
                        onChange={e => onUpdateSpeed(selectedPoint.id, Number(e.target.value), 1)}
                        className="w-16 px-2 py-0.5 bg-gray-700 border border-gray-600 rounded text-sm text-white text-center"
                      />
                      <span className="text-xs text-cyan-400">cm/min</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            {}
            {selectedPoint.id !== 'home' && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">용접전압 (V)</label>
                    <input
                      type="number"
                      value={selectedPoint.weldVoltage ?? ''}
                      onChange={e =>
                        onUpdateWeldParams(
                          selectedPoint.id,
                          e.target.value ? Number(e.target.value) : null,
                          selectedPoint.weldCurrent,
                        )
                      }
                      className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-white"
                      placeholder="22"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">용접전류 (A)</label>
                    <input
                      type="number"
                      value={selectedPoint.weldCurrent ?? ''}
                      onChange={e =>
                        onUpdateWeldParams(
                          selectedPoint.id,
                          selectedPoint.weldVoltage,
                          e.target.value ? Number(e.target.value) : null,
                        )
                      }
                      className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-white"
                      placeholder="200"
                    />
                  </div>
                </div>
                {}
                <div>
                  <label className="text-xs text-gray-400 block mb-1">위빙 타입</label>
                  <select
                    value={selectedPoint.weavingType ?? 'none'}
                    onChange={e =>
                      onUpdateWeavingType(
                        selectedPoint.id,
                        e.target.value === 'none' ? null : e.target.value,
                      )
                    }
                    className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-white"
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
        )}
      </div>
    );
  },
);
TeachingPointPanel.displayName = 'TeachingPointPanel';
export const TeachingPointPanel_TeachingPointPanel = TeachingPointPanel;
export interface TeachingTabContentProps {
  teachingPoints: TeachingPoint[];
  selectedPointId: string | null;
  isRobotMoving: boolean;
  isWelding: boolean;
  isTouchSensing: boolean;
  isTeachingPolling: boolean;
  teachingRobotState: { connected?: boolean } | null;
  manualMoveSpeed: number;
  simulationMode: boolean;
  dryRunMode: boolean;
  currentPointIndex: number;
  savedPointsCount: number;
  isSavingJob: boolean;
  onSelectPoint: (id: string | null) => void;
  onSavePosition: (id: string) => void;
  onClearPoint: (id: string) => void;
  onClearAllPoints: () => void;
  onMoveToPoint: (point: TeachingPoint) => void;
  onSpeedChange: (speed: number) => void;
  onSimulationModeChange: (enabled: boolean) => void;
  onDryRunModeChange: (enabled: boolean) => void;
  onStartTouchSensing: () => void;
  onStopTouchSensing: () => void;
  onStartWelding: () => void;
  onStartWeldingTest?: () => void;
  onContinueWelding: () => void;
  onStopWelding: () => void;
  onOpenJobList: () => void;
  onSaveJob: () => void;
  onUpdatePointSpeed: (pointId: string, speed: number, velMode?: 0 | 1) => void;
  onUpdatePointWeldParams: (pointId: string, voltage: number | null, current: number | null) => void;
  onUpdatePointGap: (pointId: string, gap: number) => void;
  gapThicknessMm: number;
  onGapThicknessChange: (v: number) => void;
  onUpdatePointWeaveParams: (pointId: string, params: Partial<WeaveParams>) => void;
  onUpdatePointWeavingType: (pointId: string, type: string | null) => void;
  onApplyParamsToBlock: (sourcePointId: string) => void;
  onApplyParamsToAll: (sourcePointId: string) => void;
  onReorderPoints: (activeId: string, overId: string) => void;
  onGlobalEmergencyStop: () => void;
}
export function TeachingTabContent({
  teachingPoints,
  selectedPointId,
  isRobotMoving,
  isWelding,
  isTouchSensing,
  isTeachingPolling,
  teachingRobotState,
  manualMoveSpeed,
  simulationMode,
  dryRunMode,
  currentPointIndex,
  savedPointsCount,
  isSavingJob,
  onSelectPoint,
  onSavePosition,
  onClearPoint,
  onClearAllPoints,
  onMoveToPoint,
  onSpeedChange,
  onSimulationModeChange,
  onDryRunModeChange,
  onStartTouchSensing,
  onStopTouchSensing,
  onStartWelding,
  onStartWeldingTest,
  onContinueWelding,
  onStopWelding,
  onOpenJobList,
  onSaveJob,
  onUpdatePointSpeed,
  onUpdatePointWeldParams,
  onUpdatePointGap,
  gapThicknessMm,
  onGapThicknessChange,
  onUpdatePointWeaveParams,
  onUpdatePointWeavingType,
  onApplyParamsToBlock,
  onApplyParamsToAll,
  onReorderPoints,
  onGlobalEmergencyStop,
}: TeachingTabContentProps) {
  const isRunning = isRobotMoving || isWelding || isTouchSensing;
  const savedPoints = teachingPoints.filter(pt => pt.id !== 'home' && pt.isSaved);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      onReorderPoints(active.id as string, over.id as string);
    }
  };
  const sortableIds = teachingPoints
    .filter(pt => pt.id !== 'home')
    .map(pt => pt.id);
  return (
    <div className="space-y-4">
      {}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MapPin className="w-5 h-5 text-purple-400" />
          <span className="text-white font-medium">포인트 티칭</span>
          <span className="text-xs text-gray-400">({savedPointsCount}/{teachingPoints.length})</span>
        </div>
        <div className="flex gap-1 items-center">
          <button onClick={onOpenJobList} className="p-1.5 flex items-center justify-center bg-cyan-500/20 text-cyan-400 rounded hover:bg-cyan-500/30" title="불러오기">
            <FolderOpen className="w-4 h-4" />
          </button>
          <button onClick={onSaveJob} disabled={savedPointsCount === 0 || isSavingJob} className="p-1.5 flex items-center justify-center bg-green-500/20 text-green-400 rounded hover:bg-green-500/30 disabled:opacity-50" title="저장">
            <Save className="w-4 h-4" />
          </button>
          <button onClick={onClearAllPoints} disabled={savedPointsCount === 0} className="p-1.5 flex items-center justify-center bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 disabled:opacity-50" title="초기화">
            <Trash2 className="w-4 h-4" />
          </button>
          <div className="w-px h-5 bg-gray-700 mx-1" />
          <button
            onClick={() => onSimulationModeChange(!simulationMode)}
            className={`px-2 py-1 text-xs rounded flex items-center gap-1 ${simulationMode ? 'bg-yellow-500/20 text-yellow-400' : 'bg-gray-600 text-gray-400'}`}
            title="시뮬레이션 모드"
          >
            <Zap className="w-3 h-3" />
            {simulationMode ? 'SIM' : 'SIM'}
          </button>
        </div>
      </div>
      {}
      <div className="bg-gray-800/50 rounded-lg p-3">
        <div className="flex justify-between mb-2">
          <span className="text-xs text-gray-400">이동 속도</span>
          <span className="text-xs text-cyan-400 font-mono">{manualMoveSpeed}%</span>
        </div>
        <input
          type="range"
          min="1"
          max="100"
          value={manualMoveSpeed}
          onChange={(e) => onSpeedChange(Number(e.target.value))}
          className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
        />
      </div>
      {}
      {!simulationMode && (
        <div>
          <label className={`flex items-center justify-between p-2.5 bg-gray-800/50 rounded-lg cursor-pointer hover:bg-gray-800/70 transition-colors ${isRunning ? 'opacity-50 cursor-not-allowed' : ''}`}>
            <div className="flex items-center gap-2">
              <Settings className={`w-4 h-4 ${dryRunMode ? 'text-orange-400' : 'text-gray-400'}`} />
              <span className={`text-sm ${dryRunMode ? 'text-orange-300' : 'text-gray-300'}`}>DryRun 모드</span>
              <span className="text-xs text-gray-500">(아크/가스 없이 이동만)</span>
            </div>
            <div
              onClick={(e) => { if (!isRunning) { e.preventDefault(); onDryRunModeChange(!dryRunMode); } }}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                dryRunMode ? 'bg-orange-500' : 'bg-gray-600'
              }`}
            >
              <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                dryRunMode ? 'translate-x-5' : 'translate-x-0'
              }`} />
            </div>
          </label>
        </div>
      )}
      {}
      {!isWelding && !isTouchSensing ? (
        <div className="flex gap-1.5">
          {!simulationMode && (
            <button
              onClick={onStartTouchSensing}
              disabled={isRunning || savedPoints.length === 0}
              className={`flex-1 py-2.5 ${
                dryRunMode ? 'bg-purple-500/80 hover:bg-purple-400/80' : 'bg-purple-600 hover:bg-purple-500'
              } disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg flex flex-col items-center justify-center`}
            >
              <Crosshair className="w-4 h-4 mb-0.5" />
              {dryRunMode ? '터치테스트' : '터치센싱'}
            </button>
          )}
          {}
          {!simulationMode && onStartWeldingTest && (
            <button
              onClick={onStartWeldingTest}
              disabled={isRunning || savedPoints.length === 0}
              className="flex-1 py-2.5 bg-yellow-600 hover:bg-yellow-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg flex flex-col items-center justify-center"
            >
              <span>용접</span>
              <span>테스트</span>
            </button>
          )}
          <button
            onClick={onStartWelding}
            disabled={isRunning || savedPoints.length === 0}
            className="flex-1 py-2.5 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg flex flex-col items-center justify-center"
          >
            {simulationMode ? <Zap className="w-4 h-4 mb-0.5" /> : null}
            <span>{simulationMode ? '시뮬레이션' : (dryRunMode ? 'DryRun' : '용접')}</span>
            {!simulationMode && <span>시작</span>}
          </button>
          {!simulationMode && (
            <button
              onClick={onContinueWelding}
              disabled={isRunning || savedPoints.length === 0}
              className="flex-1 py-2.5 bg-orange-600 hover:bg-orange-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg flex flex-col items-center justify-center"
            >
              <span>{dryRunMode ? 'DryRun' : '용접'}</span>
              <span>계속</span>
            </button>
          )}
          <button
            onClick={onGlobalEmergencyStop}
            className={`flex-1 py-2.5 text-white text-xs font-bold rounded-lg flex flex-col items-center justify-center border-2 transition ${
              isRunning
                ? 'bg-red-600 hover:bg-red-500 border-red-400 animate-pulse'
                : 'bg-red-700 hover:bg-red-600 border-red-500'
            }`}
          >
            <Square className="w-4 h-4 mb-0.5" />
            비상정지
          </button>
        </div>
      ) : (
        <div className="flex gap-1.5">
          <div className={`flex-1 p-2.5 rounded-lg border animate-pulse ${
            isTouchSensing ? 'bg-purple-900/30 border-purple-500/30' : 'bg-yellow-900/30 border-yellow-500/30'
          }`}>
            <p className={`text-sm font-medium ${isTouchSensing ? 'text-purple-400' : 'text-yellow-400'}`}>
              {isTouchSensing
                ? (dryRunMode ? '터치 테스트' : '터치 센싱')
                : (dryRunMode ? 'DryRun' : '용접')
              } 진행 중: {currentPointIndex + 1} / {savedPoints.length}
            </p>
          </div>
          <button
            onClick={onGlobalEmergencyStop}
            className="px-4 py-2.5 text-white text-xs font-bold rounded-lg flex flex-col items-center justify-center border-2 bg-red-600 hover:bg-red-500 border-red-400 animate-pulse"
          >
            <Square className="w-4 h-4 mb-0.5" />
            비상정지
          </button>
        </div>
      )}
      {}
      <div className="space-y-0.5">
        {}
        {teachingPoints.filter(pt => pt.id === 'home').map((point) => (
          <PointItem
            key={point.id}
            point={point}
            isSelected={selectedPointId === point.id}
            isRunning={isRunning}
            isTeachingPolling={isTeachingPolling}
            teachingRobotConnected={teachingRobotState?.connected ?? false}
            isDraggable={false}
            onSelect={() => onSelectPoint(selectedPointId === point.id ? null : point.id)}
            onSavePosition={() => onSavePosition(point.id)}
            onClearPoint={() => onClearPoint(point.id)}
            onMoveToPoint={() => onMoveToPoint(point)}
            onUpdateSpeed={(speed, velMode) => onUpdatePointSpeed(point.id, speed, velMode)}
            onUpdateWeldParams={(voltage, current) => onUpdatePointWeldParams(point.id, voltage, current)}
            onUpdateGap={(gap) => onUpdatePointGap(point.id, gap)}
            gapThicknessMm={gapThicknessMm}
            onUpdateWeaveParams={(params) => onUpdatePointWeaveParams(point.id, params)}
            onUpdateWeavingType={(type) => onUpdatePointWeavingType(point.id, type)}
            onApplyParamsToBlock={() => onApplyParamsToBlock(point.id)}
            onApplyParamsToAll={() => onApplyParamsToAll(point.id)}
            onSaveJob={onSaveJob}
          />
        ))}
        {}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
            {teachingPoints.filter(pt => pt.id !== 'home').map((point) => (
              <SortablePointItem
                key={point.id}
                point={point}
                isSelected={selectedPointId === point.id}
                isRunning={isRunning}
                isTeachingPolling={isTeachingPolling}
                teachingRobotConnected={teachingRobotState?.connected ?? false}
                onSelect={() => onSelectPoint(selectedPointId === point.id ? null : point.id)}
                onSavePosition={() => onSavePosition(point.id)}
                onClearPoint={() => onClearPoint(point.id)}
                onMoveToPoint={() => onMoveToPoint(point)}
                onUpdateSpeed={(speed, velMode) => onUpdatePointSpeed(point.id, speed, velMode)}
                onUpdateWeldParams={(voltage, current) => onUpdatePointWeldParams(point.id, voltage, current)}
                onUpdateGap={(gap) => onUpdatePointGap(point.id, gap)}
                    gapThicknessMm={gapThicknessMm}
                onUpdateWeaveParams={(params) => onUpdatePointWeaveParams(point.id, params)}
                onUpdateWeavingType={(type) => onUpdatePointWeavingType(point.id, type)}
                onApplyParamsToBlock={() => onApplyParamsToBlock(point.id)}
                onApplyParamsToAll={() => onApplyParamsToAll(point.id)}
                onSaveJob={onSaveJob}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}
export const TeachingTabContent_TeachingTabContent = TeachingTabContent;
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
        title="와이어 정밀 조정 (스틱아웃 세팅)"
      >
        정밀 조정
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
/* eslint-disable react/prop-types */
const UnifiedWorkspaceCanvasComponent: React.FC<UnifiedWorkspaceCanvasProps> = ({
  ucellConfig,
  workspaceConfig = DEFAULT_WORKSPACE,
  pathHistory = [],
  currentPosition,
  pausedPosition,
  weldPoints = [],
  centerlinePath = [],
  centerlinePoints = [],
  onCenterlinePointClick,
  partWeldEnabled,
  partSavedPointCounts,
  onPartWeldToggle,
  ucellWidth = 600,
  ucellHeight = 550,
  canvasWidth = 600,
  canvasHeight = 450,
  colors = {},
  animated = true,
  onSegmentChange,
  onWeldPointClick,
  onReorderPoints,
  className = '',
}) => {
  const mergedColors = { ...DEFAULT_COLORS, ...colors };
  const { bounds: configBounds, showGrid, gridSpacing } = { ...DEFAULT_WORKSPACE, ...workspaceConfig };
  const bounds = useMemo(() => {
    if (pathHistory.length === 0) {
      return configBounds;
    }
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    pathHistory.forEach(p => {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    });
    if (minX >= configBounds.minX && maxX <= configBounds.maxX &&
        minY >= configBounds.minY && maxY <= configBounds.maxY) {
      return configBounds;
    }
    const rangeX = maxX - minX || 100;
    const rangeY = maxY - minY || 100;
    const margin = 0.2;
    return {
      minX: Math.min(configBounds.minX, minX - rangeX * margin),
      maxX: Math.max(configBounds.maxX, maxX + rangeX * margin),
      minY: Math.min(configBounds.minY, minY - rangeY * margin),
      maxY: Math.max(configBounds.maxY, maxY + rangeY * margin),
    };
  }, [pathHistory, configBounds]);
  const transform = useCallback(
    (pos: { x: number; y: number }) => {
      const scaleX = canvasWidth / (bounds.maxX - bounds.minX);
      const scaleY = canvasHeight / (bounds.maxY - bounds.minY);
      return {
        x: (pos.x - bounds.minX) * scaleX,
        y: canvasHeight - (pos.y - bounds.minY) * scaleY,
      };
    },
    [canvasWidth, canvasHeight, bounds]
  );
  const {
    svgRef,
    dragState,
    dropTargetId,
    validTargetIds,
    handlePointMouseDown,
    handleSvgMouseMove,
    handleSvgMouseUp,
    handleSvgMouseLeave,
  } = useDragAndDrop(weldPoints, transform, onReorderPoints, onWeldPointClick);
  const [partOrderMap, setPartOrderMap] = useState<Record<number, number>>({});
  useEffect(() => {
    getWeldingPartOrder().then((order: WeldingPartOrderItem[]) => {
      const map: Record<number, number> = {};
      order.forEach(o => { map[o.part_index] = o.execution_order; });
      setPartOrderMap(map);
    }).catch(() => {});
  }, []);
  const partToggles = useMemo<PartToggleConfig[]>(() => {
    if (!partWeldEnabled) return [];
    const halfWidth = ucellWidth / 2;
    const halfHeight = ucellHeight / 2;
    const getPointCount = (index: number) => partSavedPointCounts?.[index] ?? 0;
    return [
      {
        index: 0, name: '파트1', enabled: partWeldEnabled[0] ?? true,
        position: { x: -halfWidth / 2, y: -halfHeight + 50 }, labelOffset: { x: 0, y: 0 },
        canToggle: getPointCount(0) >= 2, savedPointCount: getPointCount(0),
        executionOrder: partOrderMap[0],
      },
      {
        index: 1, name: '파트2', enabled: partWeldEnabled[1] ?? true,
        position: { x: -halfWidth + 60, y: 0 }, labelOffset: { x: 0, y: 0 },
        canToggle: getPointCount(1) >= 2, savedPointCount: getPointCount(1),
        executionOrder: partOrderMap[1],
      },
      {
        index: 2, name: '파트3', enabled: partWeldEnabled[2] ?? true,
        position: { x: halfWidth / 2, y: -halfHeight + 50 }, labelOffset: { x: 0, y: 0 },
        canToggle: getPointCount(2) >= 2, savedPointCount: getPointCount(2),
        executionOrder: partOrderMap[2],
      },
      {
        index: 3, name: '파트4', enabled: partWeldEnabled[3] ?? true,
        position: { x: halfWidth - 60, y: 0 }, labelOffset: { x: 0, y: 0 },
        canToggle: getPointCount(3) >= 2, savedPointCount: getPointCount(3),
        executionOrder: partOrderMap[3],
      },
    ];
  }, [partWeldEnabled, partSavedPointCounts, ucellWidth, ucellHeight, partOrderMap]);
  return (
    <svg
      ref={svgRef}
      width={canvasWidth}
      height={canvasHeight}
      viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
      className={`drop-shadow-lg ${className}`}
      style={{ background: 'transparent' }}
      onMouseMove={handleSvgMouseMove}
      onMouseUp={handleSvgMouseUp}
      onMouseLeave={handleSvgMouseLeave}
    >
      {}
      {showGrid && (
        <GridLayer
          bounds={bounds}
          spacing={gridSpacing || 100}
          color={mergedColors.grid}
          transform={transform}
        />
      )}
      {}
      {ucellConfig && (
        <UCellLayer
          config={ucellConfig}
          color={mergedColors.ucell}
          transform={transform}
          onSegmentChange={onSegmentChange}
        />
      )}
      {}
      {pathHistory.length > 0 && (
        <PathLayer
          pathHistory={pathHistory}
          movePathColor={mergedColors.movePath}
          weldingPathColor={mergedColors.weldingPath}
          strokeWidth={2}
          transform={transform}
        />
      )}
      {}
      {centerlinePath.length > 0 && (
        <CenterlineLayer
          centerlinePath={centerlinePath}
          centerlinePoints={centerlinePoints}
          color={mergedColors.centerline}
          strokeWidth={1.5}
          transform={transform}
          onPointClick={onCenterlinePointClick}
        />
      )}
      {}
      {weldPoints.length > 0 && (
        <DimensionLinesLayer
          points={weldPoints}
          transform={transform}
        />
      )}
      {}
      {weldPoints.length > 0 && (
        <WeldPointsLayer
          points={weldPoints}
          color={mergedColors.weldPoint}
          completedColor={mergedColors.weldPointCompleted}
          transform={transform}
          onClick={dragState?.isDragging ? undefined : onWeldPointClick}
          draggingId={dragState?.isDragging ? dragState.pointId : null}
          dropTargetId={dropTargetId}
          validTargetIds={dragState?.isDragging ? validTargetIds : undefined}
          onMouseDown={onReorderPoints ? handlePointMouseDown : undefined}
        />
      )}
      {}
      {dragState?.isDragging && (
        <g style={{ pointerEvents: 'none' }}>
          <circle
            cx={dragState.currentX}
            cy={dragState.currentY}
            r={14}
            fill={dragState.point.completed ? mergedColors.weldPointCompleted : mergedColors.weldPoint}
            stroke="white"
            strokeWidth={2.5}
            opacity={0.8}
          />
          {dragState.point.order !== undefined && (
            <text
              x={dragState.currentX}
              y={dragState.currentY + 5}
              fill="white"
              fontSize="14"
              fontWeight="bold"
              textAnchor="middle"
            >
              {dragState.point.order}
            </text>
          )}
        </g>
      )}
      {}
      {partToggles.length > 0 && (
        <PartToggleLayer
          partToggles={partToggles}
          transform={transform}
          onToggle={onPartWeldToggle}
        />
      )}
      {}
      {pausedPosition && !currentPosition && (
        <g>
          {(() => {
            const pos = transform(pausedPosition);
            return (
              <>
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={15}
                  fill="none"
                  stroke={mergedColors.pausedPosition}
                  strokeWidth={2}
                  strokeDasharray="4 2"
                  opacity={0.6}
                >
                  <animate
                    attributeName="r"
                    values="12;20;12"
                    dur="2s"
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="opacity"
                    values="0.8;0.3;0.8"
                    dur="2s"
                    repeatCount="indefinite"
                  />
                </circle>
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={8}
                  fill={mergedColors.pausedPosition}
                  stroke="white"
                  strokeWidth={2}
                />
                <rect
                  x={pos.x - 4}
                  y={pos.y - 4}
                  width={2.5}
                  height={8}
                  fill="white"
                  rx={0.5}
                />
                <rect
                  x={pos.x + 1.5}
                  y={pos.y - 4}
                  width={2.5}
                  height={8}
                  fill="white"
                  rx={0.5}
                />
                <text
                  x={pos.x + 15}
                  y={pos.y - 12}
                  fill={mergedColors.pausedPosition}
                  fontSize="11"
                  fontWeight="bold"
                >
                  중단점
                </text>
                <text
                  x={pos.x + 15}
                  y={pos.y + 2}
                  fill="white"
                  fontSize="9"
                  opacity={0.8}
                >
                  ({pausedPosition.x.toFixed(0)}, {pausedPosition.y.toFixed(0)})
                </text>
              </>
            );
          })()}
        </g>
      )}
      {}
      {currentPosition && (
        <CurrentPositionLayer
          position={currentPosition}
          color={mergedColors.currentPosition}
          weldingColor={mergedColors.weldingPath}
          animated={animated}
          transform={transform}
        />
      )}
    </svg>
  );
};
export const UnifiedWorkspaceCanvas = memo(UnifiedWorkspaceCanvasComponent);
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
export { TorchOrientationIndicator_TorchOrientationIndicator as TorchOrientationIndicator };
export { RobotControlPanel_RobotControlPanel as RobotControlPanel };
export { TeachingPointPanel_TeachingPointPanel as TeachingPointPanel };
