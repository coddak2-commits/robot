import React from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutDashboard, Cpu, ClipboardList, Settings, Target, FlaskConical } from 'lucide-react';
interface MenuItem {
  id: string;
  label: string;
  eng: string;
  icon: React.ElementType;
  path: string;
  color: string;
}
const Main: React.FC = () => {
  const navigate = useNavigate();
  const mainItems: MenuItem[] = [
    {
      id: 'dashboard',
      label: '대시보드',
      eng: 'Dashboard',
      icon: LayoutDashboard,
      path: '/dashboard',
      color: 'from-cyan-500 to-blue-500',
    },
    {
      id: 'cell-selection',
      label: '용접부 선택',
      eng: 'Cell Selection',
      icon: Target,
      path: '/cell-selection',
      color: 'from-orange-500 to-red-500',
    },
    {
      id: 'jobs',
      label: '작업 관리',
      eng: 'Job Management',
      icon: ClipboardList,
      path: '/jobs',
      color: 'from-purple-500 to-pink-500',
    },
    {
      id: 'robot-control',
      label: '로봇 제어',
      eng: 'Robot Control',
      icon: Cpu,
      path: '/robot-control',
      color: 'from-green-500 to-emerald-500',
    },
    {
      id: 'settings',
      label: '설정',
      eng: 'Settings',
      icon: Settings,
      path: '/settings',
      color: 'from-gray-500 to-slate-500',
    },
  ];
  return (
    <div className="min-h-screen bg-black p-6">
      {}
      <div className="text-center mb-8">
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">로봇 용접 제어 시스템</h1>
        <p className="text-gray-400">Robot Welding Control System</p>
      </div>
      {}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6 max-w-5xl mx-auto">
        {mainItems.map(item => {
          const IconComponent = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => navigate(item.path)}
              className={`
                relative overflow-hidden
                bg-gray-800/50 hover:bg-gray-700/50
                border-2 border-gray-700 hover:border-cyan-500/50
                rounded-3xl p-6 md:p-8
                transition-all duration-300
                touch-manipulation
                min-h-[180px] md:min-h-[220px]
                flex flex-col items-center justify-center gap-4
                group
              `}
            >
              {}
              <div
                className={`
                  absolute inset-0 opacity-0 group-hover:opacity-20
                  bg-gradient-to-br ${item.color}
                  transition-opacity duration-300
                `}
              />
              {}
              <div
                className={`
                  w-16 h-16 md:w-20 md:h-20
                  rounded-2xl
                  bg-gradient-to-br ${item.color}
                  flex items-center justify-center
                  shadow-lg
                  group-hover:scale-110 transition-transform duration-300
                `}
              >
                <IconComponent className="w-8 h-8 md:w-10 md:h-10 text-white" />
              </div>
              {}
              <div className="text-center z-10">
                <div className="text-white font-bold text-lg md:text-xl mb-1">{item.label}</div>
                <div className="text-gray-400 text-sm">{item.eng}</div>
              </div>
            </button>
          );
        })}
      </div>
      {}
      <div className="fixed bottom-0 left-0 right-0 bg-gray-900/90 border-t border-gray-800 p-4">
        <div className="flex items-center justify-center gap-8 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
            <span className="text-gray-400">시스템 정상</span>
          </div>
          <div className="text-gray-500">|</div>
          <div className="text-gray-400">
            {new Date().toLocaleString('ko-KR', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              weekday: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
export default Main;
