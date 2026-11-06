// [v1.1.289] 촬영 기록 USB 내보내기 버튼 (펜던트 전용).
// robot_camera 가 리눅스에서 돌 때만 보인다(노트북은 저장 폴더를 탐색기로 열면 됨).
// 실행하면 USB 연결 -> 복사 -> 크기 대조 -> 펜던트에서 삭제 -> USB 해제까지 robot_camera 가 처리한다.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getCameraExportStatus, startCameraExport, CameraExportStatus } from '../../../lib/cameraApi';

interface CameraExportButtonProps {
  disabled?: boolean;
}

const mb = (b?: number) => `${((b ?? 0) / (1024 * 1024)).toFixed(1)}MB`;

const PHASE_LABEL: Record<string, string> = {
  start: '준비 중',
  mount: 'USB 연결 중',
  copy: '복사 중',
  verify: 'USB 기록 확인 중',
  delete: '펜던트에서 삭제 중',
  unmount: 'USB 해제 중',
};

export function CameraExportButton({ disabled = false }: CameraExportButtonProps) {
  const [supported, setSupported] = useState(false);
  const [open, setOpen] = useState(false);
  const [st, setSt] = useState<CameraExportStatus | null>(null);
  const [startError, setStartError] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 버튼 표시 여부: robot_camera 가 리눅스에서 응답할 때만
  useEffect(() => {
    let alive = true;
    const check = async () => {
      const s = await getCameraExportStatus(false);
      if (alive) setSupported(!!s?.supported);
    };
    check();
    const timer = setInterval(check, 10000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const stopPoll = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  };
  useEffect(() => stopPoll, []);

  const refresh = useCallback(async (scan: boolean) => {
    const s = await getCameraExportStatus(scan);
    setSt(s);
    return s;
  }, []);

  // 팝업이 열려 있고 내보내는 중이 아니면 3초마다 USB·남은 기록 다시 확인 (USB 를 나중에 꽂는 경우)
  const runningNow = !!st?.running;
  useEffect(() => {
    if (!open || runningNow) return;
    const timer = setInterval(() => { void refresh(true); }, 3000);
    return () => clearInterval(timer);
  }, [open, runningNow, refresh]);

  const openPopup = async () => {
    setStartError('');
    setOpen(true);
    const s = await refresh(true);
    if (s?.running) startPoll();
  };

  const startPoll = () => {
    stopPoll();
    pollRef.current = setInterval(async () => {
      const s = await refresh(false);
      if (s && !s.running) {
        stopPoll();
        if (s.phase === 'done' || s.phase === 'error') {
          // 끝난 뒤 남은 파일 수 다시 계산
          const after = await getCameraExportStatus(true);
          if (after) setSt({ ...after, phase: s.phase, message: s.message, error: s.error });
        }
      }
    }, 1000);
  };

  const handleStart = async () => {
    setStartError('');
    const r = await startCameraExport();
    if (!r.ok) {
      setStartError(r.error ?? '시작 실패');
      return;
    }
    await refresh(false);
    startPoll();
  };

  if (!supported) return null;

  const running = !!st?.running;
  const pct = st && st.total_bytes > 0 ? Math.min(100, (st.done_bytes / st.total_bytes) * 100) : 0;
  const usbOk = !!st?.usb_device;
  const btn: React.CSSProperties = { padding: '12px 0', fontSize: 15, border: 'none', borderRadius: 8, cursor: 'pointer', color: '#fff' };

  return (
    <>
      <button
        onClick={openPopup}
        disabled={disabled}
        title={disabled ? '용접/DryRun 진행 중에는 사용할 수 없습니다' : '촬영 기록을 USB 로 옮기고 펜던트에서 지움'}
        style={{
          padding: '4px 8px', fontSize: 12, fontWeight: 600, borderRadius: 8, cursor: disabled ? 'not-allowed' : 'pointer',
          background: disabled ? 'rgba(55,65,81,0.4)' : 'rgba(59,130,246,0.2)', color: disabled ? '#6b7280' : '#93c5fd',
          border: `1px solid ${disabled ? 'rgba(75,85,99,0.4)' : 'rgba(59,130,246,0.35)'}`,
        }}
      >
        촬영 기록 USB 내보내기
      </button>
      {open && createPortal(
        <div onClick={() => !running && setOpen(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 300,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            width: 'min(440px, 92vw)', background: '#0f172a', border: '1px solid #334155', borderRadius: 14,
            padding: 18, color: '#e2e8f0', fontSize: 14,
          }}>
            <h2 style={{ margin: '0 0 12px', fontSize: 18 }}>촬영 기록 USB 내보내기</h2>
            {!st ? (
              <div style={{ color: '#94a3b8' }}>상태를 불러오는 중...</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div>USB: {usbOk ? <b style={{ color: '#86efac' }}>인식됨 ({st.usb_device})</b> : <b style={{ color: '#fca5a5' }}>없음 — USB 를 꽂아 주세요</b>}</div>
                {!running && st.pending_files !== undefined && (
                  <div>내보낼 기록: <b>{st.pending_files}개 파일, {mb(st.pending_bytes)}</b></div>
                )}
                {(running || st.phase === 'done' || st.phase === 'error') && st.total_files > 0 && (
                  <>
                    <div>{running ? PHASE_LABEL[st.phase] ?? st.phase : '결과'}: {st.done_files}/{st.total_files}개, {mb(st.done_bytes)}/{mb(st.total_bytes)}</div>
                    <div style={{ height: 10, background: '#1e293b', borderRadius: 5, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: '#3b82f6' }} />
                    </div>
                  </>
                )}
                {st.phase === 'done' && !running && (
                  <div style={{ color: '#86efac', fontWeight: 600 }}>
                    {st.message} (펜던트에서 {st.deleted_files}개 삭제, USB 의 vot-camera-export 폴더)
                  </div>
                )}
                {st.phase === 'error' && !running && <div style={{ color: '#fca5a5', fontWeight: 600 }}>{st.error}</div>}
                {startError && <div style={{ color: '#fca5a5', fontWeight: 600 }}>{startError}</div>}
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                  복사·확인이 끝난 파일만 펜던트에서 지웁니다. 끝날 때까지 USB 를 뽑지 마세요.
                </div>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 14 }}>
              <button onClick={() => setOpen(false)} disabled={running}
                style={{ ...btn, background: '#334155', opacity: running ? 0.5 : 1, cursor: running ? 'not-allowed' : 'pointer' }}
              >닫기</button>
              <button onClick={handleStart} disabled={running || !usbOk || !st?.pending_files}
                style={{
                  ...btn, fontWeight: 'bold', background: '#2b7ae6',
                  opacity: running || !usbOk || !st?.pending_files ? 0.5 : 1,
                  cursor: running || !usbOk || !st?.pending_files ? 'not-allowed' : 'pointer',
                }}
              >{running ? '내보내는 중...' : '내보내기'}</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
