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
