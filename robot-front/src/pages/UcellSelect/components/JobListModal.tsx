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
import { JobListItem } from './JobListItem';

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
  pendingDeleteJobIds?: number[];
  onUndoDeleteJob?: (id: number) => void;
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
  pendingDeleteJobIds,
  onUndoDeleteJob,
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
                isPendingDelete={pendingDeleteJobIds?.includes(job.id)}
                onUndoDelete={() => onUndoDeleteJob?.(job.id)}
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
