import React, { useState, useEffect } from 'react';
import { Settings, Mail, FileArchive, Cpu, AlertCircle, RefreshCw, CheckCircle, XCircle, Sliders, Shield, Globe, Clock, Moon, Sun, Bell, Bug, Download, Info, Users, User, Plus, Trash2, Edit, LogOut, X, Save, ChevronRight, History } from 'lucide-react';
import type { TouchSensingSettings, SystemConfig, RobotSettingsData, RobotErrorData, RobotErrorEvent, VersionInfo, UpdateCheckResponse, UpdateStatus, SystemInfo, UserData, UserFormData } from '..';
import { sendDiagnosticLogsEmail, downloadLogsZipUrl, updateRobotSettings, getRobotErrorHistory } from '../../../lib';
import { SettingsToggleRow } from '../../../components/common/index';
import { formatDateTime } from '../../../utils';
import { useNavigate } from 'react-router-dom';
import { useTheme, useLang, useUpdaterContext } from '../../../contexts';
import { setSoundEnabled, setAutoLogoutMinutes, setNotificationsEnabled } from '../../../lib/appSettings';
import { percent, displayProgress } from '../../../lib/updater';
import { RobotSdkToolsSection } from './RobotSdkToolsSection';

interface RobotSettingsTabProps {
  robotCoordSettings: RobotSettingsData;
  setRobotCoordSettings: React.Dispatch<React.SetStateAction<RobotSettingsData>>;
  robotError: RobotErrorData | null;
  loadingError: boolean;
  resettingError: boolean;
  onFetchRobotError: () => void;
  onResetError: () => void;
}
const RobotSettingsTab: React.FC<RobotSettingsTabProps> = ({
  robotCoordSettings,
  setRobotCoordSettings,
  robotError,
  loadingError,
  resettingError,
  onFetchRobotError,
  onResetError,
}) => {
  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold text-white flex items-center gap-2 mb-6">
        <Cpu className="w-6 h-6 text-cyan-400" />
        로봇 기본 설정
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <SettingsToggleRow
            label="충돌 감지"
            description="켜짐: 중간 감도 / 꺼짐: 최소 감도 (완전 비활성화 아님)"
            enabled={robotCoordSettings.collision_detection_enabled}
            onChange={enabled =>
              setRobotCoordSettings(prev => ({ ...prev, collision_detection_enabled: enabled }))
            }
          />
        </div>
      </div>
      {}
      <div className="mt-8 pt-6 border-t border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Settings className="w-5 h-5 text-orange-400" />
            좌표계 설정
          </h3>
        </div>
        <p className="text-gray-400 text-sm mb-4">
          현장 로봇의 도구/사용자 좌표계가 다를 경우 설정하세요. (예: toolcoord3 사용 시 → Tool: 3)
        </p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div>
            <label className="block text-gray-400 text-sm mb-2 font-medium">
              도구좌표계 (Tool)
            </label>
            <input
              type="number"
              min="0"
              max="14"
              value={robotCoordSettings.tool_num}
              onChange={e =>
                setRobotCoordSettings(prev => ({
                  ...prev,
                  tool_num: parseInt(e.target.value) || 0,
                }))
              }
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-xl text-white focus:border-orange-500 focus:outline-none"
            />
            <p className="text-xs text-gray-500 mt-1">0~14</p>
          </div>
          <div>
            <label className="block text-gray-400 text-sm mb-2 font-medium">
              사용자좌표계 (User)
            </label>
            <input
              type="number"
              min="0"
              max="14"
              value={robotCoordSettings.user_num}
              onChange={e =>
                setRobotCoordSettings(prev => ({
                  ...prev,
                  user_num: parseInt(e.target.value) || 0,
                }))
              }
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-xl text-white focus:border-orange-500 focus:outline-none"
            />
            <p className="text-xs text-gray-500 mt-1">0~14</p>
          </div>
          <div>
            <label className="block text-gray-400 text-sm mb-2 font-medium">기본 속도 (%)</label>
            <input
              type="number"
              min="0"
              max="100"
              value={robotCoordSettings.default_vel}
              onChange={e =>
                setRobotCoordSettings(prev => ({
                  ...prev,
                  default_vel: parseFloat(e.target.value) || 0,
                }))
              }
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-xl text-white focus:border-orange-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-gray-400 text-sm mb-2 font-medium">기본 가속도 (%)</label>
            <input
              type="number"
              min="0"
              max="100"
              value={robotCoordSettings.default_acc}
              onChange={e =>
                setRobotCoordSettings(prev => ({
                  ...prev,
                  default_acc: parseFloat(e.target.value) || 0,
                }))
              }
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-xl text-white focus:border-orange-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-gray-400 text-sm mb-2 font-medium">
              기본 오버라이드 (%)
            </label>
            <input
              type="number"
              min="0"
              max="100"
              value={robotCoordSettings.default_ovl}
              onChange={e =>
                setRobotCoordSettings(prev => ({
                  ...prev,
                  default_ovl: parseFloat(e.target.value) || 0,
                }))
              }
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-xl text-white focus:border-orange-500 focus:outline-none"
            />
          </div>
        </div>
      </div>
      {}
      <div className="mt-8 pt-6 border-t border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-400" />
            로봇 에러/알람 관리
          </h3>
          <button
            onClick={onFetchRobotError}
            disabled={loadingError}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-600 rounded-lg text-white text-sm transition flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loadingError ? 'animate-spin' : ''}`} />
            {loadingError ? '조회 중...' : '새로고침'}
          </button>
        </div>
        <p className="text-gray-400 text-sm mb-4">
          로봇에서 발생한 에러를 확인하고 초기화할 수 있습니다. 복구 가능한 에러만 초기화됩니다.
        </p>
        {}
        <div className="flex items-center justify-between bg-gray-800/50 rounded-xl p-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-500/20 rounded-lg flex items-center justify-center">
              <RefreshCw className="w-5 h-5 text-orange-400" />
            </div>
            <div>
              <div className="text-white font-medium">에러 자동 초기화</div>
              <div className="text-gray-400 text-xs mt-0.5">
                용접 중 에러 발생 시 자동으로 알람을 초기화합니다
              </div>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={robotCoordSettings.auto_clear_error}
              onChange={e => {
                const newValue = e.target.checked;
                setRobotCoordSettings(prev => ({ ...prev, auto_clear_error: newValue }));
                updateRobotSettings({ auto_clear_error: newValue }).catch(console.error);
              }}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
          </label>
        </div>
        {}
        <div className="flex items-center justify-between bg-gray-800/50 rounded-xl p-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
              <Sliders className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <div className="text-white font-medium">최소 위빙 거리</div>
              <div className="text-gray-400 text-xs mt-0.5">
                포인트 간 거리가 이 값보다 작으면 위빙이 비활성화됩니다
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={10}
              max={500}
              step={10}
              value={robotCoordSettings.min_weaving_distance}
              onChange={e => {
                const newValue = Math.max(10, Math.min(500, Number(e.target.value)));
                setRobotCoordSettings(prev => ({ ...prev, min_weaving_distance: newValue }));
              }}
              onBlur={e => {
                const newValue = Math.max(10, Math.min(500, Number(e.target.value)));
                updateRobotSettings({ min_weaving_distance: newValue }).catch(console.error);
              }}
              className="w-24 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-center focus:outline-none focus:border-purple-500"
            />
            <span className="text-gray-400 text-sm">mm</span>
          </div>
        </div>
        {}
        <div
          className={`rounded-xl p-5 border ${
            robotError?.has_error
              ? 'bg-red-500/10 border-red-500/30'
              : 'bg-green-500/10 border-green-500/30'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {robotError?.has_error ? (
                <div className="w-12 h-12 bg-red-500/20 rounded-xl flex items-center justify-center">
                  <AlertCircle className="w-6 h-6 text-red-400" />
                </div>
              ) : (
                <div className="w-12 h-12 bg-green-500/20 rounded-xl flex items-center justify-center">
                  <CheckCircle className="w-6 h-6 text-green-400" />
                </div>
              )}
              <div>
                <div
                  className={`text-lg font-medium ${robotError?.has_error ? 'text-red-400' : 'text-green-400'}`}
                >
                  {robotError ? (robotError.has_error ? '에러 발생' : '정상') : '상태 미확인'}
                </div>
                {robotError && (
                  <div className="text-gray-400 text-sm mt-1">
                    {robotError.has_error ? (
                      <>
                        <span className="font-mono">Main: {robotError.main_code}</span>
                        <span className="mx-2">|</span>
                        <span className="font-mono">Sub: {robotError.sub_code}</span>
                      </>
                    ) : (
                      robotError.message
                    )}
                  </div>
                )}
              </div>
            </div>
            {robotError?.has_error && (
              <button
                onClick={onResetError}
                disabled={resettingError}
                className="px-5 py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 rounded-xl text-white transition flex items-center gap-2 font-medium"
              >
                <XCircle className="w-5 h-5" />
                {resettingError ? '초기화 중...' : '에러 초기화'}
              </button>
            )}
          </div>
          {robotError?.has_error && robotError.message && (
            <div className="mt-4 pt-4 border-t border-red-500/20">
              <div className="text-sm text-red-300">{robotError.message}</div>
            </div>
          )}
        </div>
      </div>
      <RobotErrorHistorySection />
      <RobotSdkToolsSection />
    </div>
  );
};
const DAY_RANGE_OPTIONS = [7, 30, 90] as const;
const RobotErrorHistorySection: React.FC = () => {
  const [events, setEvents] = useState<RobotErrorEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState<number>(30);
  const load = async (range: number) => {
    setLoading(true);
    try {
      const data = await getRobotErrorHistory(range, 50, 0);
      setEvents(data);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load(days);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);
  const formatDuration = (sec: number | null) => {
    if (sec == null) return '-';
    if (sec < 60) return `${Math.round(sec)}초`;
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return `${m}분 ${s}초`;
  };
  return (
    <div className="mt-8 pt-6 border-t border-gray-700">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <History className="w-5 h-5 text-cyan-400" />
          에러 이력
        </h3>
        <div className="flex items-center gap-2">
          <div className="flex bg-gray-800 rounded-lg p-1">
            {DAY_RANGE_OPTIONS.map(opt => (
              <button
                key={opt}
                onClick={() => setDays(opt)}
                className={`px-3 py-1.5 rounded-md text-sm transition ${
                  days === opt ? 'bg-cyan-600 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                {opt}일
              </button>
            ))}
          </div>
          <button
            onClick={() => load(days)}
            disabled={loading}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-600 rounded-lg text-white text-sm transition flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>
      {events.length === 0 ? (
        <p className="text-gray-500 text-sm">
          {loading ? '조회 중...' : `최근 ${days}일간 기록된 에러가 없습니다.`}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-700">
                <th className="pb-2 pr-4 font-medium">발생 시각</th>
                <th className="pb-2 pr-4 font-medium">코드</th>
                <th className="pb-2 pr-4 font-medium">지속 시간</th>
                <th className="pb-2 font-medium">상태</th>
              </tr>
            </thead>
            <tbody>
              {events.map(ev => (
                <tr key={ev.id} className="border-b border-gray-800">
                  <td className="py-2 pr-4 text-gray-300 font-mono">{formatDateTime(ev.started_at)}</td>
                  <td className="py-2 pr-4 text-gray-300 font-mono">
                    {ev.main_code}
                    {ev.sub_code ? `-${ev.sub_code}` : ''}
                  </td>
                  <td className="py-2 pr-4 text-gray-300">{formatDuration(ev.duration_sec)}</td>
                  <td className="py-2">
                    {ev.ongoing ? (
                      <span className="text-red-400">진행 중</span>
                    ) : (
                      <span className="text-gray-500">해제됨</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
export const RobotSettingsTab_RobotSettingsTab = RobotSettingsTab;
