import React, { useState, useRef, useCallback } from 'react';
import { Play, Pause, Square, ChevronRight, ChevronLeft, MapPin, RotateCcw, Calendar, Clock, Trash2, Edit3, Check, X } from 'lucide-react';
import { TeachingJob, moveToJointPosition, moveToCartesianPosition, setWeaveParams, startWeave, endWeave, startArc, endArc, setWeldingParams, stopRobot, enableRobot, setRobotMode } from '../../../lib';
import { WEAVING_TYPE_OPTIONS } from '../../UcellSelect';
import { formatDateTime } from '../../../utils';
import { createLogger } from '../../../lib';
import { useAlert } from '../../../contexts';
interface JobDetailProps {
  job: TeachingJob;
  isRunning: boolean;
  isPaused: boolean;
  currentPointIndex: number;
  editingPointId: number | null;
  pointParamsMap: Record<number, PointParams>;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onBack: () => void;
  onEditPoint: (pointId: number | null) => void;
  onUpdatePointParams: (pointId: number, params: PointParams) => void;
}
const StatusBadge: React.FC<{ status: string; savedPoints?: number; totalPoints?: number }> = ({
  status, savedPoints, totalPoints,
}) => {
  const { className, label } = getStatusBadgeProps(status, savedPoints, totalPoints);
  return <span className={className}>{label}</span>;
};
const ParamInput: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  small?: boolean;
  onChange: (value: number) => void;
}> = ({ label, value, min, max, step = 1, small = false, onChange }) => (
  <div className="space-y-1">
    <label className={`block text-xs ${small ? 'text-gray-500' : 'text-gray-400'}`}>{label}</label>
    <input
      type="number"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={e => onChange(Number(e.target.value))}
      className={`w-full px-2 ${small ? 'py-1' : 'py-1.5'} bg-gray-900 border border-gray-600 rounded${small ? '' : '-lg'} text-white text-${small ? 'xs' : 'sm'} focus:outline-none focus:border-cyan-500`}
    />
  </div>
);
const JobDetail: React.FC<JobDetailProps> = ({
  job,
  isRunning,
  isPaused,
  currentPointIndex,
  editingPointId,
  pointParamsMap,
  onStart,
  onPause,
  onResume,
  onStop,
  onBack,
  onEditPoint,
  onUpdatePointParams,
}) => {
  const savedPointsCount = job.points?.filter(p => p.is_saved).length || 0;
  return (
    <div className="space-y-4">
      {}
      <div className="bg-gray-800/60 backdrop-blur-sm rounded-2xl p-5 border border-gray-700/50">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-xl font-bold text-white">{job.name}</h3>
            <div className="flex items-center gap-4 text-sm text-gray-400 mt-1">
              {job.cell_name && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-4 h-4" />
                  {job.cell_name}
                </span>
              )}
              <span>
                {job.saved_points || 0}/{job.total_points || 10} 포인트 저장됨
              </span>
            </div>
          </div>
          <StatusBadge status={job.status} savedPoints={job.saved_points} totalPoints={job.total_points} />
        </div>
        {}
        <div className="grid grid-cols-3 gap-3">
          {isPaused ? (
            <button
              onClick={onResume}
              className="py-4 rounded-2xl font-bold text-lg bg-gradient-to-br from-orange-500 to-amber-600 text-white hover:from-orange-400 hover:to-amber-500 transition touch-manipulation flex flex-col items-center justify-center gap-1"
            >
              <RotateCcw className="w-6 h-6" />
              <span>재개</span>
            </button>
          ) : isRunning ? (
            <button
              onClick={onPause}
              className="py-4 rounded-2xl font-bold text-lg bg-gradient-to-br from-yellow-500 to-orange-600 text-white hover:from-yellow-400 hover:to-orange-500 transition touch-manipulation flex flex-col items-center justify-center gap-1"
            >
              <Pause className="w-6 h-6" />
              <span>일시정지</span>
            </button>
          ) : (
            <button
              onClick={onStart}
              disabled={(job.saved_points || 0) === 0}
              className={`py-4 rounded-2xl font-bold text-lg transition touch-manipulation flex flex-col items-center justify-center gap-1 ${
                (job.saved_points || 0) === 0
                  ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                  : 'bg-gradient-to-br from-green-500 to-emerald-600 text-white hover:from-green-400 hover:to-emerald-500'
              }`}
            >
              <Play className="w-6 h-6" />
              <span>시작</span>
            </button>
          )}
          <button
            onClick={onStop}
            disabled={!isRunning && !isPaused}
            className={`py-4 rounded-2xl font-bold text-lg transition touch-manipulation flex flex-col items-center justify-center gap-1 ${
              !isRunning && !isPaused
                ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                : 'bg-gradient-to-br from-red-500 to-rose-600 text-white hover:from-red-400 hover:to-rose-500'
            }`}
          >
            <Square className="w-6 h-6" />
            <span>정지</span>
          </button>
          <button
            onClick={onBack}
            className="py-4 rounded-2xl font-bold text-lg bg-gray-700 text-gray-300 hover:bg-gray-600 transition touch-manipulation flex flex-col items-center justify-center gap-1"
          >
            <ChevronLeft className="w-6 h-6" />
            <span>목록</span>
          </button>
        </div>
        {}
        {isRunning && (
          <div className="mt-4">
            <div className="flex justify-between text-sm text-gray-400 mb-2">
              <span>진행 상황</span>
              <span>{currentPointIndex + 1} / {savedPointsCount}</span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-3">
              <div
                className="bg-gradient-to-r from-cyan-500 to-blue-500 h-3 rounded-full transition-all duration-500"
                style={{
                  width: `${((currentPointIndex + 1) / Math.max(savedPointsCount, 1)) * 100}%`,
                }}
              />
            </div>
          </div>
        )}
      </div>
      {}
      <div className="bg-gray-800/60 backdrop-blur-sm rounded-2xl p-5 border border-gray-700/50">
        <h4 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <MapPin className="w-5 h-5 text-cyan-400" />
          티칭 포인트
          <span className="text-xs text-gray-500 ml-2">(클릭하여 파라미터 편집)</span>
        </h4>
        <div className="space-y-2 max-h-[600px] overflow-y-auto">
          {job.points && job.points.length > 0 ? (
            job.points.map((point, index) => {
              const params = pointParamsMap[point.id] || getDefaultPointParams();
              const isEditing = editingPointId === point.id;
              const isWeldingPoint = point.point_id !== 'home' && point.point_id !== 'p9';
              return (
                <div
                  key={point.id}
                  className={`rounded-xl border transition-all ${
                    isRunning && index === currentPointIndex
                      ? 'border-cyan-500 bg-cyan-500/10'
                      : isEditing
                      ? 'border-orange-500 bg-orange-500/10'
                      : point.is_saved
                      ? 'border-gray-600 bg-gray-900/50 hover:border-gray-500 cursor-pointer'
                      : 'border-gray-700/50 bg-gray-900/30 opacity-50'
                  }`}
                >
                  {}
                  <div
                    className="p-3 flex items-center justify-between"
                    onClick={() => point.is_saved && !isRunning && onEditPoint(isEditing ? null : point.id)}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                          point.is_saved ? 'bg-cyan-500/20 text-cyan-400' : 'bg-gray-700 text-gray-500'
                        }`}
                      >
                        {point.order}
                      </div>
                      <div>
                        <div className="text-white font-medium">{point.name}</div>
                        {point.is_saved && point.tcp && (
                          <div className="text-xs text-gray-500">
                            ({point.tcp.x.toFixed(1)}, {point.tcp.y.toFixed(1)}, {point.tcp.z.toFixed(1)})
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-gray-400">
                      {point.is_saved && (
                        <>
                          <span>속도: {params.moveSpeed}%</span>
                          {isWeldingPoint && (
                            <>
                              <span>전압: {params.weldVoltage}V</span>
                              <span>전류: {params.weldCurrent}A</span>
                            </>
                          )}
                          {params.weavingType !== 'none' && (
                            <span className="text-cyan-400">
                              {WEAVING_TYPE_OPTIONS.find(opt => opt.value === params.weavingType)?.label}
                            </span>
                          )}
                          <ChevronRight className={`w-4 h-4 transition-transform ${isEditing ? 'rotate-90' : ''}`} />
                        </>
                      )}
                    </div>
                  </div>
                  {}
                  {isEditing && point.is_saved && (
                    <div className="px-3 pb-3 border-t border-gray-700/50">
                      <div className="pt-3 space-y-4">
                        {}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <ParamInput
                            label="이동 속도 (%)"
                            value={params.moveSpeed}
                            min={1} max={100}
                            onChange={v => onUpdatePointParams(point.id, { ...params, moveSpeed: v })}
                          />
                          {isWeldingPoint && (
                            <>
                              <ParamInput
                                label="용접 전압 (V)"
                                value={params.weldVoltage}
                                min={10} max={40} step={0.1}
                                onChange={v => onUpdatePointParams(point.id, { ...params, weldVoltage: v })}
                              />
                              <ParamInput
                                label="용접 전류 (A)"
                                value={params.weldCurrent}
                                min={50} max={400}
                                onChange={v => onUpdatePointParams(point.id, { ...params, weldCurrent: v })}
                              />
                              <div className="space-y-1">
                                <label className="block text-xs text-gray-400">위빙 타입</label>
                                <select
                                  value={params.weavingType}
                                  onChange={e => onUpdatePointParams(point.id, { ...params, weavingType: e.target.value })}
                                  className="w-full px-2 py-1.5 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500"
                                >
                                  {WEAVING_TYPE_OPTIONS.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                  ))}
                                </select>
                              </div>
                            </>
                          )}
                        </div>
                        {}
                        {isWeldingPoint && params.weavingType !== 'none' && (
                          <div className="border-t border-gray-700/50 pt-3">
                            <h5 className="text-xs font-medium text-cyan-400 mb-2">
                              위빙 세부 설정 ({WEAVING_TYPE_OPTIONS.find(opt => opt.value === params.weavingType)?.label})
                            </h5>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                              <ParamInput small label="주파수 (Hz)" value={params.weaveFrequency}
                                min={0.5} max={10} step={0.1}
                                onChange={v => onUpdatePointParams(point.id, { ...params, weaveFrequency: v })} />
                              <ParamInput small label="범위/진폭 (mm)" value={params.weaveRange}
                                min={0} max={20} step={0.5}
                                onChange={v => onUpdatePointParams(point.id, { ...params, weaveRange: v })} />
                              <ParamInput small label="좌측 체류 (ms)" value={params.weaveLeftStayTime}
                                min={0} max={1000} step={10}
                                onChange={v => onUpdatePointParams(point.id, { ...params, weaveLeftStayTime: v })} />
                              <ParamInput small label="우측 체류 (ms)" value={params.weaveRightStayTime}
                                min={0} max={1000} step={10}
                                onChange={v => onUpdatePointParams(point.id, { ...params, weaveRightStayTime: v })} />
                              {params.weavingType === 'vertical_triangle' && (
                                <>
                                  <ParamInput small label="좌측 현길이 (mm)" value={params.weaveLeftRange}
                                    min={0} max={20} step={0.5}
                                    onChange={v => onUpdatePointParams(point.id, { ...params, weaveLeftRange: v })} />
                                  <ParamInput small label="우측 현길이 (mm)" value={params.weaveRightRange}
                                    min={0} max={20} step={0.5}
                                    onChange={v => onUpdatePointParams(point.id, { ...params, weaveRightRange: v })} />
                                </>
                              )}
                              {(params.weavingType === 'circle_cw' || params.weavingType === 'circle_ccw') && (
                                <ParamInput small label="회전비율 (%)" value={params.weaveCircleRadio}
                                  min={0} max={100} step={5}
                                  onChange={v => onUpdatePointParams(point.id, { ...params, weaveCircleRadio: v })} />
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="text-center py-8 text-gray-500">저장된 포인트가 없습니다.</div>
          )}
        </div>
      </div>
    </div>
  );
};
export const JobDetail_JobDetail = JobDetail;
interface JobListProps {
  jobs: TeachingJob[];
  isFiltered?: boolean;
  selectedJobId: number | null;
  page: number;
  itemsPerPage: number;
  editingJobId: number | null;
  editingJobName: string;
  onSelectJob: (jobId: number) => void;
  onDeleteJob: (jobId: number) => void;
  onStartEdit: (jobId: number, jobName: string) => void;
  onSaveJobName: (jobId: number) => void;
  onCancelEdit: () => void;
  onEditingNameChange: (name: string) => void;
  onPageChange: (page: number) => void;
}
const StatusBadge_JobList: React.FC<{ status: string; savedPoints?: number; totalPoints?: number }> = ({
  status, savedPoints, totalPoints,
}) => {
  const { className, label } = getStatusBadgeProps(status, savedPoints, totalPoints);
  return <span className={className}>{label}</span>;
};
const JobList: React.FC<JobListProps> = ({
  jobs,
  isFiltered,
  selectedJobId,
  page,
  itemsPerPage,
  editingJobId,
  editingJobName,
  onSelectJob,
  onDeleteJob,
  onStartEdit,
  onSaveJobName,
  onCancelEdit,
  onEditingNameChange,
  onPageChange,
}) => {
  if (jobs.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500">
        <Calendar className="w-16 h-16 mx-auto mb-4 opacity-50" />
        {isFiltered ? (
          <p className="text-lg">조건에 맞는 작업이 없습니다.</p>
        ) : (
          <>
            <p className="text-lg">저장된 작업이 없습니다.</p>
            <p className="text-sm mt-2">티칭 화면에서 새 작업을 생성해주세요.</p>
          </>
        )}
      </div>
    );
  }
  const totalPages = Math.ceil(jobs.length / itemsPerPage);
  const pagedJobs = jobs.slice((page - 1) * itemsPerPage, page * itemsPerPage);
  return (
    <div className="space-y-3">
      {pagedJobs.map(job => (
        <div
          key={job.id}
          className={`bg-gray-800/60 backdrop-blur-sm rounded-2xl p-5 border transition cursor-pointer ${
            selectedJobId === job.id
              ? 'border-cyan-500'
              : 'border-gray-700/50 hover:border-cyan-500/50'
          }`}
          onClick={() => onSelectJob(job.id)}
        >
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              {editingJobId === job.id ? (
                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                  <input
                    type="text"
                    value={editingJobName}
                    onChange={e => onEditingNameChange(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') onSaveJobName(job.id);
                      else if (e.key === 'Escape') onCancelEdit();
                    }}
                    className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                    autoFocus
                  />
                  <button
                    onClick={() => onSaveJobName(job.id)}
                    className="p-2 text-green-400 hover:bg-green-500/10 rounded-lg transition"
                  >
                    <Check className="w-5 h-5" />
                  </button>
                  <button
                    onClick={onCancelEdit}
                    className="p-2 text-gray-400 hover:bg-gray-700 rounded-lg transition"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold text-white truncate">{job.name}</h3>
                    <StatusBadge_JobList status={job.status} savedPoints={job.saved_points} totalPoints={job.total_points} />
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-400">
                    {job.cell_name && (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-4 h-4" />
                        {job.cell_name}
                      </span>
                    )}
                    {job.created_at && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {formatDateTime(job.created_at)}
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
            <div className="flex items-center gap-2 ml-4" onClick={e => e.stopPropagation()}>
              <button
                onClick={() => onStartEdit(job.id, job.name)}
                className="p-3 text-gray-400 hover:text-cyan-400 hover:bg-cyan-500/10 rounded-xl transition touch-manipulation"
              >
                <Edit3 className="w-5 h-5" />
              </button>
              <button
                onClick={() => onDeleteJob(job.id)}
                className="p-3 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition touch-manipulation"
              >
                <Trash2 className="w-5 h-5" />
              </button>
              <ChevronRight className="w-5 h-5 text-gray-500" />
            </div>
          </div>
        </div>
      ))}
      {}
      {jobs.length > itemsPerPage && (
        <div className="flex items-center justify-center gap-4 pt-4">
          <button
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page === 1}
            className="p-2 rounded-lg bg-gray-700 text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-gray-400">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            className="p-2 rounded-lg bg-gray-700 text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
};
export const JobList_JobList = JobList;
export type TeachingPoint = NonNullable<TeachingJob['points']>[0];
export interface PointParams {
  moveSpeed: number;
  weldVoltage: number;
  weldCurrent: number;
  weavingType: string;
  weaveFrequency: number;
  weaveRange: number;
  weaveLeftRange: number;
  weaveRightRange: number;
  weaveLeftStayTime: number;
  weaveRightStayTime: number;
  weaveCircleRadio: number;
}
export const getDefaultPointParams = (): PointParams => ({
  moveSpeed: 20,
  weldVoltage: 22.0,
  weldCurrent: 180.0,
  weavingType: 'none',
  weaveFrequency: 2.0,
  weaveRange: 3.0,
  weaveLeftRange: 3.0,
  weaveRightRange: 3.0,
  weaveLeftStayTime: 0,
  weaveRightStayTime: 0,
  weaveCircleRadio: 50,
});
export const getPointParams = (
  point: TeachingPoint,
  pointParamsMap: Record<number, PointParams>
): PointParams => {
  if (pointParamsMap[point.id]) {
    return pointParamsMap[point.id];
  }
  return {
    moveSpeed: point.move_speed || 20,
    weldVoltage: point.weld_voltage || 22.0,
    weldCurrent: point.weld_current || 180.0,
    weavingType: point.weaving_type || 'none',
    weaveFrequency: 2.0,
    weaveRange: 3.0,
    weaveLeftRange: 3.0,
    weaveRightRange: 3.0,
    weaveLeftStayTime: 0,
    weaveRightStayTime: 0,
    weaveCircleRadio: 50,
  };
};
export type StatusFilter = 'all' | 'completed' | 'running' | 'teaching_done' | 'teaching_progress' | 'waiting';
export const getStatusCategory = (status: string, savedPoints?: number, totalPoints?: number): Exclude<StatusFilter, 'all'> => {
  const saved = savedPoints || 0;
  const total = totalPoints || 10;
  if (status === 'completed') return 'completed';
  if (status === 'running') return 'running';
  if (saved === total) return 'teaching_done';
  if (saved > 0) return 'teaching_progress';
  return 'waiting';
};
export const getStatusInfo = (status: string, savedPoints?: number, totalPoints?: number) => {
  const saved = savedPoints || 0;
  const total = totalPoints || 10;
  if (status === 'completed') {
    return { label: '완료', colorClass: 'bg-green-500/20 text-green-400' };
  } else if (status === 'running') {
    return { label: '진행중', colorClass: 'bg-blue-500/20 text-blue-400' };
  } else if (saved === total) {
    return { label: `티칭완료 (${saved}/${total})`, colorClass: 'bg-cyan-500/20 text-cyan-400' };
  } else if (saved > 0) {
    return { label: `티칭중 (${saved}/${total})`, colorClass: 'bg-yellow-500/20 text-yellow-400' };
  } else {
    return { label: '대기중', colorClass: 'bg-gray-500/20 text-gray-400' };
  }
};
export const getStatusBadgeProps = (status: string, savedPoints?: number, totalPoints?: number) => {
  const info = getStatusInfo(status, savedPoints, totalPoints);
  return {
    className: `px-3 py-1.5 rounded-full text-sm font-medium ${info.colorClass}`,
    label: info.label,
  };
};
const log = createLogger('JobExecution');
interface UseJobExecutionReturn {
  isRunning: boolean;
  isPaused: boolean;
  currentPointIndex: number;
  handleStartJob: () => Promise<void>;
  handlePauseJob: () => void;
  handleResumeJob: () => void;
  handleStopJob: () => Promise<void>;
}
export function useJobExecution(
  selectedJob: TeachingJob | null,
  pointParamsMap: Record<number, PointParams>,
): UseJobExecutionReturn {
  const { show: showAlert } = useAlert();
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentPointIndex, setCurrentPointIndex] = useState(0);
  const isRunningRef = useRef(false);
  const isPausedRef = useRef(false);
  const handleStartJob = useCallback(async () => {
    if (!selectedJob?.points || selectedJob.points.length === 0) {
      log.warn('startJob.noPoints', '저장된 포인트가 없음');
      showAlert('저장된 포인트가 없습니다.', { type: 'warning' });
      return;
    }
    const savedPoints = selectedJob.points.filter((p: TeachingPoint) => p.is_saved);
    if (savedPoints.length === 0) {
      log.warn('startJob.noSavedPoints', '저장된 포인트가 없음');
      showAlert('저장된 포인트가 없습니다.', { type: 'warning' });
      return;
    }
    const totalTimer = log.startTimer();
    log.info('startJob.begin', '작업 시작', {
      jobId: selectedJob.id,
      jobName: selectedJob.name,
      pointCount: savedPoints.length,
    });
    isRunningRef.current = true;
    isPausedRef.current = false;
    setIsRunning(true);
    setIsPaused(false);
    setCurrentPointIndex(0);
    try {
      const setupTimer = log.startTimer();
      log.info('startJob.setup', '로봇 설정 중 (모드 전환 + 서보 활성화)...');
      const [modeResult, enableResult] = await Promise.all([
        setRobotMode(0).catch(e => ({ error: e, type: 'mode' })),
        enableRobot().catch(e => ({ error: e, type: 'enable' })),
      ]);
      if ((modeResult as any).error) {
        throw new Error(`모드 변경 실패: ${(modeResult as any).error.message}`);
      }
      if ((enableResult as any).error) {
        throw new Error(`서보 활성화 실패: ${(enableResult as any).error.message}`);
      }
      setupTimer.end('startJob.setup.done', '로봇 설정 완료');
      for (let i = 0; i < savedPoints.length; i++) {
        if (!isRunningRef.current) {
          log.info('startJob.stopped', '작업 중지됨', { currentIndex: i });
          break;
        }
        while (isPausedRef.current) {
          await new Promise(resolve => setTimeout(resolve, 100));
          if (!isRunningRef.current) break;
        }
        const point = savedPoints[i];
        setCurrentPointIndex(i);
        const params = pointParamsMap[point.id] || getDefaultPointParams();
        const weaveTypeCode =
          WEAVING_TYPE_OPTIONS.find(opt => opt.value === params.weavingType)?.code ?? -1;
        const hasWeaving = weaveTypeCode >= 0;
        const departureSpeed = params.moveSpeed;
        const isWeldingPoint = point.point_id !== 'home' && point.point_id !== 'p9';
        if (isWeldingPoint) {
          log.info('startJob.welding.start', `${point.name} 용접 시작`, {
            voltage: params.weldVoltage, current: params.weldCurrent,
          });
          await setWeldingParams(params.weldCurrent, params.weldVoltage);
          await startArc();
        }
        if (hasWeaving) {
          log.info('startJob.weave.start', `${point.name} 위빙 시작`, {
            weaveType: params.weavingType, weaveTypeCode,
          });
          await setWeaveParams({
            weave_type: weaveTypeCode,
            weave_frequency: params.weaveFrequency,
            weave_range: params.weaveRange,
            weave_left_range: params.weaveLeftRange,
            weave_right_range: params.weaveRightRange,
            weave_left_stay_time: params.weaveLeftStayTime,
            weave_right_stay_time: params.weaveRightStayTime,
            weave_circle_radio: params.weaveCircleRadio,
            weave_yaw_angle: 0,
            weave_rot_angle: 0,
          });
          await startWeave();
        }
        const moveTimer = log.startTimer();
        if (hasWeaving && point.tcp) {
          log.info('startJob.move.start', `[${i + 1}/${savedPoints.length}] ${point.name} 직선 이동 (위빙)`, {
            speed: departureSpeed,
          });
          await moveToCartesianPosition(point.tcp, departureSpeed, 0, 100, -1);
        } else if (point.joints) {
          log.info('startJob.move.start', `[${i + 1}/${savedPoints.length}] ${point.name} 관절 이동`, {
            speed: departureSpeed,
          });
          await moveToJointPosition(point.joints, departureSpeed, 100, 100, -1, 0, point.tool_num ?? 0, point.user_num ?? 0);
        }
        moveTimer.end('startJob.move.done', `${point.name} 이동 완료`);
        if (hasWeaving) {
          await endWeave();
          log.info('startJob.weave.end', `${point.name} 위빙 종료`);
        }
        if (isWeldingPoint) {
          await endArc();
          log.info('startJob.welding.end', `${point.name} 용접 종료`);
        }
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      isRunningRef.current = false;
      setIsRunning(false);
      setCurrentPointIndex(0);
      totalTimer.end('startJob.complete', '작업 완료', { totalPoints: savedPoints.length });
      showAlert('작업이 완료되었습니다.', { type: 'success' });
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      log.error('startJob.error', '작업 실행 중 오류', { error: errorObj.message }, {
        stack: errorObj.stack,
      });
      isRunningRef.current = false;
      setIsRunning(false);
      showAlert('작업 실행 중 오류가 발생했습니다.', { type: 'error' });
    }
  }, [selectedJob, pointParamsMap, showAlert]);
  const handlePauseJob = useCallback(() => {
    isPausedRef.current = true;
    setIsPaused(true);
  }, []);
  const handleResumeJob = useCallback(() => {
    isPausedRef.current = false;
    setIsPaused(false);
  }, []);
  const handleStopJob = useCallback(async () => {
    isRunningRef.current = false;
    isPausedRef.current = false;
    setIsRunning(false);
    setIsPaused(false);
    setCurrentPointIndex(0);
    try {
      await stopRobot();
    } catch (error) {
      console.error('Failed to stop robot:', error);
    }
  }, []);
  return {
    isRunning,
    isPaused,
    currentPointIndex,
    handleStartJob,
    handlePauseJob,
    handleResumeJob,
    handleStopJob,
  };
}
export { JobList_JobList as JobList };
export { JobDetail_JobDetail as JobDetail };
