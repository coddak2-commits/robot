// [v1.1.307] 마지막으로 연 작업 번호. 용접부 선택 화면과 펜던트 화면이 같이 쓴다.
const LAST_JOB_ID_KEY = 'vot.lastJobId';
// 브라우저 저장소를 쓸 수 없는 환경(차단/시크릿 등)에서도 화면이 동작하도록 실패는 무시한다.
export function readLastJobId(): number | null {
  try {
    const v = localStorage.getItem(LAST_JOB_ID_KEY);
    if (v === null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}
export function writeLastJobId(id: number): void {
  try {
    localStorage.setItem(LAST_JOB_ID_KEY, String(id));
  } catch {
    // 무시
  }
}
