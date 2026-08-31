import { RobotJoints, RobotTCF, RobotStatusResponse } from '@/types/RobotData';
// 이 프로젝트에는 @types/node가 없어 process 전역 타입이 없음 - 이 파일 한정 최소 선언
declare const process: { env: { REACT_APP_MOCK_PASSWORD?: string } };
export interface WeldingJob {
  id: string;
  name: string;
  cellType: 'ucell' | 'collar';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'paused';
  progress: number;
  scheduledAt: string;
  startedAt?: string;
  completedAt?: string;
  estimatedDuration: number;
  robotId: string;
  weldingParams: {
    current: number;
    voltage: number;
    speed: number;
    gasFlow: number;
  };
  createdBy: string;
}
export interface JobHistory {
  id: string;
  jobId: string;
  jobName: string;
  status: 'completed' | 'failed';
  startedAt: string;
  completedAt: string;
  duration: number;
  weldCount: number;
  defectCount: number;
  operator: string;
}
const mockJobs: WeldingJob[] = [
  {
    id: 'job-001', name: 'U-Cell 용접 작업 A', cellType: 'ucell', status: 'running',
    progress: 45, scheduledAt: '2025-01-27T09:00:00', startedAt: '2025-01-27T09:05:00',
    estimatedDuration: 30, robotId: 'robot-01',
    weldingParams: { current: 180, voltage: 24, speed: 50, gasFlow: 15 }, createdBy: 'admin',
  },
  {
    id: 'job-002', name: 'Collar Plate 용접 B', cellType: 'collar', status: 'pending',
    progress: 0, scheduledAt: '2025-01-27T10:00:00',
    estimatedDuration: 45, robotId: 'robot-01',
    weldingParams: { current: 200, voltage: 26, speed: 40, gasFlow: 18 }, createdBy: 'operator1',
  },
  {
    id: 'job-003', name: 'U-Cell 용접 작업 C', cellType: 'ucell', status: 'pending',
    progress: 0, scheduledAt: '2025-01-27T11:30:00',
    estimatedDuration: 25, robotId: 'robot-01',
    weldingParams: { current: 175, voltage: 23, speed: 55, gasFlow: 14 }, createdBy: 'admin',
  },
];
const mockJobHistory: JobHistory[] = [
  { id: 'hist-001', jobId: 'job-prev-001', jobName: 'U-Cell 용접 작업 #127', status: 'completed', startedAt: '2025-01-26T14:00:00', completedAt: '2025-01-26T14:28:00', duration: 28, weldCount: 24, defectCount: 0, operator: 'admin' },
  { id: 'hist-002', jobId: 'job-prev-002', jobName: 'Collar Plate 용접 #89', status: 'completed', startedAt: '2025-01-26T11:00:00', completedAt: '2025-01-26T11:42:00', duration: 42, weldCount: 36, defectCount: 1, operator: 'operator1' },
  { id: 'hist-003', jobId: 'job-prev-003', jobName: 'U-Cell 용접 작업 #126', status: 'failed', startedAt: '2025-01-26T09:00:00', completedAt: '2025-01-26T09:15:00', duration: 15, weldCount: 12, defectCount: 3, operator: 'admin' },
  { id: 'hist-004', jobId: 'job-prev-004', jobName: 'U-Cell 용접 작업 #125', status: 'completed', startedAt: '2025-01-25T16:00:00', completedAt: '2025-01-25T16:30:00', duration: 30, weldCount: 24, defectCount: 0, operator: 'operator2' },
];
export const mockGetJobs = async (): Promise<WeldingJob[]> => {
  await delay(200);
  return [...mockJobs];
};
export const mockCreateJob = async (
  job: Omit<WeldingJob, 'id' | 'status' | 'progress'>,
): Promise<WeldingJob> => {
  await delay(300);
  const newJob: WeldingJob = { ...job, id: `job-${Date.now()}`, status: 'pending', progress: 0 };
  mockJobs.push(newJob);
  return newJob;
};
export const mockDeleteJob = async (jobId: string): Promise<boolean> => {
  await delay(200);
  const index = mockJobs.findIndex(j => j.id === jobId);
  if (index !== -1) { mockJobs.splice(index, 1); return true; }
  return false;
};
export const mockUpdateJobStatus = async (
  jobId: string, status: WeldingJob['status'],
): Promise<WeldingJob | null> => {
  await delay(200);
  const job = mockJobs.find(j => j.id === jobId);
  if (job) {
    job.status = status;
    if (status === 'running') job.startedAt = new Date().toISOString();
    else if (status === 'completed' || status === 'failed') {
      job.completedAt = new Date().toISOString();
      job.progress = status === 'completed' ? 100 : job.progress;
    }
    return { ...job };
  }
  return null;
};
export const mockGetJobHistory = async (): Promise<JobHistory[]> => {
  await delay(200);
  return [...mockJobHistory];
};
let useMockMode = false;
export const setMockMode = (enabled: boolean) => {
  useMockMode = enabled;
};
export const isMockMode = () => useMockMode;
export const mockRobotState = {
  connected: true,
  mode: 0,
  running: false,
  joints: {
    j1: 0,
    j2: -90,
    j3: 90,
    j4: -180,
    j5: -90,
    j6: 0,
  } as RobotJoints,
  tcp: {
    x: -495,
    y: -130,
    z: 680,
    rx: -90,
    ry: 0,
    rz: 90,
  } as RobotTCF,
  temperature: [42, 38, 45, 36, 41, 39],
  torque: [12.5, 18.2, 22.1, 8.4, 6.2, 3.1],
  speed: 50,
  errorCode: 0,
  operatingHours: 1234.5,
};
export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
export const mockCheckConnection = async () => {
  await delay(200);
  return {
    status_code: 200,
    message: 'success',
    data: 'connected',
  };
};
export const mockGetRobotStatus = async (): Promise<RobotStatusResponse> => {
  await delay(100);
  const variation = () => (Math.random() - 0.5) * 0.1;
  return {
    status_code: 200,
    data: {
      joints: {
        j1: Number(mockRobotState.joints.j1) + variation(),
        j2: Number(mockRobotState.joints.j2) + variation(),
        j3: Number(mockRobotState.joints.j3) + variation(),
        j4: Number(mockRobotState.joints.j4) + variation(),
        j5: Number(mockRobotState.joints.j5) + variation(),
        j6: Number(mockRobotState.joints.j6) + variation(),
      },
      tcp: {
        x: Number(mockRobotState.tcp.x) + variation(),
        y: Number(mockRobotState.tcp.y) + variation(),
        z: Number(mockRobotState.tcp.z) + variation(),
        rx: Number(mockRobotState.tcp.rx) + variation(),
        ry: Number(mockRobotState.tcp.ry) + variation(),
        rz: Number(mockRobotState.tcp.rz) + variation(),
      },
      tl_cur_pos_base: [0, 0, 0, 0, 0, 0],
    },
  };
};
export const mockMoveRobot = async (data: {
  joints?: Partial<RobotJoints>;
  tcf?: Partial<RobotTCF>;
}) => {
  await delay(500);
  if (data.joints) {
    mockRobotState.joints = { ...mockRobotState.joints, ...data.joints };
  }
  if (data.tcf) {
    mockRobotState.tcp = { ...mockRobotState.tcp, ...data.tcf };
  }
  return { status_code: 200, message: 'success', data: null };
};
export const mockStopRobot = async () => {
  await delay(100);
  mockRobotState.running = false;
  return { status_code: 200, message: 'success', data: null };
};
export const mockChangeMode = async (mode: number) => {
  await delay(200);
  mockRobotState.mode = mode;
  return { status_code: 200, message: 'success', data: { mode } };
};
export const mockGetRobotMonitoring = async () => {
  await delay(50);
  const tempVariation = () => Math.random() * 2 - 1;
  const torqueVariation = () => Math.random() * 0.5 - 0.25;
  return {
    joints: mockRobotState.joints,
    tcp: mockRobotState.tcp,
    temperature: mockRobotState.temperature.map(t => t + tempVariation()),
    torque: mockRobotState.torque.map(t => t + torqueVariation()),
    speed: mockRobotState.speed + (Math.random() * 2 - 1),
    mode: mockRobotState.mode,
    running: mockRobotState.running,
    errorCode: mockRobotState.errorCode,
    operatingHours: mockRobotState.operatingHours,
  };
};
export interface User {
  id: string;
  username: string;
  name: string;
  role: 'admin' | 'operator' | 'viewer';
  email: string;
  lastLogin?: string;
  createdAt: string;
  active: boolean;
}
const mockUsers: User[] = [
  { id: 'user-001', username: 'admin', name: '관리자', role: 'admin', email: 'admin@factory.com', lastLogin: '2025-01-27T08:30:00', createdAt: '2024-01-01T00:00:00', active: true },
  { id: 'user-002', username: 'operator1', name: '김용접', role: 'operator', email: 'operator1@factory.com', lastLogin: '2025-01-26T17:00:00', createdAt: '2024-03-15T00:00:00', active: true },
  { id: 'user-003', username: 'operator2', name: '이작업', role: 'operator', email: 'operator2@factory.com', lastLogin: '2025-01-25T09:00:00', createdAt: '2024-06-20T00:00:00', active: true },
  { id: 'user-004', username: 'viewer1', name: '박모니터', role: 'viewer', email: 'viewer1@factory.com', createdAt: '2024-09-10T00:00:00', active: false },
];
export const mockGetUsers = async (): Promise<User[]> => {
  await delay(200);
  return [...mockUsers];
};
export interface SystemConfig {
  robotSettings: {
    defaultSpeed: number;
    maxSpeed: number;
    defaultAcceleration: number;
    safetyZoneEnabled: boolean;
    collisionDetection: boolean;
  };
  weldingDefaults: {
    current: number;
    voltage: number;
    speed: number;
    gasFlow: number;
    preHeatTime: number;
    postHeatTime: number;
  };
  systemPreferences: {
    language: 'ko' | 'en';
    theme: 'dark' | 'light';
    autoLogoutMinutes: number;
    soundEnabled: boolean;
    notificationsEnabled: boolean;
  };
}
let mockSystemConfig: SystemConfig = {
  robotSettings: {
    defaultSpeed: 50, maxSpeed: 100, defaultAcceleration: 180,
    safetyZoneEnabled: true, collisionDetection: true,
  },
  weldingDefaults: {
    current: 180, voltage: 24, speed: 50, gasFlow: 15,
    preHeatTime: 2, postHeatTime: 3,
  },
  systemPreferences: {
    language: 'ko', theme: 'dark', autoLogoutMinutes: 60,
    soundEnabled: true, notificationsEnabled: true,
  },
};
export const mockGetSystemConfig = async (): Promise<SystemConfig> => {
  await delay(200);
  return { ...mockSystemConfig };
};
export const mockUpdateSystemConfig = async (config: Partial<SystemConfig>): Promise<SystemConfig> => {
  await delay(300);
  mockSystemConfig = {
    ...mockSystemConfig,
    ...config,
    robotSettings: { ...mockSystemConfig.robotSettings, ...config.robotSettings },
    weldingDefaults: { ...mockSystemConfig.weldingDefaults, ...config.weldingDefaults },
    systemPreferences: { ...mockSystemConfig.systemPreferences, ...config.systemPreferences },
  };
  return { ...mockSystemConfig };
};
export interface DashboardStats {
  todayJobs: number;
  completedJobs: number;
  failedJobs: number;
  totalWeldCount: number;
  defectRate: number;
  uptime: number;
  robotStatus: 'idle' | 'running' | 'error' | 'maintenance';
  currentJob: WeldingJob | null;
  alerts: Array<{
    id: string;
    type: 'warning' | 'error' | 'info';
    message: string;
    timestamp: string;
  }>;
}
export const mockGetDashboardStats = async (): Promise<DashboardStats> => {
  await delay(150);
  const jobs = await mockGetJobs();
  const runningJob = jobs.find(j => j.status === 'running') || null;
  return {
    todayJobs: 5, completedJobs: 3, failedJobs: 1,
    totalWeldCount: 84, defectRate: 2.4, uptime: 98.5,
    robotStatus: runningJob ? 'running' : 'idle',
    currentJob: runningJob,
    alerts: [
      { id: 'alert-001', type: 'info', message: '다음 예정 작업: U-Cell 용접 작업 C (11:30)', timestamp: new Date().toISOString() },
      { id: 'alert-002', type: 'warning', message: '용접 와이어 잔량 부족 (약 2시간 분량)', timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString() },
    ],
  };
};
export const mockLogin = async (username: string, password: string) => {
  await delay(500);
  // 하드코딩된 비밀번호를 번들에 남기지 않기 위해 개발자가 로컬에서만
  // REACT_APP_MOCK_PASSWORD를 설정해야 목업 로그인이 동작함 (미설정 시 항상 비활성).
  const devPassword = process.env.REACT_APP_MOCK_PASSWORD;
  if (!devPassword) {
    throw new Error('Mock login is disabled (REACT_APP_MOCK_PASSWORD not set)');
  }
  const user = mockUsers.find(u => u.username === username && u.active);
  if (user && password === devPassword) {
    return {
      status_code: 200,
      data: {
        accessToken: 'mock-access-token-' + Date.now(),
        refreshToken: 'mock-refresh-token-' + Date.now(),
        user: { id: user.id, username: user.username, name: user.name, role: user.role },
      },
    };
  }
  throw new Error('Invalid credentials');
};
