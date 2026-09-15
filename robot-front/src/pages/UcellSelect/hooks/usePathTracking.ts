import { getRealtimeRobotStatus } from '../../../lib';
import { createLogger } from '../../../lib';
import { useCallback, useEffect, useRef, useState } from 'react';

const log_usePathTracking = createLogger('usePathTracking');
const POLL_INTERVAL_MS = 120;
const MIN_DISTANCE_THRESHOLD = 0.5;
const MAX_PATH_POINTS = 1000;
export interface PathPoint {
  x: number;
  y: number;
  z: number;
  isWelding: boolean;
  timestamp: number;
}
export interface CurrentPosition {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
  isWelding: boolean;
}
export interface UsePathTrackingReturn {
  pathHistory: PathPoint[];
  currentPosition: CurrentPosition | null;
  isTracking: boolean;
  startTracking: (isWelding?: boolean) => void;
  stopTracking: () => void;
  clearPath: () => void;
  fetchCurrentPosition: () => Promise<CurrentPosition | null>;
}
const calculateDistance = (
  p1: { x: number; y: number; z: number },
  p2: { x: number; y: number; z: number }
): number => {
  return Math.sqrt(
    Math.pow(p2.x - p1.x, 2) +
    Math.pow(p2.y - p1.y, 2) +
    Math.pow(p2.z - p1.z, 2)
  );
};
export function usePathTracking(): UsePathTrackingReturn {
  const [pathHistory, setPathHistory] = useState<PathPoint[]>([]);
  const [currentPosition, setCurrentPosition] = useState<CurrentPosition | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isWeldingRef = useRef(false);
  const lastPositionRef = useRef<PathPoint | null>(null);
  const fetchCurrentPosition = useCallback(async (): Promise<CurrentPosition | null> => {
    try {
      const status = await getRealtimeRobotStatus();
      if (!status?.tcp || status.tcp.length < 6) {
        return null;
      }
      const position: CurrentPosition = {
        x: status.tcp[0],
        y: status.tcp[1],
        z: status.tcp[2],
        rx: status.tcp[3],
        ry: status.tcp[4],
        rz: status.tcp[5],
        isWelding: isWeldingRef.current,
      };
      setCurrentPosition(position);
      return position;
    } catch (error) {
      log_usePathTracking.error('fetchCurrentPosition.error', '위치 조회 실패', { error: String(error) });
      return null;
    }
  }, []);
  const pollFailCountRef = useRef(0);
  const pollPosition = useCallback(async () => {
    try {
      const status = await getRealtimeRobotStatus();
      if (!status?.tcp || status.tcp.length < 3) {
        pollFailCountRef.current++;
        if (pollFailCountRef.current % 10 === 0) {
          log_usePathTracking.warn('pollPosition.noTcp', `TCP 데이터 없음 (연속 ${pollFailCountRef.current}회)`);
        }
        return;
      }
      pollFailCountRef.current = 0;
      const now = Date.now();
      const newPoint: PathPoint = {
        x: status.tcp[0],
        y: status.tcp[1],
        z: status.tcp[2],
        isWelding: isWeldingRef.current,
        timestamp: now,
      };
      setCurrentPosition({
        x: status.tcp[0],
        y: status.tcp[1],
        z: status.tcp[2],
        rx: status.tcp[3] || 0,
        ry: status.tcp[4] || 0,
        rz: status.tcp[5] || 0,
        isWelding: isWeldingRef.current,
      });
      const lastPos = lastPositionRef.current;
      if (!lastPos || calculateDistance(lastPos, newPoint) >= MIN_DISTANCE_THRESHOLD) {
        setPathHistory(prev => {
          const updated = [...prev, newPoint];
          if (updated.length > MAX_PATH_POINTS) {
            return updated.slice(-MAX_PATH_POINTS);
          }
          return updated;
        });
        lastPositionRef.current = newPoint;
      }
    } catch (error) {
      pollFailCountRef.current++;
      if (pollFailCountRef.current % 10 === 0) {
        log_usePathTracking.warn('pollPosition.error', `폴링 오류 (연속 ${pollFailCountRef.current}회)`, { error: String(error) });
      }
    }
  }, []);
  const startTracking = useCallback((isWelding = false) => {
    if (pollingIntervalRef.current) {
      log_usePathTracking.warn('startTracking.alreadyRunning', '이미 추적 중');
      return;
    }
    log_usePathTracking.info('startTracking', '경로 추적 시작', { isWelding, pollInterval: POLL_INTERVAL_MS });
    isWeldingRef.current = isWelding;
    setIsTracking(true);
    pollPosition();
    pollingIntervalRef.current = setInterval(pollPosition, POLL_INTERVAL_MS);
  }, [pollPosition]);
  const stopTracking = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    isWeldingRef.current = false;
    setIsTracking(false);
    log_usePathTracking.info('stopTracking', '경로 추적 중지', { pathPoints: pathHistory.length });
  }, [pathHistory.length]);
  const clearPath = useCallback(() => {
    setPathHistory([]);
    lastPositionRef.current = null;
    log_usePathTracking.info('clearPath', '경로 히스토리 초기화');
  }, []);
  // 화면 이동/언마운트 시 폴링 인터벌이 남아 계속 도는 것을 막는다 (v1.1.135).
  // 기존에는 stop 함수를 명시적으로 부르지 않으면 인터벌이 영영 살아있었다.
  useEffect(() => () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  }, []);
  return {
    pathHistory,
    currentPosition,
    isTracking,
    startTracking,
    stopTracking,
    clearPath,
    fetchCurrentPosition,
  };
}
