// [v1.1.288] robot_blackfly(Blackfly S, 127.0.0.1:8003) 호출. 용접 중 촬영(과제용).
// 아크 ON 때 start, 아크 OFF 때 stop 을 보낸다. 응답을 기다리지 않고, 실패해도 조용히 넘어간다.
// 카메라·프로그램이 없으면 아무 일도 일어나지 않는다. 정지 신호가 안 가도 프로그램이 스스로 멈춘다.
import { createLogger } from './index';

const log = createLogger('Blackfly');
const BLACKFLY_BASE = 'http://127.0.0.1:8003';

function fireAndForget(path: string, body?: unknown, timeoutMs = 1000): void {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  fetch(`${BLACKFLY_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
    signal: ctrl.signal,
  })
    .catch(() => {})
    .finally(() => clearTimeout(timer));
}

/** 용접 1회를 구분하는 id (폴더 이름) */
export function newBlackflyRunId(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export function blackflyStart(runId: string, part: string, jobName?: string | null): void {
  log.info('blackfly.start', `촬영 시작 신호 ${runId} ${part}`);
  fireAndForget('/blackfly/start', { run_id: runId, part, job_name: jobName ?? '' });
}

export function blackflyStop(): void {
  fireAndForget('/blackfly/stop');
}
