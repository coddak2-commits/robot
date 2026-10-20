import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutDashboard, Cpu, ClipboardList, Settings, Target, FlaskConical, CheckSquare, Gamepad2, Power } from 'lucide-react';
import { useLang } from '../../contexts';
import { getSystemInfo, shutdownPendant, getApiBaseUrl } from '../../lib';
interface MenuItem {
  id: string;
  label: string;
  eng: string;
  icon: React.ElementType;
  path: string;
  color: string;
  onClick?: () => void;
}
// [v1.1.273] 펜던트 프로그램 종료 단계
// confirm: 확인창 / stopping: 요청 후 코어가 멈추길 기다림 / done: 전원 꺼도 됨 / error: 실패 안내
type ShutdownPhase = 'idle' | 'confirm' | 'stopping' | 'done' | 'error';
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
// 공용 axios 는 연결 실패 시 포트 재탐색·로그인 이동을 하므로 상태 확인은 fetch 로 직접 한다.
const isCoreAlive = async (): Promise<boolean> => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 1000);
  try {
    const res = await fetch(`${getApiBaseUrl()}/health`, { signal: ctrl.signal, cache: 'no-store' });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
};
const Main: React.FC = () => {
  const navigate = useNavigate();
  const { lang, t } = useLang();
  // [v1.1.273] 코어가 리눅스(정품 펜던트)일 때만 '프로그램 종료' 카드를 보인다.
  const [isPendant, setIsPendant] = useState(false);
  const [shutdownPhase, setShutdownPhase] = useState<ShutdownPhase>('idle');
  const [shutdownMessage, setShutdownMessage] = useState('');
  useEffect(() => {
    getSystemInfo()
      .then(info => setIsPendant(info?.platform === 'Linux'))
      .catch(() => setIsPendant(false));
  }, []);
  // 종료 요청 후 /health 가 응답하지 않을 때까지 기다린다(코어 정지). 이어서 robot-back·DB 정지와
  // sync 시간을 5초 더 둔 뒤 '전원을 꺼도 됩니다'를 띄운다. 60초 안에 안 멈추면 실패로 본다.
  const runShutdown = async () => {
    setShutdownPhase('stopping');
    try {
      const res = await shutdownPendant();
      if (res?.status_code !== 200) {
        setShutdownMessage(res?.data?.message || '종료 요청이 거부되었습니다.');
        setShutdownPhase('error');
        return;
      }
    } catch {
      setShutdownMessage('종료 요청을 보내지 못했습니다.');
      setShutdownPhase('error');
      return;
    }
    for (let i = 0; i < 60; i++) {
      await sleep(1000);
      if (!(await isCoreAlive())) {
        await sleep(5000);
        setShutdownPhase('done');
        return;
      }
    }
    setShutdownMessage('프로그램이 멈추지 않았습니다. 터미널에서 상태를 확인해 주세요.');
    setShutdownPhase('error');
  };
  const mainItems: MenuItem[] = [
    {
      id: 'pendant',
      label: '펜던트',
      eng: 'Pendant',
      icon: Gamepad2,
      path: '/pendant',
      color: 'from-sky-500 to-indigo-500',
    },
    {
      id: 'cell-selection',
      label: '용접부 선택',
      eng: 'Cell Selection',
      icon: Target,
      path: '/cell-selection',
      color: 'from-orange-500 to-red-500',
    },
    {
      id: 'dashboard',
      label: '대시보드',
      eng: 'Dashboard',
      icon: LayoutDashboard,
      path: '/dashboard',
      color: 'from-cyan-500 to-blue-500',
    },
    {
      id: 'jobs',
      label: '작업 관리',
      eng: 'Job Management',
      icon: ClipboardList,
      path: '/jobs',
      color: 'from-purple-500 to-pink-500',
    },
    {
      id: 'robot-control',
      label: '로봇 제어',
      eng: 'Robot Control',
      icon: Cpu,
      path: '/robot-control',
      color: 'from-green-500 to-emerald-500',
    },
    {
      id: 'promotions',
      label: '승격 요청',
      eng: 'Promotions',
      icon: CheckSquare,
      path: '/gap/promotions',
      color: 'from-amber-500 to-yellow-500',
    },
    {
      id: 'settings',
      label: '설정',
      eng: 'Settings',
      icon: Settings,
      path: '/settings',
      color: 'from-gray-500 to-slate-500',
    },
    ...(isPendant
      ? [{
          id: 'shutdown',
          label: '프로그램 종료',
          eng: 'Shut Down',
          icon: Power,
          path: '',
          color: 'from-red-600 to-rose-700',
          onClick: () => setShutdownPhase('confirm'),
        }]
      : []),
  ];
  // [v1.1.269] compact 메뉴 카드 높이를 화면 높이에 맞춰 두 줄로 채운다(170px 고정 -> (화면높이-200)/2).
  // [v1.1.268] compact 기준 1279x719 -> 1280x800 (정품 펜던트 FR-HMI 1280x800 화면에 맞춤)
  return (
    <div className="mn-root min-h-screen bg-black p-6">
      <style>{`@media (max-width: 1280px), (max-height: 800px) { .mn-root.mn-root { padding: 12px 12px 56px; } .mn-head.mn-head { margin-bottom: 12px; } .mn-head h1 { font-size: 28px; margin-bottom: 0; } .mn-grid.mn-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; } .mn-card.mn-card { min-height: calc((100vh - 200px) / 2); padding: 16px; gap: 14px; } .mn-icon.mn-icon { width: 80px; height: 80px; } .mn-foot.mn-foot { padding: 8px; } }`}</style>
      <div className="mn-head text-center mb-8">
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">{t('mainTitle')}</h1>
        <p className="text-gray-400">{t('mainSubtitle')}</p>
      </div>
      {}
      <div className="mn-grid grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6 max-w-5xl mx-auto">
        {mainItems.map(item => {
          const IconComponent = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => (item.onClick ? item.onClick() : navigate(item.path))}
              className={`
                mn-card relative overflow-hidden
                bg-gray-800/50 hover:bg-gray-700/50
                border-2 border-gray-700 hover:border-cyan-500/50
                rounded-3xl p-6 md:p-8
                transition-all duration-300
                touch-manipulation
                min-h-[180px] md:min-h-[220px]
                flex flex-col items-center justify-center gap-4
                group
              `}
            >
              {}
              <div
                className={`
                  absolute inset-0 opacity-0 group-hover:opacity-20
                  bg-gradient-to-br ${item.color}
                  transition-opacity duration-300
                `}
              />
              {}
              <div
                className={`
                  mn-icon w-16 h-16 md:w-20 md:h-20
                  rounded-2xl
                  bg-gradient-to-br ${item.color}
                  flex items-center justify-center
                  shadow-lg
                  group-hover:scale-110 transition-transform duration-300
                `}
              >
                <IconComponent className="w-8 h-8 md:w-10 md:h-10 text-white" />
              </div>
              {}
              <div className="text-center z-10">
                <div className="text-white font-bold text-lg md:text-xl mb-1">
                  {lang === 'en' ? item.eng : item.label}
                </div>
                <div className="text-gray-400 text-sm">{lang === 'en' ? item.label : item.eng}</div>
              </div>
            </button>
          );
        })}
      </div>
      {}
      {shutdownPhase !== 'idle' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="w-[480px] max-w-[90vw] rounded-2xl border border-gray-700 bg-gray-900 p-8 text-center">
            {shutdownPhase === 'confirm' && (
              <>
                <div className="text-2xl font-bold text-white mb-3">프로그램을 종료할까요?</div>
                <div className="text-gray-400 mb-6">종료 후 제어기 전원을 끄면 됩니다.<br />다시 쓰려면 제어기를 다시 켜야 합니다.</div>
                <div className="flex gap-4">
                  <button
                    onClick={() => setShutdownPhase('idle')}
                    className="flex-1 py-4 rounded-xl bg-gray-700 hover:bg-gray-600 text-white text-lg font-bold"
                  >
                    취소
                  </button>
                  <button
                    onClick={runShutdown}
                    className="flex-1 py-4 rounded-xl bg-red-600 hover:bg-red-500 text-white text-lg font-bold"
                  >
                    종료
                  </button>
                </div>
              </>
            )}
            {shutdownPhase === 'stopping' && (
              <>
                <div className="text-2xl font-bold text-white mb-3">종료 중...</div>
                <div className="text-gray-400">전원을 끄지 말고 기다려 주세요.</div>
              </>
            )}
            {shutdownPhase === 'done' && (
              <>
                <div className="text-2xl font-bold text-green-400 mb-3">종료 완료</div>
                <div className="text-white text-lg">제어기 전원을 꺼도 됩니다.</div>
              </>
            )}
            {shutdownPhase === 'error' && (
              <>
                <div className="text-2xl font-bold text-red-400 mb-3">종료하지 못했습니다</div>
                <div className="text-gray-300 mb-6">{shutdownMessage}</div>
                <button
                  onClick={() => setShutdownPhase('idle')}
                  className="w-full py-4 rounded-xl bg-gray-700 hover:bg-gray-600 text-white text-lg font-bold"
                >
                  닫기
                </button>
              </>
            )}
          </div>
        </div>
      )}
      {}
      <div className="mn-foot fixed bottom-0 left-0 right-0 bg-gray-900/90 border-t border-gray-800 p-4">
        <div className="flex items-center justify-center gap-8 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
            <span className="text-gray-400">{t('systemNormal')}</span>
          </div>
          <div className="text-gray-500">|</div>
          <div className="text-gray-400">
            {new Date().toLocaleString('ko-KR', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              weekday: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
export default Main;
