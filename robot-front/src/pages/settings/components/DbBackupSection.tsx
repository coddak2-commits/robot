// [v1.1.301] 펜던트 DB 백업 (설정 > 업데이트, 코어가 리눅스일 때만 보임).
// 교시 작업·포인트·설정·작업내역을 USB 의 vot-db-backup 폴더에 저장한다(화면·디버그 로그는 구조만).
// 펜던트에도 최근 5개를 남긴다(~/vot/db-backup).
// [v1.1.302] 복원 추가. USB 또는 펜던트 보관본에서 고른다. 복원 전에 지금 DB 를 자동으로 백업하고,
// 실패하면 그 백업으로 되돌린다. 복원 중에는 프로그램이 잠시 꺼진다. 끝나면 화면을 새로 불러온다.
// [v1.1.303] 복원 확인을 window.prompt('복원' 입력) 대신 화면 안 확인 창(체크 + 버튼)으로 바꿈.
// 펜던트 키보드로는 한글을 칠 수 없고, USB 포트가 하나라 키보드를 꽂으면 USB 를 뽑아야 하며,
// Chromium 기본 입력 창은 터치로 취소가 안 됐다(2026-11-16).
import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Database, CheckCircle, AlertCircle, RotateCcw, RefreshCw } from 'lucide-react';
import { backupDbToUsb, scanDbRestore, startDbRestore, getDbRestoreStatus, DbRestoreFile, DbRestoreStatus } from '../../../lib';

// robot_welding_1.1.301_20261116_113701.sql.gz -> 2026-11-16 11:37
const fileTime = (f: string) => {
  const m = f.match(/_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})\d{2}\.sql\.gz$/);
  return m ? `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}` : f;
};

export const DbBackupSection: React.FC = () => {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [files, setFiles] = useState<DbRestoreFile[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [rst, setRst] = useState<DbRestoreStatus | null>(null);
  const [polling, setPolling] = useState(false);
  const [coreDown, setCoreDown] = useState(false);
  const [confirmFile, setConfirmFile] = useState<DbRestoreFile | null>(null);
  const [agreed, setAgreed] = useState(false);

  const refresh = useCallback(async () => {
    const s = await getDbRestoreStatus();
    if (!s) { setCoreDown(true); return null; }
    setCoreDown(false);
    setRst(s);
    return s;
  }, []);

  useEffect(() => {
    void refresh().then(s => { if (s?.running) setPolling(true); });
  }, [refresh]);

  useEffect(() => {
    if (!polling) return;
    const timer = setInterval(async () => {
      const s = await refresh();
      if (!s || s.running) return;
      setPolling(false);
      if (s.phase === 'done') {
        setResult({ ok: true, text: `복원 완료 (${s.file}). 3초 뒤 화면을 새로 불러옵니다.` });
        setTimeout(() => window.location.reload(), 3000);
      } else if (s.phase === 'error') {
        setResult({ ok: false, text: s.message });
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [polling, refresh]);

  const handleBackup = async () => {
    setBusy(true);
    setResult(null);
    const r = await backupDbToUsb();
    setBusy(false);
    setResult(r.ok
      ? { ok: true, text: `USB 저장 완료: vot-db-backup/${r.file} (${r.sizeKb ?? 0}KB). USB 를 뽑아도 됩니다.` }
      : { ok: false, text: r.message || '백업 실패' });
  };

  const handleScan = async () => {
    setScanning(true);
    setResult(null);
    const r = await scanDbRestore();
    setScanning(false);
    if (!r.ok) { setFiles(null); setResult({ ok: false, text: r.message ?? '확인 실패' }); return; }
    setFiles(r.files);
    if (r.files.length === 0) setResult({ ok: false, text: `복원할 백업이 없습니다.${r.usbMessage ? ` (USB: ${r.usbMessage})` : ''}` });
  };

  const openConfirm = (f: DbRestoreFile) => {
    setAgreed(false);
    setConfirmFile(f);
  };

  const handleRestore = async (f: DbRestoreFile) => {
    setConfirmFile(null);
    setResult(null);
    const r = await startDbRestore(f.source, f.file);
    if (!r.ok) { setResult({ ok: false, text: r.message || '시작 실패' }); return; }
    setFiles(null);
    setPolling(true);
    await refresh();
  };

  const running = polling || !!rst?.running;

  return (
    <div className="bg-gray-900/60 rounded-xl p-5 border border-cyan-700/30">
      <h3 className="text-lg font-medium text-cyan-300 mb-2 flex items-center gap-2">
        <Database className="w-5 h-5" />
        DB 백업·복원 (펜던트)
      </h3>
      <p className="text-gray-400 text-xs mb-4">
        교시 작업·포인트·설정·작업내역을 USB 의 <code className="px-1 bg-gray-700 rounded text-cyan-300">vot-db-backup</code> 폴더에 저장합니다.
        화면 로그·디버그 로그는 빼고 저장합니다. 펜던트에도 최근 5개를 보관합니다. USB 를 먼저 꽂으세요.
      </p>
      {running && (
        <div className="mb-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center gap-3">
          <RefreshCw className="w-5 h-5 text-blue-400 animate-spin flex-shrink-0" />
          <div className="text-blue-200 text-sm">
            {coreDown ? '복원 중... 프로그램이 잠시 꺼져 있습니다 (정상)' : rst?.message || '복원 중'}
          </div>
        </div>
      )}
      {result && (
        <div className={`mb-3 p-3 rounded-lg flex items-center gap-2 text-sm ${result.ok
          ? 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-200'
          : 'bg-red-500/15 border border-red-500/40 text-red-200'}`}
        >
          {result.ok ? <CheckCircle className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
          {result.text}
        </div>
      )}
      {!running && (
        <div className="flex gap-2">
          <button
            onClick={handleBackup}
            disabled={busy}
            className="px-4 py-2.5 bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 rounded-lg text-white text-sm flex items-center gap-2"
          >
            <Database className={`w-4 h-4 ${busy ? 'animate-pulse' : ''}`} />
            {busy ? '백업 중...' : 'USB 로 DB 백업'}
          </button>
          <button
            onClick={handleScan}
            disabled={scanning || busy}
            className="px-4 py-2.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded-lg text-gray-200 text-sm flex items-center gap-2"
          >
            <RotateCcw className={`w-4 h-4 ${scanning ? 'animate-spin' : ''}`} />
            {scanning ? '찾는 중...' : '복원할 백업 찾기'}
          </button>
        </div>
      )}
      {!running && files && files.length > 0 && (
        <div className="mt-3 space-y-2">
          {files.map(f => (
            <div key={`${f.source}/${f.file}`} className="flex items-center gap-3 p-2.5 rounded-lg bg-gray-800/60 border border-gray-700/50">
              <span className={`text-xs px-2 py-0.5 rounded ${f.source === 'usb' ? 'bg-emerald-700/40 text-emerald-200' : 'bg-gray-700 text-gray-300'}`}>
                {f.source === 'usb' ? 'USB' : '펜던트'}
              </span>
              <span className="text-white text-sm">{fileTime(f.file)}</span>
              <span className="text-xs text-gray-400 font-mono">v{f.version}</span>
              <span className="text-xs text-gray-500">{(f.size / 1024).toFixed(0)}KB</span>
              <button
                onClick={() => openConfirm(f)}
                className="ml-auto px-3 py-1.5 bg-red-700 hover:bg-red-600 rounded-lg text-white text-sm"
              >
                복원
              </button>
            </div>
          ))}
        </div>
      )}
      {confirmFile && createPortal(
        <div onClick={() => setConfirmFile(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 300,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            width: 'min(520px, 92vw)', background: '#0f172a', border: '1px solid #7f1d1d', borderRadius: 14,
            padding: 20, color: '#e2e8f0', fontSize: 15,
          }}>
            <h2 style={{ margin: '0 0 10px', fontSize: 19, color: '#fca5a5' }}>DB 복원</h2>
            <div style={{ marginBottom: 10 }}>
              <b>[{confirmFile.source === 'usb' ? 'USB' : '펜던트 보관본'}] {fileTime(confirmFile.file)}</b> 백업(v{confirmFile.version})으로
              DB 전체를 되돌립니다.
            </div>
            <ul style={{ margin: '0 0 14px', paddingLeft: 18, color: '#cbd5e1', fontSize: 14, lineHeight: 1.6 }}>
              <li>그 시각 이후에 저장한 교시·설정·작업내역은 사라집니다</li>
              <li>복원 전 DB 는 자동으로 따로 백업합니다 (실패하면 그걸로 되돌림)</li>
              <li>복원 중 프로그램이 잠시 꺼집니다. 전원을 끄지 마세요</li>
            </ul>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px', background: '#1e293b', borderRadius: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} style={{ width: 24, height: 24 }} />
              <span>위 내용을 확인했습니다</span>
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 16 }}>
              <button onClick={() => setConfirmFile(null)}
                style={{ padding: '14px 0', fontSize: 16, border: 'none', borderRadius: 8, background: '#334155', color: '#fff', cursor: 'pointer' }}
              >취소</button>
              <button onClick={() => void handleRestore(confirmFile)} disabled={!agreed}
                style={{
                  padding: '14px 0', fontSize: 16, fontWeight: 'bold', border: 'none', borderRadius: 8, color: '#fff',
                  background: '#b91c1c', opacity: agreed ? 1 : 0.4, cursor: agreed ? 'pointer' : 'not-allowed',
                }}
              >복원 진행</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
      {rst && rst.log_tail.length > 0 && (running || rst.phase === 'error') && (
        <details className="mt-3" open={rst.phase === 'error'}>
          <summary className="text-xs text-gray-400 cursor-pointer">복원 기록 (restore.log)</summary>
          <pre className="mt-2 max-h-48 overflow-auto text-[11px] leading-4 text-gray-300 bg-black/40 p-2 rounded">
            {rst.log_tail.join('\n')}
          </pre>
        </details>
      )}
    </div>
  );
};
