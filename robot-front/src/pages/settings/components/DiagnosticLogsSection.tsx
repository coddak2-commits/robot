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

const LS_LOG_EMAIL = 'vot.diagnosticLogs.recipient';
const LS_LOG_AUTO = 'vot.diagnosticLogs.autoSendOnError';
const LS_LOG_DAYS = 'vot.diagnosticLogs.days';
const LS_LOG_MAX = 'vot.diagnosticLogs.maxFiles';
const DEFAULT_RECIPIENT = 'coddak2@gmail.com';
export const DiagnosticLogsSection: React.FC = () => {
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
