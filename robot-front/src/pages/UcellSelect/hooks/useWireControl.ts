import { pulseWireFeed, startWireFeed, stopWireFeed, stopAllWireFeed, WIRE_STOP_FAILED_MESSAGE, WIRE_BLOCKED_WHILE_RUNNING_MESSAGE } from '../../../lib';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAlert } from '../../../contexts';

// 작업 화면 툴바의 Wire In/Out 버튼. 1회 누를 때 보내는 양.
// v1.1.128: 용접 중에는 전류 AO가 높아 실제 송급 속도가 더 빠를 수 있어 우선 축소 (테스트용).
const WIRE_TARGET_MM = 0.2;
// 버튼 라벨은 In/Out, 실제 방향은 In=당기기(reverse), Out=밀기(forward).
const DIRECTION_OF: Record<'in' | 'out', 'forward' | 'reverse'> = { in: 'reverse', out: 'forward' };
export interface UseWireControlReturn {
  wireContinuous: boolean;
  setWireContinuous: (v: boolean) => void;
  wireFeeding: 'in' | 'out' | null;
  handleWireIn: () => Promise<void>;
  handleWireOut: () => Promise<void>;
  handleWireStop: () => Promise<void>;
}
// weldingActive: 용접/DryRun이 도는 중이면 수동 송급을 막는다 (v1.1.138).
// 아크 중에는 용접기의 전류 연동 제어가 송급 속도를 정하므로, 이 파일의
// "0.2mm" 계산(유휴 기준 1.75mm/s)이 성립하지 않는다. 실측 전까지 차단.
// 정지(handleWireStop)는 막지 않는다 - 멈추는 건 언제든 가능해야 한다.
export function useWireControl(weldingActive = false): UseWireControlReturn {
  const { show: showAlert } = useAlert();
  const [wireContinuous, setWireContinuous] = useState(false);
  const [wireFeeding, setWireFeeding] = useState<'in' | 'out' | null>(null);
  // setState는 비동기라 정지 경로에서 즉시 읽을 수 없다. 방향은 ref로 따로 들고 간다.
  const feedingRef = useRef<'in' | 'out' | null>(null);
  const clearFeedingState = useCallback(() => {
    feedingRef.current = null;
    setWireFeeding(null);
  }, []);
  const warnStopFailed = useCallback(() => {
    showAlert(WIRE_STOP_FAILED_MESSAGE, { type: 'error', title: '와이어 정지 실패' });
  }, [showAlert]);
  const feed = useCallback(async (side: 'in' | 'out') => {
    if (weldingActive) {
      showAlert(WIRE_BLOCKED_WHILE_RUNNING_MESSAGE, { type: 'warning', title: '와이어 수동 조작 차단' });
      return;
    }
    const direction = DIRECTION_OF[side];
    const prev = feedingRef.current;
    if (prev && prev !== side) {
      // 반대 방향이 돌고 있으면 먼저 확실히 세운다.
      if (!(await stopWireFeed(DIRECTION_OF[prev]))) {
        warnStopFailed();
        return;
      }
      clearFeedingState();
    }
    // 정지 버튼이 눌릴 수 있도록 송급 시작 "전에" 상태를 올린다.
    feedingRef.current = side;
    setWireFeeding(side);
    if (wireContinuous) {
      // 연속 모드는 사용자가 직접 정지한다.
      try {
        await startWireFeed(direction);
      } catch (error) {
        console.error('와이어 송급 시작 오류:', error);
        clearFeedingState();
      }
      return;
    }
    const result = await pulseWireFeed(direction, WIRE_TARGET_MM);
    clearFeedingState();
    if (!result.stopped) warnStopFailed();
    else if (!result.ok) console.error('와이어 송급 오류:', result.error);
  }, [weldingActive, wireContinuous, clearFeedingState, warnStopFailed, showAlert]);
  const handleWireIn = useCallback(() => feed('in'), [feed]);
  const handleWireOut = useCallback(() => feed('out'), [feed]);
  const handleWireStop = useCallback(async () => {
    const side = feedingRef.current;
    const stopped = side ? await stopWireFeed(DIRECTION_OF[side]) : await stopAllWireFeed();
    clearFeedingState();
    if (!stopped) warnStopFailed();
  }, [clearFeedingState, warnStopFailed]);
  // 화면 이동/언마운트 시 연속 송급이 켜진 채로 남는 것을 막는다.
  useEffect(() => () => {
    const side = feedingRef.current;
    if (side) stopWireFeed(DIRECTION_OF[side]).catch(() => {});
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
