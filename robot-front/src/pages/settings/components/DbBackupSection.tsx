// [v1.1.301] 펜던트 DB 백업 (설정 > 업데이트, 코어가 리눅스일 때만 보임).
// 교시 작업·포인트·설정·작업내역을 USB 의 vot-db-backup 폴더에 저장한다(화면·디버그 로그는 구조만).
// 펜던트에도 최근 5개를 남긴다(~/vot/db-backup). 복원 기능은 다음에 따로 넣는다.
import React, { useState } from 'react';
import { Database, CheckCircle, AlertCircle } from 'lucide-react';
import { backupDbToUsb } from '../../../lib';

export const DbBackupSection: React.FC = () => {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const handleBackup = async () => {
    setBusy(true);
    setResult(null);
    const r = await backupDbToUsb();
    setBusy(false);
    setResult(r.ok
      ? { ok: true, text: `USB 저장 완료: vot-db-backup/${r.file} (${r.sizeKb ?? 0}KB). USB 를 뽑아도 됩니다.` }
      : { ok: false, text: r.message || '백업 실패' });
  };

  return (
    <div className="bg-gray-900/60 rounded-xl p-5 border border-cyan-700/30">
      <h3 className="text-lg font-medium text-cyan-300 mb-2 flex items-center gap-2">
        <Database className="w-5 h-5" />
        DB 백업 (펜던트)
      </h3>
      <p className="text-gray-400 text-xs mb-4">
        교시 작업·포인트·설정·작업내역을 USB 의 <code className="px-1 bg-gray-700 rounded text-cyan-300">vot-db-backup</code> 폴더에 저장합니다.
        화면 로그·디버그 로그는 빼고 저장합니다. 펜던트에도 최근 5개를 보관합니다. USB 를 먼저 꽂으세요.
      </p>
      {result && (
        <div className={`mb-3 p-3 rounded-lg flex items-center gap-2 text-sm ${result.ok
          ? 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-200'
          : 'bg-red-500/15 border border-red-500/40 text-red-200'}`}
        >
          {result.ok ? <CheckCircle className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
          {result.text}
        </div>
      )}
      <button
        onClick={handleBackup}
        disabled={busy}
        className="px-4 py-2.5 bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 rounded-lg text-white text-sm flex items-center gap-2"
      >
        <Database className={`w-4 h-4 ${busy ? 'animate-pulse' : ''}`} />
        {busy ? '백업 중...' : 'USB 로 DB 백업'}
      </button>
    </div>
  );
};
