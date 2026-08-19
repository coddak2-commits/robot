import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { getApiBaseUrl } from '../../../lib';
import type { RobotStatus, RobotStatusInfo, MoveResult } from '../components';
const MAX_DISCONNECT_COUNT = 5;
export function useRobotTestControl() {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [robotIp, setRobotIp] = useState('192.168.58.2');
  const [joints, setJoints] = useState<number[]>([0, 0, 0, 0, 0, 0]);
  const [tcp, setTcp] = useState<number[]>([0, 0, 0, 0, 0, 0]);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, setLastUpdate] = useState<Date | null>(null);
  const [jogMode, setJogMode] = useState<'joint' | 'cartesian' | 'tcp'>('joint');
  const [jogSpeed, setJogSpeed] = useState(20);
  const [activeJog, setActiveJog] = useState<{ axis: number; direction: number } | null>(null);
  const jogStopRef = useRef<boolean>(false);
  const disconnectCountRef = useRef<number>(0);
  const [targetJoints, setTargetJoints] = useState<number[]>([0, 0, 0, 0, 0, 0]);
  const [isMoving, setIsMoving] = useState(false);
  const [moveResult, setMoveResult] = useState<MoveResult | null>(null);
  const [robotStatus, setRobotStatus] = useState<RobotStatusInfo>({});
  const [isServoLoading, setIsServoLoading] = useState(false);
  const [isDancing, setIsDancing] = useState(false);
  const [danceStep, setDanceStep] = useState(0);
  const danceStopRef = useRef<boolean>(false);
  const API_BASE = useMemo(() => `${getApiBaseUrl()}/robot_sdk`, []);
  const connectRobot = useCallback(async () => {
    setIsConnecting(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: robotIp })
      });
      const data = await response.json();
      if (data.success || data.data?.success) {
        try {
          await fetch(`${API_BASE}/robot/enable`, { method: 'POST' });
          await fetch(`${API_BASE}/robot/mode?mode=0`, { method: 'POST' });
        } catch (enableErr) {
          console.warn('서보 활성화/모드 전환 실패:', enableErr);
        }
        setIsConnected(true);
        setIsPolling(true);
        disconnectCountRef.current = 0;
      } else {
        setError(data.message || data.data?.message || '연결 실패');
      }
    } catch {
      setError('서버 연결 오류: 백엔드가 실행 중인지 확인하세요');
    } finally {
      setIsConnecting(false);
    }
  }, [API_BASE, robotIp]);
  const disconnectRobot = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/disconnect`, { method: 'POST' });
      setIsConnected(false);
      setIsPolling(false);
      setJoints([0, 0, 0, 0, 0, 0]);
      setTcp([0, 0, 0, 0, 0, 0]);
    } catch {
      setError('연결 해제 오류');
    }
  }, [API_BASE]);
  const startJog = useCallback(async (axis: number, direction: number) => {
    console.log('[startJog] called:', { axis, direction, isConnected, jogMode });
    if (!isConnected) return;
    jogStopRef.current = false;
    setActiveJog({ axis, direction });
    try {
      const ref = jogMode === 'joint' ? 0 : (jogMode === 'cartesian' ? 2 : 4);
      await fetch(`${API_BASE}/jog/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ref, nb: axis, dir: direction,
          vel: jogSpeed, acc: 100, max_dis: 360
        })
      });
    } catch (e) {
      console.error('조그 시작 오류:', e);
    }
  }, [API_BASE, isConnected, jogMode, jogSpeed]);
  const stopJog = useCallback(async () => {
    if (jogStopRef.current) return;
    jogStopRef.current = true;
    setActiveJog(null);
    try {
      const ref = jogMode === 'joint' ? 1 : (jogMode === 'cartesian' ? 3 : 5);
      await fetch(`${API_BASE}/jog/stop?ref=${ref}`, { method: 'POST' });
    } catch (e) {
      console.error('조그 정지 오류:', e);
    }
  }, [API_BASE, jogMode]);
  const emergencyStop = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/jog/stop_immediate`, { method: 'POST' });
      setActiveJog(null);
    } catch (e) {
      console.error('비상 정지 오류:', e);
    }
  }, [API_BASE]);
  const enableServo = useCallback(async () => {
    if (isServoLoading) return;
    setIsServoLoading(true);
    try {
      await fetch(`${API_BASE}/robot/mode?mode=0`, { method: 'POST' });
      const response = await fetch(`${API_BASE}/robot/enable`, { method: 'POST' });
      const data = await response.json();
      if (data.status_code !== 200) {
        console.error('서보 활성화 실패:', data.message);
      }
    } catch (e) {
      console.error('서보 활성화 오류:', e);
    } finally {
      setIsServoLoading(false);
    }
  }, [API_BASE, isServoLoading]);
  const disableServo = useCallback(async () => {
    if (isServoLoading) return;
    setIsServoLoading(true);
    try {
      const response = await fetch(`${API_BASE}/robot/disable`, { method: 'POST' });
      const data = await response.json();
      if (data.status_code !== 200) {
        console.error('서보 비활성화 실패:', data.message);
      }
    } catch (e) {
      console.error('서보 비활성화 오류:', e);
    } finally {
      setIsServoLoading(false);
    }
  }, [API_BASE, isServoLoading]);
  const moveToTarget = useCallback(async () => {
    if (!isConnected || isMoving) return;
    setIsMoving(true);
    setMoveResult(null);
    try {
      const response = await fetch(`${API_BASE}/move/joint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          joint_pos: {
            j1: targetJoints[0], j2: targetJoints[1], j3: targetJoints[2],
            j4: targetJoints[3], j5: targetJoints[4], j6: targetJoints[5],
          },
          vel: jogSpeed,
        }),
      });
      const data = await response.json();
      if (data.status_code === 200 && data.data?.result === 0) {
        setMoveResult({ success: true, message: '이동 명령 전송 완료' });
      } else {
        setMoveResult({ success: false, message: data.message || '이동 실패' });
      }
    } catch {
      setMoveResult({ success: false, message: '이동 명령 오류' });
    } finally {
      setIsMoving(false);
    }
  }, [API_BASE, isConnected, isMoving, jogSpeed, targetJoints]);
  const copyCurrentToTarget = useCallback(() => {
    setTargetJoints([...joints]);
    setMoveResult(null);
  }, [joints]);
  const updateTargetJoint = useCallback((index: number, value: string) => {
    const numValue = parseFloat(value) || 0;
    setTargetJoints(prev => {
      const newTargets = [...prev];
      newTargets[index] = numValue;
      return newTargets;
    });
    setMoveResult(null);
  }, []);
  const addToAllJoints = useCallback((delta: number) => {
    setTargetJoints(prev => prev.map(v => v + delta));
    setMoveResult(null);
  }, []);
  const danceSequence = useMemo(() => [
    { name: '준비', joints: [0, -20, 0, 0, 0, 0] },
    { name: '오른쪽', joints: [30, -10, 10, 0, 20, 0] },
    { name: '왼쪽', joints: [-30, -10, 10, 0, -20, 0] },
    { name: '위로', joints: [0, -40, -20, 0, 0, 30] },
    { name: '아래로', joints: [0, 10, 30, 0, 0, -30] },
    { name: '회전1', joints: [45, -20, 0, 30, 0, 45] },
    { name: '회전2', joints: [-45, -20, 0, -30, 0, -45] },
    { name: '마무리', joints: [0, 0, 0, 0, 0, 0] },
  ], []);
  const executeMoveJ = useCallback(async (jointPos: number[]): Promise<boolean> => {
    try {
      const response = await fetch(`${API_BASE}/move/joint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          joint_pos: {
            j1: jointPos[0], j2: jointPos[1], j3: jointPos[2],
            j4: jointPos[3], j5: jointPos[4], j6: jointPos[5],
          },
          vel: jogSpeed,
        }),
      });
      const data = await response.json();
      return data.status_code === 200 && data.data?.result === 0;
    } catch {
      return false;
    }
  }, [API_BASE, jogSpeed]);
  const startDance = useCallback(async () => {
    if (!isConnected || isDancing) return;
    const basePosition = [...joints];
    setIsDancing(true);
    danceStopRef.current = false;
    setDanceStep(0);
    for (let i = 0; i < danceSequence.length; i++) {
      if (danceStopRef.current) break;
      setDanceStep(i + 1);
      const step = danceSequence[i];
      const targetPos = basePosition.map((base, idx) => base + step.joints[idx]);
      await executeMoveJ(targetPos);
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
    if (!danceStopRef.current) {
      setDanceStep(danceSequence.length + 1);
      await executeMoveJ(basePosition);
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
    setIsDancing(false);
    setDanceStep(0);
  }, [isConnected, isDancing, joints, danceSequence, executeMoveJ]);
  const stopDance = useCallback(async () => {
    danceStopRef.current = true;
    await emergencyStop();
    setIsDancing(false);
    setDanceStep(0);
  }, [emergencyStop]);
  const fetchRobotStatus = useCallback(async () => {
    if (!isPolling) return;
    try {
      const response = await fetch(`${API_BASE}/realtime`);
      const data: RobotStatus = await response.json();
      if (data.connected) {
        disconnectCountRef.current = 0;
        setIsConnected(true);
        if (data.joints) setJoints(data.joints);
        if (data.tcp) setTcp(data.tcp);
        setLastUpdate(new Date());
        setError(null);
        setRobotStatus({
          error_code: data.error_code,
          error_message: data.error_message,
          servo_enabled: data.servo_enabled,
          warning: data.warning,
        });
      } else {
        disconnectCountRef.current++;
        console.warn(`연결 실패 ${disconnectCountRef.current}/${MAX_DISCONNECT_COUNT}`, data.error || data.reason);
        setRobotStatus({ error_message: data.reason || data.error });
        if (disconnectCountRef.current >= MAX_DISCONNECT_COUNT) {
          setIsConnected(false);
          setIsPolling(false);
          if (data.error) setError(data.error);
        }
      }
    } catch {
      disconnectCountRef.current++;
      if (disconnectCountRef.current >= MAX_DISCONNECT_COUNT) {
        setIsConnected(false);
        setIsPolling(false);
        setError('네트워크 연결 오류');
      }
    }
  }, [isPolling, API_BASE]);
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (isPolling) {
      fetchRobotStatus();
      interval = setInterval(fetchRobotStatus, 200);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [isPolling, fetchRobotStatus]);
  useEffect(() => {
    console.log('[RobotTest] 페이지 진입, 폴링 시작 (연결은 Header에서 담당)');
    setIsPolling(true);
    disconnectCountRef.current = 0;
  }, []);
  return {
    isConnected, isConnecting, robotIp, setRobotIp,
    error, robotStatus,
    connectRobot, disconnectRobot,
    jogMode, setJogMode, jogSpeed, setJogSpeed,
    activeJog, startJog, stopJog, emergencyStop,
    isServoLoading, enableServo, disableServo,
    joints, tcp,
    targetJoints, setTargetJoints, isMoving, moveResult,
    moveToTarget, copyCurrentToTarget, updateTargetJoint, addToAllJoints,
    isDancing, danceStep, danceSequence, startDance, stopDance,
  };
}
