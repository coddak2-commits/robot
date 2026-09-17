// 와이어 수동 조그(인칭) 공용 로직.
//
// v1.1.136 이전에는 이 로직이 세 곳에 복사돼 있었다:
//   - UcellSelect/hooks/useWireControl.ts  (작업 화면 툴바 Wire In/Out)
//   - pages/wire-inching/index.tsx         ("와이어 조정" 팝업)
//   - pages/pendant/index.tsx              (팬던트 "와이어 수동 제어")
// 그 결과 아래와 같은 드리프트가 실제로 발생했다:
//   - 팬던트만 송급 속도 상수가 1.0으로 뒤처져 1.75배 과송급 (v1.1.135에서 수정)
//   - 정지 명령 재시도가 useWireControl에만 적용 (v1.1.132)
// 세 화면이 이 파일만 쓰도록 통합한다. 앞으로 송급 로직은 여기만 고친다.
//
// 원리: 로봇 SDK에는 송급 모터 on/off 스위치만 있고 "몇 mm 보내라" 명령이 없다.
//       모터 ON -> (길이 / 송급속도)만큼 대기 -> 모터 OFF.

import {
  forwardWireFeed,
  reverseWireFeed,
  stopForwardWireFeed,
  stopReverseWireFeed,
} from './robotApi/index';

/** forward = 밀기(내보내기), reverse = 당기기(집어넣기) */
export type WireDirection = 'forward' | 'reverse';

// 실측값. 구 상수 3.5 기준으로 1mm를 요청했을 때 실제 0.5mm가 나온 결과에서
// 역산: 0.5mm / (1mm / 3.5mm/s) = 1.75mm/s.
export const WIRE_FEED_SPEED_MM_PER_SEC = 1.75;

// 정지 명령이 실패하면 와이어가 계속 송급된다. 반드시 재시도한다.
export const WIRE_STOP_RETRY_COUNT = 3;
export const WIRE_STOP_RETRY_DELAY_MS = 150;

export const wireFeedDurationMs = (amountMm: number): number =>
  Math.max(0, Math.round((amountMm / WIRE_FEED_SPEED_MM_PER_SEC) * 1000));

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/** 모터만 켠다. 연속 송급(사용자가 직접 정지)에 쓴다. */
export const startWireFeed = async (direction: WireDirection, ioType = 0): Promise<void> => {
  const start = direction === 'forward' ? forwardWireFeed : reverseWireFeed;
  await start(ioType, 1);
};

/** 모터를 끈다. 실패하면 재시도하고, 끝까지 실패하면 false. */
export const stopWireFeed = async (direction: WireDirection, ioType = 0): Promise<boolean> => {
  const stop = direction === 'forward' ? stopForwardWireFeed : stopReverseWireFeed;
  for (let attempt = 1; attempt <= WIRE_STOP_RETRY_COUNT; attempt++) {
    try {
      await stop(ioType);
      return true;
    } catch (error) {
      console.error(`와이어 정지 실패 (${direction} ${attempt}/${WIRE_STOP_RETRY_COUNT}):`, error);
      if (attempt < WIRE_STOP_RETRY_COUNT) await sleep(WIRE_STOP_RETRY_DELAY_MS);
    }
  }
  return false;
};

/** 방향을 모를 때 양쪽 다 세운다. */
export const stopAllWireFeed = async (ioType = 0): Promise<boolean> => {
  const forwardOk = await stopWireFeed('forward', ioType);
  const reverseOk = await stopWireFeed('reverse', ioType);
  return forwardOk && reverseOk;
};

export interface WirePulseResult {
  /** 시작과 정지가 모두 성공했는가 */
  ok: boolean;
  /** 정지 명령이 성공했는가. false면 와이어가 계속 나가고 있을 수 있다. */
  stopped: boolean;
  durationMs: number;
  error?: string;
}

/** 모터 ON -> 대기 -> OFF. 시작이 실패해도 정지를 시도한다. */
export const pulseWireFeed = async (
  direction: WireDirection,
  amountMm: number,
  ioType = 0,
): Promise<WirePulseResult> => pulseWireFeedMs(direction, wireFeedDurationMs(amountMm), ioType);

/** 시간(ms) 기준 송급. 파트 전환 스틱아웃 보정처럼 실측 시간으로 돌릴 때 쓴다. */
export const pulseWireFeedMs = async (
  direction: WireDirection,
  durationMs: number,
  ioType = 0,
): Promise<WirePulseResult> => {
  try {
    await startWireFeed(direction, ioType);
  } catch (error) {
    const stopped = await stopWireFeed(direction, ioType);
    return { ok: false, stopped, durationMs, error: String(error) };
  }
  await sleep(durationMs);
  const stopped = await stopWireFeed(direction, ioType);
  return { ok: stopped, stopped, durationMs };
};

/** 로봇이 프로그램(용접/DryRun)을 돌리는 중에 수동 조작을 막을 때 띄울 문구. */
export const WIRE_BLOCKED_WHILE_RUNNING_MESSAGE =
  '용접/DryRun이 진행 중일 때는 와이어 수동 조작을 할 수 없습니다.\n'
  + '아크 중 실제 송급량은 용접기의 전류 연동 제어가 정하기 때문에, 화면에 표시된 mm와 크게 달라질 수 있습니다.\n'
  + '실측으로 확인되기 전까지 차단합니다. 정지는 언제든 가능합니다.';

/** 정지 실패 시 사용자에게 띄울 공용 문구. */
export const WIRE_STOP_FAILED_MESSAGE =
  '와이어 정지 명령이 실패했습니다. 와이어가 계속 송급될 수 있으니 비상정지로 즉시 멈추세요.';
