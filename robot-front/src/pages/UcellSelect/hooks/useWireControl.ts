import { forwardWireFeed, reverseWireFeed, stopForwardWireFeed, stopReverseWireFeed } from '../../../lib';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAlert } from '../../../contexts';

// 실제 속도 1.75mm/s로 1mm가 나오도록 계산한 값 (wire-inching.tsx와 동일 기준)
const WIRE_FEED_SPEED_MM_PER_SEC = 1.75;
const WIRE_TARGET_MM = 0.2; // v1.1.128: 용접 중 사용 시 전류 AO가 높아 실제 송급 속도가 더 빠를 수 있어 우선 축소 (테스트용)
const WIRE_FORWARD_DURATION_MS = Math.round((WIRE_TARGET_MM / WIRE_FEED_SPEED_MM_PER_SEC) * 1000);
const WIRE_REVERSE_DURATION_MS = Math.round((WIRE_TARGET_MM / WIRE_FEED_SPEED_MM_PER_SEC) * 1000);
// 정지 명령이 실패하면 와이어가 계속 송급되므로 반드시 재시도한다 (v1.1.132).
const WIRE_STOP_RETRY_COUNT = 3;
const WIRE_STOP_RETRY_DELAY_MS = 150;
export interface UseWireControlReturn {
  wireContinuous: boolean;
  setWireContinuous: (v: boolean) => void;
  wireFeeding: 'in' | 'out' | null;
  handleWireIn: () => Promise<void>;
  handleWireOut: () => Promise<void>;
  handleWireStop: () => Promise<void>;
}
export function useWireControl(): UseWireControlReturn {
  const { show: showAlert } = useAlert();
  const [wireContinuous, setWireContinuous] = useState(false);
  const [wireFeeding, setWireFeeding] = useState<'in' | 'out' | null>(null);
  // setState는 비동기라 정지 경로에서 즉시 읽을 수 없다. 방향은 ref로 따로 들고 간다.
  const feedingRef = useRef<'in' | 'out' | null>(null);
  const pulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearPulseTimer = useCallback(() => {
    if (pulseTimerRef.current !== null) {
      clearTimeout(pulseTimerRef.current);
      pulseTimerRef.current = null;
    }
  }, []);
  const stopFeed = useCallback(async (dir: 'in' | 'out'): Promise<boolean> => {
    const stop = dir === 'in' ? stopReverseWireFeed : stopForwardWireFeed;
    for (let attempt = 1; attempt <= WIRE_STOP_RETRY_COUNT; attempt++) {
      try {
        await stop(0);
        return true;
      } catch (error) {
        console.error(`와이어 정지 실패 (${attempt}/${WIRE_STOP_RETRY_COUNT}):`, error);
        if (attempt < WIRE_STOP_RETRY_COUNT) {
          await new Promise(resolve => setTimeout(resolve, WIRE_STOP_RETRY_DELAY_MS));
        }
      }
    }
    return false;
  }, []);
  const clearFeedingState = useCallback((dir: 'in' | 'out' | null) => {
    if (dir === null || feedingRef.current === dir) {
      feedingRef.current = null;
      setWireFeeding(null);
    }
  }, []);
  const warnStopFailed = useCallback(() => {
    showAlert(
      '와이어 정지 명령이 실패했습니다. 와이어가 계속 송급될 수 있으니 비상정지로 즉시 멈추세요.',
      { type: 'error', title: '와이어 정지 실패' },
    );
  }, [showAlert]);
  const startFeed = useCallback(async (dir: 'in' | 'out') => {
    clearPulseTimer();
    const prev = feedingRef.current;
    if (prev && prev !== dir) {
      // 반대 방향이 돌고 있으면 먼저 확실히 세운다.
      if (!(await stopFeed(prev))) {
        warnStopFailed();
        return;
      }
      clearFeedingState(prev);
    }
    const feed = dir === 'in' ? reverseWireFeed : forwardWireFeed;
    // 정지 버튼이 눌릴 수 있도록 송급 시작 "전에" 상태를 올린다.
    // 이 값이 없으면 타이머가 실패했을 때 사용자가 멈출 방법이 없다.
    feedingRef.current = dir;
    setWireFeeding(dir);
    try {
      await feed(0, 1);
    } catch (error) {
      console.error(dir === 'in' ? 'Wire In 오류:' : 'Wire Out 오류:', error);
      clearFeedingState(dir);
      return;
    }
    if (wireContinuous) return; // 연속 모드는 사용자가 직접 정지한다.
    const durationMs = dir === 'in' ? WIRE_REVERSE_DURATION_MS : WIRE_FORWARD_DURATION_MS;
    pulseTimerRef.current = setTimeout(() => {
      pulseTimerRef.current = null;
      void (async () => {
        const stopped = await stopFeed(dir);
        clearFeedingState(dir);
        if (!stopped) warnStopFailed();
      })();
    }, durationMs);
  }, [wireContinuous, clearPulseTimer, stopFeed, clearFeedingState, warnStopFailed]);
  const handleWireIn = useCallback(() => startFeed('in'), [startFeed]);
  const handleWireOut = useCallback(() => startFeed('out'), [startFeed]);
  const handleWireStop = useCallback(async () => {
    clearPulseTimer();
    const dir = feedingRef.current;
    // 방향을 모르면 양쪽 다 세운다.
    const stopped = dir
      ? await stopFeed(dir)
      : (await stopFeed('in')) && (await stopFeed('out'));
    clearFeedingState(null);
    if (!stopped) warnStopFailed();
  }, [clearPulseTimer, stopFeed, clearFeedingState, warnStopFailed]);
  // 화면 이동/언마운트로 타이머가 사라져 정지 명령이 영영 안 나가는 것을 막는다.
  useEffect(() => () => {
    if (pulseTimerRef.current !== null) clearTimeout(pulseTimerRef.current);
    const dir = feedingRef.current;
    if (dir) {
      const stop = dir === 'in' ? stopReverseWireFeed : stopForwardWireFeed;
      stop(0).catch(() => {});
    }
  }, []);
  return {
    wireContinuous,
    setWireContinuous,
    wireFeeding,
    handleWireIn,
    handleWireOut,
    handleWireStop,
  };
}
