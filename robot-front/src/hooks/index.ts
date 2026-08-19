import { useState, useEffect, useCallback, useRef } from 'react';
import { getApiBaseUrl, Axios as api } from '../lib';
import { createLogger } from '../lib';
import { UpdateStatus, ReleaseInfo, checkLatestRelease, fetchExpectedSha256 } from '../lib/updater';
import { APP_VERSION } from '../lib';
const log = createLogger('networkStatus');
export interface NetworkStatus {
  isOnline: boolean;
  isServerReachable: boolean;
  lastServerResponse: Date | null;
  disconnectedDurationSec: number;
}
interface UseNetworkStatusOptions {
  heartbeatInterval?: number;
  heartbeatTimeout?: number;
  enabled?: boolean;
}
export function useNetworkStatus(
  options: UseNetworkStatusOptions = {},
): NetworkStatus {
  const {
    heartbeatInterval = 10000,
    heartbeatTimeout = 3000,
    enabled = true,
  } = options;
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isServerReachable, setIsServerReachable] = useState(true);
  const [lastServerResponse, setLastServerResponse] = useState<Date | null>(null);
  const [disconnectedDurationSec, setDisconnectedDurationSec] = useState(0);
  const disconnectedSinceRef = useRef<Date | null>(null);
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      log.info('network.online', '네트워크 연결 복구');
    };
    const handleOffline = () => {
      setIsOnline(false);
      log.warn('network.offline', '네트워크 연결 끊김');
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
  const checkServer = useCallback(async () => {
    if (!isOnline || !enabled) return;
    try {
      await api.get('/system/version', {
        timeout: heartbeatTimeout,
        meta: { skipErrorLog: true },
      } as any);
      const now = new Date();
      setIsServerReachable(true);
      setLastServerResponse(now);
      if (disconnectedSinceRef.current) {
        const downtime = (now.getTime() - disconnectedSinceRef.current.getTime()) / 1000;
        log.info('server.recovered', `서버 연결 복구 (${downtime.toFixed(1)}초 중단)`);
        disconnectedSinceRef.current = null;
        setDisconnectedDurationSec(0);
      }
    } catch {
      if (!disconnectedSinceRef.current) {
        disconnectedSinceRef.current = new Date();
        log.warn('server.unreachable', '서버 연결 불가');
      }
      setIsServerReachable(false);
    }
  }, [isOnline, enabled, heartbeatTimeout]);
  useEffect(() => {
    if (!enabled) return;
    checkServer();
    const interval = setInterval(checkServer, heartbeatInterval);
    return () => clearInterval(interval);
  }, [checkServer, heartbeatInterval, enabled]);
  useEffect(() => {
    if (isServerReachable) return;
    const timer = setInterval(() => {
      if (disconnectedSinceRef.current) {
        const sec = (Date.now() - disconnectedSinceRef.current.getTime()) / 1000;
        setDisconnectedDurationSec(Math.floor(sec));
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [isServerReachable]);
  return {
    isOnline,
    isServerReachable,
    lastServerResponse,
    disconnectedDurationSec,
  };
}
export interface RobotState {
  joint_position: number[];
  tcp_position: number[];
  velocity: number;
  is_moving: boolean;
  is_welding: boolean;
  timestamp: number;
}
export interface UseRobotWebSocketOptions {
  url?: string;
  autoReconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  autoConnect?: boolean;
}
export interface UseRobotWebSocketReturn {
  robotState: RobotState | null;
  isConnected: boolean;
  error: string | null;
  connect: () => void;
  disconnect: () => void;
  pathHistory: { x: number; y: number; z: number; isWelding: boolean; timestamp: number }[];
  clearPathHistory: () => void;
}
const getDefaultWsUrl = () => {
  const baseUrl = getApiBaseUrl();
  return baseUrl.replace(/^http/, 'ws') + '/ws/state';
};
const DEFAULT_WS_URL = getDefaultWsUrl();
const MAX_PATH_HISTORY = 500;
export function useRobotWebSocket(options: UseRobotWebSocketOptions = {}): UseRobotWebSocketReturn {
  const {
    url = DEFAULT_WS_URL,
    autoReconnect = true,
    reconnectInterval = 3000,
    maxReconnectAttempts = 5,
    autoConnect = false,
  } = options;
  const [robotState, setRobotState] = useState<RobotState | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pathHistory, setPathHistory] = useState<
    { x: number; y: number; z: number; isWelding: boolean; timestamp: number }[]
  >([]);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearPathHistory = useCallback(() => {
    setPathHistory([]);
  }, []);
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }
    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;
      ws.onopen = () => {
        console.log('[WebSocket] 연결됨');
        setIsConnected(true);
        setError(null);
        reconnectAttemptsRef.current = 0;
      };
      ws.onmessage = (event) => {
        try {
          const data: RobotState = JSON.parse(event.data);
          setRobotState(data);
          if (data.tcp_position && data.tcp_position.length >= 3) {
            setPathHistory((prev) => {
              const newPoint = {
                x: data.tcp_position[0],
                y: data.tcp_position[1],
                z: data.tcp_position[2],
                isWelding: data.is_welding || false,
                timestamp: data.timestamp || Date.now(),
              };
              if (prev.length > 0) {
                const last = prev[prev.length - 1];
                const distance = Math.sqrt(
                  Math.pow(newPoint.x - last.x, 2) +
                  Math.pow(newPoint.y - last.y, 2) +
                  Math.pow(newPoint.z - last.z, 2)
                );
                if (distance < 0.5) {
                  return prev;
                }
              }
              const updated = [...prev, newPoint];
              if (updated.length > MAX_PATH_HISTORY) {
                return updated.slice(-MAX_PATH_HISTORY);
              }
              return updated;
            });
          }
        } catch (e) {
          console.error('[WebSocket] 메시지 파싱 오류:', e);
        }
      };
      ws.onerror = (event) => {
        console.error('[WebSocket] 에러:', event);
        setError('WebSocket 연결 오류');
      };
      ws.onclose = (event) => {
        console.log('[WebSocket] 연결 종료:', event.code, event.reason);
        setIsConnected(false);
        wsRef.current = null;
        if (autoReconnect) {
          reconnectAttemptsRef.current++;
          const baseDelay = reconnectInterval;
          const maxDelay = 30000;
          const exponentialDelay = baseDelay * Math.pow(2, reconnectAttemptsRef.current - 1);
          const jitter = Math.random() * baseDelay * 0.3;
          const delay = Math.min(exponentialDelay + jitter, maxDelay);
          console.log(
            `[WebSocket] 재연결 시도 ${reconnectAttemptsRef.current} (${(delay / 1000).toFixed(1)}초 후)...`
          );
          setError(`서버 재연결 시도 중... (${reconnectAttemptsRef.current}회)`);
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        }
      };
    } catch (e) {
      console.error('[WebSocket] 연결 실패:', e);
      setError('WebSocket 연결 실패');
    }
  }, [url, autoReconnect, reconnectInterval, maxReconnectAttempts]);
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
    reconnectAttemptsRef.current = maxReconnectAttempts;
  }, [maxReconnectAttempts]);
  useEffect(() => {
    if (autoConnect) {
      connect();
    }
    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);
  return {
    robotState,
    isConnected,
    error,
    connect,
    disconnect,
    pathHistory,
    clearPathHistory,
  };
}
const log_useUpdater = createLogger('useUpdater');
const CURRENT_VERSION = APP_VERSION;
const POLL_INTERVAL_MS = 12 * 60 * 60 * 1000;
export interface UseUpdaterOptions {
  disableAutoCheck?: boolean;
}
export interface UseUpdaterReturn {
  status: UpdateStatus;
  currentVersion: string;
  checkNow: () => Promise<void>;
  startUpdate: (release: ReleaseInfo) => Promise<void>;
  dismiss: () => void;
}
export function useUpdater(options?: UseUpdaterOptions): UseUpdaterReturn {
  const [status, setStatus] = useState<UpdateStatus>({ kind: 'up_to_date' });
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dismissedVersionsRef = useRef<Set<string>>(new Set());
  const checkNow = useCallback(async () => {
    setStatus({ kind: 'checking' });
    try {
      const release = await checkLatestRelease(CURRENT_VERSION);
      if (!release) {
        setStatus({ kind: 'up_to_date' });
        log_useUpdater.info('check.noUpdate', `최신 버전 (${CURRENT_VERSION})`);
        return;
      }
      log_useUpdater.info('check.available', `새 버전 발견: ${release.version}`);
      setStatus({ kind: 'available', release });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log_useUpdater.error('check.error', '업데이트 확인 실패', { error: msg });
      setStatus({ kind: 'error', message: msg });
    }
  }, []);
  const startUpdate = useCallback(async (release: ReleaseInfo) => {
    log_useUpdater.info('download.start', `다운로드 시작: v${release.version}`);
    setStatus({
      kind: 'downloading',
      release,
      progress: { downloaded: 0, total: 0, speedBps: 0 },
    });
    try {
      let expectedSha = '';
      if (release.sha256Url) {
        try {
          expectedSha = await fetchExpectedSha256(release.sha256Url);
        } catch (e) {
          log_useUpdater.warn('sha.fetchFailed', 'SHA 파일 가져오기 실패 — 검증 스킵', { error: String(e) });
        }
      }
      const filename = release.downloadUrl.split('/').pop() ?? 'installer.exe';
      await api.post('/updater/download', {
        url: release.downloadUrl,
        filename,
        expected_sha256: expectedSha,
      });
      const started = Date.now();
      let downloadedPath = '';
      // eslint-disable-next-line no-constant-condition
      for (;;) {
        await new Promise(r => setTimeout(r, 300));
        const res = await api.get<{
          state: string;
          downloaded: number;
          total: number;
          path: string;
          error: string;
        }>('/updater/download/progress');
        const data = res.data;
        const elapsed = Math.max(0.001, (Date.now() - started) / 1000);
        setStatus({
          kind: 'downloading',
          release,
          progress: {
            downloaded: data.downloaded,
            total: data.total || data.downloaded,
            speedBps: Math.floor(data.downloaded / elapsed),
          },
        });
        if (data.state === 'done') {
          downloadedPath = data.path;
          break;
        }
        if (data.state === 'error') {
          setStatus({ kind: 'error', message: data.error || '다운로드 실패' });
          return;
        }
      }
      setStatus({ kind: 'downloaded', release, path: downloadedPath });
      setStatus({ kind: 'installing', release });
      await api.post('/updater/launch', { path: downloadedPath });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log_useUpdater.error('update.error', '업데이트 실패', { error: msg });
      setStatus({ kind: 'error', message: msg });
    }
  }, []);
  const dismiss = useCallback(() => {
    if (status.kind === 'available') {
      dismissedVersionsRef.current.add(status.release.version);
    }
    setStatus({ kind: 'up_to_date' });
  }, [status]);
  useEffect(() => {
    if (options?.disableAutoCheck) return;
    const initialTimer = setTimeout(() => {
      checkNow();
    }, 5000);
    timerRef.current = setInterval(() => {
      if (status.kind === 'up_to_date' || status.kind === 'error') {
        checkNow();
      }
    }, POLL_INTERVAL_MS);
    return () => {
      clearTimeout(initialTimer);
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options?.disableAutoCheck]);
  return {
    status,
    currentVersion: CURRENT_VERSION,
    checkNow,
    startUpdate,
    dismiss,
  };
}
export interface WeldingPoint {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
  jointPositions: number[];
  isWelding: boolean;
  timestamp: number;
}
export interface WeldingSession {
  id: string;
  cellType: 'normal' | 'collar_plate';
  cellId: number;
  cellName: string;
  height: number;
  width: number;
  startTime: number;
  endTime?: number;
  status: 'running' | 'paused' | 'stopped' | 'completed';
  totalPoints: number;
  completedPoints: number;
  currentPointIndex: number;
  waypoints: WeldingPoint[];
  pausedAt?: WeldingPoint;
}
export interface UseWeldingSessionOptions {
  autoSave?: boolean;
  saveInterval?: number;
}
export interface UseWeldingSessionReturn {
  session: WeldingSession | null;
  hasResumableSession: boolean;
  resumableSession: WeldingSession | null;
  startSession: (config: {
    cellType: 'normal' | 'collar_plate';
    cellId: number;
    cellName: string;
    height: number;
    width: number;
    waypoints: WeldingPoint[];
  }) => void;
  pauseSession: (currentPosition: WeldingPoint) => void;
  resumeSession: () => WeldingSession | null;
  stopSession: () => void;
  completeSession: () => void;
  updateProgress: (pointIndex: number, position: WeldingPoint) => void;
  clearSavedSession: () => void;
  getResumePoint: () => WeldingPoint | null;
  getRemainingWaypoints: () => WeldingPoint[];
}
const STORAGE_KEY = 'welding_session';
const STORAGE_HISTORY_KEY = 'welding_session_history';
function generateSessionId(): string {
  return `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
export function useWeldingSession(
  options: UseWeldingSessionOptions = {}
): UseWeldingSessionReturn {
  const { autoSave = true, saveInterval = 1000 } = options;
  const [session, setSession] = useState<WeldingSession | null>(null);
  const [resumableSession, setResumableSession] = useState<WeldingSession | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed: WeldingSession = JSON.parse(saved);
        if (parsed.status === 'paused' || parsed.status === 'stopped') {
          setResumableSession(parsed);
        }
      }
    } catch (e) {
      console.error('[WeldingSession] 저장된 세션 로드 실패:', e);
    }
  }, []);
  const saveSession = useCallback((sessionData: WeldingSession) => {
    if (!autoSave) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessionData));
    } catch (e) {
      console.error('[WeldingSession] 세션 저장 실패:', e);
    }
  }, [autoSave]);
  const addToHistory = useCallback((sessionData: WeldingSession) => {
    try {
      const historyStr = localStorage.getItem(STORAGE_HISTORY_KEY);
      const history: WeldingSession[] = historyStr ? JSON.parse(historyStr) : [];
      history.unshift(sessionData);
      if (history.length > 10) {
        history.pop();
      }
      localStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(history));
    } catch (e) {
      console.error('[WeldingSession] 히스토리 저장 실패:', e);
    }
  }, []);
  const startSession = useCallback((config: {
    cellType: 'normal' | 'collar_plate';
    cellId: number;
    cellName: string;
    height: number;
    width: number;
    waypoints: WeldingPoint[];
  }) => {
    const newSession: WeldingSession = {
      id: generateSessionId(),
      cellType: config.cellType,
      cellId: config.cellId,
      cellName: config.cellName,
      height: config.height,
      width: config.width,
      startTime: Date.now(),
      status: 'running',
      totalPoints: config.waypoints.length,
      completedPoints: 0,
      currentPointIndex: 0,
      waypoints: config.waypoints,
    };
    setSession(newSession);
    setResumableSession(null);
    saveSession(newSession);
    console.log('[WeldingSession] 새 세션 시작:', newSession.id);
  }, [saveSession]);
  const pauseSession = useCallback((currentPosition: WeldingPoint) => {
    setSession(prev => {
      if (!prev) return null;
      const updated: WeldingSession = {
        ...prev,
        status: 'paused',
        pausedAt: currentPosition,
      };
      saveSession(updated);
      setResumableSession(updated);
      console.log('[WeldingSession] 세션 일시정지:', {
        id: updated.id,
        completedPoints: updated.completedPoints,
        totalPoints: updated.totalPoints,
        pausedAt: currentPosition,
      });
      return updated;
    });
  }, [saveSession]);
  const resumeSession = useCallback((): WeldingSession | null => {
    const sessionToResume = resumableSession;
    if (!sessionToResume) {
      console.warn('[WeldingSession] 재개할 세션이 없습니다');
      return null;
    }
    const resumed: WeldingSession = {
      ...sessionToResume,
      status: 'running',
    };
    setSession(resumed);
    setResumableSession(null);
    saveSession(resumed);
    console.log('[WeldingSession] 세션 재개:', {
      id: resumed.id,
      resumeFrom: resumed.currentPointIndex,
      pausedAt: resumed.pausedAt,
    });
    return resumed;
  }, [resumableSession, saveSession]);
  const stopSession = useCallback(() => {
    setSession(prev => {
      if (!prev) return null;
      const updated: WeldingSession = {
        ...prev,
        status: 'stopped',
        endTime: Date.now(),
      };
      saveSession(updated);
      setResumableSession(updated);
      addToHistory(updated);
      console.log('[WeldingSession] 세션 중단:', updated.id);
      return null;
    });
  }, [saveSession, addToHistory]);
  const completeSession = useCallback(() => {
    setSession(prev => {
      if (!prev) return null;
      const completed: WeldingSession = {
        ...prev,
        status: 'completed',
        endTime: Date.now(),
        completedPoints: prev.totalPoints,
      };
      addToHistory(completed);
      localStorage.removeItem(STORAGE_KEY);
      console.log('[WeldingSession] 세션 완료:', completed.id);
      return null;
    });
    setResumableSession(null);
  }, [addToHistory]);
  const updateProgress = useCallback((pointIndex: number, position: WeldingPoint) => {
    setSession(prev => {
      if (!prev || prev.status !== 'running') return prev;
      const updated: WeldingSession = {
        ...prev,
        currentPointIndex: pointIndex,
        completedPoints: pointIndex,
        pausedAt: position,
      };
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(() => {
        saveSession(updated);
      }, saveInterval);
      return updated;
    });
  }, [saveSession, saveInterval]);
  const clearSavedSession = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setResumableSession(null);
    console.log('[WeldingSession] 저장된 세션 삭제');
  }, []);
  const getResumePoint = useCallback((): WeldingPoint | null => {
    if (resumableSession?.pausedAt) {
      return resumableSession.pausedAt;
    }
    return null;
  }, [resumableSession]);
  const getRemainingWaypoints = useCallback((): WeldingPoint[] => {
    if (!resumableSession) return [];
    const startIndex = resumableSession.currentPointIndex;
    return resumableSession.waypoints.slice(startIndex);
  }, [resumableSession]);
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);
  return {
    session,
    hasResumableSession: resumableSession !== null,
    resumableSession,
    startSession,
    pauseSession,
    resumeSession,
    stopSession,
    completeSession,
    updateProgress,
    clearSavedSession,
    getResumePoint,
    getRemainingWaypoints,
  };
}
