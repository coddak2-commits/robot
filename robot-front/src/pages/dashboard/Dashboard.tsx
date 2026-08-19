import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity, AlertTriangle, CheckCircle, Clock, Cpu, Target, Wrench, XCircle, Zap,
} from 'lucide-react';
import { PageLayout, LoadingScreen } from '../../components/common/index';
import { getRobotError, getRealtimeRobotStatus, RealtimeRobotStatus } from '../../lib/robotApi/index';
import { deviationApi, dashboardApi, DashboardStatsResponse } from '../../lib/gapApi';
import { getStatusColor, getStatusText, getStatusBg } from '../../utils';

type RealAlert = { id: string; type: 'error' | 'warning' | 'info'; message: string; timestamp: string };
type RobotStatus = 'idle' | 'running' | 'error' | 'maintenance';

const fetchRealAlerts = async (): Promise<RealAlert[]> => {
  const alerts: RealAlert[] = [];
  try {
    const err = await getRobotError();
    if (err?.has_error) {
      alerts.push({
        id: `robot-err-${err.main_code}-${err.sub_code}`,
        type: 'error',
        message: `로봇 오류: ${err.message} (${err.main_code}-${err.sub_code})`,
        timestamp: new Date().toISOString(),
      });
    }
  } catch {}
  if (typeof localStorage !== 'undefined' && localStorage.getItem('gap_token')) {
    try {
      const devs = await deviationApi.listRecent(10);
      devs.forEach(d => {
        const type: RealAlert['type'] = d.level >= 3 ? 'error' : d.level === 2 ? 'warning' : 'info';
        alerts.push({
          id: `dev-${d.id}`,
          type,
          message: `편차 [L${d.level}] ${d.point_code ?? '-'} ${d.field_name}: 지시 ${d.command_value} → 실측 ${d.actual_value} (${Number(d.deviation_pct).toFixed(1)}%)`,
          timestamp: d.created_at,
        });
      });
    } catch {}
  }
  return alerts.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
};

const deriveRobotStatus = (r: RealtimeRobotStatus | null): RobotStatus => {
  if (!r?.connected) return 'idle';
  if (r.error_code && r.error_code !== 0) return 'error';
  if (r.robot_state && r.robot_state > 1) return 'running';
  return 'idle';
};

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStatsResponse | null>(null);
  const [robot, setRobot] = useState<RealtimeRobotStatus | null>(null);
  const [realAlerts, setRealAlerts] = useState<RealAlert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [s, r, a] = await Promise.all([
          dashboardApi.stats().catch(() => null),
          getRealtimeRobotStatus().catch(() => null),
          fetchRealAlerts(),
        ]);
        setStats(s);
        setRobot(r);
        setRealAlerts(a);
      } catch (e) {
        console.error('Dashboard fetch error:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
    const i = setInterval(load, 5000);
    return () => clearInterval(i);
  }, []);

  if (loading) return <LoadingScreen text="시스템 로딩 중..." />;

  const robotStatus = deriveRobotStatus(robot);

  return (
    <PageLayout>
      {/* 상단 요약 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className={`rounded-2xl p-4 border-2 ${getStatusBg(robotStatus)} backdrop-blur-sm`}>
          <div className="flex items-center justify-between mb-2">
            <Cpu className={`w-8 h-8 ${getStatusColor(robotStatus)}`} />
            <div className={`w-3 h-3 rounded-full animate-pulse ${robotStatus === 'running' ? 'bg-green-400' : robotStatus === 'error' ? 'bg-red-400' : 'bg-cyan-400'}`}></div>
          </div>
          <div className="text-2xl font-bold text-white">{getStatusText(robotStatus)}</div>
          <div className="text-gray-400 text-sm">로봇 상태</div>
        </div>

        <div className="rounded-2xl p-4 border-2 border-green-500/30 bg-green-500/10 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-2">
            <CheckCircle className="w-8 h-8 text-green-400" />
          </div>
          <div className="text-2xl font-bold text-white">
            {stats?.completedJobs ?? 0}/{stats?.todayJobs ?? 0}
          </div>
          <div className="text-gray-400 text-sm">오늘 완료/전체</div>
        </div>

        <div className={`rounded-2xl p-4 border-2 ${(stats?.defectRate || 0) > 3 ? 'border-red-500/30 bg-red-500/10' : 'border-emerald-500/30 bg-emerald-500/10'} backdrop-blur-sm`}>
          <div className="flex items-center justify-between mb-2">
            <Target className={`w-8 h-8 ${(stats?.defectRate || 0) > 3 ? 'text-red-400' : 'text-emerald-400'}`} />
          </div>
          <div className="text-2xl font-bold text-white">{(stats?.defectRate ?? 0).toFixed(1)}%</div>
          <div className="text-gray-400 text-sm">오늘 불량률</div>
        </div>

        <div className="rounded-2xl p-4 border-2 border-cyan-500/30 bg-cyan-500/10 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-2">
            <Activity className="w-8 h-8 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold text-white">{stats?.totalWeldCount ?? 0}</div>
          <div className="text-gray-400 text-sm">누적 용접 작업</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 로봇 실시간 */}
        <div className="lg:col-span-2 bg-gray-800/60 backdrop-blur-sm rounded-2xl p-6 border border-gray-700/50">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <Cpu className="w-6 h-6 text-cyan-400" />
              로봇 실시간
            </h2>
            <span className={`px-4 py-2 rounded-full text-sm font-medium ${getStatusBg(robotStatus)} ${getStatusColor(robotStatus)}`}>
              {getStatusText(robotStatus)}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gray-900/60 rounded-xl p-4 border border-gray-700/50">
              <div className="text-gray-400 text-sm mb-3 font-medium">조인트 각도 (°)</div>
              <div className="grid grid-cols-3 gap-2">
                {(robot?.joints ?? [0, 0, 0, 0, 0, 0]).map((v, i) => (
                  <div key={i} className="text-center p-2 bg-gray-800/50 rounded-lg">
                    <div className="text-gray-500 text-xs font-medium">J{i + 1}</div>
                    <div className="text-cyan-400 font-mono text-sm">{v.toFixed(1)}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-gray-900/60 rounded-xl p-4 border border-gray-700/50">
              <div className="text-gray-400 text-sm mb-3 font-medium">TCP 위치 (mm / °)</div>
              <div className="grid grid-cols-3 gap-2">
                {(robot?.tcp ?? [0, 0, 0, 0, 0, 0]).map((v, i) => {
                  const labels = ['X', 'Y', 'Z', 'RX', 'RY', 'RZ'];
                  return (
                    <div key={i} className="text-center p-2 bg-gray-800/50 rounded-lg">
                      <div className="text-gray-500 text-xs font-medium">{labels[i]}</div>
                      <div className="text-cyan-400 font-mono text-sm">{v.toFixed(1)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {!robot?.connected && (
            <div className="mt-4 p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/30 text-yellow-300 text-sm text-center">
              로봇 미연결 — Robot Core 서버 상태를 확인하세요
            </div>
          )}
        </div>

        {/* 현재 작업 */}
        <div className="bg-gray-800/60 backdrop-blur-sm rounded-2xl p-6 border border-gray-700/50">
          <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
            <Zap className="w-6 h-6 text-yellow-400" />
            현재 작업
          </h2>
          {stats?.currentJob ? (
            <div className="space-y-4">
              <div className="bg-gray-900/60 rounded-xl p-4 border border-gray-700/50">
                <div className="text-lg font-medium text-white mb-2">
                  {stats.currentJob.job_name ?? `작업 #${stats.currentJob.id}`}
                </div>
                {stats.currentJob.cell_type && (
                  <div className="inline-block px-3 py-1 rounded-full text-xs font-medium bg-cyan-500/20 text-cyan-400 mb-4">
                    {stats.currentJob.cell_type}
                  </div>
                )}
                {stats.currentJob.started_at && (
                  <div className="text-gray-400 text-sm">
                    시작: {new Date(stats.currentJob.started_at).toLocaleString('ko-KR')}
                  </div>
                )}
              </div>
              <button
                onClick={() => navigate('/pendant')}
                className="w-full py-4 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 rounded-xl text-white font-medium transition touch-manipulation min-h-[56px]"
              >
                작업 화면 열기
              </button>
            </div>
          ) : (
            <div className="text-center py-8">
              <Clock className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <div className="text-gray-400 mb-4">진행 중인 작업 없음</div>
              <button
                onClick={() => navigate('/pendant')}
                className="px-6 py-4 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 rounded-xl text-white font-medium transition touch-manipulation min-h-[56px]"
              >
                작업 시작
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 알림 + 빠른 이동 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <div className="bg-gray-800/60 backdrop-blur-sm rounded-2xl p-6 border border-gray-700/50">
          <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
            <AlertTriangle className="w-6 h-6 text-yellow-400" />
            시스템 알림
            {stats && stats.recentDeviations24h > 0 && (
              <span className="text-xs text-gray-400 font-normal ml-2">
                (24h 편차 {stats.recentDeviations24h}건)
              </span>
            )}
          </h2>
          <div className="space-y-3 max-h-[250px] overflow-y-auto">
            {realAlerts.length === 0 && (
              <div className="p-4 rounded-xl bg-gray-700/20 border border-gray-600/30 text-gray-400 text-sm text-center">
                현재 알림 없음
              </div>
            )}
            {realAlerts.map(alert => (
              <div
                key={alert.id}
                className={`p-4 rounded-xl flex items-start gap-3 ${
                  alert.type === 'error'
                    ? 'bg-red-500/10 border border-red-500/30'
                    : alert.type === 'warning'
                      ? 'bg-yellow-500/10 border border-yellow-500/30'
                      : 'bg-blue-500/10 border border-blue-500/30'
                }`}
              >
                {alert.type === 'error' && <XCircle className="w-5 h-5 text-red-400 flex-shrink-0" />}
                {alert.type === 'warning' && <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0" />}
                {alert.type === 'info' && <Activity className="w-5 h-5 text-blue-400 flex-shrink-0" />}
                <div className="flex-1">
                  <div className="text-white text-sm">{alert.message}</div>
                  <div className="text-gray-500 text-xs mt-1">
                    {new Date(alert.timestamp).toLocaleString('ko-KR', {
                      year: '2-digit', month: '2-digit', day: '2-digit',
                      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-gray-800/60 backdrop-blur-sm rounded-2xl p-6 border border-gray-700/50">
          <h2 className="text-xl font-semibold text-white mb-4">빠른 이동</h2>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => navigate('/pendant')}
              className="p-4 bg-gray-900/60 hover:bg-gray-700/60 rounded-xl border border-gray-700/50 transition touch-manipulation flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center">
                <Target className="w-6 h-6 text-white" />
              </div>
              <span className="text-white font-medium">Pendant</span>
            </button>
            <button onClick={() => navigate('/cell-selection')}
              className="p-4 bg-gray-900/60 hover:bg-gray-700/60 rounded-xl border border-gray-700/50 transition touch-manipulation flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-red-600 rounded-xl flex items-center justify-center">
                <Cpu className="w-6 h-6 text-white" />
              </div>
              <span className="text-white font-medium">티칭</span>
            </button>
            <button onClick={() => navigate('/jobs')}
              className="p-4 bg-gray-900/60 hover:bg-gray-700/60 rounded-xl border border-gray-700/50 transition touch-manipulation flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center">
                <Activity className="w-6 h-6 text-white" />
              </div>
              <span className="text-white font-medium">작업 관리</span>
            </button>
            <button onClick={() => navigate('/settings')}
              className="p-4 bg-gray-900/60 hover:bg-gray-700/60 rounded-xl border border-gray-700/50 transition touch-manipulation flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-gray-500 to-slate-600 rounded-xl flex items-center justify-center">
                <Wrench className="w-6 h-6 text-white" />
              </div>
              <span className="text-white font-medium">시스템 설정</span>
            </button>
          </div>
        </div>
      </div>
    </PageLayout>
  );
};
export default Dashboard;
