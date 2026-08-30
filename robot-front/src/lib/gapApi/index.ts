// 갭 기반 파라미터 시스템 백엔드(:8000) 전용 axios 클라이언트
// 기존 lib/api (:8001 로봇 제어)와 분리
import axios, { AxiosInstance } from 'axios';

declare const process: { env: { [key: string]: string | undefined } };

const GAP_API_BASE = process.env.REACT_APP_GAP_API_URL || 'http://localhost:8000';

export const gapApi: AxiosInstance = axios.create({
  baseURL: GAP_API_BASE,
  timeout: 10000,
});

// JWT 자동 첨부
gapApi.interceptors.request.use(config => {
  const token = localStorage.getItem('gap_token');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 401 자동 로그아웃
gapApi.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('gap_token');
      localStorage.removeItem('gap_user');
      window.dispatchEvent(new Event('gap-auth-expired'));
    }
    return Promise.reject(err);
  }
);

// ============================================================
// 타입 정의
// ============================================================
export type UserRole = 'admin' | 'operator' | 'viewer';
export type Posture = 'vertical' | 'horizontal';
export type DataSource = 'lab' | 'field' | 'wps';
export type PromotionStatus = 'pending' | 'approved' | 'rejected' | 'superseded';
export type JobStatus = 'created' | 'ready' | 'running' | 'paused' | 'completed' | 'failed' | 'aborted';
export type JobMode = 'real' | 'dry_run';

export interface AuthUser {
  access_token: string;
  token_type: string;
  role: UserRole;
  username: string;
  full_name: string | null;
}

export interface WeldingParam {
  id: number;
  posture: Posture;
  gap_mm: number;
  current_a: number;
  voltage_v: number;
  speed_cpm: number;
  stickout_mm: number;
  weave_enabled: boolean;
  weave_type: number;
  weave_freq_hz: number;
  weave_range_mm: number;
  weave_left_dwell_ms: number;
  weave_right_dwell_ms: number;
  material: string;
  thickness_mm: number;
  joint_type: string;
  source: DataSource;
  active: boolean;
  deactivated_at: string | null;
  deactivated_by: number | null;
  deactivation_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface WeldingParamCreate {
  posture: Posture;
  gap_mm: number;
  current_a: number;
  voltage_v: number;
  speed_cpm: number;
  stickout_mm: number;
  weave_enabled?: boolean;
  weave_freq_hz?: number;
  weave_range_mm?: number;
  weave_left_dwell_ms?: number;
  weave_right_dwell_ms?: number;
  material?: string;
  thickness_mm: number;
  joint_type?: string;
  notes?: string;
}

export interface ParamLookupResult {
  matched: boolean;
  fallback_level: number;
  warning: string | null;
  param: WeldingParam | null;
  candidates: WeldingParam[] | null;
}

export interface PromotionRequest {
  id: number;
  trigger_type: string;
  posture: Posture;
  gap_mm: number;
  material: string | null;
  thickness_mm: number | null;
  joint_type: string | null;
  field_name: string;
  current_value: number;
  requested_value: number;
  override_count: number;
  override_stddev_pct: number | null;
  operator_count: number | null;
  reason: string | null;
  status: PromotionStatus;
  reviewed_by: number | null;
  reviewer_note: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface ParamOverrideCreate {
  job_id: number;
  point_code?: string;
  posture: Posture;
  gap_mm: number;
  material?: string;
  thickness_mm?: number;
  joint_type?: string;
  field_name: string;
  original_value: number;
  override_value: number;
  reason?: string;
}

// ============================================================
// API 함수
// ============================================================

// 로그인 (form-encoded)
export async function loginGap(username: string, password: string): Promise<AuthUser> {
  const form = new URLSearchParams();
  form.append('username', username);
  form.append('password', password);
  const res = await gapApi.post<AuthUser>('/api/auth/login', form, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  return res.data;
}

// 파라미터
export const paramApi = {
  lookup: (params: { posture: Posture; gap: number; thickness: number; material?: string; joint?: string }) =>
    gapApi.get<ParamLookupResult>('/api/params/lookup', { params }).then(r => r.data),

  list: (params?: { posture?: Posture; material?: string; thickness?: number; joint?: string; include_inactive?: boolean }) =>
    gapApi.get<WeldingParam[]>('/api/params/', { params }).then(r => r.data),

  get: (id: number) => gapApi.get<WeldingParam>(`/api/params/${id}`).then(r => r.data),

  create: (body: WeldingParamCreate) =>
    gapApi.post<WeldingParam>('/api/params/', body).then(r => r.data),

  update: (id: number, body: Partial<WeldingParamCreate>) =>
    gapApi.patch<WeldingParam>(`/api/params/${id}`, body).then(r => r.data),

  deactivate: (id: number, reason: string) =>
    gapApi.delete<WeldingParam>(`/api/params/${id}`, { data: { reason } }).then(r => r.data),

  restore: (id: number) =>
    gapApi.post<WeldingParam>(`/api/params/${id}/restore`).then(r => r.data),
};

// 오버라이드
export const overrideApi = {
  create: (body: ParamOverrideCreate) =>
    gapApi.post('/api/overrides/', body).then(r => r.data),

  list: (params?: { job_id?: number; posture?: Posture; gap_mm?: number; limit?: number }) =>
    gapApi.get('/api/overrides/', { params }).then(r => r.data),
};

// 승격 요청
export const promotionApi = {
  list: (params?: { status?: PromotionStatus }) =>
    gapApi.get<PromotionRequest[]>('/api/promotions/', { params }).then(r => r.data),

  get: (id: number) => gapApi.get<PromotionRequest>(`/api/promotions/${id}`).then(r => r.data),

  review: (id: number, action: 'approve' | 'reject', note?: string) =>
    gapApi.post<PromotionRequest>(`/api/promotions/${id}/review`, { action, note }).then(r => r.data),
};

// 작업
export const jobApi = {
  list: (params?: { status?: JobStatus }) =>
    gapApi.get('/api/jobs/', { params }).then(r => r.data),

  get: (id: number) => gapApi.get(`/api/jobs/${id}`).then(r => r.data),

  create: (body: { job_name?: string; cell_type?: string; mode?: JobMode; notes?: string }) =>
    gapApi.post('/api/jobs/', body).then(r => r.data),

  start: (id: number) => gapApi.post(`/api/jobs/${id}/start`).then(r => r.data),

  complete: (id: number) => gapApi.post(`/api/jobs/${id}/complete`).then(r => r.data),

  listPointGaps: (jobId: number) =>
    gapApi.get(`/api/jobs/${jobId}/point-gaps`).then(r => r.data),

  bulkUpsertPointGaps: (
    jobId: number,
    points: { point_code: string; gap_mm: number; posture: Posture; thickness_mm: number }[]
  ) =>
    gapApi.post(`/api/jobs/${jobId}/point-gaps`, { job_id: jobId, points }).then(r => r.data),
};

// 설정
export const settingsApi = {
  getDefaults: () => gapApi.get('/api/settings/defaults').then(r => r.data),
  getAlarmThresholds: () => gapApi.get('/api/settings/alarm-thresholds').then(r => r.data),
  getOverrideLimits: () => gapApi.get('/api/settings/override-limits').then(r => r.data),
  getDetectionConfig: () => gapApi.get('/api/settings/detection-config').then(r => r.data),
};

// 사용자 (관리자용)
export const userApi = {
  me: () => gapApi.get('/api/users/me').then(r => r.data),
  list: () => gapApi.get('/api/users/').then(r => r.data),
  create: (body: { username: string; password: string; full_name?: string; email?: string; role?: UserRole }) =>
    gapApi.post('/api/users/', body).then(r => r.data),
};

// 관리자 배치
export const adminApi = {
  runPromotionDetection: () =>
    gapApi.post('/api/admin/run-promotion-detection').then(r => r.data),
};

// 편차 이벤트 (알람 소스)
export interface DeviationEvent {
  id: number;
  created_at: string;
  job_id: number;
  point_code: string | null;
  level: 1 | 2 | 3;
  field_name: string;
  command_value: number;
  actual_value: number;
  deviation_pct: number;
  duration_sec: number;
  action_taken: string | null;
}
export const deviationApi = {
  listRecent: (limit = 10, level?: number) =>
    gapApi
      .get<DeviationEvent[]>('/api/deviations/', { params: { limit, level } })
      .then(r => r.data),
};

export interface DashboardStatsResponse {
  todayJobs: number;
  completedJobs: number;
  failedJobs: number;
  totalWeldCount: number;
  defectRate: number;
  currentJob: { id: number; job_name: string | null; cell_type: string | null; started_at: string | null } | null;
  recentDeviations24h: number;
}
export const dashboardApi = {
  stats: () => gapApi.get<DashboardStatsResponse>('/api/dashboard/stats').then(r => r.data),
};
