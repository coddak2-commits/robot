import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  mockGetSystemConfig,
  mockUpdateSystemConfig,
  SystemConfig,
} from '../../../lib';
import { isDebugEnabled, setDebugEnabled } from '../../../utils';
import { useAlert } from '../../../contexts';
import {
  getSystemVersion,
  checkForUpdates,
  getUpdateStatus,
  startUpdate,
  getSystemInfo,
  VersionInfo,
  UpdateCheckResponse,
  UpdateStatus,
  SystemInfo,
  getRobotSettings,
  updateRobotSettings,
  RobotSettingsData,
  getRobotError,
  resetRobotError,
  RobotErrorData,
  getWeldingConfig,
  updateWeldingConfig,
  getUsers,
  createUser,
  updateUser,
  deleteUser,
  UserData,
  logout,
} from '../../../lib';
import type { TabType, TouchSensingSettings, UserFormData } from '..';
const TOUCH_SENSING_DEFAULTS: TouchSensingSettings = {
  touch_sensing_enabled: true,
  touch_distance: 100.0,
  touch_approach_angle: 20.0,
  touch_sensing_velocity: 1.0,
  touch_sensing_acceleration: 3.0,
  touch_sensing_step_size: 5.0,
  touch_sensing_retract_distance: 10.0,
  touch_sensing_approach_offset: 100.0,
  touch_sensing_move_distance: 0.5,
  touch_sensing_point_speed: 50.0,
  touch_sensing_search_speed: 3.0,
  p1_touch_center: true, p1_touch_left: true, p1_touch_right: true, p1_touch_bottom: false,
  p2_touch_center: true, p2_touch_left: true, p2_touch_right: true,
  p3_touch_center: true, p3_touch_left: true, p3_touch_right: true, p3_touch_bottom: true,
  p4_touch_center: true, p4_touch_top: true, p4_touch_bottom: true, p4_touch_side: true,
  p5_touch_center: true, p5_touch_top: true, p5_touch_bottom: true,
  p6_touch_center: true, p6_touch_top: true, p6_touch_bottom: true,
  p7_touch_center: true, p7_touch_left: true, p7_touch_right: true,
  p8_touch_center: true, p8_touch_left: true, p8_touch_right: true,
  p9_touch_center: true, p9_touch_left: true, p9_touch_right: true, p9_touch_bottom: true,
  p10_touch_center: true, p10_touch_top: true, p10_touch_bottom: true, p10_touch_side: true,
  p11_touch_center: true, p11_touch_top: true, p11_touch_bottom: true,
  p12_touch_center: true, p12_touch_top: true, p12_touch_bottom: true,
  arc_tracking_enabled: false,
  arc_tracking_left_right: true, arc_tracking_up_down: true,
  arc_tracking_klr: 0.06, arc_tracking_kud: 0.06,
  arc_tracking_step_max_lr: 5.0, arc_tracking_step_max_ud: 5.0,
  arc_tracking_sum_max_lr: 30.0, arc_tracking_sum_max_ud: 30.0,
};
export function useSystemSettingsData() {
  const navigate = useNavigate();
  const { show: showAlert } = useAlert();
  const [activeTab, setActiveTab] = useState<TabType>('users');
  const [users, setUsers] = useState<UserData[]>([]);
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const [userForm, setUserForm] = useState<UserFormData>({
    username: '', password: '', name: '', email: '',
    role: 'operator', active: true,
  });
  const [debugMode, setDebugMode] = useState(isDebugEnabled());
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [updateCheck, setUpdateCheck] = useState<UpdateCheckResponse | null>(null);
  const [updateStatus, setUpdateStatusState] = useState<UpdateStatus | null>(null);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [robotCoordSettings, setRobotCoordSettings] = useState<RobotSettingsData>({
    tool_num: 0, user_num: 0, default_vel: 20, default_acc: 100,
    default_ovl: 100, auto_clear_error: true, min_weaving_distance: 50,
  });
  const [robotError, setRobotError] = useState<RobotErrorData | null>(null);
  const [loadingError, setLoadingError] = useState(false);
  const [resettingError, setResettingError] = useState(false);
  const [touchSensingSettings, setTouchSensingSettings] = useState<TouchSensingSettings>(TOUCH_SENSING_DEFAULTS);
  const handleDebugToggle = () => {
    const newValue = !debugMode;
    setDebugMode(newValue);
    setDebugEnabled(newValue);
  };
  const fetchData = async () => {
    try {
      const [usersData, configData] = await Promise.all([getUsers(), mockGetSystemConfig()]);
      setUsers(usersData);
      setConfig(configData);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };
  const fetchVersionInfo = async () => {
    try {
      const [version, sysInfo] = await Promise.all([getSystemVersion(), getSystemInfo()]);
      setVersionInfo(version);
      setSystemInfo(sysInfo);
    } catch (error) {
      console.error('Failed to fetch version info:', error);
    }
  };
  const fetchRobotCoordSettings = async () => {
    try {
      const settings = await getRobotSettings();
      setRobotCoordSettings(settings);
    } catch (error) {
      console.error('Failed to fetch robot coord settings:', error);
    }
  };
  const fetchTouchSensingSettings = async () => {
    try {
      const cfg = await getWeldingConfig();
      const ts = TOUCH_SENSING_DEFAULTS;
      const result: Record<string, unknown> = {};
      const cfgAny = cfg as unknown as Record<string, unknown>;
      for (const key of Object.keys(ts) as (keyof TouchSensingSettings)[]) {
        result[key] = cfgAny[key] ?? ts[key];
      }
      setTouchSensingSettings(result as unknown as TouchSensingSettings);
    } catch (error) {
      console.error('Failed to fetch touch sensing settings:', error);
    }
  };
  const fetchRobotError = async () => {
    setLoadingError(true);
    try {
      const error = await getRobotError();
      setRobotError(error);
    } catch (error) {
      console.error('Failed to fetch robot error:', error);
      setRobotError(null);
    } finally {
      setLoadingError(false);
    }
  };
  useEffect(() => {
    fetchData();
    fetchVersionInfo();
    fetchRobotCoordSettings();
  }, []);
  useEffect(() => {
    if (activeTab === 'robot') fetchRobotError();
  }, [activeTab]);
  useEffect(() => {
    if (activeTab === 'welding') fetchTouchSensingSettings();
  }, [activeTab]);
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (updating) {
      interval = setInterval(async () => {
        try {
          const status = await getUpdateStatus();
          setUpdateStatusState(status);
          if (status.status === 'completed' || status.status === 'error') {
            setUpdating(false);
          }
        } catch (error) {
          console.error('Failed to get update status:', error);
        }
      }, 2000);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [updating]);
  const handleResetError = async () => {
    if (!confirm('로봇 에러를 초기화하시겠습니까?')) return;
    setResettingError(true);
    try {
      await resetRobotError();
      showAlert('에러가 초기화되었습니다.', { type: 'success' });
      await fetchRobotError();
    } catch (error) {
      console.error('Failed to reset robot error:', error);
      showAlert('에러 초기화에 실패했습니다.', { type: 'error' });
    } finally {
      setResettingError(false);
    }
  };
  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    try {
      const result = await checkForUpdates();
      setUpdateCheck(result);
    } catch (error) {
      console.error('Failed to check for updates:', error);
    } finally {
      setCheckingUpdate(false);
    }
  };
  const handleStartUpdate = async () => {
    if (!updateCheck?.update_available) return;
    setUpdating(true);
    try {
      await startUpdate();
    } catch (error) {
      console.error('Failed to start update:', error);
      setUpdating(false);
    }
  };
  const openUserModal = (user?: UserData) => {
    if (user) {
      setEditingUser(user);
      setUserForm({
        username: user.username, password: '', name: user.name,
        email: user.email || '', role: user.role, active: user.active,
      });
    } else {
      setEditingUser(null);
      setUserForm({ username: '', password: '', name: '', email: '', role: 'operator', active: true });
    }
    setUserModalOpen(true);
  };
  const handleSaveUser = async () => {
    try {
      if (editingUser) {
        await updateUser(editingUser.id, {
          name: userForm.name, email: userForm.email, role: userForm.role,
          active: userForm.active, password: userForm.password || undefined,
        });
        showAlert('사용자가 수정되었습니다.', { type: 'success' });
      } else {
        if (!userForm.username || !userForm.password || !userForm.name) {
          showAlert('아이디, 비밀번호, 이름은 필수입니다.', { type: 'error' });
          return;
        }
        await createUser({
          username: userForm.username, password: userForm.password,
          name: userForm.name, email: userForm.email, role: userForm.role,
        });
        showAlert('사용자가 생성되었습니다.', { type: 'success' });
      }
      setUserModalOpen(false);
      fetchData();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '사용자 저장 실패';
      showAlert(message, { type: 'error' });
    }
  };
  const handleDeleteUser = async (userId: number, userName: string) => {
    if (!confirm(`'${userName}' 사용자를 삭제하시겠습니까?`)) return;
    try {
      await deleteUser(userId);
      showAlert('사용자가 삭제되었습니다.', { type: 'success' });
      fetchData();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '사용자 삭제 실패';
      showAlert(message, { type: 'error' });
    }
  };
  const handleLogout = async () => {
    if (!confirm('로그아웃 하시겠습니까?')) return;
    try {
      await logout();
    } catch {
    } finally {
      localStorage.removeItem('user');
      localStorage.removeItem('token');
      navigate('/');
    }
  };
  const handleSaveConfig = async () => {
    setSaving(true);
    const errors: string[] = [];
    try {
      if (config && (activeTab === 'users' || activeTab === 'system')) {
        try { await mockUpdateSystemConfig(config); }
        catch (error) { console.error('Failed to save mock config:', error); errors.push('시스템 설정'); }
      }
      if (activeTab === 'robot') {
        try {
          const updated = await updateRobotSettings(robotCoordSettings);
          setRobotCoordSettings(updated);
        } catch (error) { console.error('Failed to save robot coord settings:', error); errors.push('로봇 좌표계 설정'); }
      }
      if (activeTab === 'welding') {
        try {
          await updateWeldingConfig(touchSensingSettings);
        } catch (error) { console.error('Failed to save touch sensing settings:', error); errors.push('터치 센싱 설정'); }
      }
      if (errors.length > 0) {
        showAlert(`일부 설정 저장 실패: ${errors.join(', ')}`, { type: 'error' });
      } else {
        showAlert('설정이 저장되었습니다.', { type: 'success' });
      }
    } catch (error) {
      console.error('Failed to save config:', error);
      showAlert('설정 저장에 실패했습니다.', { type: 'error' });
    } finally {
      setSaving(false);
    }
  };
  return {
    activeTab, setActiveTab,
    users, config, setConfig,
    loading, saving,
    userModalOpen, setUserModalOpen,
    editingUser, userForm, setUserForm,
    debugMode,
    versionInfo, updateCheck, updateStatus, systemInfo,
    checkingUpdate, updating,
    robotCoordSettings, setRobotCoordSettings,
    robotError, loadingError, resettingError,
    touchSensingSettings, setTouchSensingSettings,
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
  };
}
