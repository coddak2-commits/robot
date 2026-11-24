// [v1.1.314] 네 점(P1·P3·P7·P9)으로 나머지 포인트 만들기 (사용자 아이디어 2026-11-24, 형상 방식 1.1.312~313 대체).
// 네 점만 찍고 버튼을 누르면 나머지 포인트의 위치·토치 자세를 중간값으로 만든다.
//   - P4 = P3, P10 = P9 (같은 자리, 관절값도 복사)
//   - P2 = P1·P3 중간, P8 = P7·P9 중간
//   - P6·P12 = P3·P9 가운데에서 각자 OVERLAP_HALF_MM 만큼 넘어감 (합계 5mm 겹침)
//   - P5 = P3·P6 중간, P11 = P9·P12 중간
//   - 토치 자세(rx·ry·rz)도 중간값. 관절값은 역기구학(두 끝점 관절의 중간값을 기준). 로봇 연결 필요
//   - 용접 조건(전류·전압·속도·위빙·갭)은 지금 작업 값 그대로. 홈은 건드리지 않음
// 왼쪽(P1-P3)과 오른쪽(P7-P9) 수직 기울기 차이가 LEAN_WARN_MM 넘으면 경고 후 계속/취소.
// 관절값 계산 실패 포인트만 원래 상태로 두고 나머지는 적용 (전부 실패면 적용 안 함).
import { useCallback, useState } from 'react';
import { useAlert } from '../../../contexts';
import { getInverseKin } from '../../../lib/robotApi/index';
import type { TeachingPoint } from '..';

const OVERLAP_HALF_MM = 2.5;
const LEAN_WARN_MM = 20;
const MIN_WIDTH_MM = 200; // P3~P9 가 이보다 짧으면 잘못 찍은 것으로 본다
const MIN_HEIGHT_MM = 50; // P1·P7 이 P3·P9 보다 이만큼은 높아야 한다
const ANCHORS = ['p1', 'p3', 'p7', 'p9'];

type Tcp = NonNullable<TeachingPoint['tcp']>;
interface Target {
  id: string;
  tcp: Tcp;
  seed: number[] | null;
  joints?: number[] | null; // 복사(P4·P10)는 계산 없이 이 값을 쓴다
}
interface BuildOk {
  targets: Target[];
  overwritten: string[];
  lean: number;
}

const wrap180 = (a: number) => {
  let v = a;
  while (v > 180) v -= 360;
  while (v < -180) v += 360;
  return v;
};
const lerpAng = (a: number, b: number, t: number) => wrap180(a + wrap180(b - a) * t);
const lerpTcp = (a: Tcp, b: Tcp, t: number): Tcp => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  z: a.z + (b.z - a.z) * t,
  rx: lerpAng(a.rx, b.rx, t),
  ry: lerpAng(a.ry, b.ry, t),
  rz: lerpAng(a.rz, b.rz, t),
});
const lerpJoints = (a: number[] | null, b: number[] | null, t: number): number[] | null =>
  a && b && a.length === 6 && b.length === 6 ? a.map((v, i) => v + (b[i] - v) * t) : a ?? b ?? null;

// 순수 계산: 지금 네 점 -> 만들 포인트 목록 (관절값은 나중에 채움)
export function buildFromFourPoints(current: TeachingPoint[]): BuildOk | { error: string } {
  const get = (id: string) => current.find(p => p.id === id && p.isSaved && p.tcp);
  const missing = ANCHORS.filter(id => !get(id)).map(id => id.toUpperCase());
  if (missing.length > 0) return { error: `${missing.join('·')} 를 먼저 저장하세요` };
  const [P1, P3, P7, P9] = ANCHORS.map(id => get(id)!);
  const tools = new Set([P1, P3, P7, P9].map(p => p.toolNum));
  if (tools.size > 1) return { error: 'P1·P3·P7·P9 의 툴 번호가 다릅니다. 같은 툴로 저장하세요' };
  const t1 = P1.tcp!, t3 = P3.tcp!, t7 = P7.tcp!, t9 = P9.tcp!;
  const width = Math.hypot(t9.x - t3.x, t9.y - t3.y);
  if (width < MIN_WIDTH_MM) return { error: `P3~P9 거리가 ${width.toFixed(0)}mm 입니다. P3·P9 위치를 확인하세요` };
  if (t1.z - t3.z < MIN_HEIGHT_MM || t7.z - t9.z < MIN_HEIGHT_MM) {
    return { error: 'P1·P7 이 P3·P9 보다 충분히 높지 않습니다. 위치를 확인하세요' };
  }
  // P3 -> P9 방향 단위벡터와 좌우 기울기(위 점이 아래 점에서 벗어난 거리: 안쪽 방향, 앞뒤 방향)
  const ux = (t9.x - t3.x) / width, uy = (t9.y - t3.y) / width;
  const along = (dx: number, dy: number) => dx * ux + dy * uy;
  const perp = (dx: number, dy: number) => -dx * uy + dy * ux;
  const lIn = along(t1.x - t3.x, t1.y - t3.y), lPerp = perp(t1.x - t3.x, t1.y - t3.y);
  const rIn = -along(t7.x - t9.x, t7.y - t9.y), rPerp = perp(t7.x - t9.x, t7.y - t9.y);
  const lean = Math.hypot(rIn - lIn, rPerp - lPerp);

  const half = OVERLAP_HALF_MM / width;
  const t6 = 0.5 + half, t12 = 0.5 - half; // P3->P9 비율 위치
  const p6 = lerpTcp(t3, t9, t6), p12 = lerpTcp(t3, t9, t12);
  const j3 = P3.joints, j9 = P9.joints;
  const targets: Target[] = [
    { id: 'p2', tcp: lerpTcp(t1, t3, 0.5), seed: lerpJoints(P1.joints, j3, 0.5) },
    { id: 'p4', tcp: { ...t3 }, seed: j3, joints: j3 },
    { id: 'p5', tcp: lerpTcp(t3, p6, 0.5), seed: lerpJoints(j3, j9, t6 / 2) },
    { id: 'p6', tcp: p6, seed: lerpJoints(j3, j9, t6) },
    { id: 'p8', tcp: lerpTcp(t7, t9, 0.5), seed: lerpJoints(P7.joints, j9, 0.5) },
    { id: 'p10', tcp: { ...t9 }, seed: j9, joints: j9 },
    { id: 'p11', tcp: lerpTcp(t9, p12, 0.5), seed: lerpJoints(j9, j3, (1 - t12) / 2) },
    { id: 'p12', tcp: p12, seed: lerpJoints(j3, j9, t12) },
  ];
  const overwritten = targets
    .map(t => current.find(p => p.id === t.id))
    .filter((p): p is TeachingPoint => !!p && p.isSaved)
    .map(p => p.name || p.id);
  return { targets, overwritten, lean };
}

interface FourPointControlProps {
  points: TeachingPoint[];
  onApply: (points: TeachingPoint[]) => void;
  disabled?: boolean;
  saveHint?: string;
}

export function FourPointControl({ points, onApply, disabled = false, saveHint }: FourPointControlProps) {
  const { show: showAlert } = useAlert();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<{ result: BuildOk; leanWarn: boolean } | null>(null);

  const apply = useCallback(async (result: BuildOk) => {
    setConfirm(null);
    setBusy(true);
    try {
      const anchor = points.find(p => p.id === 'p3')!;
      const solved = new Map<string, number[]>();
      const failed: string[] = [];
      for (const t of result.targets) {
        const joints = t.joints && t.joints.length === 6
          ? t.joints
          : t.seed ? await getInverseKin([t.tcp.x, t.tcp.y, t.tcp.z, t.tcp.rx, t.tcp.ry, t.tcp.rz], t.seed) : null;
        if (joints) solved.set(t.id, joints);
        else failed.push(points.find(p => p.id === t.id)?.name || t.id);
      }
      if (solved.size === 0) {
        showAlert(`관절값 계산 실패: ${failed.join(', ')}. 로봇 연결을 확인하세요. 포인트는 바꾸지 않았습니다.`, { type: 'error' });
        return;
      }
      const next = points.map(p => {
        const t = result.targets.find(x => x.id === p.id);
        const joints = solved.get(p.id);
        if (!t || !joints) return p;
        return { ...p, tcp: t.tcp, joints, toolNum: anchor.toolNum, userNum: anchor.userNum, isSaved: true, touchOffset: null };
      });
      onApply(next);
      const hint = saveHint ? `\n${saveHint}` : '';
      if (failed.length > 0) {
        showAlert(`포인트 ${solved.size}개를 만들었지만 ${failed.join(', ')} 은(는) 관절값 계산에 실패해 바꾸지 않았습니다. 그 포인트는 직접 티칭하세요.${hint}`, { type: 'warning', title: '나머지 포인트 만들기' });
      } else {
        showAlert(`P1·P3·P7·P9 로 포인트 ${solved.size}개를 만들었습니다. 터치센싱 후 용접하세요.${hint}`, { type: 'success', title: '나머지 포인트 만들기' });
      }
    } finally {
      setBusy(false);
    }
  }, [points, onApply, showAlert, saveHint]);

  const start = useCallback(async () => {
    const result = buildFromFourPoints(points);
    if ('error' in result) {
      showAlert(result.error, { type: 'warning', title: '나머지 포인트 만들기' });
      return;
    }
    const leanWarn = result.lean > LEAN_WARN_MM;
    if (leanWarn || result.overwritten.length > 0) setConfirm({ result, leanWarn });
    else await apply(result);
  }, [points, showAlert, apply]);

  return (
    <span className="flex items-center gap-1.5">
      <button
        onClick={start}
        disabled={disabled || busy}
        className={`px-2 py-1 rounded-lg text-xs font-medium border transition ${
          disabled || busy
            ? 'bg-gray-700/40 text-gray-500 border-gray-600/40 cursor-not-allowed'
            : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30'
        }`}
        title="P1·P3·P7·P9 를 저장한 뒤 누르면 나머지 포인트를 중간값으로 채웁니다"
      >
        {busy ? '계산 중...' : '나머지 포인트 만들기'}
      </button>
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setConfirm(null)}>
          <div className="w-96 rounded-xl border border-gray-600 bg-gray-800 p-4 text-sm text-gray-200" onClick={e => e.stopPropagation()}>
            <div className="mb-3 font-semibold text-white">나머지 포인트 만들기</div>
            {confirm.leanWarn && (
              <p className="mb-3 text-amber-300">
                왼쪽과 오른쪽 수직 기울기가 {confirm.result.lean.toFixed(0)}mm 다릅니다 (기준 {LEAN_WARN_MM}mm). P1·P7 위치를 확인하세요.
                판이 휜 경우라면 계속한 뒤 P2·P8 을 직접 다시 찍으세요.
              </p>
            )}
            {confirm.result.overwritten.length > 0 && (
              <p className="mb-3 text-gray-300">
                이미 저장된 {confirm.result.overwritten.join(', ')} 의 위치·자세를 중간값으로 덮어씁니다. 용접 조건은 그대로 둡니다.
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirm(null)} className="rounded-lg border border-gray-600 px-3 py-1.5 text-gray-300 hover:bg-gray-700">
                취소
              </button>
              <button
                onClick={() => apply(confirm.result)}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 font-medium text-white hover:bg-emerald-500"
              >
                계속
              </button>
            </div>
          </div>
        </div>
      )}
    </span>
  );
}
