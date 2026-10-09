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

// 실측 프로파일 (2026-09-18, v1.1.159).
// 모터 ON 후 와이어가 실제로 움직이기까지 지연이 있어서 (길이/속도)만으로는
// 짧은 시간에서 크게 틀린다. 두 점 실측으로 지연과 속도를 같이 구했다.
// v1.1.160 재보정. 159 값으로 요청 대비 실제를 재서 역산했다.
//   밀기   5mm 요청 → +7mm(953ms), 25mm 요청 → +26mm(3484ms)  => 지연 20ms, 7.5mm/s
//   당기기 5mm 요청 → -4mm(392ms), 25mm 요청 → -21mm(1119ms)  => 지연 220ms, 23.4mm/s
// 1mm처럼 짧은 값은 양방향 모두 ±1mm 수준이 한계다.
//
// v1.1.208 밀기 재보정 (2026-09-30, 현장 반복 실측).
// 160 값(지연 20ms, 7.5mm/s)으로 요청 5mm→실제 2.5mm, 요청 25mm→실제 20mm.
// 해당 명령 시간은 687ms와 3353ms이므로,
//   속도 = (20 - 2.5)mm / (3353 - 687)ms = 6.56mm/s
//   지연 = 687ms - (2.5 / 6.56)*1000 = 306ms
// 160 때는 과송급이었는데 지금은 부족하다. 송급 롤러 압력·라이너·스풀이 바뀌면
// 다시 틀어진다는 뜻이므로, 값이 안 맞으면 같은 방식으로 두 점 재실측한다.
// 당기기는 이번에 재지 않아 160 값 그대로 둔다.
//
// v1.1.218 밀기 프로파일 2개로 분리 (2026-10-01, 현장 실측).
// 208 값(식은 상태 기준)으로 용접 직후 재보니 요청 5mm→실제 8mm, 25mm→31mm.
// 해당 명령 시간은 1068ms와 4117ms이므로,
//   속도 = (31 - 8)mm / (4117 - 1068)ms = 7.54mm/s
//   지연 = 1068ms - (8 / 7.54)*1000 = 7ms
// 뜨거우면 라이너 마찰이 줄어 모터가 바로 돌고 더 빨리 나간다.
// 한 프로파일로는 못 덮는다. 식은 값으로 맞추면 뜨거울 때 25mm가 31mm,
// 뜨거운 값으로 맞추면 식었을 때 25mm가 20mm로 나온다.
// 송급에 엔코더가 없어 실제 길이를 되먹임할 방법이 없으므로 상태로 나눈다.
// 당기기는 두 상태 모두 안 쟀다. 160 값을 양쪽에 그대로 쓴다.
type WireProfile = Record<WireDirection, { deadTimeMs: number; speedMmPerSec: number }>;
//
// v1.1.234 양쪽 프로파일·당기기 재보정 (2026-10-08, 현장 실측).
//
// v1.1.233 은 두 측정이 모두 '뜨거운' 상태라는 전제로 뜨거운 쪽만 고쳤는데,
// 그 전제가 틀렸다. 같은 날 다시 재보니 '용접 전' 값이 233 이전과 거의 같았고,
// 233 은 식은 쪽을 건드리지 않았다. 즉 '용접 전' 측정은 식은 상태였다.
// 233 의 뜨거운 값(-84ms, 10.26mm/s)은 식은 데이터와 뜨거운 데이터를 섞어 낸
// 것이라 폐기하고, 아래처럼 두 상태를 따로 맞춘다.
//
// [식은 상태] 208 값(306ms, 6.56mm/s)으로 두 번 측정. 명령 시간 458/1068/4117ms.
//     요청 1mm -> 2mm, 3mm       (평균 2.5)
//     요청 5mm -> 9mm, 7~9mm     (평균 8.5)
//     요청 25mm -> 35mm, 31~34mm (평균 33.75)
//   세 점 최소제곱 -> 속도 8.46mm/s, 지연 117ms (세 점 모두 오차 0.5mm 이내).
//   검산: 25mm -> 3072ms -> 25.0 / 5mm -> 708ms -> 5.0 / 1mm -> 235ms -> 1.0
//
// [뜨거운 상태] 218 값(7ms, 7.54mm/s)으로 용접 직후 1회. 명령 시간 670/3323ms.
//     요청 5mm -> 6mm, 요청 25mm -> 35mm
//   두 점 -> 속도 10.93mm/s, 지연 121ms.
//   검산: 25mm -> 2409ms -> 25.0 / 5mm -> 579ms -> 5.0
//   같은 측정의 1mm(140ms -> 3mm)는 21mm/s 에 해당해 물리적으로 안 맞는다.
//   눈대중 오차로 보고 버렸다. 뜨거운 쪽은 측정이 1회뿐이라 신뢰도가 낮다.
//
// [당기기] 160 값(220ms, 23.4mm/s)으로 식은 상태 1회. 명령 시간 263/434/1288ms.
//     요청 1mm -> 2~3mm, 5mm -> 3mm, 25mm -> 23mm
//   5·25mm 두 점 -> 속도 23.42mm/s(종전과 거의 같다), 지연 306ms.
//   속도는 맞았고 지연만 모자랐다. 1mm 측정(263ms -> 2.5mm)은 새 지연보다
//   짧은 펄스라 0mm 여야 하므로 역시 눈대중 오차로 본다.
//   당기기는 두 상태를 나누지 않고 양쪽에 같은 값을 쓴다(종전 방식 유지).
//
// 1mm 는 어느 방향이든 ±1mm 가 한계다. 펄스가 수백 ms 밖에 안 되고 HTTP 왕복
// 시간이 그 안에서 차지하는 비중이 크다.
//
// v1.1.238 뜨거운 밀기 재보정 (2026-10-09, 현장 실측).
// 234 값(121ms, 10.93mm/s)으로 용접 직후 반복 측정. 명령 시간 212/578/2408ms.
//     요청 1mm -> 2, 4, 6mm          (평균 4.0)
//     요청 5mm -> 6, 7, 7, 8mm       (평균 7.0)
//     요청 25mm -> 30, 27, 29, 30mm  (평균 29.0)
//   5·25mm 두 점 -> 속도 (29.0-7.0)/(2.408-0.578) = 12.02mm/s,
//   지연 0.578 - 7.0/12.02 = -4ms -> 0 으로 둔다.
//   검산: 25mm -> 2080ms -> 25.0 / 5mm -> 416ms -> 5.0
//   1mm 는 2~6mm 로 흩어져 계산에서 뺐다. 25mm 자체도 27~30mm 로 흩어져
//   보정 후에도 매번 ±1.5mm 정도는 차이가 날 수 있다.
//   식은 쪽과 당기기는 이번에 재지 않았다. 뜨거운 판정 시간(5분)도 그대로다.
export const WIRE_FEED_PROFILE_COLD: WireProfile = {
  forward: { deadTimeMs: 117, speedMmPerSec: 8.46 },
  reverse: { deadTimeMs: 306, speedMmPerSec: 23.42 },
};
export const WIRE_FEED_PROFILE_HOT: WireProfile = {
  forward: { deadTimeMs: 0, speedMmPerSec: 12.02 },
  reverse: { deadTimeMs: 306, speedMmPerSec: 23.42 },
};
// 마지막 아크 OFF 로부터 이 시간 안이면 뜨거운 값을 쓴다.
// 5분은 임의로 잡은 값이다. 실제로 몇 분이면 식는지 확인되면 바꾼다.
export const WIRE_HOT_WINDOW_MS = 5 * 60 * 1000;
const ARC_OFF_AT_KEY = 'wire_last_arc_off_at';
/** 아크를 끌 때 호출한다. 송급 프로파일 선택에만 쓴다. */
export const markArcOff = (): void => {
  try {
    localStorage.setItem(ARC_OFF_AT_KEY, String(Date.now()));
  } catch {
    /* 저장 못 해도 식은 값으로 동작한다 */
  }
};
export const isWireHot = (): boolean => {
  try {
    const raw = localStorage.getItem(ARC_OFF_AT_KEY);
    if (!raw) return false;
    const at = Number(raw);
    if (!Number.isFinite(at)) return false;
    const elapsed = Date.now() - at;
    return elapsed >= 0 && elapsed < WIRE_HOT_WINDOW_MS;
  } catch {
    return false;
  }
};
export const getWireFeedProfile = (): WireProfile =>
  isWireHot() ? WIRE_FEED_PROFILE_HOT : WIRE_FEED_PROFILE_COLD;
/** 이전 이름 호환. 지금 상태에 맞는 프로파일을 돌려준다. */
export const WIRE_FEED_PROFILE: WireProfile = WIRE_FEED_PROFILE_COLD;

// 정지 명령이 실패하면 와이어가 계속 송급된다. 반드시 재시도한다.
export const WIRE_STOP_RETRY_COUNT = 3;
export const WIRE_STOP_RETRY_DELAY_MS = 150;

export const wireFeedDurationMs = (
  amountMm: number,
  direction: WireDirection = 'forward',
): number => {
  if (amountMm <= 0) return 0;
  const { deadTimeMs, speedMmPerSec } = getWireFeedProfile()[direction];
  return Math.round(deadTimeMs + (amountMm / speedMmPerSec) * 1000);
};

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
): Promise<WirePulseResult> => pulseWireFeedMs(direction, wireFeedDurationMs(amountMm, direction), ioType);

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
