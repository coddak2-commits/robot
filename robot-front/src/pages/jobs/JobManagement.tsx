import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  List,
  CheckCircle,
  Zap,
  Settings,
  MapPin,
  RotateCcw,
} from 'lucide-react';
import { PageLayout, LoadingScreen } from '../../components/common/index';
import { StatCard_StatCard as StatCard } from '../../components/common';
import {
  getTeachingJobs,
  getTeachingJob,
  deleteTeachingJob,
  updateTeachingJobName,
  TeachingJob,
} from '../../lib';
import { JobList, JobDetail, useJobExecution, getStatusCategory, StatusFilter } from './components/index';
import { PointParams, TeachingPoint, getPointParams } from './components';
type SortKey = 'created_desc' | 'created_asc' | 'name_asc' | 'name_desc';
const JobManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'list' | 'detail'>('list');
  const [jobs, setJobs] = useState<TeachingJob[]>([]);
  const [selectedJob, setSelectedJob] = useState<TeachingJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const ITEMS_PER_PAGE = 5;
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('created_desc');
  const [editingJobId, setEditingJobId] = useState<number | null>(null);
  const [editingJobName, setEditingJobName] = useState('');
  const [editingPointId, setEditingPointId] = useState<number | null>(null);
  const [pointParamsMap, setPointParamsMap] = useState<Record<number, PointParams>>({});
  const {
    isRunning,
    isPaused,
    currentPointIndex,
    handleStartJob,
    handlePauseJob,
    handleResumeJob,
    handleStopJob,
  } = useJobExecution(selectedJob, pointParamsMap);
  const fetchJobs = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getTeachingJobs();
      let jobList: TeachingJob[] = [];
      if (Array.isArray(data)) {
        jobList = data;
      } else if (data?.data?.jobs) {
        jobList = data.data.jobs;
      } else if (data?.jobs) {
        jobList = data.jobs;
      }
      setJobs(jobList);
    } catch (error) {
      console.error('Failed to fetch jobs:', error);
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);
  const loadJobDetail = async (jobId: number) => {
    try {
      const response = await getTeachingJob(jobId);
      const job = response?.data || response;
      if (job && job.id) {
        setSelectedJob(job);
        setActiveTab('detail');
        setEditingPointId(null);
        const paramsMap: Record<number, PointParams> = {};
        job.points?.forEach((point: TeachingPoint) => {
          paramsMap[point.id] = getPointParams(point, pointParamsMap);
        });
        setPointParamsMap(paramsMap);
      }
    } catch (error) {
      console.error('Failed to load job detail:', error);
    }
  };
  const UNDO_WINDOW_MS = 7000;
  const pendingDeletesRef = useRef<Map<number, { job: TeachingJob; timer: ReturnType<typeof setTimeout> }>>(new Map());
  const [pendingDeleteIds, setPendingDeleteIds] = useState<number[]>([]);
  const syncPendingDeleteIds = () => setPendingDeleteIds(Array.from(pendingDeletesRef.current.keys()));
  useEffect(() => {
    return () => {
      pendingDeletesRef.current.forEach(entry => clearTimeout(entry.timer));
    };
  }, []);
  const finalizeDelete = useCallback(async (jobId: number) => {
    const entry = pendingDeletesRef.current.get(jobId);
    pendingDeletesRef.current.delete(jobId);
    syncPendingDeleteIds();
    try {
      await deleteTeachingJob(jobId);
    } catch (error) {
      console.error('Failed to delete job:', error);
      if (entry) {
        setJobs(prev => (prev.some(j => j.id === jobId) ? prev : [...prev, entry.job]));
      }
    }
  }, []);
  const handleUndoDelete = (jobId: number) => {
    const entry = pendingDeletesRef.current.get(jobId);
    if (!entry) return;
    clearTimeout(entry.timer);
    pendingDeletesRef.current.delete(jobId);
    syncPendingDeleteIds();
    setJobs(prev => (prev.some(j => j.id === jobId) ? prev : [...prev, entry.job]));
  };
  const handleDeleteJob = (jobId: number) => {
    if (!confirm('이 작업을 삭제하시겠습니까? (삭제 후 7초 이내에는 실행취소할 수 있습니다)')) return;
    const job = jobs.find(j => j.id === jobId);
    if (!job) return;
    setJobs(prev => prev.filter(j => j.id !== jobId));
    if (selectedJob?.id === jobId) {
      setSelectedJob(null);
      setActiveTab('list');
    }
    const timer = setTimeout(() => finalizeDelete(jobId), UNDO_WINDOW_MS);
    pendingDeletesRef.current.set(jobId, { job, timer });
    syncPendingDeleteIds();
  };
  useEffect(() => {
    setPage(1);
  }, [searchQuery, statusFilter, sortKey]);
  const filteredJobs = jobs
    .filter(job => {
      if (statusFilter !== 'all' && getStatusCategory(job.status, job.saved_points, job.total_points) !== statusFilter) {
        return false;
      }
      const q = searchQuery.trim().toLowerCase();
      if (!q) return true;
      return job.name?.toLowerCase().includes(q) || job.cell_name?.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      switch (sortKey) {
        case 'name_asc':
          return a.name.localeCompare(b.name);
        case 'name_desc':
          return b.name.localeCompare(a.name);
        case 'created_asc':
          return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
        case 'created_desc':
        default:
          return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
      }
    });
  const handleSaveJobName = async (jobId: number) => {
    if (!editingJobName.trim()) return;
    try {
      await updateTeachingJobName(jobId, editingJobName.trim());
      setJobs(prev => prev.map(j => (j.id === jobId ? { ...j, name: editingJobName.trim() } : j)));
      if (selectedJob?.id === jobId) {
        setSelectedJob(prev => (prev ? { ...prev, name: editingJobName.trim() } : null));
      }
      setEditingJobId(null);
      setEditingJobName('');
    } catch (error) {
      console.error('Failed to update job name:', error);
    }
  };
  if (loading) {
    return <LoadingScreen text="작업 목록 로딩 중..." />;
  }
  return (
    <PageLayout>
      {}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <StatCard icon={<List className="w-6 h-6 text-blue-400" />} label="전체 작업" value={jobs.length} color="blue" />
        <StatCard icon={<CheckCircle className="w-6 h-6 text-cyan-400" />} label="티칭완료" value={jobs.filter(j => (j.saved_points || 0) === (j.total_points || 10)).length} color="cyan" />
        <StatCard icon={<MapPin className="w-6 h-6 text-yellow-400" />} label="티칭중" value={jobs.filter(j => (j.saved_points || 0) > 0 && (j.saved_points || 0) < (j.total_points || 10)).length} color="yellow" />
        <StatCard icon={<Zap className="w-6 h-6 text-green-400" />} label="실행완료" value={jobs.filter(j => j.status === 'completed').length} color="green" />
        <button
          onClick={fetchJobs}
          className="bg-gray-800/60 backdrop-blur-sm rounded-2xl p-4 border border-gray-700/50 hover:bg-gray-700/60 transition flex items-center justify-center gap-2 text-white"
        >
          <RotateCcw className="w-5 h-5" />
          <span>새로고침</span>
        </button>
      </div>
      {}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab('list')}
          className={`flex-1 py-4 rounded-xl font-medium transition touch-manipulation flex items-center justify-center gap-2 ${
            activeTab === 'list'
              ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-lg shadow-cyan-500/20'
              : 'bg-gray-800/60 text-gray-400 hover:text-white hover:bg-gray-700'
          }`}
        >
          <List className="w-5 h-5" />
          작업 목록
        </button>
        <button
          onClick={() => selectedJob && setActiveTab('detail')}
          disabled={!selectedJob}
          className={`flex-1 py-4 rounded-xl font-medium transition touch-manipulation flex items-center justify-center gap-2 ${
            activeTab === 'detail'
              ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-lg shadow-cyan-500/20'
              : selectedJob
              ? 'bg-gray-800/60 text-gray-400 hover:text-white hover:bg-gray-700'
              : 'bg-gray-800/30 text-gray-600 cursor-not-allowed'
          }`}
        >
          <Settings className="w-5 h-5" />
          작업 상세
        </button>
      </div>
      {}
      {activeTab === 'list' && (
        <div className="flex flex-wrap gap-2 mb-4">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="작업명 또는 셀 이름 검색"
            className="flex-1 min-w-[200px] px-4 py-2.5 bg-gray-800/60 border border-gray-700/50 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500"
          />
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as StatusFilter)}
            className="px-4 py-2.5 bg-gray-800/60 border border-gray-700/50 rounded-xl text-white focus:outline-none focus:border-cyan-500"
          >
            <option value="all">전체 상태</option>
            <option value="completed">완료</option>
            <option value="running">진행중</option>
            <option value="teaching_done">티칭완료</option>
            <option value="teaching_progress">티칭중</option>
            <option value="waiting">대기중</option>
          </select>
          <select
            value={sortKey}
            onChange={e => setSortKey(e.target.value as SortKey)}
            className="px-4 py-2.5 bg-gray-800/60 border border-gray-700/50 rounded-xl text-white focus:outline-none focus:border-cyan-500"
          >
            <option value="created_desc">최신순</option>
            <option value="created_asc">오래된순</option>
            <option value="name_asc">이름순</option>
            <option value="name_desc">이름 역순</option>
          </select>
        </div>
      )}
      {}
      {activeTab === 'list' ? (
        <JobList
          jobs={filteredJobs}
          isFiltered={searchQuery.trim() !== '' || statusFilter !== 'all'}
          selectedJobId={selectedJob?.id ?? null}
          page={page}
          itemsPerPage={ITEMS_PER_PAGE}
          editingJobId={editingJobId}
          editingJobName={editingJobName}
          onSelectJob={loadJobDetail}
          onDeleteJob={handleDeleteJob}
          onStartEdit={(jobId, jobName) => {
            setEditingJobId(jobId);
            setEditingJobName(jobName);
          }}
          onSaveJobName={handleSaveJobName}
          onCancelEdit={() => setEditingJobId(null)}
          onEditingNameChange={setEditingJobName}
          onPageChange={setPage}
        />
      ) : (
        selectedJob && (
          <JobDetail
            job={selectedJob}
            isRunning={isRunning}
            isPaused={isPaused}
            currentPointIndex={currentPointIndex}
            editingPointId={editingPointId}
            pointParamsMap={pointParamsMap}
            onStart={handleStartJob}
            onPause={handlePauseJob}
            onResume={handleResumeJob}
            onStop={handleStopJob}
            onBack={() => setActiveTab('list')}
            onEditPoint={setEditingPointId}
            onUpdatePointParams={(pointId, params) =>
              setPointParamsMap(prev => ({ ...prev, [pointId]: params }))
            }
          />
        )
      )}
      {}
      {pendingDeleteIds.length > 0 && (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 w-80">
          {pendingDeleteIds.map(id => {
            const entry = pendingDeletesRef.current.get(id);
            if (!entry) return null;
            return (
              <div
                key={id}
                className="bg-gray-800 border border-gray-600 rounded-xl shadow-lg p-4 flex items-center justify-between gap-3"
              >
                <span className="text-sm text-gray-200 truncate">'{entry.job.name}' 삭제됨</span>
                <button
                  onClick={() => handleUndoDelete(id)}
                  className="shrink-0 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium rounded-lg transition"
                >
                  실행취소
                </button>
              </div>
            );
          })}
        </div>
      )}
    </PageLayout>
  );
};
export default JobManagement;
