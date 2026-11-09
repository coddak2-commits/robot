// [v1.1.283] 카메라 촬영 버튼. robot_camera 에 카메라가 연결돼 있을 때만 보인다.
// 누르면 실제 갭(시편 값)·메모를 입력하고 깊이+컬러를 저장한다 (camera_captures).
import { useCallback, useEffect, useState } from 'react';
import { Camera } from 'lucide-react';
import { useAlert } from '../../../contexts';
import { getCameraStatus, captureCamera, collectPointGaps } from '../../../lib/cameraApi';

interface CameraCaptureButtonProps {
  jobId: number | null;
  jobName: string | null;
  points: Array<{ id: string; isSaved: boolean; gap?: number }>;
  disabled?: boolean;
}

export function CameraCaptureButton({ jobId, jobName, points, disabled = false }: CameraCaptureButtonProps) {
  const { show: showAlert } = useAlert();
  const [connected, setConnected] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [gapText, setGapText] = useState('');
  const [note, setNote] = useState('');

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

  const handleCapture = useCallback(async () => {
    const gapTrim = gapText.trim();
    const gap = gapTrim === '' ? null : Number(gapTrim);
    if (gap !== null && (!Number.isFinite(gap) || gap < 0 || gap > 20)) {
      showAlert('실제 갭은 0~20 사이 숫자로 입력하세요 (비워 두면 저장 안 함)', { type: 'warning' });
      return;
    }
    setBusy(true);
    const result = await captureCamera({
      trigger: 'manual',
      job_id: jobId,
      job_name: jobName,
      gap_actual_mm: gap,
      part_gaps: collectPointGaps(points),
      note: note.trim() || undefined,
    });
    setBusy(false);
    if (result.ok) {
      const ratio = result.capture?.depth_valid_ratio;
      const ratioText = typeof ratio === 'number' ? `, 깊이 유효 ${(ratio * 100).toFixed(1)}%` : '';
      showAlert(`촬영 저장 완료 (번호 ${result.id}${ratioText})`, { type: 'success' });
      setOpen(false);
      setNote('');
    } else {
      showAlert(`촬영 실패: ${result.error ?? '알 수 없는 오류'}`, { type: 'error' });
    }
  }, [gapText, note, jobId, jobName, points, showAlert]);

  if (!connected) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={disabled || busy}
        className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border transition ${
          disabled || busy
            ? 'bg-gray-700/40 text-gray-500 border-gray-600/40 cursor-not-allowed'
            : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30'
        }`}
        title={disabled ? '용접/DryRun 진행 중에는 사용할 수 없습니다' : '카메라 촬영 (깊이+컬러 저장)'}
      >
        <Camera className="w-3.5 h-3.5" />
        카메라 촬영
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => !busy && setOpen(false)}>
          <div className="w-80 rounded-xl border border-gray-600 bg-gray-800 p-4 text-sm text-gray-200" onClick={e => e.stopPropagation()}>
            <div className="mb-3 flex items-center gap-2 font-semibold text-white">
              <Camera className="w-4 h-4 text-emerald-400" />
              카메라 촬영
            </div>
            <label className="mb-1 block text-xs text-gray-400">실제 갭 (mm, 시편 값 · 비워 두면 저장 안 함)</label>
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              value={gapText}
              onChange={e => setGapText(e.target.value)}
              className="mb-3 w-full rounded-lg border border-gray-600 bg-gray-700 px-2 py-1.5 text-white focus:border-emerald-500 focus:outline-none"
            />
            <label className="mb-1 block text-xs text-gray-400">메모 (선택)</label>
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              maxLength={200}
              className="mb-4 w-full rounded-lg border border-gray-600 bg-gray-700 px-2 py-1.5 text-white focus:border-emerald-500 focus:outline-none"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setOpen(false)}
                disabled={busy}
                className="rounded-lg border border-gray-600 px-3 py-1.5 text-gray-300 hover:bg-gray-700"
              >
                취소
              </button>
              <button
                onClick={handleCapture}
                disabled={busy}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {busy ? '촬영 중...' : '촬영'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
