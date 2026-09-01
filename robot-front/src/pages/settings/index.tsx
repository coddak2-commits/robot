import React from 'react';
import { Users, Sliders, Shield, Save, Clock, Cpu, Wifi, Download, Database } from 'lucide-react';
import { PageLayout, LoadingScreen } from '../../components/common/index';
import { useSystemSettingsData } from './hooks/useSystemSettingsData';
import { useLang } from '../../contexts';
import { StatusCard_StatusCard as StatusCard, UserManagementTab_UserManagementTab as UserManagementTab, UserModal_UserModal as UserModal, RobotSettingsTab_RobotSettingsTab as RobotSettingsTab, WeldingDefaultsTab_WeldingDefaultsTab as WeldingDefaultsTab, SystemEnvTab_SystemEnvTab as SystemEnvTab, UpdateTab_UpdateTab as UpdateTab } from './components';
import { SystemConfig } from '../../lib';
import { VersionInfo, UpdateCheckResponse, UpdateStatus, SystemInfo, RobotSettingsData, RobotErrorData, RobotErrorEvent, UserData } from '../../lib';
const SystemSettings: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    users,
    config,
    setConfig,
    loading,
    saving,
    userModalOpen,
    setUserModalOpen,
    editingUser,
    userForm,
    setUserForm,
    debugMode,
    versionInfo,
    updateCheck,
    updateStatus,
    systemInfo,
    checkingUpdate,
    updating,
    robotCoordSettings,
    setRobotCoordSettings,
    robotError,
    loadingError,
    resettingError,
    robotConnected,
    touchSensingSettings,
    setTouchSensingSettings,
    handleDebugToggle,
    handleResetError,
    handleCheckUpdate,
    handleStartUpdate,
    openUserModal,
    handleSaveUser,
    handleDeleteUser,
    handleLogout,
    handleSaveConfig,
    fetchRobotError,
  } = useSystemSettingsData();
  const { t } = useLang();
  const tabs = [
    { id: 'users' as TabType, label: t('tabUsers'), icon: Users },
    { id: 'robot' as TabType, label: t('tabRobot'), icon: Cpu },
    { id: 'welding' as TabType, label: t('tabWelding'), icon: Sliders },
    { id: 'system' as TabType, label: t('tabSystem'), icon: Shield },
    { id: 'update' as TabType, label: t('tabUpdate'), icon: Download },
  ];
  if (loading) {
    return <LoadingScreen text="로딩 중..." />;
  }
  return (
    <PageLayout>
      {}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatusCard
          icon={<Wifi className={`w-6 h-6 ${robotConnected ? 'text-green-400' : 'text-red-400'}`} />}
          bgColor={robotConnected ? 'bg-green-500/20' : 'bg-red-500/20'}
          value={robotConnected === null ? '확인중...' : robotConnected ? '연결됨' : '연결 안됨'}
          valueColor={robotConnected ? 'text-green-400' : 'text-red-400'}
          label="로봇 상태"
        />
        <StatusCard
          icon={<Users className="w-6 h-6 text-blue-400" />}
          bgColor="bg-blue-500/20"
          value={String(users.length)}
          label="등록 사용자"
        />
        <StatusCard
          icon={<Database className="w-6 h-6 text-cyan-400" />}
          bgColor="bg-cyan-500/20"
          value={`v${versionInfo?.version || '---'}`}
          label="시스템 버전"
        />
        <StatusCard
          icon={<Clock className="w-6 h-6 text-yellow-400" />}
          bgColor="bg-yellow-500/20"
          value={
            systemInfo?.uptime_seconds != null
              ? `${Math.floor(systemInfo.uptime_seconds / 86400)}일 ${Math.floor((systemInfo.uptime_seconds % 86400) / 3600)}시간`
              : '---'
          }
          label="가동 시간"
        />
      </div>
      {}
      <div className="flex gap-2 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 flex-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-4 rounded-xl font-medium transition touch-manipulation flex items-center justify-center gap-2 ${
                activeTab === tab.id
                  ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-lg shadow-cyan-500/20'
                  : 'bg-gray-800/60 text-gray-300 hover:bg-gray-700/60 border border-gray-700/50'
              }`}
            >
              <tab.icon className="w-5 h-5" />
              <span className="hidden md:inline">{tab.label}</span>
            </button>
          ))}
        </div>
        <button
          onClick={handleSaveConfig}
          disabled={saving}
          className="px-5 py-4 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-50 rounded-xl text-white transition touch-manipulation flex items-center gap-2 font-medium"
        >
          <Save className="w-5 h-5" />
          <span className="hidden md:inline">{saving ? t('saving') : t('saveSettings')}</span>
        </button>
      </div>
      {}
      <div className="bg-gray-800/60 backdrop-blur-sm rounded-2xl border border-gray-700/50">
        {activeTab === 'users' && (
          <UserManagementTab
            users={users}
            onOpenUserModal={openUserModal}
            onDeleteUser={handleDeleteUser}
            onLogout={handleLogout}
          />
        )}
        {activeTab === 'robot' && config && (
          <RobotSettingsTab
            robotCoordSettings={robotCoordSettings}
            setRobotCoordSettings={setRobotCoordSettings}
            robotError={robotError}
            loadingError={loadingError}
            resettingError={resettingError}
            onFetchRobotError={fetchRobotError}
            onResetError={handleResetError}
          />
        )}
        {activeTab === 'welding' && (
          <WeldingDefaultsTab
            touchSensingSettings={touchSensingSettings}
            setTouchSensingSettings={setTouchSensingSettings}
          />
        )}
        {activeTab === 'system' && config && (
          <SystemEnvTab
            config={config}
            setConfig={setConfig}
            debugMode={debugMode}
            onDebugToggle={handleDebugToggle}
          />
        )}
        {activeTab === 'update' && (
          <UpdateTab
            versionInfo={versionInfo}
            systemInfo={systemInfo}
          />
        )}
      </div>
      {}
      {userModalOpen && (
        <UserModal
          editingUser={editingUser}
          userForm={userForm}
          onFormChange={setUserForm}
          onSave={handleSaveUser}
          onClose={() => setUserModalOpen(false)}
        />
      )}
    </PageLayout>
  );
};
export const SystemSettings_SystemSettings = SystemSettings;
export type TabType = 'users' | 'robot' | 'welding' | 'system' | 'update';
export interface TouchSensingSettings {
  touch_sensing_enabled: boolean;
  touch_distance: number;
  touch_approach_angle: number;
  touch_sensing_velocity: number;
  touch_sensing_acceleration: number;
  touch_sensing_step_size: number;
  touch_sensing_retract_distance: number;
  touch_sensing_approach_offset: number;
  touch_sensing_move_distance: number;
  touch_sensing_point_speed: number;
  touch_sensing_search_speed: number;
  p1_touch_center: boolean;
  p1_touch_left: boolean;
  p1_touch_right: boolean;
  p1_touch_bottom: boolean;
  p2_touch_center: boolean;
  p2_touch_left: boolean;
  p2_touch_right: boolean;
  p3_touch_center: boolean;
  p3_touch_left: boolean;
  p3_touch_right: boolean;
  p3_touch_bottom: boolean;
  p4_touch_center: boolean;
  p4_touch_top: boolean;
  p4_touch_bottom: boolean;
  p4_touch_side: boolean;
  p5_touch_center: boolean;
  p5_touch_top: boolean;
  p5_touch_bottom: boolean;
  p6_touch_center: boolean;
  p6_touch_top: boolean;
  p6_touch_bottom: boolean;
  p7_touch_center: boolean;
  p7_touch_left: boolean;
  p7_touch_right: boolean;
  p8_touch_center: boolean;
  p8_touch_left: boolean;
  p8_touch_right: boolean;
  p9_touch_center: boolean;
  p9_touch_left: boolean;
  p9_touch_right: boolean;
  p9_touch_bottom: boolean;
  p10_touch_center: boolean;
  p10_touch_top: boolean;
  p10_touch_bottom: boolean;
  p10_touch_side: boolean;
  p11_touch_center: boolean;
  p11_touch_top: boolean;
  p11_touch_bottom: boolean;
  p12_touch_center: boolean;
  p12_touch_top: boolean;
  p12_touch_bottom: boolean;
  arc_tracking_enabled: boolean;
  arc_tracking_left_right: boolean;
  arc_tracking_up_down: boolean;
  arc_tracking_klr: number;
  arc_tracking_kud: number;
  arc_tracking_step_max_lr: number;
  arc_tracking_step_max_ud: number;
  arc_tracking_sum_max_lr: number;
  arc_tracking_sum_max_ud: number;
}
export interface UserFormData {
  username: string;
  password: string;
  name: string;
  email: string;
  role: 'admin' | 'operator' | 'viewer';
  active: boolean;
}
export type {
  SystemConfig,
  VersionInfo,
  UpdateCheckResponse,
  UpdateStatus,
  SystemInfo,
  RobotSettingsData,
  RobotErrorData,
  RobotErrorEvent,
  UserData,
};
