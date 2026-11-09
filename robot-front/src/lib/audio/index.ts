import { isSoundEnabled } from '../appSettings';
type Beep = { freq: number; durationMs: number };
let ctx: AudioContext | null = null;
function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC: typeof AudioContext | undefined =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') {
    void ctx.resume();
  }
  return ctx;
}
function playTone({ freq, durationMs }: Beep, volume = 0.08): void {
  if (!isSoundEnabled()) return;
  const c = getCtx();
  if (!c) return;
  try {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const now = c.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.005);
    gain.gain.setValueAtTime(volume, now + Math.max(0, (durationMs - 30) / 1000));
    gain.gain.linearRampToValueAtTime(0, now + durationMs / 1000);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(now);
    osc.stop(now + durationMs / 1000 + 0.02);
  } catch {
  }
}
function playSequence(beeps: Beep[], gapMs = 30): void {
  let delay = 0;
  for (const b of beeps) {
    setTimeout(() => playTone(b), delay);
    delay += b.durationMs + gapMs;
  }
}
export function playSaveOkBeep(): void {
  playSequence(
    [
      { freq: 880, durationMs: 70 },
      { freq: 1318, durationMs: 90 },
    ],
    15,
  );
}
export function playErrorBeep(): void {
  playSequence(
    [
      { freq: 220, durationMs: 120 },
      { freq: 180, durationMs: 180 },
    ],
    30,
  );
}
