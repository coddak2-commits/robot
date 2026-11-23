// [v1.1.312] U셀 형상으로 나머지 포인트 만들기.
// 형상 = 이름이 '[형상]' 또는 '[SHAPE]' 로 시작하는 작업 (예: '[형상] 연습용 U셀'). 모든 포인트를 최적으로 티칭해 둔 작업.
// 새 작업에서 P1·P7 만 저장하고 형상을 골라 버튼을 누르면, P1·P7 로 U셀의 평면 이동·회전을 구해
// 형상의 나머지 포인트를 옮겨 채운다.
//   - 높이(Z)는 형상 값 그대로 (U셀은 늘 같은 바닥. 실제 바닥은 터치센싱이 찾음)
//   - 토치 자세는 형상 값 + 회전량(rz)
//   - 속도·용접 조건·위빙·갭도 형상 값 (P1·P7 은 위치만 그대로 두고 조건은 형상 값)
//   - 관절값은 새 위치로 역기구학(형상 관절값을 기준으로) 계산. 로봇 연결 필요
//   - 홈은 지금 작업에 저장돼 있으면 그대로, 없으면 형상 홈
// 형상 선택은 작업마다 localStorage 에 기억한다.
import { useCallback, useEffect, useState } from 'react';
import { useAlert } from '../../../contexts';
import { getTeachingJobs, getTeachingJob, getInverseKin } from '../../../lib/robotApi/index';
import type { TeachingPoint } from '..';
import { toTeachingPoint } from '../hooks/useJobManagement';

const SHAPE_PREFIXES = ['[형상]', '[SHAPE]'];
const SHAPE_DIST_TOL_MM = 15; // P1~P7 거리가 형상과 이만큼 넘게 다르면 형상이 맞지 않는 것으로 본다
const SHAPE_YAW_LIMIT_DEG = 5; // U셀 회전이 이보다 크면 잘못 찍은 것으로 본다
const ANCHOR_IDS = ['p1', 'p7'];
const STORE_KEY = (jobId: number | null) => `vot.shape.${jobId ?? 'none'}`;

export const isShapeJobName = (name?: string | null): boolean =>
  !!name && SHAPE_PREFIXES.some(p => name.trim().toUpperCase().startsWith(p.toUpperCase()));
const shapeLabel = (name: string): string => {
  const t = name.trim();
  const p = SHAPE_PREFIXES.find(pre => t.toUpperCase().startsWith(pre.toUpperCase()));
  return p ? t.slice(p.length).trim() || t : t;
};
const readStore = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const writeStore = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 저장 못 해도 기능에는 지장 없음
  }
};

type Tcp = NonNullable<TeachingPoint['tcp']>;
interface BuildOk {
  points: TeachingPoint[];
  moved: { dx: number; dy: number; yawDeg: number; distDiff: number };
  overwritten: string[];
  targets: { point: TeachingPoint; shapeJoints: number[] | null }[];
}

// 순수 계산: 형상 + 지금 P1·P7 -> 새 포인트 배열 (관절값은 나중에 채움)
export function buildFromShape(shape: TeachingPoint[], current: TeachingPoint[]): BuildOk | { error: string } {
  const sp = (id: string) => shape.find(p => p.id === id && p.isSaved && p.tcp);
  const cp = (id: string) => current.find(p => p.id === id && p.isSaved && p.tcp);
  const s1 = sp('p1')?.tcp, s7 = sp('p7')?.tcp, c1 = cp('p1')?.tcp, c7 = cp('p7')?.tcp;
  if (!s1 || !s7) return { error: '형상 작업에 P1·P7 이 없습니다' };
  if (!c1 || !c7) return { error: '지금 작업에 P1·P7 을 먼저 저장하세요' };
  // 좌표는 툴 좌표계 기준이라 형상과 지금 P1·P7 의 툴 번호가 같아야 한다
  const tools = [sp('p1'), sp('p7'), cp('p1'), cp('p7')].map(p => p?.toolNum);
  if (new Set(tools).size > 1) return { error: `툴 번호가 다릅니다 (형상 ${tools[0]}, 지금 ${tools[2]}). 같은 툴로 P1·P7 을 저장하세요` };
  const ds = Math.hypot(s7.x - s1.x, s7.y - s1.y);
  const dc = Math.hypot(c7.x - c1.x, c7.y - c1.y);
  const distDiff = dc - ds;
  if (Math.abs(distDiff) > SHAPE_DIST_TOL_MM) {
    return { error: `P1~P7 거리 ${dc.toFixed(0)}mm 가 형상(${ds.toFixed(0)}mm)과 ${distDiff.toFixed(0)}mm 다릅니다. 형상 선택 또는 P1·P7 위치를 확인하세요` };
  }
  let yaw = Math.atan2(c7.y - c1.y, c7.x - c1.x) - Math.atan2(s7.y - s1.y, s7.x - s1.x);
  yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
  const yawDeg = (yaw * 180) / Math.PI;
  if (Math.abs(yawDeg) > SHAPE_YAW_LIMIT_DEG) {
    return { error: `U셀 회전이 ${yawDeg.toFixed(1)}° 로 너무 큽니다. P1·P7 위치를 확인하세요` };
  }
  // P1·P7 가운데를 기준으로 맞춘다 (두 점 티칭 오차를 반씩 나눔)
  const sm = { x: (s1.x + s7.x) / 2, y: (s1.y + s7.y) / 2 };
  const cm = { x: (c1.x + c7.x) / 2, y: (c1.y + c7.y) / 2 };
  const cos = Math.cos(yaw), sin = Math.sin(yaw);
  const move = (t: Tcp): Tcp => {
    const x = t.x - sm.x, y = t.y - sm.y;
    let rz = t.rz + yawDeg;
    if (rz > 180) rz -= 360;
    if (rz < -180) rz += 360;
    return { ...t, x: cm.x + cos * x - sin * y, y: cm.y + sin * x + cos * y, z: t.z, rz };
  };
  const overwritten: string[] = [];
  const targets: BuildOk['targets'] = [];
  const points = current.map(cur => {
    const s = shape.find(p => p.id === cur.id && p.isSaved && p.tcp);
    if (!s || !s.tcp) return cur;
    const params = {
      moveSpeed: s.moveSpeed, velMode: s.velMode, weldVoltage: s.weldVoltage, weldCurrent: s.weldCurrent,
      weavingType: s.weavingType, weaveParams: s.weaveParams, gap: s.gap, toolNum: s.toolNum, userNum: s.userNum,
    };
    if (cur.id === 'home') {
      return cur.isSaved && cur.tcp ? cur : { ...cur, ...params, tcp: s.tcp, joints: s.joints, isSaved: true, touchOffset: null };
    }
    if (ANCHOR_IDS.includes(cur.id)) return { ...cur, ...params, toolNum: cur.toolNum, userNum: cur.userNum, touchOffset: null };
    if (cur.isSaved) overwritten.push(cur.name || cur.id);
    const next: TeachingPoint = { ...cur, ...params, tcp: move(s.tcp), joints: null, isSaved: true, touchOffset: null };
    targets.push({ point: next, shapeJoints: s.joints && s.joints.length === 6 ? s.joints : null });
    return next;
  });
  const mid = move({ x: sm.x, y: sm.y, z: 0, rx: 0, ry: 0, rz: 0 });
  return { points, moved: { dx: mid.x - sm.x, dy: mid.y - sm.y, yawDeg, distDiff }, overwritten, targets };
}

interface ShapeTemplateControlProps {
  jobId: number | null;
  points: TeachingPoint[];
  onApply: (points: TeachingPoint[]) => void;
  disabled?: boolean;
  saveHint?: string;
}

export function ShapeTemplateControl({ jobId, points, onApply, disabled = false, saveHint }: ShapeTemplateControlProps) {
  const { show: showAlert } = useAlert();
  const [shapes, setShapes] = useState<{ id: number; label: string }[]>([]);
  const [shapeId, setShapeId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<{ result: BuildOk; label: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await getTeachingJobs(undefined, 500);
      const jobs: { id: number; name: string; total_points?: number }[] = res?.data?.jobs ?? [];
      setShapes(jobs.filter(j => isShapeJobName(j.name) && (j.total_points ?? 0) > 0).map(j => ({ id: j.id, label: shapeLabel(j.name) })));
    } catch {
      setShapes([]);
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  useEffect(() => {
    const saved = readStore(STORE_KEY(jobId)) ?? readStore('vot.shape.last');
    setShapeId(saved ? Number(saved) : null);
  }, [jobId]);

  const choose = (v: string) => {
    const id = v ? Number(v) : null;
    setShapeId(id);
    if (id != null) {
      writeStore(STORE_KEY(jobId), String(id));
      writeStore('vot.shape.last', String(id));
    }
  };

  const apply = useCallback(async (result: BuildOk, label: string) => {
    setConfirm(null);
    setBusy(true);
    try {
      const failed: string[] = [];
      for (const t of result.targets) {
        const tcp = t.point.tcp!;
        const joints = t.shapeJoints ? await getInverseKin([tcp.x, tcp.y, tcp.z, tcp.rx, tcp.ry, tcp.rz], t.shapeJoints) : null;
        if (joints) t.point.joints = joints;
        else failed.push(t.point.name || t.point.id);
      }
      if (failed.length > 0) {
        showAlert(`관절값 계산 실패: ${failed.join(', ')}. 로봇 연결을 확인하거나 그 포인트를 직접 티칭하세요. 포인트는 바꾸지 않았습니다.`, { type: 'error' });
        return;
      }
      onApply(result.points);
      const m = result.moved;
      showAlert(
        `'${label}' 형상으로 포인트 ${result.targets.length}개를 만들었습니다. 이동 X ${m.dx.toFixed(1)} / Y ${m.dy.toFixed(1)} mm, 회전 ${m.yawDeg.toFixed(2)}°, P1~P7 거리 차 ${m.distDiff.toFixed(1)}mm${saveHint ? `\n${saveHint}` : ''}`,
        { type: 'success', title: '나머지 포인트 만들기' },
      );
    } finally {
      setBusy(false);
    }
  }, [onApply, showAlert, saveHint]);

  const start = useCallback(async () => {
    if (shapeId == null) {
      showAlert('형상을 먼저 고르세요', { type: 'warning' });
      return;
    }
    setBusy(true);
    let shapePts: TeachingPoint[] = [];
    try {
      const res = await getTeachingJob(shapeId);
      shapePts = (res?.data?.points ?? []).map(toTeachingPoint) as TeachingPoint[];
    } catch {
      shapePts = [];
    }
    setBusy(false);
    if (shapePts.length === 0) {
      showAlert('형상 작업을 불러오지 못했습니다', { type: 'error' });
      return;
    }
    const result = buildFromShape(shapePts, points);
    const label = shapes.find(s => s.id === shapeId)?.label ?? '형상';
    if ('error' in result) {
      showAlert(result.error, { type: 'warning', title: '나머지 포인트 만들기' });
      return;
    }
    if (result.overwritten.length > 0) setConfirm({ result, label });
    else await apply(result, label);
  }, [shapeId, points, shapes, showAlert, apply]);

  return (
    <span className="flex items-center gap-1.5">
      <span className="text-gray-500 text-xs">형상:</span>
      <select
        value={shapeId ?? ''}
        onChange={e => choose(e.target.value)}
        onFocus={refresh}
        disabled={disabled || busy}
        className="px-2 py-1 bg-gray-900 border border-gray-700 rounded text-white text-xs focus:outline-none focus:border-cyan-500"
        title="나머지 포인트를 만들 때 쓸 U셀 형상 (이름이 [형상] 으로 시작하는 작업)"
      >
        <option value="">{shapes.length === 0 ? '형상 없음' : '선택'}</option>
        {shapes.map(s => (
          <option key={s.id} value={s.id}>{s.label}</option>
        ))}
      </select>
      <button
        onClick={start}
        disabled={disabled || busy || shapeId == null}
        className={`px-2 py-1 rounded-lg text-xs font-medium border transition ${
          disabled || busy || shapeId == null
            ? 'bg-gray-700/40 text-gray-500 border-gray-600/40 cursor-not-allowed'
            : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30'
        }`}
        title="P1·P7 을 저장한 뒤 누르면 형상으로 나머지 포인트를 채웁니다"
      >
        {busy ? '계산 중...' : '나머지 포인트 만들기'}
      </button>
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setConfirm(null)}>
          <div className="w-96 rounded-xl border border-gray-600 bg-gray-800 p-4 text-sm text-gray-200" onClick={e => e.stopPropagation()}>
            <div className="mb-3 font-semibold text-white">직접 저장한 포인트 덮어쓰기</div>
            <p className="mb-4 text-gray-300">
              이미 저장된 {confirm.result.overwritten.join(', ')} 을(를) '{confirm.label}' 형상 값으로 덮어씁니다. P1·P7 위치는 그대로 둡니다.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirm(null)} className="rounded-lg border border-gray-600 px-3 py-1.5 text-gray-300 hover:bg-gray-700">
                취소
              </button>
              <button
                onClick={() => apply(confirm.result, confirm.label)}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 font-medium text-white hover:bg-emerald-500"
              >
                덮어쓰기
              </button>
            </div>
          </div>
        </div>
      )}
    </span>
  );
}
