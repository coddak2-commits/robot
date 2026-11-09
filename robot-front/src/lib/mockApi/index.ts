import { RobotJoints, RobotTCF } from '@/types/RobotData';
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
export const mockGetJobs = async (): Promise<WeldingJob[]> => {
  await delay(200);
  return [...mockJobs];
};
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
