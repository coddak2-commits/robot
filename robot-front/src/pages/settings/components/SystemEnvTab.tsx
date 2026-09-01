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
