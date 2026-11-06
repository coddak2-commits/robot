// [v1.1.283] robot_camera(Orbbec Gemini 435Le, 127.0.0.1:8002) 호출.
// 카메라 프로그램이 없거나 꺼져 있으면 조용히 실패한다. 용접 흐름을 막지 않는다.
import { createLogger } from './index';
import { getRealtimeRobotStatus } from './robotApi/index';

const log = createLogger('Camera');
const CAMERA_BASE = 'http://127.0.0.1:8002';

export interface CameraStatus {
  connected: boolean;
  busy: boolean;
  name: string;
  serial: string;
  firmware: string;
  last_error: string;
}

export interface CameraCaptureInput {
  trigger: 'manual' | 'auto';
  job_id?: number | null;
  job_name?: string | null;
  gap_actual_mm?: number | null;
  part_gaps?: Record<string, number>;
  note?: string;
}

export interface CameraCaptureResult {
  ok: boolean;
  id?: number;
  error?: string;
  capture?: { depth_valid_ratio?: number; color_path?: string; depth_path?: string };
}

async function fetchJson<T>(path: string, init: RequestInit, timeoutMs: number): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${CAMERA_BASE}${path}`, { ...init, signal: ctrl.signal });
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/** 카메라 프로그램 상태. 프로그램이 없거나 응답이 없으면 null */
export async function getCameraStatus(timeoutMs = 1500): Promise<CameraStatus | null> {
  try {
    return await fetchJson<CameraStatus>('/camera/status', { method: 'GET' }, timeoutMs);
  } catch {
    return null;
  }
}

/** 저장된 포인트의 gap 값 (포인트 id -> gap) */
export function collectPointGaps(points: Array<{ id: string; isSaved: boolean; gap?: number }>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of points) {
    if (p.isSaved && p.id !== 'home') out[p.id] = Number(p.gap ?? 0);
  }
  return out;
}

/** 깊이+컬러 촬영. 로봇 위치는 촬영 직전에 읽어서 같이 저장 */
export async function captureCamera(input: CameraCaptureInput, timeoutMs = 15000): Promise<CameraCaptureResult> {
  let robot_tcp: number[] | null = null;
  let robot_joints: number[] | null = null;
  try {
    const st = await getRealtimeRobotStatus();
    robot_tcp = st?.tcp ?? null;
    robot_joints = st?.joints ?? null;
  } catch {
    // 로봇 위치를 못 읽어도 촬영은 진행
  }
  try {
    const result = await fetchJson<CameraCaptureResult>(
      '/camera/capture',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...input, robot_tcp, robot_joints }),
      },
      timeoutMs,
    );
    if (result.ok) {
      log.info('camera.capture.ok', `${input.trigger} 촬영 id=${result.id}`, { depth_valid_ratio: result.capture?.depth_valid_ratio });
    } else {
      log.warn('camera.capture.fail', `${input.trigger} 촬영 실패: ${result.error}`);
    }
    return result;
  } catch (e) {
    const msg = e instanceof Error && e.name === 'AbortError' ? '응답 시간 초과' : e instanceof Error ? e.message : String(e);
    log.warn('camera.capture.fail', `${input.trigger} 촬영 실패: ${msg}`);
    return { ok: false, error: msg };
  }
}

// [v1.1.289] 촬영 기록 USB 내보내기 (펜던트 전용, robot_camera 가 처리)
export interface CameraExportStatus {
  ok: boolean;
  supported: boolean;
  running: boolean;
  phase: 'idle' | 'start' | 'mount' | 'copy' | 'verify' | 'delete' | 'unmount' | 'done' | 'error';
  message: string;
  error: string;
  usb_device?: string;
  pending_files?: number;
  pending_bytes?: number;
  total_files: number;
  done_files: number;
  total_bytes: number;
  done_bytes: number;
  deleted_files: number;
  dest: string;
}

/** 내보내기 상태. scan=true 면 내보낼 파일 수·용량도 계산. 프로그램이 없으면 null */
export async function getCameraExportStatus(scan = false, timeoutMs = 3000): Promise<CameraExportStatus | null> {
  try {
    return await fetchJson<CameraExportStatus>(`/camera/export/status${scan ? '?scan=1' : ''}`, { method: 'GET' }, timeoutMs);
  } catch {
    return null;
  }
}

export async function startCameraExport(): Promise<{ ok: boolean; error?: string }> {
  try {
    return await fetchJson<{ ok: boolean; error?: string }>('/camera/export/start', { method: 'POST' }, 5000);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 용접 시작 직전 자동 촬영. 카메라가 연결돼 있을 때만, 실패해도 용접은 그대로 진행 */
export async function autoCaptureBeforeWeld(input: Omit<CameraCaptureInput, 'trigger'>): Promise<void> {
  const st = await getCameraStatus();
  if (!st || !st.connected) return;
  if (st.busy) {
    log.warn('camera.auto.skip', '카메라 촬영 중이라 자동 촬영 건너뜀');
    return;
  }
  await captureCamera({ ...input, trigger: 'auto' });
}
