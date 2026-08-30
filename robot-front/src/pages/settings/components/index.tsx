import React, { useState, useEffect } from 'react';
import { Settings, Mail, FileArchive, Cpu, AlertCircle, RefreshCw, CheckCircle, XCircle, Sliders, Shield, Globe, Clock, Moon, Sun, Bell, Bug, Download, Info, Users, User, Plus, Trash2, Edit, LogOut, X, Save, ChevronRight } from 'lucide-react';
import type { TouchSensingSettings, SystemConfig, RobotSettingsData, RobotErrorData, VersionInfo, UpdateCheckResponse, UpdateStatus, SystemInfo, UserData, UserFormData } from '..';
import { sendDiagnosticLogsEmail, downloadLogsZipUrl, updateRobotSettings } from '../../../lib';
import { SettingsToggleRow } from '../../../components/common/index';
import { formatDateTime } from '../../../utils';
import { useNavigate } from 'react-router-dom';
import { useTheme, useLang, useUpdaterContext } from '../../../contexts';
import { setSoundEnabled, setAutoLogoutMinutes, setNotificationsEnabled } from '../../../lib/appSettings';
import { percent, displayProgress } from '../../../lib/updater';
interface ArcTrackingSectionProps {
  settings: TouchSensingSettings;
  updateTouch: (field: keyof TouchSensingSettings, value: boolean | number) => void;
}
const ArcTrackingDetails: React.FC<ArcTrackingSectionProps> = ({ settings, updateTouch }) => (
  <div
    className="grid grid-cols-1 md:grid-cols-2 gap-6"
    data-audit="dup"
    data-audit-note="중복: 아크 트래킹 설정 — /settings 와 /settings/welding(SequenceTab)가 동일 welding_config 편집"
    data-audit-loc="src/pages/settings/components/ArcTrackingSection.tsx:18"
  >
    {}
    <div className="bg-gray-800/50 rounded-xl p-4 space-y-3">
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={settings.arc_tracking_left_right}
          onChange={e => updateTouch('arc_tracking_left_right', e.target.checked)}
          className="w-5 h-5 rounded border-gray-600 bg-gray-700 text-orange-500 focus:ring-orange-500 focus:ring-offset-gray-800"
        />
        <span className="text-white font-medium">좌우 보정</span>
      </label>
      {settings.arc_tracking_left_right && (
        <div className="pl-8 space-y-3">
          <NumberInput
            label="감도 계수 (Klr)"
            value={settings.arc_tracking_klr}
            onChange={v => updateTouch('arc_tracking_klr', v)}
            step={0.01}
            min={0.01}
            max={1}
            hint="0.01~1.0 (클수록 민감)"
            color="orange"
          />
          <NumberInput
            label="최대 스텝 (mm)"
            value={settings.arc_tracking_step_max_lr}
            onChange={v => updateTouch('arc_tracking_step_max_lr', v)}
            step={0.5}
            min={0.5}
            max={20}
            hint="한 스텝당 최대 보정량"
            color="orange"
          />
          <NumberInput
            label="총 최대 보정량 (mm)"
            value={settings.arc_tracking_sum_max_lr}
            onChange={v => updateTouch('arc_tracking_sum_max_lr', v)}
            step={1}
            min={5}
            max={100}
            hint="누적 최대 보정량"
            color="orange"
          />
        </div>
      )}
    </div>
    {}
    <div className="bg-gray-800/50 rounded-xl p-4 space-y-3">
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={settings.arc_tracking_up_down}
          onChange={e => updateTouch('arc_tracking_up_down', e.target.checked)}
          className="w-5 h-5 rounded border-gray-600 bg-gray-700 text-orange-500 focus:ring-orange-500 focus:ring-offset-gray-800"
        />
        <span className="text-white font-medium">상하 보정</span>
      </label>
      {settings.arc_tracking_up_down && (
        <div className="pl-8 space-y-3">
          <NumberInput
            label="감도 계수 (Kud)"
            value={settings.arc_tracking_kud}
            onChange={v => updateTouch('arc_tracking_kud', v)}
            step={0.01}
            min={0.01}
            max={1}
            hint="0.01~1.0 (클수록 민감)"
            color="orange"
          />
          <NumberInput
            label="최대 스텝 (mm)"
            value={settings.arc_tracking_step_max_ud}
            onChange={v => updateTouch('arc_tracking_step_max_ud', v)}
            step={0.5}
            min={0.5}
            max={20}
            hint="한 스텝당 최대 보정량"
            color="orange"
          />
          <NumberInput
            label="총 최대 보정량 (mm)"
            value={settings.arc_tracking_sum_max_ud}
            onChange={v => updateTouch('arc_tracking_sum_max_ud', v)}
            step={1}
            min={5}
            max={100}
            hint="누적 최대 보정량"
            color="orange"
          />
        </div>
      )}
    </div>
  </div>
);
const ArcTrackingSection: React.FC<ArcTrackingSectionProps> = ({ settings, updateTouch }) => (
  <div className="mt-8 pt-6 border-t border-gray-700">
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-lg font-semibold text-white flex items-center gap-2">
        <Settings className="w-5 h-5 text-orange-400" />
        아크 트래킹 설정
      </h3>
    </div>
    <p className="text-gray-400 text-sm mb-4">용접 중 실시간 용접선 추적 보정 기능을 설정합니다.</p>
    {}
    <div className="flex items-center justify-between bg-gray-800/50 rounded-xl p-4 mb-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-orange-500/20 rounded-lg flex items-center justify-center">
          <Settings className="w-5 h-5 text-orange-400" />
        </div>
        <div>
          <div className="text-white font-medium">아크 트래킹 사용</div>
          <div className="text-gray-400 text-xs mt-0.5">용접 중 실시간 용접선 추적 보정</div>
        </div>
      </div>
      <label className="relative inline-flex items-center cursor-pointer">
        <input
          type="checkbox"
          checked={settings.arc_tracking_enabled}
          onChange={e => updateTouch('arc_tracking_enabled', e.target.checked)}
          className="sr-only peer"
        />
        <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
      </label>
    </div>
    {settings.arc_tracking_enabled && (
      <ArcTrackingDetails settings={settings} updateTouch={updateTouch} />
    )}
  </div>
);
export const ArcTrackingSection_ArcTrackingSection = ArcTrackingSection;
const LS_LOG_EMAIL = 'vot.diagnosticLogs.recipient';
const LS_LOG_AUTO = 'vot.diagnosticLogs.autoSendOnError';
const LS_LOG_DAYS = 'vot.diagnosticLogs.days';
const LS_LOG_MAX = 'vot.diagnosticLogs.maxFiles';
const DEFAULT_RECIPIENT = 'coddak2@gmail.com';
const DiagnosticLogsSection: React.FC = () => {
  const [logRecipient, setLogRecipient] = useState<string>(
    () => localStorage.getItem(LS_LOG_EMAIL) || DEFAULT_RECIPIENT,
  );
  const [autoSendOnError, setAutoSendOnError] = useState<boolean>(
    () => localStorage.getItem(LS_LOG_AUTO) === '1',
  );
  const [logDays, setLogDays] = useState<number>(() => {
    const v = parseInt(localStorage.getItem(LS_LOG_DAYS) || '7', 10);
    return Number.isFinite(v) && v > 0 ? v : 7;
  });
  const [logMaxFiles, setLogMaxFiles] = useState<number>(() => {
    const v = parseInt(localStorage.getItem(LS_LOG_MAX) || '1', 10);
    return Number.isFinite(v) && v > 0 ? v : 1;
  });
  const [logNote, setLogNote] = useState<string>('');
  const [sendingLog, setSendingLog] = useState(false);
  const [logResult, setLogResult] = useState<{ ok: boolean; msg: string } | null>(null);
  useEffect(() => {
    localStorage.setItem(LS_LOG_EMAIL, logRecipient);
  }, [logRecipient]);
  useEffect(() => {
    localStorage.setItem(LS_LOG_AUTO, autoSendOnError ? '1' : '0');
  }, [autoSendOnError]);
  useEffect(() => {
    localStorage.setItem(LS_LOG_DAYS, String(logDays));
  }, [logDays]);
  useEffect(() => {
    localStorage.setItem(LS_LOG_MAX, String(logMaxFiles));
  }, [logMaxFiles]);
  const handleSendLogs = async () => {
    setSendingLog(true);
    setLogResult(null);
    const res = await sendDiagnosticLogsEmail(logRecipient, logDays, logNote, logMaxFiles);
    setLogResult({ ok: res.ok, msg: res.ok ? '이메일 발송 성공' : res.message || '발송 실패' });
    setSendingLog(false);
  };
  return (
    <div className="bg-gray-900/60 rounded-xl p-5 border border-purple-700/30">
      <h3 className="text-lg font-medium text-purple-300 mb-3 flex items-center gap-2">
        <Mail className="w-5 h-5" />
        진단 로그 발송
      </h3>
      <p className="text-gray-400 text-xs mb-4">
        robot_core 로그(.log)를 zip으로 묶어 지정 이메일로 발송하거나 직접 다운로드.
        <br />
        <span className="text-purple-300">SMTP:</span> 서버 config.ini의 [smtp] 설정 사용
      </p>
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">받을 이메일</label>
          <input
            type="email"
            value={logRecipient}
            onChange={e => setLogRecipient(e.target.value)}
            placeholder="example@domain.com"
            className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm focus:border-purple-500 focus:outline-none"
          />
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="block text-xs text-gray-400 mb-1">최근 파일</label>
            <input
              type="number"
              min={1}
              max={20}
              value={logMaxFiles}
              onChange={e =>
                setLogMaxFiles(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))
              }
              className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm focus:border-purple-500 focus:outline-none"
            />
            <p className="text-[10px] text-gray-500 mt-0.5">최신 N개</p>
          </div>
          <div className="flex-1">
            <label className="block text-xs text-gray-400 mb-1">기간(일)</label>
            <input
              type="number"
              min={1}
              max={30}
              value={logDays}
              onChange={e => setLogDays(Math.max(1, Math.min(30, parseInt(e.target.value) || 7)))}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm focus:border-purple-500 focus:outline-none"
            />
            <p className="text-[10px] text-gray-500 mt-0.5">이내</p>
          </div>
          <div className="flex-[3]">
            <label className="block text-xs text-gray-400 mb-1">메모 (선택)</label>
            <input
              type="text"
              value={logNote}
              onChange={e => setLogNote(e.target.value)}
              placeholder="예: 우측 세로 용접 멈춤 보고"
              className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm focus:border-purple-500 focus:outline-none"
            />
          </div>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={autoSendOnError}
            onChange={e => setAutoSendOnError(e.target.checked)}
            className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-purple-500 focus:ring-purple-500"
          />
          <span className="text-sm text-gray-200">오류 발생 시 자동으로 이메일 발송</span>
        </label>
        <div className="flex gap-2 pt-1">
          <button
            onClick={handleSendLogs}
            disabled={sendingLog || !logRecipient}
            className="flex-1 px-4 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:opacity-50 rounded-lg text-white text-sm transition flex items-center justify-center gap-2"
          >
            <Mail className="w-4 h-4" />
            {sendingLog ? '발송 중...' : '지금 발송'}
          </button>
          <a
            href={downloadLogsZipUrl(logDays)}
            download
            className="px-4 py-2.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-gray-200 text-sm transition flex items-center gap-2"
          >
            <FileArchive className="w-4 h-4" />
            zip 다운로드
          </a>
        </div>
        {logResult && (
          <div
            className={`text-xs px-3 py-2 rounded-lg ${
              logResult.ok
                ? 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-200'
                : 'bg-red-500/15 border border-red-500/40 text-red-200'
            }`}
          >
            {logResult.msg}
          </div>
        )}
      </div>
    </div>
  );
};
export const DiagnosticLogsSection_DiagnosticLogsSection = DiagnosticLogsSection;
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
    </div>
  );
};
export const RobotSettingsTab_RobotSettingsTab = RobotSettingsTab;
export interface StatusCardProps {
  icon: React.ReactNode;
  bgColor: string;
  value: string;
  valueColor?: string;
  label: string;
}
export const StatusCard: React.FC<StatusCardProps> = ({
  icon, bgColor, value, valueColor = 'text-white', label,
}) => (
  <div className="bg-gray-800/60 backdrop-blur-sm rounded-2xl p-4 border border-gray-700/50">
    <div className="flex items-center gap-3">
      <div className={`w-12 h-12 ${bgColor} rounded-xl flex items-center justify-center`}>
        {icon}
      </div>
      <div>
        <div className={`text-lg font-bold ${valueColor}`}>{value}</div>
        <div className="text-gray-400 text-sm">{label}</div>
      </div>
    </div>
  </div>
);
export const StatusCard_StatusCard = StatusCard;
interface SystemEnvTabProps {
  config: SystemConfig;
  setConfig: React.Dispatch<React.SetStateAction<SystemConfig | null>>;
  debugMode: boolean;
  onDebugToggle: () => void;
}
const SystemEnvTab: React.FC<SystemEnvTabProps> = ({
  config,
  setConfig,
  debugMode,
  onDebugToggle,
}) => {
  const { setTheme } = useTheme();
  const { setLang, t } = useLang();
  const updatePref = (field: string, value: unknown) => {
    setConfig(prev =>
      prev ? { ...prev, systemPreferences: { ...prev.systemPreferences, [field]: value } } : null,
    );
  };
  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold text-white flex items-center gap-2 mb-6">
        <Shield className="w-6 h-6 text-cyan-400" />
        {t('tabSystem')}
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <label className="block text-gray-400 text-sm mb-2 font-medium flex items-center gap-1">
              <Globe className="w-4 h-4" />
              {t('language')}
            </label>
            <select
              value={config.systemPreferences.language}
              onChange={e => {
                const next = e.target.value as 'ko' | 'en';
                updatePref('language', next);
                setLang(next);
              }}
              className="w-full px-4 py-4 bg-gray-900 border border-gray-700 rounded-xl text-white focus:border-cyan-500 focus:outline-none text-lg"
            >
              <option value="ko">한국어</option>
              <option value="en">English</option>
            </select>
          </div>
          <div>
            <label className="block text-gray-400 text-sm mb-2 font-medium flex items-center gap-1">
              <Clock className="w-4 h-4" />
              자동 로그아웃 (분)
            </label>
            <input
              type="number"
              value={config.systemPreferences.autoLogoutMinutes}
              onChange={e => {
                const next = Number(e.target.value);
                updatePref('autoLogoutMinutes', next);
                setAutoLogoutMinutes(next);
              }}
              className="w-full px-4 py-4 bg-gray-900 border border-gray-700 rounded-xl text-white focus:border-cyan-500 focus:outline-none text-lg"
              min="1"
            />
          </div>
        </div>
        <div className="space-y-4">
          <div className="bg-gray-900/60 rounded-xl p-5 border border-gray-700/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {config.systemPreferences.theme === 'dark' ? (
                  <Moon className="w-6 h-6 text-cyan-400" />
                ) : (
                  <Sun className="w-6 h-6 text-yellow-400" />
                )}
                <div>
                  <div className="text-white font-medium text-lg">{t('theme')}</div>
                  <div className="text-gray-400 text-sm">
                    {config.systemPreferences.theme === 'dark' ? t('darkMode') : t('lightMode')}
                  </div>
                </div>
              </div>
              <button
                onClick={() => {
                  const next = config.systemPreferences.theme === 'dark' ? 'light' : 'dark';
                  updatePref('theme', next);
                  setTheme(next);
                }}
                className={`w-16 h-9 rounded-full transition ${
                  config.systemPreferences.theme === 'dark' ? 'bg-cyan-600' : 'bg-gray-600'
                }`}
              >
                <div
                  className={`w-7 h-7 bg-white rounded-full transition-transform ${
                    config.systemPreferences.theme === 'dark' ? 'translate-x-8' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>
          <SettingsToggleRow
            label={t('notifications')}
            description={t('notificationsDesc')}
            enabled={config.systemPreferences.notificationsEnabled}
            onChange={enabled => {
              updatePref('notificationsEnabled', enabled);
              setNotificationsEnabled(enabled);
            }}
            icon={<Bell className="w-6 h-6" />}
          />
          <SettingsToggleRow
            label={t('soundEffect')}
            description={t('soundEffectDesc')}
            enabled={config.systemPreferences.soundEnabled}
            onChange={enabled => {
              updatePref('soundEnabled', enabled);
              setSoundEnabled(enabled);
            }}
            icon={<Settings className="w-6 h-6" />}
          />
          {}
          <div className="bg-gray-900/60 rounded-xl p-5 border border-green-700/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Bug className="w-6 h-6 text-green-400" />
                <div>
                  <div className="text-white font-medium text-lg">{t('debugMode')}</div>
                  <div className="text-gray-400 text-sm">Ctrl + 우클릭으로 className 복사</div>
                </div>
              </div>
              <button
                onClick={onDebugToggle}
                className={`w-16 h-9 rounded-full transition ${
                  debugMode ? 'bg-green-600' : 'bg-gray-600'
                }`}
              >
                <div
                  className={`w-7 h-7 bg-white rounded-full transition-transform ${
                    debugMode ? 'translate-x-8' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
export const SystemEnvTab_SystemEnvTab = SystemEnvTab;
interface TouchSensingSectionProps {
  settings: TouchSensingSettings;
  updateTouch: (field: keyof TouchSensingSettings, value: boolean | number) => void;
}
const NumberInput: React.FC<{
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  hint: string;
  color: 'yellow' | 'orange';
}> = ({ label, value, onChange, min, max, step, hint, color }) => (
  <div>
    <label className="block text-gray-400 text-sm mb-2 font-medium">{label}</label>
    <input
      type="number"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={e => onChange(parseFloat(e.target.value) || min)}
      className={`w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-xl text-white focus:border-${color}-500 focus:outline-none`}
    />
    <p className="text-xs text-gray-500 mt-1">{hint}</p>
  </div>
);
const TouchSensingParams: React.FC<TouchSensingSectionProps> = ({ settings, updateTouch }) => (
  <div
    className="grid grid-cols-2 md:grid-cols-3 gap-4"
    data-audit="dup"
    data-audit-note="중복+일부미사용: 터치센싱 — /settings 와 /settings/welding(SequenceTab) 분산. 실행은 SequenceTab의 touch_speed를 읽고 여기 velocity/accel/step/angle/retract/move/search 필드는 사장됨(미참조)"
    data-audit-loc="src/pages/settings/components/TouchSensingSection.tsx:40"
  >
    <NumberInput
      label="탐색 속도 (%)"
      value={settings.touch_sensing_velocity}
      onChange={v => updateTouch('touch_sensing_velocity', v)}
      min={1}
      max={10}
      step={0.5}
      hint="1~10% (낮을수록 정밀)"
      color="yellow"
    />
    <NumberInput
      label="탐색 가속도 (%)"
      value={settings.touch_sensing_acceleration}
      onChange={v => updateTouch('touch_sensing_acceleration', v)}
      min={1}
      max={10}
      step={0.5}
      hint="1~10% (낮을수록 부드러움)"
      color="yellow"
    />
    <NumberInput
      label="탐색 거리 (mm)"
      value={settings.touch_distance}
      onChange={v => updateTouch('touch_distance', v)}
      min={10}
      max={200}
      step={5}
      hint="10~200mm"
      color="yellow"
    />
    <NumberInput
      label="스텝 크기 (mm)"
      value={settings.touch_sensing_step_size}
      onChange={v => updateTouch('touch_sensing_step_size', v)}
      min={1}
      max={20}
      step={1}
      hint="1~20mm (점진적 이동 단위)"
      color="yellow"
    />
    <NumberInput
      label="접근 각도 (도)"
      value={settings.touch_approach_angle}
      onChange={v => updateTouch('touch_approach_angle', v)}
      min={0}
      max={45}
      step={5}
      hint="0~45도 (좌우 센싱 시 헤드 틸트)"
      color="yellow"
    />
    <NumberInput
      label="센싱 후 이격 거리 (mm)"
      value={settings.touch_sensing_retract_distance}
      onChange={v => updateTouch('touch_sensing_retract_distance', v)}
      min={5}
      max={50}
      step={1}
      hint="5~50mm (접촉 후 후퇴 및 다음 포인트 이동 전 이격)"
      color="yellow"
    />
    <NumberInput
      label="포인트별 이격거리 (mm)"
      value={settings.touch_sensing_approach_offset}
      onChange={v => updateTouch('touch_sensing_approach_offset', v)}
      min={50}
      max={200}
      step={10}
      hint="50~200mm (포인트 접근/이탈 시 TCP Z축 후퇴 거리)"
      color="yellow"
    />
    <NumberInput
      label="터치 센싱 이동 거리 (mm)"
      value={settings.touch_sensing_move_distance}
      onChange={v => updateTouch('touch_sensing_move_distance', v)}
      min={0.1}
      max={1.0}
      step={0.1}
      hint="0.1~1.0mm (와이어 접촉 감지 트리거 거리, 작을수록 안전)"
      color="yellow"
    />
    <NumberInput
      label="포인트 이동 속도 (%)"
      value={settings.touch_sensing_point_speed}
      onChange={v => updateTouch('touch_sensing_point_speed', v)}
      min={10}
      max={100}
      step={5}
      hint="10~100% (터치 센싱 중 포인트 간 이동 속도)"
      color="yellow"
    />
    <NumberInput
      label="와이어 탐색 속도 (%)"
      value={settings.touch_sensing_search_speed}
      onChange={v => updateTouch('touch_sensing_search_speed', v)}
      min={1}
      max={10}
      step={1}
      hint="1~10% (와이어가 모재에 접촉할 때까지 이동하는 속도)"
      color="yellow"
    />
  </div>
);
const TouchSensingDirections: React.FC<TouchSensingSectionProps> = ({ settings, updateTouch }) => {
  const checkbox = (field: keyof TouchSensingSettings, label: string) => (
    <label className="flex items-center gap-3 cursor-pointer">
      <input
        type="checkbox"
        checked={settings[field] as boolean}
        onChange={e => updateTouch(field, e.target.checked)}
        className="w-5 h-5 rounded border-gray-600 bg-gray-700 text-yellow-500 focus:ring-yellow-500 focus:ring-offset-gray-800"
      />
      <span className="text-white">{label}</span>
    </label>
  );
  const pointCard = (
    title: string,
    color: string,
    fields: [keyof TouchSensingSettings, string][],
  ) => (
    <div className="bg-gray-800/50 rounded-xl p-4">
      <div className={`text-${color} font-medium mb-3`}>{title}</div>
      <div className="space-y-2">
        {fields.map(([field, label]) => (
          <React.Fragment key={field}>{checkbox(field, label)}</React.Fragment>
        ))}
      </div>
    </div>
  );
  return (
    <div className="mt-6 pt-4 border-t border-gray-700">
      <h4 className="text-md font-medium text-white mb-3">포인트별 터치 센싱 방향</h4>
      <p className="text-gray-400 text-xs mb-4">
        각 포인트에서 수행할 터치 센싱 방향을 선택합니다. 세로/가로 용접에 따라 터치 방향이
        다릅니다.
      </p>
      {}
      <div className="mb-6">
        <h5 className="text-sm font-medium text-purple-400 mb-3 flex items-center gap-2">
          <span className="w-3 h-3 bg-purple-500 rounded-full"></span>
          Part1: 가로 용접 (P4→P5→P6)
        </h5>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {pointCard('P4 (시작점)', 'cyan-400', [
            ['p4_touch_center', '중앙 (X방향)'],
            ['p4_touch_top', '상단 (+Z방향)'],
            ['p4_touch_bottom', '하단 (-Z방향)'],
            ['p4_touch_side', '좌측 (-Y방향)'],
          ])}
          {pointCard('P5 (중간점)', 'green-400', [
            ['p5_touch_center', '중앙 (X방향)'],
            ['p5_touch_top', '상단 (+Z방향)'],
            ['p5_touch_bottom', '하단 (-Z방향)'],
          ])}
          {pointCard('P6 (끝점)', 'orange-400', [
            ['p6_touch_center', '중앙 (X방향)'],
            ['p6_touch_top', '상단 (+Z방향)'],
            ['p6_touch_bottom', '하단 (-Z방향)'],
          ])}
        </div>
      </div>
      {}
      <div className="mb-6">
        <h5 className="text-sm font-medium text-blue-400 mb-3 flex items-center gap-2">
          <span className="w-3 h-3 bg-blue-500 rounded-full"></span>
          Part2: 세로 용접 (P3→P2→P1)
        </h5>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {pointCard('P3 (시작점)', 'cyan-400', [
            ['p3_touch_center', '중앙 (X방향)'],
            ['p3_touch_left', '좌측 (-Y방향)'],
            ['p3_touch_right', '우측 (+Y방향)'],
            ['p3_touch_bottom', '하단 (-Z방향)'],
          ])}
          {pointCard('P2 (중간점)', 'green-400', [
            ['p2_touch_center', '중앙 (X방향)'],
            ['p2_touch_left', '좌측 (-Y방향)'],
            ['p2_touch_right', '우측 (+Y방향)'],
          ])}
          {pointCard('P1 (끝점)', 'orange-400', [
            ['p1_touch_center', '중앙 (X방향)'],
            ['p1_touch_left', '좌측 (-Y방향)'],
            ['p1_touch_right', '우측 (+Y방향)'],
          ])}
        </div>
      </div>
      {}
      <div className="mb-6">
        <h5 className="text-sm font-medium text-pink-400 mb-3 flex items-center gap-2">
          <span className="w-3 h-3 bg-pink-500 rounded-full"></span>
          Part3: 가로 용접 (P10→P11→P12)
        </h5>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {pointCard('P10 (시작점)', 'cyan-400', [
            ['p10_touch_center', '중앙 (X방향)'],
            ['p10_touch_top', '상단 (+Z방향)'],
            ['p10_touch_bottom', '하단 (-Z방향)'],
            ['p10_touch_side', '우측 (+Y방향)'],
          ])}
          {pointCard('P11 (중간점)', 'green-400', [
            ['p11_touch_center', '중앙 (X방향)'],
            ['p11_touch_top', '상단 (+Z방향)'],
            ['p11_touch_bottom', '하단 (-Z방향)'],
          ])}
          {pointCard('P12 (끝점)', 'orange-400', [
            ['p12_touch_center', '중앙 (X방향)'],
            ['p12_touch_top', '상단 (+Z방향)'],
            ['p12_touch_bottom', '하단 (-Z방향)'],
          ])}
        </div>
      </div>
      {}
      <div className="mb-6">
        <h5 className="text-sm font-medium text-amber-400 mb-3 flex items-center gap-2">
          <span className="w-3 h-3 bg-amber-500 rounded-full"></span>
          Part4: 세로 용접 (P9→P8→P7)
        </h5>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {pointCard('P9 (시작점)', 'cyan-400', [
            ['p9_touch_center', '중앙 (X방향)'],
            ['p9_touch_left', '좌측 (-Y방향)'],
            ['p9_touch_right', '우측 (+Y방향)'],
            ['p9_touch_bottom', '하단 (-Z방향)'],
          ])}
          {pointCard('P8 (중간점)', 'green-400', [
            ['p8_touch_center', '중앙 (X방향)'],
            ['p8_touch_left', '좌측 (-Y방향)'],
            ['p8_touch_right', '우측 (+Y방향)'],
          ])}
          {pointCard('P7 (끝점)', 'orange-400', [
            ['p7_touch_center', '중앙 (X방향)'],
            ['p7_touch_left', '좌측 (-Y방향)'],
            ['p7_touch_right', '우측 (+Y방향)'],
          ])}
        </div>
      </div>
    </div>
  );
};
const TouchSensingSection: React.FC<TouchSensingSectionProps> = ({ settings, updateTouch }) => (
  <div className="mt-8 pt-6 border-t border-gray-700">
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-lg font-semibold text-white flex items-center gap-2">
        <Settings className="w-5 h-5 text-yellow-400" />
        터치 센싱 설정
      </h3>
    </div>
    <p className="text-gray-400 text-sm mb-4">
      터치 센싱 시 사용되는 속도, 거리, 각도 등을 설정합니다.
    </p>
    {}
    <div className="flex items-center justify-between bg-gray-800/50 rounded-xl p-4 mb-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-yellow-500/20 rounded-lg flex items-center justify-center">
          <Settings className="w-5 h-5 text-yellow-400" />
        </div>
        <div>
          <div className="text-white font-medium">터치 센싱 사용</div>
          <div className="text-gray-400 text-xs mt-0.5">용접 시작 전 모재 표면 탐색 활성화</div>
        </div>
      </div>
      <label className="relative inline-flex items-center cursor-pointer">
        <input
          type="checkbox"
          checked={settings.touch_sensing_enabled}
          onChange={e => updateTouch('touch_sensing_enabled', e.target.checked)}
          className="sr-only peer"
        />
        <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-yellow-500"></div>
      </label>
    </div>
    <TouchSensingParams settings={settings} updateTouch={updateTouch} />
    <TouchSensingDirections settings={settings} updateTouch={updateTouch} />
  </div>
);
export { NumberInput };
export const TouchSensingSection_TouchSensingSection = TouchSensingSection;
interface UpdateTabProps {
  versionInfo: VersionInfo | null;
  systemInfo: SystemInfo | null;
}
const UpdateTab: React.FC<UpdateTabProps> = ({ versionInfo, systemInfo }) => {
  const updater = useUpdaterContext();
  const status = updater.status;
  const isBusy = ['checking', 'downloading', 'verifying', 'installing'].includes(status.kind);
  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold text-white flex items-center gap-2 mb-6">
        <Download className="w-6 h-6 text-cyan-400" />
        소프트웨어 업데이트
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {}
        <div className="space-y-4">
          <div className="bg-gray-900/60 rounded-xl p-5 border border-gray-700/50">
            <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
              <Info className="w-5 h-5 text-cyan-400" />
              현재 버전 정보
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-400">버전</span>
                <span className="text-white font-mono">v{versionInfo?.version || '---'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">빌드 날짜</span>
                <span className="text-white">{versionInfo?.build_date || '---'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">릴리스 노트</span>
                <span className="text-white">{versionInfo?.release_notes || '---'}</span>
              </div>
            </div>
          </div>
          {}
          <div className="bg-gray-900/60 rounded-xl p-5 border border-gray-700/50">
            <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
              <Cpu className="w-5 h-5 text-cyan-400" />
              시스템 정보
            </h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">플랫폼</span>
                <span className="text-white font-mono">{systemInfo?.platform || '---'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">아키텍처</span>
                <span className="text-white font-mono">{systemInfo?.architecture || '---'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Python</span>
                <span className="text-white font-mono text-xs">
                  {systemInfo?.python_version?.split(' ')[0] || '---'}
                </span>
              </div>
            </div>
          </div>
        </div>
        {}
        <div className="space-y-4">
          <div className="bg-gray-900/60 rounded-xl p-5 border border-gray-700/50">
            <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-cyan-400" />
              업데이트 확인
            </h3>
            {}
            {(status.kind === 'up_to_date' || status.kind === 'available' || status.kind === 'pending') && (
              <div
                className={`mb-4 p-4 rounded-xl ${
                  status.kind !== 'up_to_date'
                    ? 'bg-green-500/10 border border-green-500/30'
                    : 'bg-gray-700/30 border border-gray-600/30'
                }`}
              >
                {status.kind !== 'up_to_date' ? (
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-6 h-6 text-green-400" />
                    <div>
                      <div className="text-green-400 font-medium">새 업데이트 사용 가능!</div>
                      <div className="text-gray-300 text-sm">
                        v{updater.currentVersion} → v{status.release.version}
                      </div>
                      {status.release.notes && (
                        <div className="text-gray-400 text-sm mt-1">{status.release.notes}</div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-6 h-6 text-gray-400" />
                    <div>
                      <div className="text-gray-300 font-medium">최신 버전입니다</div>
                      <div className="text-gray-400 text-sm">현재 버전: v{updater.currentVersion}</div>
                    </div>
                  </div>
                )}
              </div>
            )}
            {}
            {status.kind === 'downloading' && (
              <div className="mb-4 p-4 rounded-xl bg-blue-500/10 border border-blue-500/30">
                <div className="flex items-center gap-3 mb-3">
                  <RefreshCw className="w-5 h-5 text-blue-400 animate-spin" />
                  <div className="text-blue-300 font-medium">다운로드 중...</div>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${percent(status.progress)}%` }}
                  />
                </div>
                <div className="text-gray-400 text-sm mt-2 text-center">
                  {displayProgress(status.progress)}
                </div>
              </div>
            )}
            {}
            {(status.kind === 'verifying' || status.kind === 'installing') && (
              <div className="mb-4 p-4 rounded-xl bg-blue-500/10 border border-blue-500/30">
                <div className="flex items-center gap-3">
                  <RefreshCw className="w-5 h-5 text-blue-400 animate-spin" />
                  <div className="text-blue-300 font-medium">
                    {status.kind === 'verifying' ? '파일 검증 중...' : '설치 프로그램 실행 중...'}
                  </div>
                </div>
              </div>
            )}
            {}
            {status.kind === 'error' && (
              <div className="mb-4 p-4 rounded-xl bg-red-500/10 border border-red-500/30">
                <div className="flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 text-red-400" />
                  <div className="font-medium text-red-300">{status.message}</div>
                </div>
              </div>
            )}
            {}
            <div className="flex gap-3">
              <button
                onClick={() => updater.checkNow()}
                disabled={isBusy}
                className="flex-1 px-5 py-3 bg-gray-700/80 hover:bg-gray-600 disabled:opacity-50 rounded-xl text-white transition flex items-center justify-center gap-2 font-medium border border-gray-600"
              >
                <RefreshCw className={`w-5 h-5 ${status.kind === 'checking' ? 'animate-spin' : ''}`} />
                {status.kind === 'checking' ? '확인 중...' : '업데이트 확인'}
              </button>
              {(status.kind === 'available' || status.kind === 'pending') && (
                <button
                  onClick={() => updater.startUpdate(status.release)}
                  disabled={isBusy}
                  className="flex-1 px-5 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-50 rounded-xl text-white transition flex items-center justify-center gap-2 font-medium"
                >
                  <Download className="w-5 h-5" />
                  업데이트 설치
                </button>
              )}
            </div>
          </div>
          {}
          <div className="bg-gray-900/60 rounded-xl p-5 border border-yellow-700/30">
            <h3 className="text-lg font-medium text-yellow-400 mb-3 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              수동 업데이트
            </h3>
            <p className="text-gray-400 text-sm mb-3">
              자동 업데이트가 작동하지 않을 경우, 프로젝트 폴더에서
              <code className="mx-1 px-2 py-0.5 bg-gray-700 rounded text-cyan-400">
                scripts\update.bat
              </code>
              파일을 실행하세요.
            </p>
            <p className="text-gray-500 text-xs">업데이트 후 애플리케이션을 재시작해야 합니다.</p>
          </div>
        </div>
      </div>
      {}
      <div className="mt-6">
        <DiagnosticLogsSection />
      </div>
    </div>
  );
};
export const UpdateTab_UpdateTab = UpdateTab;
interface UserManagementTabProps {
  users: UserData[];
  onOpenUserModal: (user?: UserData) => void;
  onDeleteUser: (userId: number, userName: string) => void;
  onLogout: () => void;
}
const getRoleBadge = (role: UserData['role']) => {
  const styles = {
    admin: 'bg-red-500/20 text-red-400 border-red-500/50',
    operator: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
    viewer: 'bg-gray-500/20 text-gray-400 border-gray-500/50',
  };
  const labels = {
    admin: '관리자',
    operator: '작업자',
    viewer: '조회자',
  };
  return (
    <span className={`px-3 py-1 rounded-full text-sm border ${styles[role]}`}>
      {labels[role]}
    </span>
  );
};
type UserSortKey = 'name_asc' | 'name_desc' | 'lastLogin_desc' | 'lastLogin_asc';
const UserManagementTab: React.FC<UserManagementTabProps> = ({
  users,
  onOpenUserModal,
  onDeleteUser,
  onLogout,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | UserData['role']>('all');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [sortKey, setSortKey] = useState<UserSortKey>('name_asc');
  const isFiltered = searchQuery.trim() !== '' || roleFilter !== 'all' || activeFilter !== 'all';
  const filteredUsers = users
    .filter(user => {
      if (roleFilter !== 'all' && user.role !== roleFilter) return false;
      if (activeFilter === 'active' && !user.active) return false;
      if (activeFilter === 'inactive' && user.active) return false;
      const q = searchQuery.trim().toLowerCase();
      if (!q) return true;
      return (
        user.name?.toLowerCase().includes(q) ||
        user.username?.toLowerCase().includes(q) ||
        user.email?.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      switch (sortKey) {
        case 'name_desc':
          return b.name.localeCompare(a.name);
        case 'lastLogin_desc':
          return new Date(b.lastLogin || 0).getTime() - new Date(a.lastLogin || 0).getTime();
        case 'lastLogin_asc':
          return new Date(a.lastLogin || 0).getTime() - new Date(b.lastLogin || 0).getTime();
        case 'name_asc':
        default:
          return a.name.localeCompare(b.name);
      }
    });
  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Users className="w-6 h-6 text-cyan-400" />
          사용자 목록
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onOpenUserModal()}
            className="px-5 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 rounded-xl text-white text-sm transition flex items-center gap-2 font-medium"
          >
            <Plus className="w-4 h-4" />
            사용자 추가
          </button>
          <button
            onClick={onLogout}
            className="px-5 py-3 bg-gray-700 hover:bg-gray-600 rounded-xl text-white text-sm transition flex items-center gap-2 font-medium border border-gray-600"
          >
            <LogOut className="w-4 h-4" />
            로그아웃
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mb-6">
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="이름, 아이디, 이메일 검색"
          className="flex-1 min-w-[200px] px-4 py-2.5 bg-gray-900/60 border border-gray-700/50 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500"
        />
        <select
          value={roleFilter}
          onChange={e => setRoleFilter(e.target.value as 'all' | UserData['role'])}
          className="px-4 py-2.5 bg-gray-900/60 border border-gray-700/50 rounded-xl text-white focus:outline-none focus:border-cyan-500"
        >
          <option value="all">전체 권한</option>
          <option value="admin">관리자</option>
          <option value="operator">작업자</option>
          <option value="viewer">조회자</option>
        </select>
        <select
          value={activeFilter}
          onChange={e => setActiveFilter(e.target.value as 'all' | 'active' | 'inactive')}
          className="px-4 py-2.5 bg-gray-900/60 border border-gray-700/50 rounded-xl text-white focus:outline-none focus:border-cyan-500"
        >
          <option value="all">전체 상태</option>
          <option value="active">활성</option>
          <option value="inactive">비활성</option>
        </select>
        <select
          value={sortKey}
          onChange={e => setSortKey(e.target.value as UserSortKey)}
          className="px-4 py-2.5 bg-gray-900/60 border border-gray-700/50 rounded-xl text-white focus:outline-none focus:border-cyan-500"
        >
          <option value="name_asc">이름순</option>
          <option value="name_desc">이름 역순</option>
          <option value="lastLogin_desc">최근 로그인순</option>
          <option value="lastLogin_asc">오래된 로그인순</option>
        </select>
      </div>
      <div className="space-y-4">
        {filteredUsers.map(user => (
          <div
            key={user.id}
            className="bg-gray-900/60 rounded-xl p-5 flex items-center justify-between border border-gray-700/50 hover:border-cyan-500/30 transition"
          >
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-gradient-to-br from-gray-600 to-gray-700 rounded-xl flex items-center justify-center">
                <User className="w-7 h-7 text-gray-300" />
              </div>
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-white font-semibold text-lg">{user.name}</span>
                  <span className="text-gray-500 text-sm">({user.username})</span>
                  {getRoleBadge(user.role)}
                  {user.active ? (
                    <span className="flex items-center gap-1 text-green-400 text-sm">
                      <CheckCircle className="w-4 h-4" />
                      활성
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-red-400 text-sm">
                      <XCircle className="w-4 h-4" />
                      비활성
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-400">
                  <span className="flex items-center gap-1">
                    <Mail className="w-4 h-4" />
                    {user.email || '-'}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    최근 로그인: {user.lastLogin ? formatDateTime(user.lastLogin, { includeYear: true }) : '-'}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onOpenUserModal(user)}
                className="px-4 py-2 bg-gray-700/80 hover:bg-gray-600 rounded-xl text-white text-sm transition touch-manipulation border border-gray-600 flex items-center gap-1"
              >
                <Edit className="w-4 h-4" />
                편집
              </button>
              <button
                onClick={() => onDeleteUser(user.id, user.name)}
                className="px-4 py-2 bg-red-600/20 hover:bg-red-600/40 rounded-xl text-red-400 text-sm transition touch-manipulation border border-red-600/30 flex items-center gap-1"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
        {filteredUsers.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            {isFiltered ? '조건에 맞는 사용자가 없습니다.' : '등록된 사용자가 없습니다.'}
          </div>
        )}
      </div>
    </div>
  );
};
export const UserManagementTab_UserManagementTab = UserManagementTab;
interface UserModalProps {
  editingUser: UserData | null;
  userForm: UserFormData;
  onFormChange: (form: UserFormData) => void;
  onSave: () => void;
  onClose: () => void;
}
const UserModal: React.FC<UserModalProps> = ({
  editingUser,
  userForm,
  onFormChange,
  onSave,
  onClose,
}) => {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-2xl border border-gray-700 w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h3 className="text-xl font-semibold text-white">
            {editingUser ? '사용자 편집' : '사용자 추가'}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-gray-400 text-sm mb-2">아이디 *</label>
            <input
              type="text"
              value={userForm.username}
              onChange={(e) => onFormChange({ ...userForm, username: e.target.value })}
              disabled={!!editingUser}
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-xl text-white focus:border-cyan-500 focus:outline-none disabled:bg-gray-800 disabled:text-gray-500"
              placeholder="로그인 아이디"
            />
          </div>
          <div>
            <label className="block text-gray-400 text-sm mb-2">
              비밀번호 {editingUser ? '(변경시에만 입력)' : '*'}
            </label>
            <input
              type="password"
              value={userForm.password}
              onChange={(e) => onFormChange({ ...userForm, password: e.target.value })}
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-xl text-white focus:border-cyan-500 focus:outline-none"
              placeholder={editingUser ? '변경하지 않으려면 비워두세요' : '비밀번호'}
            />
          </div>
          <div>
            <label className="block text-gray-400 text-sm mb-2">이름 *</label>
            <input
              type="text"
              value={userForm.name}
              onChange={(e) => onFormChange({ ...userForm, name: e.target.value })}
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-xl text-white focus:border-cyan-500 focus:outline-none"
              placeholder="표시 이름"
            />
          </div>
          <div>
            <label className="block text-gray-400 text-sm mb-2">이메일</label>
            <input
              type="email"
              value={userForm.email}
              onChange={(e) => onFormChange({ ...userForm, email: e.target.value })}
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-xl text-white focus:border-cyan-500 focus:outline-none"
              placeholder="email@example.com"
            />
          </div>
          <div>
            <label className="block text-gray-400 text-sm mb-2">역할</label>
            <select
              value={userForm.role}
              onChange={(e) => onFormChange({ ...userForm, role: e.target.value as 'admin' | 'operator' | 'viewer' })}
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-xl text-white focus:border-cyan-500 focus:outline-none"
            >
              <option value="admin">관리자</option>
              <option value="operator">작업자</option>
              <option value="viewer">조회자</option>
            </select>
          </div>
          {editingUser && (
            <div className="flex items-center gap-3">
              <label className="text-gray-400 text-sm">활성 상태:</label>
              <button
                type="button"
                onClick={() => onFormChange({ ...userForm, active: !userForm.active })}
                className={`
                  relative w-12 h-6 rounded-full transition-colors
                  ${userForm.active ? 'bg-cyan-600' : 'bg-gray-600'}
                `}
              >
                <span
                  className={`
                    absolute top-1 w-4 h-4 rounded-full bg-white transition-transform
                    ${userForm.active ? 'left-7' : 'left-1'}
                  `}
                />
              </button>
              <span className={userForm.active ? 'text-green-400' : 'text-gray-500'}>
                {userForm.active ? '활성' : '비활성'}
              </span>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3 p-6 border-t border-gray-700">
          <button
            onClick={onClose}
            className="px-5 py-3 bg-gray-700 hover:bg-gray-600 rounded-xl text-white transition"
          >
            취소
          </button>
          <button
            onClick={onSave}
            className="px-5 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 rounded-xl text-white transition flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            저장
          </button>
        </div>
      </div>
    </div>
  );
};
export const UserModal_UserModal = UserModal;
interface WeldingDefaultsTabProps {
  touchSensingSettings: TouchSensingSettings;
  setTouchSensingSettings: React.Dispatch<React.SetStateAction<TouchSensingSettings>>;
}
const WeldingDefaultsTab: React.FC<WeldingDefaultsTabProps> = ({
  touchSensingSettings,
  setTouchSensingSettings,
}) => {
  const navigate = useNavigate();
  const updateTouch = (field: keyof TouchSensingSettings, value: boolean | number) => {
    setTouchSensingSettings(prev => ({ ...prev, [field]: value }));
  };
  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold text-white flex items-center gap-2 mb-6">
        <Sliders className="w-6 h-6 text-cyan-400" />
        용접 기본 파라미터
      </h2>
      {}
      <ArcTrackingSection settings={touchSensingSettings} updateTouch={updateTouch} />
      {}
      <div className="mt-8 pt-6 border-t border-gray-700">
        <button
          onClick={() => navigate('/settings/welding')}
          className="w-full flex items-center justify-between p-4 bg-gray-800/60 hover:bg-gray-700/60 border border-gray-700 rounded-xl text-white transition"
        >
          <div className="flex items-center gap-3">
            <Sliders className="w-5 h-5 text-cyan-400" />
            <div className="text-left">
              <div className="font-medium">용접 프리셋 관리</div>
              <div className="text-sm text-gray-400">프리셋, 시퀀스, 안전 설정</div>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-400" />
        </button>
      </div>
      {}
      <TouchSensingSection settings={touchSensingSettings} updateTouch={updateTouch} />
    </div>
  );
};
export const WeldingDefaultsTab_WeldingDefaultsTab = WeldingDefaultsTab;
