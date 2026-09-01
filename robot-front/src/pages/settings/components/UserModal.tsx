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
