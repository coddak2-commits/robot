import axios, { AxiosResponse } from 'axios';
import { Axios as api } from '../http';
import { RobotJoints, RobotTCF, RobotMoveData, RobotStatusResponse } from '@/types/RobotData';
export { axios, api };
export type { AxiosResponse };
export const getRobotStatus = async (): Promise<RobotStatusResponse> => {
  try {
    const response = await api.get('/robot_sdk/realtime');
    return {
      status_code: 200,
      message: 'success',
      data: response.data,
    } as RobotStatusResponse;
  } catch (error) {
    console.error('로봇 상태 조회 오류:', error);
    throw error;
  }
};
export const checkRobotConnection = async (): Promise<RobotConnectionStatus> => {
  try {
    const response = await api.get('/robot_sdk/connection_status');
    const data = response.data;
    const isConnected = data?.data?.connected === true;
    return {
      connected: isConnected,
      status: isConnected ? 'connected' : 'disconnected',
      lastCheck: new Date().toISOString(),
      error: isConnected ? undefined : '로봇 연결 안됨',
    };
  } catch (error) {
    return {
      connected: false,
      status: 'error',
      lastCheck: new Date().toISOString(),
      error: error instanceof Error ? error.message : '연결 확인 실패',
    };
  }
};
export const getRealtimeRobotStatus = async (): Promise<RealtimeRobotStatus> => {
  try {
    const response = await api.get('/robot_sdk/realtime');
    return response.data;
  } catch (error) {
    return {
      connected: false,
      joints: null,
      tcp: null,
      reason: error instanceof Error ? error.message : '연결 실패',
    };
  }
};
export const connectRobotSDK = async (ip?: string) => {
  try {
    const response = await api.post('/robot_sdk/connect', { ip: ip || null });
    return response.data;
  } catch (error) {
    console.error('로봇 SDK 연결 오류:', error);
    throw error;
  }
};
export const enableRobot = async () => {
  try {
    const response = await api.post(
      '/robot_sdk/robot/enable',
      {},
      {
        timeout: 30000,
      },
    );
    return response.data;
  } catch (error) {
    console.error('로봇 활성화 오류:', error);
    throw error;
  }
};
export const disableRobot = async () => {
  try {
    const response = await api.post('/robot_sdk/robot/disable');
    return response.data;
  } catch (error) {
    console.error('로봇 비활성화 오류:', error);
    throw error;
  }
};
export const setAutoReconnect = async (enabled: boolean) => {
  try {
    const response = await api.post('/robot_sdk/auto_reconnect', { enabled });
    return response.data;
  } catch (error) {
    console.error('자동 재연결 설정 오류:', error);
    throw error;
  }
};
export const setRobotMode = async (mode: 0 | 1) => {
  try {
    const response = await api.post(
      `/robot_sdk/robot/mode?mode=${mode}`,
      {},
      {
        timeout: 30000,
      },
    );
    return response.data;
  } catch (error) {
    console.error('로봇 모드 변경 오류:', error);
    throw error;
  }
};
export const sendDiagnosticLogsEmail = async (
  recipient: string,
  days = 7,
  note = '',
  maxFiles = 1,
): Promise<{ ok: boolean; message?: string }> => {
  try {
    const response = await api.post(
      '/api/logs/send-email',
      { recipient, days, note, max_files: maxFiles },
      { timeout: 120000 },
    );
    const ok = response.data?.success === true || response.data?.code === 200;
    return {
      ok,
      message: response.data?.message,
    };
  } catch (error: unknown) {
    const msg =
      typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message: unknown }).message)
        : '이메일 발송 실패';
    return { ok: false, message: msg };
  }
};
export const downloadLogsZipUrl = (days = 7): string => `/api/logs/download.zip?days=${days}`;
export const moveToJointPosition = async (
  joints: number[],
  vel = 20,
  acc = 100,
  ovl = 100,
  blendT = -1,
  velMode: 0 | 1 = 0,
  tool = 0,
  user = 0,
) => {
  try {
    const response = await api.post(
      '/robot_sdk/move/joint',
      {
        joint_pos: {
          j1: joints[0] || 0,
          j2: joints[1] || 0,
          j3: joints[2] || 0,
          j4: joints[3] || 0,
          j5: joints[4] || 0,
          j6: joints[5] || 0,
        },
        tool,
        user,
        vel,
        acc,
        ovl,
        blend_t: blendT,
        vel_mode: velMode,
      },
      { timeout: 300000 },
    );
    return response.data;
  } catch (error) {
    console.error('관절 이동 오류:', error);
    throw error;
  }
};
export const getInverseKin = async (
  pose: number[],
  refJoints: number[],
): Promise<number[] | null> => {
  try {
    const response = await api.post('/robot_sdk/inverse-kin', {
      pose: pose.slice(0, 6),
      refJoints: refJoints.slice(0, 6),
    });
    const data = response.data;
    if (data?.status_code === 200 && Array.isArray(data.joints) && data.joints.length === 6) {
      return data.joints as number[];
    }
    return null;
  } catch (error) {
    console.error('역운동학 계산 오류:', error);
    return null;
  }
};
export const moveToCartesianPosition = async (
  tcp: { x: number; y: number; z: number; rx: number; ry: number; rz: number },
  vel = 20,
  acc = 100,
  ovl = 100,
  blendT = -1,
  offsetFlag = 0,
  offsetPos: number[] = [0, 0, 0, 0, 0, 0],
  jointPos?: number[],
  toolNum?: number,
  userNum?: number,
  velMode: 0 | 1 = 0,
) => {
  try {
    const response = await api.post(
      '/robot_sdk/move/linear',
      {
        desc_pos: tcp,
        tool: toolNum ?? 3,
        user: userNum ?? 0,
        vel,
        acc,
        ovl,
        blend_t: blendT,
        offset_flag: offsetFlag,
        offset_pos: offsetPos,
        joint_pos: jointPos,
        vel_mode: velMode,
      },
      { timeout: 300000 },
    );
    return response.data;
  } catch (error) {
    console.error('직선 이동 오류:', error);
    throw error;
  }
};
export const stopRobot = async (): Promise<boolean> => {
  try {
    const response = await api.post('/robot_sdk/robot/stop');
    return response.data?.status_code === 200 || response.data?.result === 0;
  } catch (error) {
    console.error('로봇 정지 오류:', error);
    return false;
  }
};
export const stopRobotSDK = async () => {
  try {
    const response = await api.post('/robot_sdk/robot/stop');
    return response.data;
  } catch (error) {
    console.error('로봇 정지 오류:', error);
    throw error;
  }
};
export const emergencyStop = async () => {
  console.log('[EMERGENCY STOP] 비상 정지 요청 시작');
  const baseUrl = api.defaults.baseURL || 'http://localhost:8000';
  const emergencyServerUrl = baseUrl.replace(/:8000\/?$/, ':8001').replace(/:8080\/?$/, ':8001');
  let authHeaders: { Authorization: string } | undefined;
  const tokenStr = localStorage.getItem('token');
  if (tokenStr) {
    try {
      const { accessToken } = JSON.parse(tokenStr);
      if (accessToken) authHeaders = { Authorization: `Bearer ${accessToken}` };
    } catch { /* ignore */ }
  }
  const stopAttempts = [
    axios
      .post(`${emergencyServerUrl}/emergency_stop`, {}, { timeout: 2000 })
      .then((res: AxiosResponse) => {
        console.log('[EMERGENCY] 포트8001 비상정지 성공:', res.data);
        return res;
      })
      .catch((e: Error) => {
        console.warn('[EMERGENCY] 포트8001 비상정지 실패:', e.message);
        return null;
      }),
    axios
      .post(`${baseUrl}/robot_sdk/robot/emergency_stop`, {}, { timeout: 2000, headers: authHeaders })
      .then((res: AxiosResponse) => {
        console.log('[EMERGENCY] emergency_stop 성공:', res.data);
        return res;
      })
      .catch((e: Error) => {
        console.warn('[EMERGENCY] emergency_stop 실패:', e.message);
        return null;
      }),
    axios
      .post(`${baseUrl}/robot_sdk/robot/stop_motion`, {}, { timeout: 2000, headers: authHeaders })
      .then((res: AxiosResponse) => {
        console.log('[EMERGENCY] stop_motion 성공:', res.data);
        return res;
      })
      .catch((e: Error) => {
        console.warn('[EMERGENCY] stop_motion 실패:', e.message);
        return null;
      }),
    axios
      .post(`${baseUrl}/robot_sdk/robot/stop_move`, {}, { timeout: 2000, headers: authHeaders })
      .then((res: AxiosResponse) => {
        console.log('[EMERGENCY] stop_move 성공:', res.data);
        return res;
      })
      .catch((e: Error) => {
        console.warn('[EMERGENCY] stop_move 실패:', e.message);
        return null;
      }),
  ];
  const results = await Promise.all(stopAttempts);
  const successCount = results.filter(r => r !== null).length;
  console.log(`[EMERGENCY STOP] 완료: ${successCount}/${stopAttempts.length} 성공`);
  return successCount > 0;
};
export const moveToJointPositionNonBlocking = async (
  joints: number[],
  speed = 20,
  acc = 100,
  ovl = 100,
  tool = 0,
  user = 0,
) => {
  try {
    const response = await api.post(
      '/robot_sdk/move/joint',
      {
        joint_pos: {
          j1: Number(joints[0]),
          j2: Number(joints[1]),
          j3: Number(joints[2]),
          j4: Number(joints[3]),
          j5: Number(joints[4]),
          j6: Number(joints[5]),
        },
        tool,
        user,
        vel: speed,
        acc,
        ovl,
        blend_t: 0,
      },
      { timeout: 10000 },
    );
    return response.data;
  } catch (error) {
    console.error('비블로킹 관절 이동 오류:', error);
    throw error;
  }
};
export const moveToCartesianPositionNonBlocking = async (
  tcp: { x: number; y: number; z: number; rx: number; ry: number; rz: number },
  vel = 20,
  acc = 100,
  ovl = 100,
  toolNum = 0,
  userNum = 0,
  offsetFlag = 0,
  offsetPos?: number[],
) => {
  try {
    const payload: Record<string, unknown> = {
      desc_pos: tcp,
      tool: toolNum,
      user: userNum,
      vel,
      acc,
      ovl,
      blend_t: 0,
    };
    if (offsetFlag !== 0 && offsetPos) {
      payload.offset_flag = offsetFlag;
      payload.offset_pos = offsetPos;
    }
    const response = await api.post('/robot_sdk/move/linear', payload, { timeout: 10000 });
    return response.data;
  } catch (error) {
    console.error('비블로킹 직선 이동 오류:', error);
    throw error;
  }
};
export const checkMotionDone = async (): Promise<{ done: boolean; error?: string }> => {
  try {
    const response = await api.get('/robot_sdk/motion/done', { timeout: 15000 });
    if (response.data?.data?.motion_done === 1) return { done: true };
    return { done: false };
  } catch (error) {
    console.error('이동 완료 확인 오류:', error);
    return { done: false, error: String(error) };
  }
};
const DEFAULT_JOINTS: RobotJoints = {
  j1: 0, j2: -90, j3: 90, j4: -180, j5: -90, j6: 0,
};
const DEFAULT_MOVE_PARAMS = {
  speed: '50', acc: '180', ovl: '50',
};
export const moveRobotToLocation = async (
  moveData: Omit<RobotMoveData, 'joints' | 'tcf'> & {
    joints?: Partial<RobotJoints>;
    tcf?: Partial<RobotTCF>;
  },
): Promise<any> => {
  const joints = { ...DEFAULT_JOINTS, ...moveData.joints };
  const speed = parseInt(moveData.speed || DEFAULT_MOVE_PARAMS.speed);
  const acc = parseInt(moveData.acc || DEFAULT_MOVE_PARAMS.acc);
  const ovl = parseInt(moveData.ovl || DEFAULT_MOVE_PARAMS.ovl);
  return moveToJointPosition(
    [Number(joints.j1), Number(joints.j2), Number(joints.j3),
     Number(joints.j4), Number(joints.j5), Number(joints.j6)],
    speed, acc, ovl, -1, 0
  );
};
export const moveRobot = async (
  options: {
    joints?: Partial<RobotJoints>;
    tcf?: Partial<RobotTCF>;
    speed?: string;
    acc?: string;
    ovl?: string;
  } = {},
) => {
  const { speed = DEFAULT_MOVE_PARAMS.speed, acc = DEFAULT_MOVE_PARAMS.acc,
          ovl = DEFAULT_MOVE_PARAMS.ovl, ...rest } = options;
  return moveRobotToLocation({ ...rest, speed, acc, ovl });
};
export const moveRobotWithJoints = (
  joints: Partial<RobotJoints>, speed?: string, acc?: string, ovl?: string,
) => moveRobot({ joints, speed, acc, ovl });
export const moveRobotWithTCF = (
  tcf: Partial<RobotTCF>, speed?: string, acc?: string, ovl?: string,
) => moveRobot({ tcf, speed, acc, ovl });
export const moveRobotWithBoth = (
  joints: Partial<RobotJoints>, tcf: Partial<RobotTCF>,
  speed?: string, acc?: string, ovl?: string,
) => moveRobot({ joints, tcf, speed, acc, ovl });
const executeWithStopCheck = async (
  operation: () => Promise<any>,
  operationName: string,
  shouldStopCallback?: () => boolean,
): Promise<void> => {
  if (shouldStopCallback && shouldStopCallback()) {
    throw new Error('STOP_REQUESTED');
  }
  const stopPromise = new Promise<never>((_, reject) => {
    const checkStop = () => {
      if (shouldStopCallback && shouldStopCallback()) {
        reject(new Error('STOP_REQUESTED'));
      } else {
        setTimeout(checkStop, 10);
      }
    };
    checkStop();
  });
  try {
    await Promise.race([operation(), stopPromise]);
  } catch (error) {
    if (error instanceof Error && error.message === 'STOP_REQUESTED') {
      console.log(`${operationName} 중 정지 요청에 의해 중단되었습니다.`);
      return;
    }
    throw error;
  }
};
export const runUcellTestSequence = async (
  sequence: Array<RobotMoveData>,
  shouldStopCallback?: () => boolean,
): Promise<void> => {
  for (let i = 0; i < sequence.length; i++) {
    const step = sequence[i];
    if (!step) { console.error(`${i + 1}번째 좌표 데이터가 없습니다.`); continue; }
    console.log(`${i + 1}번째 좌표 이동 시작`);
    await executeWithStopCheck(
      () => moveRobotToLocation(step), `${i + 1}번째 좌표 이동`, shouldStopCallback,
    );
    console.log(`${i + 1}번째 좌표 이동 완료`);
    if (i < sequence.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }
};
export const waitForMoveComplete = async (
  timeoutMs = 300000, pollIntervalMs = 500
): Promise<{ success: boolean; message: string }> => {
  const startTime = Date.now();
  await new Promise(resolve => setTimeout(resolve, 500));
  while (Date.now() - startTime < timeoutMs) {
    try {
      const status = await getRealtimeRobotStatus();
      if (!status.connected) return { success: false, message: '로봇 연결이 끊어졌습니다.' };
      if (status.robot_state === 1 || status.robot_state === null) return { success: true, message: '이동 완료' };
      if (status.error_code && status.error_code !== 0)
        return { success: false, message: `오류 발생: ${status.error_message || status.error_code}` };
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    } catch (error) {
      console.warn('이동 상태 확인 중 오류:', error);
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }
  }
  return { success: false, message: '이동 타임아웃 (5분 초과)' };
};
export const getRobotPoints = async (): Promise<RobotPointsResponse> => {
  try {
    const jobs = await getTeachingJobs();
    const points: Record<string, RobotPointData> = {};
    if (jobs?.data?.jobs && jobs.data.jobs.length > 0) {
      const latestJob = jobs.data.jobs[0];
      const jobDetail = await getTeachingJob(latestJob.id);
      if (jobDetail?.data?.points) {
        jobDetail.data.points.forEach((point: any, index: number) => {
          points[point.name || `P${index + 1}`] = {
            name: point.name || `P${index + 1}`,
            speed: '50', elbow_speed: '0', acc: '100', elbow_acc: '0',
            toolnum: '0', workpiecenum: '0',
            j1: String(point.joints?.[0] || 0), j2: String(point.joints?.[1] || 0),
            j3: String(point.joints?.[2] || 0), j4: String(point.joints?.[3] || 0),
            j5: String(point.joints?.[4] || 0), j6: String(point.joints?.[5] || 0),
            E1: '0', E2: '0', E3: '0', E4: '0',
            x: String(point.tcp?.x || 0), y: String(point.tcp?.y || 0),
            z: String(point.tcp?.z || 0), rx: String(point.tcp?.rx || 0),
            ry: String(point.tcp?.ry || 0), rz: String(point.tcp?.rz || 0),
          };
        });
      }
    }
    return { status_code: 200, data: points };
  } catch (error) {
    console.error('로봇 포인트 조회 오류:', error);
    return { status_code: 500, data: {} };
  }
};
export const getSystemVersion = async (): Promise<VersionInfo> => {
  try {
    const response = await api.get('/system/version');
    return response.data;
  } catch (error) {
    console.error('버전 정보 조회 오류:', error);
    throw error;
  }
};
export const checkForUpdates = async (): Promise<UpdateCheckResponse> => {
  try {
    const response = await api.get('/system/check-update');
    return response.data;
  } catch (error) {
    console.error('업데이트 확인 오류:', error);
    throw error;
  }
};
export const getUpdateStatus = async (): Promise<UpdateStatus> => {
  try {
    const response = await api.get('/system/update-status');
    return response.data;
  } catch (error) {
    console.error('업데이트 상태 조회 오류:', error);
    throw error;
  }
};
export const startUpdate = async () => {
  try {
    const response = await api.post('/system/update/start');
    return response.data;
  } catch (error) {
    console.error('업데이트 시작 오류:', error);
    throw error;
  }
};
export const getSystemInfo = async (): Promise<SystemInfo> => {
  try {
    const response = await api.get('/system/system-info');
    return response.data;
  } catch (error) {
    console.error('시스템 정보 조회 오류:', error);
    throw error;
  }
};
export const getRobotSettings = async (): Promise<RobotSettingsData> => {
  try {
    const response = await api.get('/robot_sdk/settings');
    return response.data.data;
  } catch (error) {
    console.error('로봇 설정 조회 오류:', error);
    throw error;
  }
};
export const updateRobotSettings = async (settings: Partial<RobotSettingsData>): Promise<RobotSettingsData> => {
  try {
    const response = await api.put('/robot_sdk/settings', settings);
    return response.data.data;
  } catch (error) {
    console.error('로봇 설정 저장 오류:', error);
    throw error;
  }
};
export const getRobotError = async (): Promise<RobotErrorData | null> => {
  try {
    const response = await api.get('/robot_sdk/robot/error');
    return response.data.data;
  } catch {
    return null;
  }
};
export const resetRobotError = async () => {
  try {
    const response = await api.post('/robot_sdk/robot/reset-error');
    return response.data;
  } catch (error) {
    console.error('로봇 에러 초기화 오류:', error);
    throw error;
  }
};
export const getRobotErrorHistory = async (
  days = 30,
  limit = 50,
  offset = 0,
): Promise<RobotErrorEvent[]> => {
  try {
    const params = new URLSearchParams({
      days: days.toString(),
      limit: limit.toString(),
      offset: offset.toString(),
    });
    const response = await api.get(`/robot_sdk/robot/error-history?${params.toString()}`);
    return response.data.data || [];
  } catch (error) {
    console.error('로봇 에러 이력 조회 오류:', error);
    return [];
  }
};
export const getTeachingJobs = async (status?: string, limit = 50, offset = 0) => {
  const params = new URLSearchParams();
  if (status) params.append('status', status);
  params.append('limit', limit.toString());
  params.append('offset', offset.toString());
  const response = await api.get(`/teaching/jobs?${params.toString()}`);
  return response.data;
};
export const getTeachingJob = async (jobId: number) => {
  try {
    const response = await api.get(`/teaching/jobs/${jobId}`);
    return response.data;
  } catch (error) {
    console.error('작업 상세 조회 오류:', error);
    throw error;
  }
};
export const createTeachingJob = async (data: CreateTeachingJobRequest) => {
  try {
    const response = await api.post('/teaching/jobs', data);
    return response.data;
  } catch (error) {
    console.error('작업 생성 오류:', error);
    throw error;
  }
};
export const updateTeachingJob = async (jobId: number, data: CreateTeachingJobRequest) => {
  try {
    const response = await api.put(`/teaching/jobs/${jobId}`, data);
    return response.data;
  } catch (error) {
    console.error('작업 수정 오류:', error);
    throw error;
  }
};
export const updateTeachingJobStatus = async (jobId: number, status: string, currentPointIndex?: number) => {
  try {
    const response = await api.patch(`/teaching/jobs/${jobId}/status`, {
      status,
      current_point_index: currentPointIndex,
    });
    return response.data;
  } catch (error) {
    console.error('작업 상태 변경 오류:', error);
    throw error;
  }
};
export const updateTeachingJobName = async (jobId: number, name: string) => {
  try {
    const response = await api.patch(`/teaching/jobs/${jobId}/name`, { name });
    return response.data;
  } catch (error) {
    console.error('작업명 변경 오류:', error);
    throw error;
  }
};
export const deleteTeachingJob = async (jobId: number) => {
  try {
    const response = await api.delete(`/teaching/jobs/${jobId}`);
    return response.data;
  } catch (error) {
    console.error('작업 삭제 오류:', error);
    throw error;
  }
};
export const addPathRecord = async (
  jobId: number,
  data: {
    tcp_x?: number;
    tcp_y?: number;
    tcp_z?: number;
    tcp_rx?: number;
    tcp_ry?: number;
    tcp_rz?: number;
    joints?: number[];
    point_index?: number;
    is_welding?: boolean;
  }
) => {
  try {
    const response = await api.post(`/teaching/jobs/${jobId}/path`, data);
    return response.data;
  } catch (error) {
    console.error('경로 기록 추가 오류:', error);
    throw error;
  }
};
export const getPathRecords = async (jobId: number, limit = 1000, offset = 0) => {
  try {
    const response = await api.get(`/teaching/jobs/${jobId}/path?limit=${limit}&offset=${offset}`);
    return response.data;
  } catch (error) {
    console.error('경로 기록 조회 오류:', error);
    throw error;
  }
};
export const clearPathRecords = async (jobId: number) => {
  try {
    const response = await api.delete(`/teaching/jobs/${jobId}/path`);
    return response.data;
  } catch (error) {
    console.error('경로 기록 삭제 오류:', error);
    throw error;
  }
};
export const wireSearchStart = async (params: WireSearchParams = {}) => {
  try {
    const response = await api.post('/welding/wire-search/start', {
      ref_pos: params.ref_pos ?? 1,
      search_vel: params.search_vel ?? 10,
      search_dis: params.search_dis ?? 100,
      auto_back_flag: params.auto_back_flag ?? 0,
      auto_back_vel: params.auto_back_vel ?? 10,
      auto_back_dis: params.auto_back_dis ?? 100,
      offset_flag: params.offset_flag ?? 1,
    });
    return response.data;
  } catch (error) {
    console.error('와이어 서치 시작 오류:', error);
    throw error;
  }
};
export const wireSearchEnd = async (params: WireSearchParams = {}) => {
  try {
    const response = await api.post('/welding/wire-search/end', {
      ref_pos: params.ref_pos ?? 1,
      search_vel: params.search_vel ?? 10,
      search_dis: params.search_dis ?? 100,
      auto_back_flag: params.auto_back_flag ?? 0,
      auto_back_vel: params.auto_back_vel ?? 10,
      auto_back_dis: params.auto_back_dis ?? 100,
      offset_flag: params.offset_flag ?? 1,
    });
    return response.data;
  } catch (error) {
    console.error('와이어 서치 종료 오류:', error);
    throw error;
  }
};
export const wireSearchWait = async (varname = 'RES0') => {
  try {
    const response = await api.post('/welding/wire-search/wait', { varname }, {
      timeout: 60000,
    });
    return response.data;
  } catch (error) {
    console.error('와이어 서치 대기 오류:', error);
    throw error;
  }
};
export const touchSearch = async (params: TouchSearchParams): Promise<TouchSearchResult> => {
  try {
    const response = await api.post('/robot_sdk/move/touch-search', {
      direction: params.direction,
      search_dis: params.search_dis ?? 100,
      search_vel: params.search_vel ?? 10,
      back_dis: params.back_dis ?? 10,
    }, {
      timeout: 120000,
    });
    return response.data;
  } catch (error) {
    console.error('터치 센싱 오류:', error);
    throw error;
  }
};
export const findDx = async (direction: 1 | -1): Promise<FindDeltaResult> => {
  try {
    const response = await api.post('/robot_sdk/move/find-dx', {
      direction,
    }, {
      timeout: 120000,
    });
    return response.data;
  } catch (error) {
    console.error('FindDx 오류:', error);
    throw error;
  }
};
export const findDy = async (direction: 1 | -1): Promise<FindDeltaResult> => {
  try {
    const response = await api.post('/robot_sdk/move/find-dy', {
      direction,
    }, {
      timeout: 120000,
    });
    return response.data;
  } catch (error) {
    console.error('FindDy 오류:', error);
    throw error;
  }
};
export const findDz = async (direction: 1 | -1): Promise<FindDeltaResult> => {
  try {
    const response = await api.post('/robot_sdk/move/find-dz', {
      direction,
    }, {
      timeout: 120000,
    });
    return response.data;
  } catch (error) {
    console.error('FindDz 오류:', error);
    throw error;
  }
};
export interface RelativeMoveResult {
  status_code: number;
  result?: number;
  message?: string;
}
export const relativeMoveJ = async (
  jointDeltas: number[],
  tool = 3,
  user = 0,
  vel = 20,
  acc = 100,
  ovl = 100,
  blendT = -1,
  velMode = 0,
): Promise<RelativeMoveResult> => {
  try {
    const response = await api.post(
      '/robot_sdk/move/relative-joint',
      {
        joint_pos: {
          j1: jointDeltas[0] || 0,
          j2: jointDeltas[1] || 0,
          j3: jointDeltas[2] || 0,
          j4: jointDeltas[3] || 0,
          j5: jointDeltas[4] || 0,
          j6: jointDeltas[5] || 0,
        },
        tool,
        user,
        vel,
        acc,
        ovl,
        blend_t: blendT,
        vel_mode: velMode,
      },
      { timeout: 60000 },
    );
    return response.data;
  } catch (error) {
    console.error('상대 관절 이동 오류:', error);
    throw error;
  }
};
export const relativeMoveL = async (
  descPosDelta: { x?: number; y?: number; z?: number; rx?: number; ry?: number; rz?: number },
  tool = 3,
  user = 0,
  vel = 20,
  acc = 100,
  ovl = 100,
  blendT = -1,
  velMode = 0,
): Promise<RelativeMoveResult> => {
  try {
    const response = await api.post(
      '/robot_sdk/move/relative-linear',
      {
        desc_pos: {
          x: descPosDelta.x ?? 0,
          y: descPosDelta.y ?? 0,
          z: descPosDelta.z ?? 0,
          rx: descPosDelta.rx ?? 0,
          ry: descPosDelta.ry ?? 0,
          rz: descPosDelta.rz ?? 0,
        },
        tool,
        user,
        vel,
        acc,
        ovl,
        blend_t: blendT,
        vel_mode: velMode,
      },
      { timeout: 60000 },
    );
    return response.data;
  } catch (error) {
    console.error('상대 직선 이동 오류:', error);
    throw error;
  }
};
export interface CoordValues {
  x: number; y: number; z: number; rx: number; ry: number; rz: number;
}
export interface ToolCoordResult {
  status_code: number;
  data?: { result: number; coord: CoordValues; id?: number; type?: number; install?: number; tool_id?: number; load_num?: number };
}
export interface WorkCoordResult {
  status_code: number;
  data?: { result: number; coord: CoordValues; id?: number; ref_frame?: number };
}
export const getCurrentToolCoord = async (): Promise<ToolCoordResult> => {
  try {
    const response = await api.get('/robot_sdk/coord/tool/current');
    return response.data;
  } catch (error) {
    console.error('현재 툴 좌표계 조회 오류:', error);
    throw error;
  }
};
export const getCurrentWorkCoord = async (): Promise<WorkCoordResult> => {
  try {
    const response = await api.get('/robot_sdk/coord/work/current');
    return response.data;
  } catch (error) {
    console.error('현재 워크 좌표계 조회 오류:', error);
    throw error;
  }
};
export const getToolCoord = async (id: number): Promise<ToolCoordResult> => {
  try {
    const response = await api.get('/robot_sdk/coord/tool', { params: { id } });
    return response.data;
  } catch (error) {
    console.error('툴 좌표계 조회 오류:', error);
    throw error;
  }
};
export const getWorkCoord = async (id: number): Promise<WorkCoordResult> => {
  try {
    const response = await api.get('/robot_sdk/coord/work', { params: { id } });
    return response.data;
  } catch (error) {
    console.error('워크 좌표계 조회 오류:', error);
    throw error;
  }
};
export const setToolCoord = async (
  id: number,
  coord: CoordValues,
  type = 0,
  install = 0,
  toolID = id,
  loadNum = 0,
) => {
  try {
    const response = await api.post('/robot_sdk/coord/tool', { id, coord, type, install, tool_id: toolID, load_num: loadNum });
    return response.data;
  } catch (error) {
    console.error('툴 좌표계 설정 오류:', error);
    throw error;
  }
};
export const setWorkCoord = async (id: number, coord: CoordValues, refFrame = 0) => {
  try {
    const response = await api.post('/robot_sdk/coord/work', { id, coord, ref_frame: refFrame });
    return response.data;
  } catch (error) {
    console.error('워크 좌표계 설정 오류:', error);
    throw error;
  }
};
export const getPayload = async (id = 0) => {
  try {
    const response = await api.get('/robot_sdk/payload', { params: { id } });
    return response.data;
  } catch (error) {
    console.error('부하(payload) 조회 오류:', error);
    throw error;
  }
};
export const setPayload = async (loadNum: number, weight: number, cog?: { x: number; y: number; z: number }) => {
  try {
    const response = await api.post('/robot_sdk/payload', { load_num: loadNum, weight, cog });
    return response.data;
  } catch (error) {
    console.error('부하(payload) 설정 오류:', error);
    throw error;
  }
};
// 이후 실행되는 모든 이동 명령의 목표 위치를 워크/베이스(flag=0) 또는 툴(flag=2) 좌표계
// 기준으로 일괄 오프셋. 실제 자재 위치가 타칭 프로그램과 살짝 어긋났을 때 포인트를
// 다시 티칭하지 않고 전체 경로를 한번에 보정하는 용도
export const pointsOffsetEnable = async (offset: Partial<CoordValues>, flag: 0 | 2 = 0) => {
  try {
    const response = await api.post('/robot_sdk/move/points-offset/enable', {
      flag,
      offset: {
        x: offset.x ?? 0, y: offset.y ?? 0, z: offset.z ?? 0,
        rx: offset.rx ?? 0, ry: offset.ry ?? 0, rz: offset.rz ?? 0,
      },
    });
    return response.data;
  } catch (error) {
    console.error('전체 궤적 오프셋 시작 오류:', error);
    throw error;
  }
};
export const pointsOffsetDisable = async () => {
  try {
    const response = await api.post('/robot_sdk/move/points-offset/disable');
    return response.data;
  } catch (error) {
    console.error('전체 궤적 오프셋 종료 오류:', error);
    throw error;
  }
};
// 비상정지(emergencyStop)보다 부드러운 정지 - 이어서 재개 가능
export const pauseRobotMotion = async () => {
  try {
    const response = await api.post('/robot_sdk/robot/pause');
    return response.data;
  } catch (error) {
    console.error('일시 정지 오류:', error);
    throw error;
  }
};
export const resumeRobotMotion = async () => {
  try {
    const response = await api.post('/robot_sdk/robot/resume');
    return response.data;
  } catch (error) {
    console.error('재개 오류:', error);
    throw error;
  }
};
export const getSafetyStopState = async () => {
  try {
    const response = await api.get('/robot_sdk/safety/stop-state');
    return response.data;
  } catch (error) {
    console.error('세이프티 정지 상태 조회 오류:', error);
    throw error;
  }
};
// 컨트롤박스/툴 DO(디지털 출력) 켜짐/꺼짐 상태 읽기.
// SDK에 AO(아날로그 출력) 하드웨어 리드백 함수가 없어 DO만 지원됨
export const getControlBoxDOState = async () => {
  try {
    const response = await api.get('/robot_sdk/io/do');
    return response.data;
  } catch (error) {
    console.error('컨트롤박스 DO 상태 조회 오류:', error);
    throw error;
  }
};
export const getToolDOState = async () => {
  try {
    const response = await api.get('/robot_sdk/io/tool-do');
    return response.data;
  } catch (error) {
    console.error('툴 DO 상태 조회 오류:', error);
    throw error;
  }
};
export const getWireSearchOffset = async (
  seamType = 0,
  method = 0,
  varNameRef = ['REF0', '#', '#', '#', '#', '#'],
  varNameRes = ['RES0', '#', '#', '#', '#', '#']
) => {
  try {
    const response = await api.post('/welding/wire-search/offset', {
      seam_type: seamType,
      method,
      var_name_ref: varNameRef,
      var_name_res: varNameRes,
    });
    return response.data;
  } catch (error) {
    console.error('와이어 서치 오프셋 계산 오류:', error);
    throw error;
  }
};
export type { RobotJoints, RobotTCF, RobotMoveData, RobotStatusResponse };
export interface RobotMoveRequest {
  cmd: number;
  data: RobotMoveData;
}
export interface RobotConnectionResponse {
  status_code: number;
  message: string;
  data: string;
}
export interface RobotConnectionStatus {
  connected: boolean;
  status: string;
  lastCheck: string;
  error?: string;
}
export interface RobotPointData {
  name: string;
  speed: string;
  elbow_speed: string;
  acc: string;
  elbow_acc: string;
  toolnum: string;
  workpiecenum: string;
  j1: string;
  j2: string;
  j3: string;
  j4: string;
  j5: string;
  j6: string;
  E1: string;
  E2: string;
  E3: string;
  E4: string;
  x: string;
  y: string;
  z: string;
  rx: string;
  ry: string;
  rz: string;
}
export interface RobotPointsResponse {
  status_code: number;
  data: Record<string, RobotPointData>;
}
export interface RealtimeRobotStatus {
  connected: boolean;
  joints: number[] | null;
  tcp: number[] | null;
  error_code?: number | null;
  error_message?: string | null;
  servo_enabled?: boolean | null;
  robot_state?: number | null;
  robot_mode?: number | null;
  current_tool_num?: number | null;
  current_user_num?: number | null;
  reason?: string;
  warning?: string;
}
export interface TeachingPointData {
  point_id: string;
  name: string;
  order: number;
  tcp_x?: number;
  tcp_y?: number;
  tcp_z?: number;
  tcp_rx?: number;
  tcp_ry?: number;
  tcp_rz?: number;
  joints?: number[];
  is_saved: boolean;
  tool_num?: number;
  user_num?: number;
  move_speed?: number;
  vel_mode?: number;
  weld_voltage?: number;
  weld_current?: number;
  weaving_type?: string;
  weave_params?: {
    weaveFrequency?: number;
    weaveRange?: number;
    weaveLeftRange?: number;
    weaveRightRange?: number;
    weaveLeftStayTime?: number;
    weaveRightStayTime?: number;
    weaveCircleRadio?: number;
    weaveYawAngle?: number;
    weaveRotAngle?: number;
  };
  gap?: number;
}
export interface CreateTeachingJobRequest {
  name?: string;
  description?: string;
  cell_type?: string;
  cell_id?: number;
  cell_name?: string;
  width?: number;
  height?: number;
  points: TeachingPointData[];
}
export interface TeachingJob {
  id: number;
  name: string;
  description?: string;
  status: string;
  current_point_index: number;
  total_points: number;
  saved_points?: number;
  cell_type?: string;
  cell_id?: number;
  cell_name?: string;
  width?: number;
  height?: number;
  created_at?: string;
  updated_at?: string;
  started_at?: string;
  completed_at?: string;
  points?: Array<{
    id: number;
    point_id: string;
    name: string;
    order: number;
    tcp?: { x: number; y: number; z: number; rx: number; ry: number; rz: number };
    joints?: number[];
    is_saved: boolean;
    is_completed: boolean;
    move_speed?: number;
    weld_voltage?: number;
    weld_current?: number;
    weaving_type?: string;
    tool_num?: number;
    user_num?: number;
  }>;
}
export interface WeaveParams {
  weave_num?: number;
  weave_type: number;
  weave_frequency: number;
  weave_inc_stay_time?: number;
  weave_range: number;
  weave_left_range: number;
  weave_right_range: number;
  additional_stay_time?: number;
  weave_left_stay_time: number;
  weave_right_stay_time: number;
  weave_circle_radio: number;
  weave_stationary?: number;
  weave_yaw_angle: number;
  weave_rot_angle: number;
}
export interface WireSearchParams {
  ref_pos?: number;
  search_vel?: number;
  search_dis?: number;
  auto_back_flag?: number;
  auto_back_vel?: number;
  auto_back_dis?: number;
  offset_flag?: number;
}
export interface TouchSearchParams {
  direction: 'x' | '-x' | 'y' | '-y' | 'z' | '-z';
  search_dis?: number;
  search_vel?: number;
  back_dis?: number;
}
export interface TouchSearchResult {
  status_code: number;
  data?: {
    result: number;
    start_pos: { x: number; y: number; z: number };
    end_pos: { x: number; y: number; z: number };
    delta: { dx: number; dy: number; dz: number };
    direction: string;
    message: string;
  };
  message?: string;
}
export interface FindDeltaResult {
  status_code: number;
  data?: {
    result: number;
    delta_x: number;
    delta_y: number;
    delta_z: number;
    direction: number;
    message: string;
  };
  message?: string;
}
export interface ArcTraceParams {
  flag?: number;
  delay_time?: number;
  is_left_right?: number;
  klr?: number;
  t_start_lr?: number;
  step_max_lr?: number;
  sum_max_lr?: number;
  is_up_down?: number;
  kud?: number;
  t_start_ud?: number;
  step_max_ud?: number;
  sum_max_ud?: number;
  axis_select?: number;
  reference_type?: number;
  refer_sample_start_ud?: number;
  refer_sample_count_ud?: number;
  reference_current?: number;
  offset_type?: number;
  offset_parameter?: number;
}
export interface VersionInfo {
  version: string;
  build_date: string;
  release_notes: string;
  min_compatible_version: string;
}
export interface UpdateCheckResponse {
  current_version: string;
  latest_version: string | null;
  update_available: boolean;
  release_notes: string | null;
  download_url: string | null;
}
export interface UpdateStatus {
  status: 'idle' | 'checking' | 'downloading' | 'installing' | 'completed' | 'error';
  progress: number;
  message: string;
}
export interface SystemInfo {
  app_version: string;
  build_date: string;
  python_version: string;
  platform: string;
  architecture: string;
  project_root: string;
  update_server: string;
  uptime_seconds?: number;
}
export interface RobotSettingsData {
  tool_num: number;
  user_num: number;
  default_vel: number;
  default_acc: number;
  default_ovl: number;
  auto_clear_error: boolean;
  min_weaving_distance: number;
  collision_detection_enabled: boolean;
  updated_at?: string;
}
export interface SdkErrorData {
  code: number;
  description: string;
  solution: string;
  operation: string;
  timestamp: number;
}
export interface RobotErrorData {
  main_code: number;
  sub_code: number;
  has_error: boolean;
  message: string;
  sdk_error?: SdkErrorData | null;
}
export interface RobotErrorEvent {
  id: number;
  main_code: number;
  sub_code: number;
  message: string;
  started_at: string;
  ended_at: string | null;
  duration_sec: number | null;
  ongoing: boolean;
}
export const getUsers = async (): Promise<UserData[]> => {
  try {
    const response = await api.get('/users');
    return response.data.data || [];
  } catch (error) {
    console.error('사용자 목록 조회 오류:', error);
    throw error;
  }
};
export const createUser = async (user: {
  username: string;
  password: string;
  name: string;
  email?: string;
  role?: string;
}): Promise<{ id: number }> => {
  try {
    const response = await api.post('/users', user);
    if (response.data.status_code !== 200) {
      throw new Error(response.data.message || '사용자 생성 실패');
    }
    return response.data.data;
  } catch (error) {
    console.error('사용자 생성 오류:', error);
    throw error;
  }
};
export const updateUser = async (userId: number, data: {
  name?: string;
  email?: string;
  role?: string;
  active?: boolean;
  password?: string;
}): Promise<void> => {
  try {
    const response = await api.put(`/users/${userId}`, data);
    if (response.data.status_code !== 200) {
      throw new Error(response.data.message || '사용자 수정 실패');
    }
  } catch (error) {
    console.error('사용자 수정 오류:', error);
    throw error;
  }
};
export const deleteUser = async (userId: number): Promise<void> => {
  try {
    const response = await api.delete(`/users/${userId}`);
    if (response.data.status_code !== 200) {
      throw new Error(response.data.message || '사용자 삭제 실패');
    }
  } catch (error) {
    console.error('사용자 삭제 오류:', error);
    throw error;
  }
};
export const login = async (username: string, password: string): Promise<UserData> => {
  try {
    const response = await api.post('/auth/login', { username, password });
    if (response.data.status_code !== 200) {
      throw new Error(response.data.message || '로그인 실패');
    }
    return response.data.data;
  } catch (error) {
    console.error('로그인 오류:', error);
    throw error;
  }
};
export const logout = async (): Promise<void> => {
  try {
    await api.post('/auth/logout');
  } catch (error) {
    console.error('로그아웃 오류:', error);
  }
};
export const setWeaveParams = async (params: WeaveParams) => {
  try {
    const response = await api.post('/welding/weave/set-para', {
      weave_num: params.weave_num ?? 0,
      weave_type: params.weave_type,
      weave_frequency: params.weave_frequency,
      weave_inc_stay_time: params.weave_inc_stay_time ?? 0,
      weave_range: params.weave_range,
      weave_left_range: params.weave_left_range,
      weave_right_range: params.weave_right_range,
      additional_stay_time: params.additional_stay_time ?? 0,
      weave_left_stay_time: params.weave_left_stay_time,
      weave_right_stay_time: params.weave_right_stay_time,
      weave_circle_radio: params.weave_circle_radio,
      weave_stationary: params.weave_stationary ?? 0,
      weave_yaw_angle: params.weave_yaw_angle,
      weave_rot_angle: params.weave_rot_angle,
    });
    return response.data;
  } catch (error) {
    console.error('위빙 파라미터 설정 오류:', error);
    throw error;
  }
};
export const startWeave = async (weaveNum = 0) => {
  try {
    const response = await api.post('/welding/weave/start', { weave_num: weaveNum });
    return response.data;
  } catch (error) {
    console.error('위빙 시작 오류:', error);
    throw error;
  }
};
export const endWeave = async (weaveNum = 0) => {
  try {
    const response = await api.post('/welding/weave/end', { weave_num: weaveNum });
    return response.data;
  } catch (error) {
    console.error('위빙 종료 오류:', error);
    throw error;
  }
};
export const startArc = async (ioType = 0, arcNum = 0, timeout = 10000) => {
  try {
    const response = await api.post('/welding/arc/start', {
      io_type: ioType,
      arc_num: arcNum,
      timeout: timeout,
    });
    return response.data;
  } catch (error) {
    console.error('아크 용접 시작 오류:', error);
    throw error;
  }
};
export const endArc = async (ioType = 0, arcNum = 0, timeout = 10000) => {
  try {
    const response = await api.post('/welding/arc/end', {
      io_type: ioType,
      arc_num: arcNum,
      timeout: timeout,
    });
    return response.data;
  } catch (error) {
    console.error('아크 용접 종료 오류:', error);
    throw error;
  }
};
export const arcOn = async (
  current: number,
  voltage: number,
  ioType = 0,
  arcNum = 0,
  timeout = 10000,
  gasPreFlowMs = 500,
) => {
  try {
    const response = await api.post(
      '/welding/arc/on',
      {
        current,
        voltage,
        io_type: ioType,
        arc_num: arcNum,
        timeout,
        gas_pre_flow_ms: gasPreFlowMs,
      },
      {
        timeout: 30000,
      },
    );
    return response.data;
  } catch (error) {
    console.error('아크 점화 오류:', error);
    throw error;
  }
};
export const arcOff = async (ioType = 0, arcNum = 0, timeout = 1000, gasPostFlowMs = 500) => {
  try {
    const response = await api.post(
      '/welding/arc/off',
      {
        io_type: ioType,
        arc_num: arcNum,
        timeout,
        gas_post_flow_ms: gasPostFlowMs,
      },
      {
        timeout: 10000,
      },
    );
    return response.data;
  } catch (error) {
    console.error('아크 종료 오류:', error);
    throw error;
  }
};
export const setWeldingCurrent = async (current: number, ioType = 0, aoIndex = 0, blend = 0) => {
  try {
    const response = await api.post('/welding/current/set', {
      current,
      io_type: ioType,
      ao_index: aoIndex,
      blend,
    });
    return response.data;
  } catch (error) {
    console.error('용접 전류 설정 오류:', error);
    throw error;
  }
};
export const setWeldingVoltage = async (voltage: number, ioType = 0, aoIndex = 0, blend = 0) => {
  try {
    const response = await api.post('/welding/voltage/set', {
      voltage,
      io_type: ioType,
      ao_index: aoIndex,
      blend,
    });
    return response.data;
  } catch (error) {
    console.error('용접 전압 설정 오류:', error);
    throw error;
  }
};
export const setWeldingParams = async (
  current: number,
  voltage: number,
  ioType = 0,
  aoIndex = 0,
  blend = 0,
) => {
  try {
    const response = await api.post('/welding/params/set', {
      current,
      voltage,
      io_type: ioType,
      ao_index: aoIndex,
      blend,
    });
    return response.data;
  } catch (error) {
    console.error('용접 파라미터 설정 오류:', error);
    throw error;
  }
};
export const gasStart = async (ioType = 0) => {
  try {
    const response = await api.post('/welding/gas/start', { io_type: ioType });
    return response.data;
  } catch (error) {
    console.error('가스 송출 시작 오류:', error);
    throw error;
  }
};
export const gasStop = async (ioType = 0) => {
  try {
    const response = await api.post('/welding/gas/stop', { io_type: ioType });
    return response.data;
  } catch (error) {
    console.error('가스 송출 정지 오류:', error);
    throw error;
  }
};
export const forwardWireFeed = async (ioType = 0, wireFeed = 1) => {
  try {
    const response = await api.post('/robot_sdk/wire/forward', { ioType, wireFeed });
    return response.data;
  } catch (error) {
    console.error('와이어 전진 오류:', error);
    throw error;
  }
};
export const reverseWireFeed = async (ioType = 0, wireFeed = 1) => {
  try {
    const response = await api.post('/robot_sdk/wire/reverse', { ioType, wireFeed });
    return response.data;
  } catch (error) {
    console.error('와이어 후진 오류:', error);
    throw error;
  }
};
export const stopForwardWireFeed = async (ioType = 0) => {
  try {
    const response = await api.post('/robot_sdk/wire/forward', { ioType, wireFeed: 0 });
    return response.data;
  } catch (error) {
    console.error('와이어 전진 정지 오류:', error);
    throw error;
  }
};
export const stopReverseWireFeed = async (ioType = 0) => {
  try {
    const response = await api.post('/robot_sdk/wire/reverse', { ioType, wireFeed: 0 });
    return response.data;
  } catch (error) {
    console.error('와이어 후진 정지 오류:', error);
    throw error;
  }
};
export const arcTraceControl = async (params: ArcTraceParams = {}) => {
  try {
    const response = await api.post('/welding/arc-trace/control', {
      flag: params.flag ?? 1,
      delay_time: params.delay_time ?? 0,
      is_left_right: params.is_left_right ?? 1,
      klr: params.klr ?? 0.06,
      t_start_lr: params.t_start_lr ?? 5.0,
      step_max_lr: params.step_max_lr ?? 5.0,
      sum_max_lr: params.sum_max_lr ?? 30.0,
      is_up_down: params.is_up_down ?? 1,
      kud: params.kud ?? 0.06,
      t_start_ud: params.t_start_ud ?? 5.0,
      step_max_ud: params.step_max_ud ?? 5.0,
      sum_max_ud: params.sum_max_ud ?? 30.0,
      axis_select: params.axis_select ?? 0,
      reference_type: params.reference_type ?? 0,
      refer_sample_start_ud: params.refer_sample_start_ud ?? 4.0,
      refer_sample_count_ud: params.refer_sample_count_ud ?? 1.0,
      reference_current: params.reference_current ?? 10.0,
      offset_type: params.offset_type ?? 0,
      offset_parameter: params.offset_parameter ?? 0,
    });
    return response.data;
  } catch (error) {
    console.error('아크 트래킹 제어 오류:', error);
    throw error;
  }
};
export const arcTraceOn = async (params: Omit<ArcTraceParams, 'flag'> = {}) => {
  return arcTraceControl({ ...params, flag: 1 });
};
export const arcTraceOff = async () => {
  return arcTraceControl({ flag: 0 });
};
export interface BatchMovePoint {
  joints?: number[];
  tcp: number[];
  speed: number;
  tool: number;
  user: number;
  vel_mode: number;
  offset_flag: number;
  offset: number[];
}
export interface BatchMoveResult {
  status_code: number;
  data: {
    completed: number;
    total: number;
    stopped: boolean;
    results: number[];
  };
}
export const batchMoveL = async (
  points: BatchMovePoint[],
  options?: { perPoint?: boolean; blendR?: number },
): Promise<BatchMoveResult> => {
  try {
    const body: Record<string, unknown> = { points };
    if (options?.perPoint) {
      body.per_point = true;
      if (options.blendR !== undefined) body.blend_r = options.blendR;
    }
    // 2026-09-04 속도 배율 인하(0.156)로 파트 하나(포인트 몇 개) 이동시간도 늘어나
    // 기존 300000ms(5분)로는 부족해질 수 있어 30분으로 상향.
    const response = await api.post('/welding/batch-move', body, {
      timeout: 1800000,
    });
    return response.data;
  } catch (error) {
    console.error('Batch MoveL 오류:', error);
    throw error;
  }
};
export const getWeldingConfig = async (): Promise<WeldingConfigData> => {
  try {
    const response = await api.get('/robot_sdk/welding-config');
    return response.data.data;
  } catch (error) {
    try {
      const fallbackResponse = await api.get('/welding-config');
      return fallbackResponse.data.data;
    } catch {
      console.error('용접 설정 조회 오류:', error);
      throw error;
    }
  }
};
export const updateWeldingConfig = async (config: Partial<WeldingConfigData>): Promise<WeldingConfigData> => {
  try {
    const response = await api.put('/robot_sdk/welding-config', config);
    return response.data.data;
  } catch (error) {
    try {
      const fallbackResponse = await api.put('/welding-config', config);
      return fallbackResponse.data.data;
    } catch {
      console.error('용접 설정 저장 오류:', error);
      throw error;
    }
  }
};
export const getWeldingPresets = async (): Promise<WeldingPresetData[]> => {
  try {
    const response = await api.get('/welding-config/presets');
    return response.data.data;
  } catch (error) {
    console.error('용접 프리셋 조회 오류:', error);
    throw error;
  }
};
export const createWeldingPreset = async (preset: Omit<WeldingPresetData, 'id' | 'is_default' | 'created_at' | 'updated_at'>): Promise<WeldingPresetData> => {
  try {
    const response = await api.post('/welding-config/presets', preset);
    return response.data.data;
  } catch (error) {
    console.error('용접 프리셋 생성 오류:', error);
    throw error;
  }
};
export const updateWeldingPreset = async (presetId: number, preset: Partial<WeldingPresetData>): Promise<WeldingPresetData> => {
  try {
    const response = await api.put(`/welding-config/presets/${presetId}`, preset);
    return response.data.data;
  } catch (error) {
    console.error('용접 프리셋 수정 오류:', error);
    throw error;
  }
};
export const deleteWeldingPreset = async (presetId: number): Promise<void> => {
  try {
    await api.delete(`/welding-config/presets/${presetId}`);
  } catch (error) {
    console.error('용접 프리셋 삭제 오류:', error);
    throw error;
  }
};
export const duplicateWeldingPreset = async (presetId: number): Promise<WeldingPresetData> => {
  try {
    const response = await api.post(`/welding-config/presets/${presetId}/duplicate`);
    return response.data.data;
  } catch (error) {
    console.error('용접 프리셋 복제 오류:', error);
    throw error;
  }
};
export interface WeldingPartOrderItem {
  part_index: number;
  execution_order: number;
  part_name: string;
  points: string[];
}
export const getWeldingPartOrder = async (): Promise<WeldingPartOrderItem[]> => {
  try {
    const response = await api.get('/welding-config/part-order');
    return response.data?.data?.order ?? [];
  } catch (error) {
    console.error('용접 파트 순서 조회 오류:', error);
    return [];
  }
};
export const updateWeldingPartOrder = async (order: WeldingPartOrderItem[]): Promise<boolean> => {
  try {
    await api.put('/welding-config/part-order', { order });
    return true;
  } catch (error) {
    console.error('용접 파트 순서 변경 오류:', error);
    return false;
  }
};
export const getWeldingLogs = async (
  limit: number = 100,
  offset: number = 0,
  jobId?: number
): Promise<{ logs: WeldingLogData[]; total: number }> => {
  try {
    const params: Record<string, unknown> = { limit, offset };
    if (jobId !== undefined) {
      params.job_id = jobId;
    }
    const response = await api.get('/welding-logs', { params });
    return response.data.data;
  } catch (error) {
    console.error('용접 로그 조회 오류:', error);
    throw error;
  }
};
export const getWeldingLog = async (logId: number): Promise<WeldingLogData> => {
  try {
    const response = await api.get(`/welding-logs/${logId}`);
    return response.data.data;
  } catch (error) {
    console.error('용접 로그 조회 오류:', error);
    throw error;
  }
};
export const createWeldingLog = async (log: Omit<WeldingLogData, 'id' | 'created_at'>): Promise<WeldingLogData> => {
  try {
    const response = await api.post('/welding-logs', log);
    return response.data.data;
  } catch (error) {
    console.error('용접 로그 생성 오류:', error);
    throw error;
  }
};
export const updateWeldingLog = async (logId: number, log: Partial<WeldingLogData>): Promise<WeldingLogData> => {
  try {
    const response = await api.put(`/welding-logs/${logId}`, log);
    return response.data.data;
  } catch (error) {
    console.error('용접 로그 업데이트 오류:', error);
    throw error;
  }
};
export const deleteWeldingLogs = async (ids: number[]): Promise<{ deleted_count: number }> => {
  try {
    const response = await api.delete('/welding-logs', { data: { ids } });
    return response.data.data;
  } catch (error) {
    console.error('용접 로그 삭제 오류:', error);
    throw error;
  }
};
export interface WeldingConfigData {
  id: number;
  touch_sensing_enabled: boolean;
  touch_speed: number;
  touch_distance: number;
  touch_offset_depth: number;
  touch_approach_angle: number;
  touch_sensing_velocity: number;
  touch_sensing_acceleration: number;
  touch_sensing_step_size: number;
  touch_sensing_retract_distance: number;
  touch_sensing_approach_offset: number;
  touch_sensing_move_distance: number;
  touch_sensing_point_speed: number;
  touch_sensing_search_speed: number;
  p1_touch_center: boolean;
  p1_touch_left: boolean;
  p1_touch_right: boolean;
  p1_touch_bottom: boolean;
  p2_touch_center: boolean;
  p2_touch_left: boolean;
  p2_touch_right: boolean;
  p3_touch_center: boolean;
  p3_touch_left: boolean;
  p3_touch_right: boolean;
  p3_touch_bottom: boolean;
  p4_touch_center: boolean;
  p4_touch_top: boolean;
  p4_touch_bottom: boolean;
  p4_touch_side: boolean;
  p5_touch_center: boolean;
  p5_touch_top: boolean;
  p5_touch_bottom: boolean;
  p6_touch_center: boolean;
  p6_touch_top: boolean;
  p6_touch_bottom: boolean;
  p7_touch_center: boolean;
  p7_touch_left: boolean;
  p7_touch_right: boolean;
  p8_touch_center: boolean;
  p8_touch_left: boolean;
  p8_touch_right: boolean;
  p9_touch_center: boolean;
  p9_touch_left: boolean;
  p9_touch_right: boolean;
  p9_touch_bottom: boolean;
  p10_touch_center: boolean;
  p10_touch_top: boolean;
  p10_touch_bottom: boolean;
  p10_touch_side: boolean;
  p11_touch_center: boolean;
  p11_touch_top: boolean;
  p11_touch_bottom: boolean;
  p12_touch_center: boolean;
  p12_touch_top: boolean;
  p12_touch_bottom: boolean;
  arc_tracking_enabled: boolean;
  arc_tracking_left_right: boolean;
  arc_tracking_up_down: boolean;
  arc_tracking_klr: number;
  arc_tracking_kud: number;
  arc_tracking_step_max_lr: number;
  arc_tracking_step_max_ud: number;
  arc_tracking_sum_max_lr: number;
  arc_tracking_sum_max_ud: number;
  arc_retry_count: number;
  arc_retry_delay: number;
  stickout_length: number;
  travel_angle: number;
  work_angle: number;
  max_current: number;
  max_voltage: number;
  overheat_protection: boolean;
  overheat_threshold: number;
  arc_time_limit: number;
  gas_pre_flow_time: number;
  gas_post_flow_time: number;
  updated_at?: string;
}
export interface WeldingPresetData {
  id: number;
  name: string;
  cell_type: string;
  height_min: number;
  height_max: number;
  current: number;
  voltage: number;
  speed: number;
  wire_speed: number;
  gas_flow: number;
  arc_start_time: number;
  crater_time: number;
  pre_heat_time: number;
  post_heat_time: number;
  weaving_enabled: boolean;
  weaving_width?: number;
  weaving_frequency?: number;
  is_default: boolean;
  created_at?: string;
  updated_at?: string;
}
export interface WeldingLogSegment {
  from: string;
  to: string;
  distance_mm: number;
  cpm: number;
  expected_sec: number;
  actual_sec?: number;
  gap?: number;
  weld_voltage?: number | null;
  weld_current?: number | null;
  weaving_type?: string | null;
  weave_params?: Record<string, unknown> | null;
  touch_offset?: { dx: number; dy: number; dz: number } | null;
}
export interface WeldingLogData {
  id?: number;
  job_id?: number | null;
  job_name?: string;
  user_id?: string;
  operation_type: 'welding' | 'dryrun' | 'simulation' | 'touch_sensing';
  start_type?: 'start' | 'continue';
  started_at: string;
  completed_at?: string;
  total_distance_mm: number;
  cpm: number;
  expected_duration_sec: number;
  actual_duration_sec: number;
  segments: WeldingLogSegment[];
  total_points: number;
  completed_points: number;
  weld_voltage?: number;
  weld_current?: number;
  weaving_type?: string;
  weave_params?: Record<string, unknown>;
  points_snapshot?: Record<string, unknown>[];
  result_status: 'pending' | 'success' | 'failed' | 'stopped';
  error_message?: string;
  created_at?: string;
}
export interface UserData {
  id: number;
  username: string;
  name: string;
  email: string;
  role: 'admin' | 'operator' | 'viewer';
  active: boolean;
  lastLogin?: string | null;
  createdAt?: string;
}
