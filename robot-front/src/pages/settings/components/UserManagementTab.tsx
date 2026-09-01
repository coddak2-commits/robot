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
