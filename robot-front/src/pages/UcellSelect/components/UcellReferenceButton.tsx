// [v1.1.310] U셀 기준 등록 버튼 (Gemini U셀 위치 대략 보정). 카메라가 연결돼 있을 때만 보인다.
// 터치 포인트를 티칭한 직후, 로봇 홈 + U셀을 건드리지 않은 상태에서 1회 누른다.
// 이후 터치센싱 때 기준 대비 U셀 이동만큼 포인트를 옮겨서 시작한다(touchSensing.ts).
import { useCallback, useEffect, useState } from 'react';
import { Crosshair } from 'lucide-react';
import { useAlert } from '../../../contexts';
import { getCameraStatus, getUcellAlignStatus, registerUcellReference } from '../../../lib/cameraApi';
import { getRealtimeRobotStatus } from '../../../lib/robotApi/index';

interface UcellReferenceButtonProps {
  jobId: number | null;
  jobName: string | null;
  points: Array<{ id: string; tcp?: { x: number; y: number; z: number } | null }>;
  disabled?: boolean;
}

const HOME_TOLERANCE_MM = 10;

export function UcellReferenceButton({ jobId, jobName, points, disabled = false }: UcellReferenceButtonProps) {
  const { show: showAlert } = useAlert();
  const [connected, setConnected] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refText, setRefText] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      const st = await getCameraStatus();
      if (alive) setConnected(!!st?.connected);
    };
    poll();
    const timer = setInterval(poll, 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const openDialog = useCallback(async () => {
    setOpen(true);
    const st = await getUcellAlignStatus();
    setRefText(st?.has_reference ? `${st.reference?.captured_at ?? ''}${st.reference?.job_name ? ` (${st.reference.job_name})` : ''}` : null);
  }, []);

  const handleRegister = useCallback(async () => {
    const home = points.find(p => p.id === 'home')?.tcp;
    if (home) {
      let tcp: number[] | null = null;
      try {
        tcp = (await getRealtimeRobotStatus())?.tcp ?? null;
      } catch {
        tcp = null;
      }
      if (!tcp) {
        showAlert('로봇 위치를 읽지 못했습니다. 로봇 연결을 확인하세요', { type: 'error' });
        return;
      }
      const d = Math.hypot(tcp[0] - home.x, tcp[1] - home.y, tcp[2] - home.z);
      if (d > HOME_TOLERANCE_MM) {
        showAlert(`로봇이 홈에서 ${d.toFixed(0)}mm 떨어져 있습니다. 홈으로 보낸 뒤 등록하세요`, { type: 'warning' });
        return;
      }
    }
    setBusy(true);
    const r = await registerUcellReference({ job_id: jobId, job_name: jobName });
    setBusy(false);
    if (r.ok) {
      showAlert(`U셀 기준 등록 완료 (깊이 점 ${r.points}개)`, { type: 'success' });
      setOpen(false);
    } else {
      showAlert(`기준 등록 실패: ${r.error ?? '알 수 없는 오류'}`, { type: 'error' });
    }
  }, [points, jobId, jobName, showAlert]);

  if (!connected) return null;

  return (
    <>
      <button
        onClick={openDialog}
        disabled={disabled || busy}
        className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border transition ${
          disabled || busy
            ? 'bg-gray-700/40 text-gray-500 border-gray-600/40 cursor-not-allowed'
            : 'bg-sky-500/20 text-sky-400 border-sky-500/30 hover:bg-sky-500/30'
        }`}
        title={disabled ? '용접/터치센싱 중에는 사용할 수 없습니다' : 'U셀 기준 등록 (카메라 위치 보정)'}
      >
        <Crosshair className="w-3.5 h-3.5" />
        U셀 기준
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => !busy && setOpen(false)}>
          <div className="w-96 rounded-xl border border-gray-600 bg-gray-800 p-4 text-sm text-gray-200" onClick={e => e.stopPropagation()}>
            <div className="mb-3 flex items-center gap-2 font-semibold text-white">
              <Crosshair className="w-4 h-4 text-sky-400" />
              U셀 기준 등록
            </div>
            <p className="mb-2 text-gray-300">터치 포인트를 티칭한 직후, 아래 상태에서 누르세요.</p>
            <ul className="mb-3 list-disc pl-5 text-gray-300">
              <li>로봇이 홈 위치</li>
              <li>U셀을 티칭한 자리에서 움직이지 않음</li>
            </ul>
            <p className="mb-4 text-xs text-gray-400">현재 기준: {refText ?? '없음'}</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setOpen(false)}
                disabled={busy}
                className="rounded-lg border border-gray-600 px-3 py-1.5 text-gray-300 hover:bg-gray-700"
              >
                취소
              </button>
              <button
                onClick={handleRegister}
                disabled={busy}
                className="rounded-lg bg-sky-600 px-3 py-1.5 font-medium text-white hover:bg-sky-500 disabled:opacity-50"
              >
                {busy ? '촬영 중...' : refText ? '기준 다시 등록' : '기준 등록'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
