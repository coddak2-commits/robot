import { TeachingPoint, WeaveParams, createInitialTeachingPoints, UCELL_POINT_DEFINITIONS, UCellData, NORMAL_CELLS, COLLAR_PLATE_CELLS, PartWeldEnabled, DEFAULT_PART_WELD_ENABLED, DEFAULT_WEAVE_PARAMS, WELDING_PARTS } from '..';
import { moveToJointPositionNonBlocking, moveToCartesianPositionNonBlocking, checkMotionDone, getWeldingConfig, updateTeachingJob, TeachingPointData, RealtimeRobotStatus, enableRobot, createTeachingJob, getTeachingJobs, getTeachingJob, deleteTeachingJob, updateTeachingJobName, TeachingJob, getRealtimeRobotStatus, stopRobotSDK, emergencyStop, endArc, endWeave, arcOff, arcTraceControl, wireSearchEnd, forwardWireFeed, reverseWireFeed, stopForwardWireFeed, stopReverseWireFeed } from '../../../lib';
import { getErrorMessage, extractResultCode } from '../../../lib/api';
import { createLogger } from '../../../lib';
import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useAlert } from '../../../contexts';
import { playSaveOkBeep, playErrorBeep } from '../../../lib/audio';
import { RobotPosition } from '../components/index';
import { getBlockPointIds, getBlockName } from '..';
import { TouchSensingOptions, TouchSensingResult, WeldingStartOptions, WeldingResult, ClosestCenterlineResult, UseWeldingOperationsReturn, findClosestCenterlinePoint as findClosestCenterlinePointFn, executeTouchSensing, TouchSensingContext, executeArcTest, ArcTestContext, executeWelding, WeldingExecutionContext } from './weldingCore';

export interface UseJobManagementReturn {
  jobList: TeachingJob[];
  currentJobId: number | null;
  isSavingJob: boolean;
  isJobListModalOpen: boolean;
  jobListPage: number;
  editingJobId: number | null;
  editingJobName: string;
  setIsJobListModalOpen: (open: boolean) => void;
  setJobListPage: (page: number) => void;
  setEditingJobId: (id: number | null) => void;
  setEditingJobName: (name: string) => void;
  fetchJobList: () => Promise<void>;
  saveJob: (teachingPoints: TeachingPoint[], cellType: string, cellId: number, height: number, width: number, jobName?: string) => Promise<boolean>;
  loadJob: (jobId: number) => Promise<TeachingPoint[] | null>;
  pendingDeleteJobIds: number[];
  requestDeleteJob: (jobId: number, jobName: string) => void;
  undoDeleteJob: (jobId: number) => void;
  updateJobName: (jobId: number, newName: string) => Promise<boolean>;
  JOBS_PER_PAGE: number;
}
export function useJobManagement(): UseJobManagementReturn {
  const [jobList, setJobList] = useState<TeachingJob[]>([]);
  const [currentJobId, setCurrentJobId] = useState<number | null>(null);
  const [isSavingJob, setIsSavingJob] = useState(false);
  const [isJobListModalOpen, setIsJobListModalOpen] = useState(false);
  const [jobListPage, setJobListPage] = useState(1);
  const [editingJobId, setEditingJobId] = useState<number | null>(null);
  const [editingJobName, setEditingJobName] = useState('');
  const JOBS_PER_PAGE = 5;
  const fetchJobList = useCallback(async () => {
    try {
      const response = await getTeachingJobs();
      const jobsArray = response?.data?.jobs ?? [];
      setJobList(jobsArray);
    } catch (error) {
      console.error('작업 목록 조회 실패:', error);
      setJobList([]);
    }
  }, []);
  const saveJob = useCallback(async (
    teachingPoints: TeachingPoint[],
    cellType: string,
    cellId: number,
    height: number,
    width: number,
    jobName?: string
  ): Promise<boolean> => {
    const savedPoints = teachingPoints.filter(pt => pt.isSaved);
    if (savedPoints.length === 0) {
      return false;
    }
    setIsSavingJob(true);
    try {
      const pointsData: TeachingPointData[] = savedPoints.map(pt => ({
        point_id: pt.id,
        name: pt.name,
        order: pt.order,
        tcp_x: pt.tcp?.x ?? 0,
        tcp_y: pt.tcp?.y ?? 0,
        tcp_z: pt.tcp?.z ?? 0,
        tcp_rx: pt.tcp?.rx ?? 0,
        tcp_ry: pt.tcp?.ry ?? 0,
        tcp_rz: pt.tcp?.rz ?? 0,
        joints: pt.joints ?? [],
        is_saved: true,
        tool_num: pt.toolNum ?? 0,
        user_num: pt.userNum ?? 0,
        move_speed: pt.moveSpeed,
        vel_mode: pt.velMode ?? 0,
        weld_voltage: pt.weldVoltage ?? undefined,
        weld_current: pt.weldCurrent ?? undefined,
        weaving_type: pt.weavingType ?? undefined,
        weave_params: pt.weaveParams,
        gap: pt.gap ?? 0,
      }));
      const result = await createTeachingJob({
        name: jobName?.trim() || `작업_${new Date().toLocaleString('ko-KR')}`,
        cell_type: cellType,
        cell_id: cellId,
        height,
        width,
        points: pointsData,
      });
      const createdId = result?.data?.id ?? result?.id;
      if (createdId) {
        setCurrentJobId(createdId);
        await fetchJobList();
        return true;
      }
      return false;
    } catch (error) {
      console.error('작업 저장 실패:', error);
      return false;
    } finally {
      setIsSavingJob(false);
    }
  }, [fetchJobList]);
  const loadJob = useCallback(async (jobId: number): Promise<TeachingPoint[] | null> => {
    try {
      const response = await getTeachingJob(jobId);
      const jobData = response?.data;
      if (!jobData?.points) {
        alert('작업 데이터를 불러올 수 없습니다.');
        return null;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const loadedPoints: TeachingPoint[] = jobData.points.map((pt: any) => {
        const tcpData = pt.tcp;
        return {
          id: pt.point_id,
          name: pt.name,
          order: pt.order,
          tcp: tcpData ? {
            x: tcpData.x,
            y: tcpData.y,
            z: tcpData.z,
            rx: tcpData.rx,
            ry: tcpData.ry,
            rz: tcpData.rz,
          } : null,
          joints: pt.joints,
          isSaved: true,
          toolNum: pt.tool_num ?? 3,
          userNum: pt.user_num ?? 0,
          moveSpeed: pt.move_speed,
          velMode: (pt.vel_mode ?? 0) as 0 | 1,
          weldVoltage: pt.weld_voltage,
          weldCurrent: pt.weld_current,
          weavingType: pt.weaving_type,
          weaveParams: pt.weave_params ? {
            weaveFrequency: pt.weave_params.weaveFrequency ?? DEFAULT_WEAVE_PARAMS.weaveFrequency,
            weaveRange: pt.weave_params.weaveRange ?? DEFAULT_WEAVE_PARAMS.weaveRange,
            weaveLeftRange: pt.weave_params.weaveLeftRange ?? DEFAULT_WEAVE_PARAMS.weaveLeftRange,
            weaveRightRange: pt.weave_params.weaveRightRange ?? DEFAULT_WEAVE_PARAMS.weaveRightRange,
            weaveLeftStayTime: pt.weave_params.weaveLeftStayTime ?? DEFAULT_WEAVE_PARAMS.weaveLeftStayTime,
            weaveRightStayTime: pt.weave_params.weaveRightStayTime ?? DEFAULT_WEAVE_PARAMS.weaveRightStayTime,
            weaveCircleRadio: pt.weave_params.weaveCircleRadio ?? DEFAULT_WEAVE_PARAMS.weaveCircleRadio,
            weaveYawAngle: pt.weave_params.weaveYawAngle ?? DEFAULT_WEAVE_PARAMS.weaveYawAngle,
            weaveRotAngle: pt.weave_params.weaveRotAngle ?? DEFAULT_WEAVE_PARAMS.weaveRotAngle,
          } : { ...DEFAULT_WEAVE_PARAMS },
          gap: pt.gap ?? 0,
        };
      });
      setCurrentJobId(jobId);
      setIsJobListModalOpen(false);
      return loadedPoints;
    } catch (error) {
      console.error('작업 불러오기 실패:', error);
      alert('작업 불러오기에 실패했습니다.');
      return null;
    }
  }, []);
  const JOB_DELETE_UNDO_WINDOW_MS = 7000;
  const pendingDeleteJobsRef = useRef<Map<number, { name: string; timer: ReturnType<typeof setTimeout> }>>(new Map());
  const [pendingDeleteJobIds, setPendingDeleteJobIds] = useState<number[]>([]);
  useEffect(() => {
    return () => {
      pendingDeleteJobsRef.current.forEach(entry => clearTimeout(entry.timer));
    };
  }, []);
  const finalizeDeleteJob = useCallback(async (jobId: number): Promise<boolean> => {
    try {
      await deleteTeachingJob(jobId);
      await fetchJobList();
      if (currentJobId === jobId) {
        setCurrentJobId(null);
      }
      return true;
    } catch (error) {
      console.error('작업 삭제 실패:', error);
      return false;
    }
  }, [currentJobId, fetchJobList]);
  const requestDeleteJob = useCallback((jobId: number, jobName: string) => {
    if (!window.confirm(`"${jobName}" 작업을 삭제하시겠습니까? (삭제 후 7초 이내에는 실행취소할 수 있습니다)`)) {
      return;
    }
    const timer = setTimeout(async () => {
      pendingDeleteJobsRef.current.delete(jobId);
      setPendingDeleteJobIds(Array.from(pendingDeleteJobsRef.current.keys()));
      const ok = await finalizeDeleteJob(jobId);
      if (!ok) {
        alert('작업 삭제에 실패했습니다.');
      }
    }, JOB_DELETE_UNDO_WINDOW_MS);
    pendingDeleteJobsRef.current.set(jobId, { name: jobName, timer });
    setPendingDeleteJobIds(Array.from(pendingDeleteJobsRef.current.keys()));
  }, [finalizeDeleteJob]);
  const undoDeleteJob = useCallback((jobId: number) => {
    const entry = pendingDeleteJobsRef.current.get(jobId);
    if (!entry) return;
    clearTimeout(entry.timer);
    pendingDeleteJobsRef.current.delete(jobId);
    setPendingDeleteJobIds(Array.from(pendingDeleteJobsRef.current.keys()));
  }, []);
  const updateJobName = useCallback(async (jobId: number, newName: string): Promise<boolean> => {
    if (!newName.trim()) {
      alert('작업명을 입력해주세요.');
      return false;
    }
    try {
      await updateTeachingJobName(jobId, newName.trim());
      await fetchJobList();
      setEditingJobId(null);
      setEditingJobName('');
      return true;
    } catch (error) {
      console.error('작업명 수정 실패:', error);
      alert('작업명 수정에 실패했습니다.');
      return false;
    }
  }, [fetchJobList]);
  return {
    jobList,
    currentJobId,
    isSavingJob,
    isJobListModalOpen,
    jobListPage,
    editingJobId,
    editingJobName,
    setIsJobListModalOpen,
    setJobListPage,
    setEditingJobId,
    setEditingJobName,
    fetchJobList,
    saveJob,
    loadJob,
    pendingDeleteJobIds,
    requestDeleteJob,
    undoDeleteJob,
    updateJobName,
    JOBS_PER_PAGE,
  };
}
