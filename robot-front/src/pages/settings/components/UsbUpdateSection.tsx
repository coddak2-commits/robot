// [v1.1.300] 펜던트 USB 업데이트 (설정 > 업데이트, 코어가 리눅스일 때만 보임).
// USB 맨 위의 pendant-update-1.1.X.tar.gz 를 찾아 고르면, 코어가 복사·빌드·재시작까지 한다.
// 빌드 중에도 예전 프로그램이 돌고, 실패하면 원래대로 되돌린다. 재시작 동안은 응답이 없는 게 정상이다.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Usb, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
import { getUsbUpdateStatus, scanUsbUpdates, startUsbUpdate, UsbUpdateStatus, UsbUpdateFile } from '../../../lib';

const verNums = (v: string) => v.split('.').map(n => parseInt(n, 10) || 0);
const cmpVer = (a: string, b: string) => {
  const x = verNums(a);
  const y = verNums(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
};
const versionOfFile = (f: string) => f.replace(/^pendant-update-/, '').replace(/\.tar\.gz$/, '');

export const UsbUpdateSection: React.FC = () => {
  const [st, setSt] = useState<UsbUpdateStatus | null>(null);
  const [coreDown, setCoreDown] = useState(false);
  const [files, setFiles] = useState<UsbUpdateFile[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [polling, setPolling] = useState(false);
  const targetRef = useRef('');

  const refresh = useCallback(async () => {
    const s = await getUsbUpdateStatus();
    if (!s) {
      setCoreDown(true);
      return null;
    }
    setCoreDown(false);
    setSt(s);
    return s;
  }, []);

  // 처음 열 때: 업데이트가 진행 중이면 이어서 지켜본다
  useEffect(() => {
    void refresh().then(s => {
      if (s?.running) {
        targetRef.current = versionOfFile(s.file);
        setPolling(true);
      }
    });
  }, [refresh]);

  // 진행 중에는 2초마다 상태 확인. 끝나고 새 버전이 돌면 3초 뒤 화면을 새로 불러온다(새 화면 파일 적용)
  useEffect(() => {
    if (!polling) return;
    const timer = setInterval(async () => {
      const s = await refresh();
      if (!s || s.running) return;
      setPolling(false);
      if (s.phase === 'done' && (!targetRef.current || s.current_version === targetRef.current)) {
        setMessage({ ok: true, text: `업데이트 완료 (v${s.current_version}). 3초 뒤 화면을 새로 불러옵니다.` });
        setTimeout(() => window.location.reload(), 3000);
      } else if (s.phase === 'error') {
        setMessage({ ok: false, text: s.message });
      } else if (s.phase === 'done') {
        setMessage({ ok: false, text: `끝났다고 나오지만 지금 버전이 v${s.current_version} 입니다 (기대 v${targetRef.current}). 진행 기록을 확인해 주세요.` });
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [polling, refresh]);

  const handleScan = async () => {
    setScanning(true);
    setMessage(null);
    const r = await scanUsbUpdates();
    setScanning(false);
    if (!r.ok) {
      setFiles(null);
      setMessage({ ok: false, text: r.message ?? 'USB 확인 실패' });
      return;
    }
    setFiles(r.files);
    if (r.files.length === 0) setMessage({ ok: false, text: 'USB 맨 위에 pendant-update-1.1.X.tar.gz 파일이 없습니다.' });
  };

  const handleInstall = async (f: UsbUpdateFile) => {
    const cur = st?.current_version ?? '';
    const older = cur && cmpVer(f.version, cur) < 0;
    const ok = window.confirm(
      `v${cur} → v${f.version} 로 ${older ? '되돌립니다(이전 버전)' : '업데이트합니다'}.\n\n` +
      '빌드에 몇 분 걸리고, 끝나면 프로그램이 재시작되며 화면이 잠시 끊깁니다.\n' +
      '진행 중에는 전원을 끄지 마세요. 실패하면 원래 버전으로 되돌립니다.\n\n진행할까요?',
    );
    if (!ok) return;
    setMessage(null);
    const r = await startUsbUpdate(f.file);
    if (!r.ok) {
      setMessage({ ok: false, text: r.message || '시작 실패' });
      return;
    }
    targetRef.current = f.version;
    setFiles(null);
    setPolling(true);
    await refresh();
  };

  const running = polling || !!st?.running;
  const cur = st?.current_version ?? '';

  return (
    <div className="bg-gray-900/60 rounded-xl p-5 border border-emerald-700/30">
      <h3 className="text-lg font-medium text-emerald-300 mb-2 flex items-center gap-2">
        <Usb className="w-5 h-5" />
        USB 업데이트 (펜던트)
      </h3>
      <p className="text-gray-400 text-xs mb-4">
        USB 맨 위에 <code className="px-1 bg-gray-700 rounded text-cyan-300">pendant-update-1.1.X.tar.gz</code> 를 넣고
        꽂은 뒤 [USB 확인]. 현재 버전 <span className="text-white font-mono">v{cur || '---'}</span>
      </p>

      {running && (
        <div className="mb-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center gap-3">
          <RefreshCw className="w-5 h-5 text-blue-400 animate-spin flex-shrink-0" />
          <div className="text-blue-200 text-sm">
            {coreDown ? '프로그램 재시작 중... (잠시 응답이 없는 것이 정상입니다)' : st?.message || '진행 중'}
          </div>
        </div>
      )}

      {message && (
        <div className={`mb-3 p-3 rounded-lg flex items-center gap-2 text-sm ${message.ok
          ? 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-200'
          : 'bg-red-500/15 border border-red-500/40 text-red-200'}`}
        >
          {message.ok ? <CheckCircle className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
          {message.text}
        </div>
      )}

      {!running && (
        <button
          onClick={handleScan}
          disabled={scanning}
          className="px-4 py-2.5 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 rounded-lg text-white text-sm flex items-center gap-2"
        >
          <Usb className={`w-4 h-4 ${scanning ? 'animate-pulse' : ''}`} />
          {scanning ? 'USB 확인 중...' : 'USB 확인'}
        </button>
      )}

      {!running && files && files.length > 0 && (
        <div className="mt-3 space-y-2">
          {files.map(f => {
            const d = cur ? cmpVer(f.version, cur) : 1;
            const tag = d > 0 ? { t: '새 버전', c: 'text-emerald-300' } : d === 0 ? { t: '현재 버전', c: 'text-gray-400' } : { t: '이전 버전', c: 'text-yellow-300' };
            return (
              <div key={f.file} className="flex items-center gap-3 p-2.5 rounded-lg bg-gray-800/60 border border-gray-700/50">
                <span className="text-white font-mono text-sm">v{f.version}</span>
                <span className={`text-xs ${tag.c}`}>{tag.t}</span>
                <span className="text-xs text-gray-500">{(f.size / 1024).toFixed(0)}KB</span>
                <button
                  onClick={() => void handleInstall(f)}
                  className="ml-auto px-3 py-1.5 bg-cyan-700 hover:bg-cyan-600 rounded-lg text-white text-sm"
                >
                  설치
                </button>
              </div>
            );
          })}
        </div>
      )}

      {st && st.log_tail.length > 0 && (running || st.phase === 'error') && (
        <details className="mt-3" open={st.phase === 'error'}>
          <summary className="text-xs text-gray-400 cursor-pointer">진행 기록 (update.log)</summary>
          <pre className="mt-2 max-h-48 overflow-auto text-[11px] leading-4 text-gray-300 bg-black/40 p-2 rounded">
            {st.log_tail.join('\n')}
          </pre>
        </details>
      )}
    </div>
  );
};
