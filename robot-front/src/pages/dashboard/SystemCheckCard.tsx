// [v1.1.298] 대시보드 '시스템 점검' 카드.
// 작업자가 전화로 "빨간 줄이 DB 예요"처럼 알려 줄 수 있게, 프로그램 각 부분의 상태를 한 화면에 모은다.
// 코어(/system/health-check)가 로봇 연결·DB·저장 공간·USB·서비스를 알려 주고,
// robot-back·카메라 두 개는 화면이 각 프로그램에 직접 물어본다. 화면을 열 때와 [다시 점검] 때만 확인한다.
import React, { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, RefreshCw } from 'lucide-react';
import { APP_VERSION, getHealthCheck, HealthCheck } from '../../lib';
import { gapApi } from '../../lib/gapApi';
import { getCameraStatus } from '../../lib/cameraApi';

type Level = 'ok' | 'warn' | 'bad' | 'off';
interface Row { name: string; level: Level; text: string }

const LEVEL_STYLE: Record<Level, { dot: string; label: string; text: string }> = {
  ok: { dot: 'bg-green-400', label: '정상', text: 'text-green-300' },
  warn: { dot: 'bg-yellow-400', label: '주의', text: 'text-yellow-300' },
  bad: { dot: 'bg-red-500', label: '문제', text: 'text-red-300' },
  off: { dot: 'bg-gray-500', label: '-', text: 'text-gray-400' },
};

const fmtUptime = (sec: number) => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
};

async function blackflyConnected(): Promise<boolean | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 1500);
  try {
    const res = await fetch('http://127.0.0.1:8003/blackfly/status', { signal: ctrl.signal, cache: 'no-store' });
    const j = await res.json();
    return !!j?.connected;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// 카메라 줄: 서비스가 없으면 '설치 안 됨', 프로그램 응답이 없으면 꺼짐, 응답은 있는데 카메라가 없으면 주의
const cameraRow = (name: string, service: string | undefined, connected: boolean | null): Row => {
  if (service === 'not-found') return { name, level: 'off', text: '설치 안 됨 (이 펜던트는 사용 안 함)' };
  if (connected === null) {
    return service ? { name, level: 'bad', text: `프로그램 응답 없음 (서비스 ${service})` } : { name, level: 'off', text: '프로그램 없음' };
  }
  return connected ? { name, level: 'ok', text: '연결됨' } : { name, level: 'warn', text: '프로그램은 켜짐, 카메라 연결 안 됨 (선 확인)' };
};

function buildRows(h: HealthCheck | null, backOk: boolean, cam: boolean | null, bf: boolean | null): Row[] {
  const rows: Row[] = [];
  if (!h) {
    rows.push({ name: '로봇 프로그램(코어)', level: 'bad', text: '응답 없음 — 프로그램 종료 후 제어기 전원을 껐다 켜 주세요' });
  } else {
    rows.push({ name: '로봇 프로그램(코어)', level: 'ok', text: `정상 (켜진 지 ${fmtUptime(h.uptime_seconds)})` });
    rows.push(h.robot_connected
      ? { name: '로봇 컨트롤러', level: 'ok', text: '연결됨' }
      : { name: '로봇 컨트롤러', level: 'bad', text: '연결 안 됨 — 컨트롤러 전원·랜선 확인' });
    rows.push(h.db_ok
      ? { name: '데이터베이스(DB)', level: 'ok', text: '정상' }
      : { name: '데이터베이스(DB)', level: 'bad', text: `오류: ${h.db_error || '조회 실패'}` });
  }
  rows.push(backOk
    ? { name: '로그인·파라미터 서버', level: 'ok', text: '정상' }
    : { name: '로그인·파라미터 서버', level: 'bad', text: `응답 없음${h?.services?.['vot-back'] ? ` (서비스 ${h.services['vot-back']})` : ''}` });
  rows.push(cameraRow('Gemini 카메라', h?.services?.['vot-camera'], cam));
  rows.push(cameraRow('Blackfly 카메라', h?.services?.['vot-blackfly'], bf));
  if (h) {
    const free = h.disk_free_mb;
    if (free >= 0) {
      const gb = (mb: number) => (mb / 1024).toFixed(1);
      const text = `남은 ${gb(free)}GB / 전체 ${gb(h.disk_total_mb)}GB`;
      rows.push({ name: '저장 공간', level: free < 2048 ? 'bad' : free < 5120 ? 'warn' : 'ok', text: free < 2048 ? `${text} — 촬영 기록·로그를 USB 로 내보내 주세요` : text });
    }
    if (h.platform === 'Linux') {
      rows.push(h.usb_device
        ? { name: 'USB', level: 'ok', text: `인식됨 (${h.usb_device})` }
        : { name: 'USB', level: 'off', text: '꽂혀 있지 않음' });
    }
    rows.push(h.version === APP_VERSION
      ? { name: '버전', level: 'ok', text: APP_VERSION }
      : { name: '버전', level: 'warn', text: `화면 ${APP_VERSION} / 코어 ${h.version} — 업데이트가 덜 됨` });
    rows.push({ name: '기기 시각', level: 'off', text: `${h.time} (휴대폰 시각과 다르면 알려 주세요)` });
  }
  return rows;
}

export const SystemCheckCard: React.FC = () => {
  const [rows, setRows] = useState<Row[]>([]);
  const [checking, setChecking] = useState(false);
  const [checkedAt, setCheckedAt] = useState('');

  const runCheck = useCallback(async () => {
    setChecking(true);
    const [h, backOk, cam, bf] = await Promise.all([
      getHealthCheck().catch(() => null),
      gapApi.get('/health', { timeout: 2000 }).then(() => true).catch(() => false),
      getCameraStatus().then(s => (s ? !!s.connected : null)),
      blackflyConnected(),
    ]);
    setRows(buildRows(h, backOk, cam, bf));
    setCheckedAt(new Date().toLocaleTimeString('ko-KR', { hour12: false }));
    setChecking(false);
  }, []);

  useEffect(() => { void runCheck(); }, [runCheck]);

  const problems = rows.filter(r => r.level === 'bad').length;
  const warnings = rows.filter(r => r.level === 'warn').length;

  return (
    <div className="db-card bg-gray-800/60 backdrop-blur-sm rounded-2xl p-6 border border-gray-700/50">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-emerald-400" />
          시스템 점검
          <span className={`text-sm font-normal ml-2 ${problems ? 'text-red-300' : warnings ? 'text-yellow-300' : 'text-green-300'}`}>
            {checking && rows.length === 0 ? '점검 중...' : problems ? `문제 ${problems}개` : warnings ? `주의 ${warnings}개` : '모두 정상'}
          </span>
        </h2>
        <div className="flex items-center gap-3">
          {checkedAt && <span className="text-xs text-gray-500">{checkedAt} 점검</span>}
          <button
            onClick={() => void runCheck()}
            disabled={checking}
            className="flex items-center gap-1.5 px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded-lg text-gray-200 text-sm"
          >
            <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
            다시 점검
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1">
        {rows.map(r => {
          const st = LEVEL_STYLE[r.level];
          return (
            <div key={r.name} className="flex items-center gap-3 py-1.5 border-b border-gray-700/40">
              <div className={`w-3 h-3 rounded-full flex-shrink-0 ${st.dot}`} />
              <div className="w-40 flex-shrink-0 text-gray-300 text-sm">{r.name}</div>
              <div className={`text-sm ${st.text}`}>{r.text}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
