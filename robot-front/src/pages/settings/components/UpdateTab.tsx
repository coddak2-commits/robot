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
import { DiagnosticLogsSection } from './DiagnosticLogsSection';

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
