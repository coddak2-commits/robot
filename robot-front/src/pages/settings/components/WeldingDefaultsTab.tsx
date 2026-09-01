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
import { ArcTrackingSection } from './ArcTrackingSection';
import { TouchSensingSection } from './TouchSensingSection';

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
