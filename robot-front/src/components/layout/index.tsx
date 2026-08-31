import React, { useState, useRef, useCallback, useEffect } from 'react';
import styles from './Footer.module.scss';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { ToggleSwitch_ToggleSwitch as ToggleSwitch } from '../common';
import { useLang } from '../../contexts';
import { getAutoLogoutMinutes } from '../../lib/appSettings';
import { APP_VERSION } from '../../lib';
import { isMockMode, mockChangeMode, mockCheckConnection } from '../../lib';
import { Axios as axios } from '../../lib';
import { setRobotMode, setAutoReconnect, getRealtimeRobotStatus, RealtimeRobotStatus, getRobotError, resetRobotError, RobotErrorData } from '../../lib';
import { getRobotAlarmMessage } from '../../lib/api';
import { Wifi, WifiOff, Home, AlertTriangle, RefreshCw } from 'lucide-react';
const footer: React.FC = () => {
  return (
    <>
      <footer className={styles.footer}>
        <div className={styles['footer-container']}>
          <div className={styles['footer-section']}>
            <h4 className={styles['footer-title']}>회사 정보</h4>
            <ul className={styles['footer-links']}>
              <li>
                <a href="/about">소개</a>
              </li>
              <li>
                <a href="/careers">채용</a>
              </li>
              <li>
                <a href="/contact">문의</a>
              </li>
            </ul>
          </div>
          <div className={styles['footer-section']}>
            <h4 className={styles['footer-title']}>고객 지원</h4>
            <ul className={styles['footer-links']}>
              <li>
                <a href="/faq">자주 묻는 질문</a>
              </li>
              <li>
                <a href="/support">1:1 문의</a>
              </li>
              <li>
                <a href="/terms">이용약관</a>
              </li>
              <li>
                <a href="/privacy">개인정보 처리방침</a>
              </li>
            </ul>
          </div>
          <div className={styles['footer-section']}>
            <h4 className={styles['footer-title']}>소셜 미디어</h4>
            <div className={styles['footer-social']}>
              <a href="https://facebook.com" target="_blank" rel="noreferrer">
                Facebook
              </a>
              <a href="https://instagram.com" target="_blank" rel="noreferrer">
                Instagram
              </a>
              <a href="https://twitter.com" target="_blank" rel="noreferrer">
                Twitter
              </a>
            </div>
          </div>
        </div>
        <div className={styles['footer-bottom']}>
          <p>&copy; 2025 MyCompany. All rights reserved.</p>
        </div>
      </footer>
    </>
  );
};
export const Footer = footer;
const PAGE_TITLE_KEYS: Record<string, string> = {
  '/': 'pageMain',
  '/menu': 'pageMain',
  '/dashboard': 'pageDashboard',
  '/cell-selection': 'pageCellSelection',
  '/jobs': 'pageJobs',
  '/robot-control': 'pageRobotControl',
  '/settings': 'pageSettings',
  '/settings/welding': 'pageWeldingSettings',
  '/settings/robot': 'pageRobotSettings',
  '/robot-test': 'pageRobotTest',
};
const Header: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLang();
  const titleKey = PAGE_TITLE_KEYS[location.pathname];
  const pageTitle = titleKey ? t(titleKey) : '';
  const [connText, setConnText] = React.useState<string>('연결 상태 확인중...');
  const [instanceCount, setInstanceCount] = React.useState<number | null>(null);
  const [isModeToggled, setIsModeToggled] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [robotStatus, setRobotStatus] = useState<RealtimeRobotStatus | null>(null);
  const [showDisconnected, setShowDisconnected] = useState(false);
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const failureCountRef = useRef(0);
  const FAILURE_THRESHOLD = 3;
  const [autoReconnectEnabled, setAutoReconnectEnabled] = useState(true);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [lastAttemptAt, setLastAttemptAt] = useState<Date | null>(null);
  const [reconnectPanelOpen, setReconnectPanelOpen] = useState(false);
  const needsAttention = connText === '연결 실패' || showDisconnected;
  const [robotError, setRobotError] = useState<RobotErrorData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isResettingError, setIsResettingError] = useState(false);
  const errorPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startPolling = useCallback(() => {
    if (pollingIntervalRef.current) return;
    setIsPolling(true);
    failureCountRef.current = 0;
    setShowDisconnected(false);
    getRealtimeRobotStatus().then(status => {
      setRobotStatus(status);
      if (status.connected) {
        failureCountRef.current = 0;
        setShowDisconnected(false);
      }
    });
    pollingIntervalRef.current = setInterval(async () => {
      const status = await getRealtimeRobotStatus();
      setRobotStatus(status);
      if (status.connected === false) {
        failureCountRef.current += 1;
        if (failureCountRef.current >= FAILURE_THRESHOLD) {
          setShowDisconnected(true);
        }
      } else {
        failureCountRef.current = 0;
        setShowDisconnected(false);
      }
    }, 1000);
  }, []);
  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    setIsPolling(false);
    setRobotStatus(null);
    failureCountRef.current = 0;
    setShowDisconnected(false);
  }, []);
  const fetchRobotError = useCallback(async () => {
    try {
      const error = await getRobotError();
      if (error?.has_error) {
        setRobotError(error);
      } else {
        setRobotError(null);
      }
    } catch {
    }
  }, []);
  const handleResetError = useCallback(async () => {
    setIsResettingError(true);
    try {
      await resetRobotError();
      setRobotError(null);
    } catch (err) {
      console.error('에러 초기화 실패:', err);
    } finally {
      setIsResettingError(false);
    }
  }, []);
  useEffect(() => {
    if (connText === '연결성공') {
      fetchRobotError();
      errorPollingRef.current = setInterval(fetchRobotError, 5000);
    } else {
      if (errorPollingRef.current) {
        clearInterval(errorPollingRef.current);
        errorPollingRef.current = null;
      }
      setRobotError(null);
    }
    return () => {
      if (errorPollingRef.current) {
        clearInterval(errorPollingRef.current);
        errorPollingRef.current = null;
      }
    };
  }, [connText, fetchRobotError]);
  useEffect(() => {
    if (robotError?.has_error && (robotError.main_code !== 0 || robotError.sub_code !== 0)) {
      setErrorMessage(getRobotAlarmMessage(robotError.main_code, robotError.sub_code));
    } else {
      setErrorMessage(null);
    }
  }, [robotError]);
  useEffect(() => {
    if (robotStatus?.robot_mode !== undefined) {
      setIsModeToggled(robotStatus.robot_mode === 1);
    }
  }, [robotStatus?.robot_mode]);
  const handleModeToggle = async (mode: boolean) => {
    const robotMode: 0 | 1 = mode === true ? 1 : 0;
    try {
      if (isMockMode()) {
        const res = await mockChangeMode(robotMode);
        if (res.status_code === 200) {
          setIsModeToggled(mode);
        }
      } else {
        const res = await setRobotMode(robotMode);
        const resultCode = res?.result ?? res?.data?.result;
        if (res?.status_code === 200 && resultCode === 0) {
          setIsModeToggled(mode);
          console.log(`모드 변경 성공: ${mode ? '수동' : '자동'} 모드`);
        } else {
          console.error('모드 변경 실패:', res);
        }
      }
    } catch (error) {
      console.error('Mode change failed:', error);
    }
  };
  const checkConnectionStatus = useCallback(async () => {
    try {
      if (isMockMode()) {
        const res = await mockCheckConnection();
        if (res.status_code === 200) {
          setConnText('Mock 연결');
          startPolling();
        } else {
          setConnText('연결 실패');
        }
      } else {
        const res = await axios.get('/robot_sdk/connection_status');
        const data = res.data?.data;
        if (data?.auto_reconnect !== undefined) {
          setAutoReconnectEnabled(data.auto_reconnect);
        }
        if (res.data?.status_code === 200 && data?.connected) {
          setConnText('연결성공');
          setInstanceCount(data?.instance_count ?? null);
          startPolling();
        } else {
          const connectRes = await axios.post('/robot_sdk/connect');
          const connectData = connectRes.data?.data;
          if (connectRes.data?.status_code === 200 && connectData?.success) {
            setConnText('연결성공');
            if (connectData?.instance_count) {
              setInstanceCount(connectData.instance_count);
            } else {
              const statusRes = await axios.get('/robot_sdk/connection_status');
              setInstanceCount(statusRes.data?.data?.instance_count ?? null);
            }
            startPolling();
          } else {
            setConnText('연결 실패');
            setInstanceCount(null);
          }
        }
      }
    } catch {
      setConnText('연결 실패');
    }
  }, [startPolling]);
  useEffect(() => {
    checkConnectionStatus();
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [checkConnectionStatus]);
  const handleManualReconnect = useCallback(async () => {
    setIsReconnecting(true);
    try {
      await checkConnectionStatus();
    } finally {
      setLastAttemptAt(new Date());
      setIsReconnecting(false);
    }
  }, [checkConnectionStatus]);
  useEffect(() => {
    if (!needsAttention) setReconnectPanelOpen(false);
  }, [needsAttention]);
  return (
    <>
      <header className={styles.header}>
        <div className={styles['header-container']}>
          {}
          <div className="flex items-center gap-3">
            {}
            <div
              className="flex flex-col items-start leading-none cursor-pointer"
              onClick={() => navigate('/menu')}
            >
              <span className="text-2xl font-bold text-cyan-400 hover:text-cyan-300 transition">
                The VoT
              </span>
              <span className="text-[10px] text-gray-500 font-mono mt-0.5">v{APP_VERSION}</span>
            </div>
            <div className="w-px h-5 bg-gray-600" />
            {}
            {isPolling ? (
              <div className="flex items-center gap-2 px-2 py-1 leading-none bg-green-500/10 border border-green-500/30 rounded-lg">
                <Wifi className="w-3 h-3 text-green-400" />
                <span className="text-xs leading-none text-green-400">{t('realtime')}</span>
                {showDisconnected && <span className="text-xs leading-none text-red-400">(미연결)</span>}
                <button
                  onClick={stopPolling}
                  className="ml-1 min-h-0 min-w-0 px-1.5 py-1 leading-none bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-xs transition"
                >
                  {t('release')}
                </button>
              </div>
            ) : (
              <button
                onClick={startPolling}
                className="flex items-center gap-1.5 min-h-0 min-w-0 px-2 py-1 leading-none bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-yellow-400 hover:bg-yellow-500/20 transition"
              >
                <WifiOff className="w-3 h-3" />
                <span className="text-xs leading-none">{t('realtimeConnect')}</span>
              </button>
            )}
            {}
            <label
              className="flex items-center gap-1.5 cursor-pointer select-none"
              title="로봇 자동 재연결 ON/OFF"
            >
              <input
                type="checkbox"
                checked={autoReconnectEnabled}
                onChange={async e => {
                  const enabled = e.target.checked;
                  setAutoReconnectEnabled(enabled);
                  try {
                    await setAutoReconnect(enabled);
                  } catch {
                    setAutoReconnectEnabled(!enabled);
                  }
                }}
                className="w-3.5 h-3.5 accent-cyan-500"
              />
              <span
                className={`text-xs ${autoReconnectEnabled ? 'text-cyan-400' : 'text-gray-500'}`}
              >
                {t('autoReconnect')}
              </span>
            </label>
            <div className="flex items-center gap-2">
              <span
                className={`text-xs ${
                  connText === '연결성공' || connText === 'Mock 연결'
                    ? 'text-green-400'
                    : connText === '연결 실패'
                    ? 'text-red-400'
                    : 'text-gray-300'
                }`}
              >
                {connText}
              </span>
              {instanceCount !== null && (
                <span
                  className={`text-xs px-1.5 py-0.5 rounded ${
                    instanceCount === 1
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-yellow-500/20 text-yellow-400'
                  }`}
                >
                  #{instanceCount}
                </span>
              )}
            </div>
            {}
            {needsAttention && (
              <div className="relative">
                <button
                  onClick={() => setReconnectPanelOpen(v => !v)}
                  className={`flex items-center gap-1 min-h-0 min-w-0 px-2 py-1 leading-none border rounded-lg text-xs transition ${
                    autoReconnectEnabled
                      ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/20'
                      : 'bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20'
                  }`}
                >
                  <AlertTriangle className="w-3 h-3" />
                  <span>{autoReconnectEnabled ? t('retrying') : t('needsAttention')}</span>
                </button>
                {reconnectPanelOpen && (
                  <div className="absolute top-full left-0 mt-2 w-64 p-3 bg-gray-800 border border-gray-600 rounded-lg shadow-lg z-50 text-xs text-gray-200">
                    <p className="mb-2 leading-relaxed">
                      {autoReconnectEnabled ? t('reconnectGuidanceAuto') : t('reconnectGuidanceManual')}
                    </p>
                    <div className="flex items-center justify-between mb-2 text-gray-400">
                      <span>{t('failCount')} {failureCountRef.current}</span>
                      {lastAttemptAt && <span>{lastAttemptAt.toLocaleTimeString()}</span>}
                    </div>
                    <button
                      onClick={handleManualReconnect}
                      disabled={isReconnecting}
                      className="w-full py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-600 text-white rounded transition"
                    >
                      {isReconnecting ? t('resetting') : t('reconnectNow')}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          {}
          {pageTitle && (
            <div className="absolute left-1/2 transform -translate-x-1/2">
              <h1 className="text-xl font-bold text-white">{pageTitle}</h1>
            </div>
          )}
          {}
          <div
            className={styles['header-actions']}
            style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 16, flexWrap: 'nowrap' }}
          >
            {}
            <button
              onClick={() => navigate('/menu')}
              className="flex items-center gap-1.5 px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded-lg text-white transition"
              style={{ flexShrink: 0 }}
            >
              <Home className="w-4 h-4" />
              <span className="text-sm">{t('menu')}</span>
            </button>
            {}
            {['/cell-selection', '/robot-control'].includes(location.pathname) && (
              <div className="flex items-center gap-1.5" style={{ transform: 'scale(0.75)', transformOrigin: 'left center' }}>
                <ToggleSwitch enabled={isModeToggled} onChange={handleModeToggle}></ToggleSwitch>
                <span
                  className={`text-sm font-medium ${
                    isModeToggled ? 'text-orange-400' : 'text-cyan-400'
                  }`}
                >
                  {isModeToggled ? '수동' : '자동'}
                </span>
              </div>
            )}
            {}
          </div>
        </div>
      </header>
      <button
        onClick={() => {
          if (!window.confirm('로그아웃 하시겠습니까?')) return;
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          localStorage.removeItem('gap_token');
          localStorage.removeItem('gap_user');
          window.location.href = '/login';
        }}
        style={{
          position: 'fixed', top: 12, right: 12, zIndex: 200,
          padding: '8px 14px', fontSize: 13, fontWeight: 'bold',
          background: '#475569', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer',
        }}
      >{t('logout')}</button>
      {}
      {robotError?.has_error && (
        <div className="bg-red-900/95 border-b border-red-500/50 px-4 py-2">
          <div className="max-w-screen-xl mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-wrap">
              <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
              {}
              {(robotError.main_code !== 0 || robotError.sub_code !== 0) && (
                <span className="text-red-400 font-medium text-sm">
                  로봇 에러 {robotError.main_code}-{robotError.sub_code}:{' '}
                  {errorMessage || '로딩 중...'}
                </span>
              )}
              {}
              {robotError.sdk_error && (
                <span className="text-orange-400 font-medium text-sm">
                  [SDK {robotError.sdk_error.code}] {robotError.sdk_error.description}
                  {robotError.sdk_error.solution && (
                    <span className="text-orange-300 text-xs ml-2">
                      ({robotError.sdk_error.solution})
                    </span>
                  )}
                </span>
              )}
            </div>
            <button
              onClick={handleResetError}
              disabled={isResettingError}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-500 disabled:bg-red-800 text-white text-sm font-medium rounded-lg flex items-center gap-2 transition flex-shrink-0"
            >
              <RefreshCw className={`w-4 h-4 ${isResettingError ? 'animate-spin' : ''}`} />
              {isResettingError ? t('resetting') : t('errorReset')}
            </button>
          </div>
        </div>
      )}
    </>
  );
};
export const Header_Header = Header;
const IDLE_CHECK_INTERVAL_MS = 10000;
const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'wheel'];
const Layout: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const hideHeaderFooter = location.pathname === '/login';
  const lastActivityRef = useRef(Date.now());
  useEffect(() => {
    if (hideHeaderFooter) return;
    const minutes = getAutoLogoutMinutes();
    if (!minutes || minutes <= 0) return;
    const timeoutMs = minutes * 60 * 1000;
    const resetActivity = () => {
      lastActivityRef.current = Date.now();
    };
    resetActivity();
    ACTIVITY_EVENTS.forEach(evt => window.addEventListener(evt, resetActivity, { passive: true }));
    const interval = setInterval(() => {
      if (Date.now() - lastActivityRef.current >= timeoutMs) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('gap_token');
        localStorage.removeItem('gap_user');
        window.dispatchEvent(new Event('gap-auth-expired'));
        navigate('/login');
      }
    }, IDLE_CHECK_INTERVAL_MS);
    return () => {
      ACTIVITY_EVENTS.forEach(evt => window.removeEventListener(evt, resetActivity));
      clearInterval(interval);
    };
  }, [hideHeaderFooter, navigate]);
  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {!hideHeaderFooter && <Header />}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
};
export const Layout_Layout = Layout;
