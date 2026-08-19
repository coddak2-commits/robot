import React, { useState, useEffect, useCallback } from 'react';
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
import { JobList, JobDetail, useJobExecution } from './components/index';
import { PointParams, TeachingPoint, getPointParams } from './components';
const JobManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'list' | 'detail'>('list');
  const [jobs, setJobs] = useState<TeachingJob[]>([]);
  const [selectedJob, setSelectedJob] = useState<TeachingJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const ITEMS_PER_PAGE = 5;
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
  const handleDeleteJob = async (jobId: number) => {
    if (!confirm('이 작업을 삭제하시겠습니까?')) return;
    try {
      await deleteTeachingJob(jobId);
      setJobs(prev => prev.filter(j => j.id !== jobId));
      if (selectedJob?.id === jobId) {
        setSelectedJob(null);
        setActiveTab('list');
      }
    } catch (error) {
      console.error('Failed to delete job:', error);
    }
  };
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
      {activeTab === 'list' ? (
        <JobList
          jobs={jobs}
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
    </PageLayout>
  );
};
export default JobManagement;
