import React from 'react';
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, RotateCcw, RotateCw, Minus, Plus, Gauge, Home, Square, RefreshCw, Power, AlertTriangle, CheckCircle, Thermometer } from 'lucide-react';
import { RobotJoints, RobotTCF } from '../../../types/RobotData';
interface JogControlPanelProps {
  controlMode: 'joint' | 'cartesian';
  selectedJoint: number;
  joints: RobotJoints;
  speed: number;
  isMoving: boolean;
  onControlModeChange: (mode: 'joint' | 'cartesian') => void;
  onSelectJoint: (joint: number) => void;
  onMoveJoint: (joint: number, delta: number) => void;
  onMoveCartesian: (axis: keyof RobotTCF, delta: number) => void;
}
const JogButton: React.FC<{
  icon: React.ReactNode;
  onPress: () => void;
  label?: string;
  className?: string;
  disabled?: boolean;
  variant?: 'default' | 'primary' | 'danger';
}> = ({ icon, onPress, label, className = '', disabled = false, variant = 'default' }) => {
  const baseClass =
    'flex flex-col items-center justify-center rounded-2xl p-4 transition-all duration-150 touch-manipulation font-medium';
  const variantClass =
    variant === 'primary'
      ? 'bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 text-white'
      : variant === 'danger'
        ? 'bg-red-600 hover:bg-red-500 active:bg-red-700 text-white'
        : 'bg-gray-700/80 hover:bg-gray-600 active:bg-cyan-600 text-white border border-gray-600';
  return (
    <button
      onTouchStart={onPress}
      onClick={onPress}
      disabled={disabled}
      className={`${baseClass} ${variantClass} disabled:opacity-50 disabled:cursor-not-allowed min-w-[80px] min-h-[80px] ${className}`}
    >
      {icon}
      {label && <span className="text-xs mt-1 opacity-80">{label}</span>}
    </button>
  );
};
export const JogControlPanel: React.FC<JogControlPanelProps> = ({
  controlMode, selectedJoint, joints, speed, isMoving,
  onControlModeChange, onSelectJoint, onMoveJoint, onMoveCartesian,
}) => (
  <div className="lg:col-span-5 bg-gray-800/60 backdrop-blur-sm rounded-2xl p-6 border border-gray-700/50">
    <div className="flex items-center justify-between mb-6">
      <h2 className="text-xl font-semibold text-white">조그 제어</h2>
      <div className="flex bg-gray-900/60 rounded-xl p-1">
        <button
          onClick={() => onControlModeChange('joint')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            controlMode === 'joint' ? 'bg-cyan-600 text-white' : 'text-gray-400 hover:text-white'
          }`}
        >
          조인트
        </button>
        <button
          onClick={() => onControlModeChange('cartesian')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            controlMode === 'cartesian' ? 'bg-cyan-600 text-white' : 'text-gray-400 hover:text-white'
          }`}
        >
          직교
        </button>
      </div>
    </div>
    {controlMode === 'joint' ? (
      <div className="space-y-6">
        <div className="grid grid-cols-6 gap-2">
          {[1, 2, 3, 4, 5, 6].map(num => (
            <button
              key={num}
              onClick={() => onSelectJoint(num)}
              className={`py-4 rounded-xl text-lg font-bold transition touch-manipulation ${
                selectedJoint === num
                  ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-500/30'
                  : 'bg-gray-700/80 text-gray-300 hover:bg-gray-600 border border-gray-600'
              }`}
            >
              J{num}
            </button>
          ))}
        </div>
        <div className="flex justify-center items-center gap-8 py-8">
          <JogButton
            icon={<Minus className="w-12 h-12" />}
            onPress={() => onMoveJoint(selectedJoint, -speed * 0.1)}
            label={`-${(speed * 0.1).toFixed(1)}°`}
            className="w-36 h-36"
            disabled={isMoving}
          />
          <div className="text-center">
            <div className="text-5xl font-bold text-cyan-400 font-mono">
              {(Number(joints[`j${selectedJoint}` as keyof RobotJoints]) || 0).toFixed(1)}°
            </div>
            <div className="text-gray-400 mt-2">J{selectedJoint} 현재 각도</div>
          </div>
          <JogButton
            icon={<Plus className="w-12 h-12" />}
            onPress={() => onMoveJoint(selectedJoint, speed * 0.1)}
            label={`+${(speed * 0.1).toFixed(1)}°`}
            className="w-36 h-36"
            disabled={isMoving}
          />
        </div>
      </div>
    ) : (
      <div className="space-y-6">
        <div className="flex justify-center">
          <div className="text-center">
            <div className="text-gray-400 text-sm mb-3 font-medium">XY 평면</div>
            <div className="grid grid-cols-3 gap-2">
              <div></div>
              <JogButton icon={<ArrowUp className="w-8 h-8" />} onPress={() => onMoveCartesian('y', speed)} label="+Y" disabled={isMoving} />
              <div></div>
              <JogButton icon={<ArrowLeft className="w-8 h-8" />} onPress={() => onMoveCartesian('x', -speed)} label="-X" disabled={isMoving} />
              <div className="w-20 h-20 bg-gray-900/60 rounded-xl border border-gray-700/50 flex items-center justify-center">
                <span className="text-gray-500 text-xs">XY</span>
              </div>
              <JogButton icon={<ArrowRight className="w-8 h-8" />} onPress={() => onMoveCartesian('x', speed)} label="+X" disabled={isMoving} />
              <div></div>
              <JogButton icon={<ArrowDown className="w-8 h-8" />} onPress={() => onMoveCartesian('y', -speed)} label="-Y" disabled={isMoving} />
              <div></div>
            </div>
          </div>
        </div>
        <div className="flex justify-center gap-8">
          <div className="text-center">
            <div className="text-gray-400 text-sm mb-3 font-medium">Z축</div>
            <div className="flex gap-2">
              <JogButton icon={<ArrowDown className="w-8 h-8" />} onPress={() => onMoveCartesian('z', -speed)} label="-Z" disabled={isMoving} />
              <JogButton icon={<ArrowUp className="w-8 h-8" />} onPress={() => onMoveCartesian('z', speed)} label="+Z" disabled={isMoving} />
            </div>
          </div>
          <div className="text-center">
            <div className="text-gray-400 text-sm mb-3 font-medium">RZ 회전</div>
            <div className="flex gap-2">
              <JogButton icon={<RotateCcw className="w-8 h-8" />} onPress={() => onMoveCartesian('rz', -speed * 0.1)} label="-RZ" disabled={isMoving} />
              <JogButton icon={<RotateCw className="w-8 h-8" />} onPress={() => onMoveCartesian('rz', speed * 0.1)} label="+RZ" disabled={isMoving} />
            </div>
          </div>
        </div>
      </div>
    )}
  </div>
);
export const JogControlPanel_JogControlPanel = JogControlPanel;
interface JointDisplayProps {
  joints: RobotJoints;
  controlMode: 'joint' | 'cartesian';
  selectedJoint: number;
  onSelectJoint: (joint: number) => void;
  onSetControlMode: (mode: 'joint') => void;
}
export const JointDisplay: React.FC<JointDisplayProps> = ({
  joints, controlMode, selectedJoint, onSelectJoint, onSetControlMode,
}) => (
  <div className="bg-gray-800/60 backdrop-blur-sm rounded-2xl p-5 border border-gray-700/50">
    <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
      <Gauge className="w-5 h-5 text-cyan-400" />
      조인트 각도
    </h2>
    <div className="space-y-2">
      {(Object.entries(joints) as [string, number | string][]).map(
        ([key, value], index) => (
          <button
            key={key}
            onClick={() => {
              onSetControlMode('joint');
              onSelectJoint(index + 1);
            }}
            className={`w-full p-3 rounded-xl transition touch-manipulation flex justify-between items-center ${
              controlMode === 'joint' && selectedJoint === index + 1
                ? 'bg-cyan-600/30 border-2 border-cyan-500'
                : 'bg-gray-900/60 border border-gray-700/50 hover:bg-gray-700/50'
            }`}
          >
            <span className="text-gray-400 font-medium">{key.toUpperCase()}</span>
            <span className="text-cyan-400 font-mono text-lg">
              {typeof value === 'number' ? value.toFixed(2) : value}°
            </span>
          </button>
        ),
      )}
    </div>
  </div>
);
export const JointDisplay_JointDisplay = JointDisplay;
interface RightControlPanelProps {
  speed: number;
  robotMode: 0 | 1;
  isMoving: boolean;
  onSpeedChange: (speed: number) => void;
  onToggleMode: () => void;
  onGoHome: () => void;
  onRefresh: () => void;
  onStop: () => void;
}
export const RightControlPanel: React.FC<RightControlPanelProps> = ({
  speed, robotMode, isMoving,
  onSpeedChange, onToggleMode, onGoHome, onRefresh, onStop,
}) => (
  <div className="lg:col-span-4 space-y-4">
    {}
    <div className="bg-gray-800/60 backdrop-blur-sm rounded-2xl p-6 border border-gray-700/50">
      <h2 className="text-lg font-semibold text-white mb-4">속도 설정</h2>
      <div className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-gray-400">이동 속도</span>
          <span className="text-3xl font-bold text-cyan-400">{speed}%</span>
        </div>
        <input
          type="range"
          min="1"
          max="100"
          value={speed}
          onChange={e => onSpeedChange(Number(e.target.value))}
          className="w-full h-3 bg-gray-700 rounded-full appearance-none cursor-pointer accent-cyan-500"
        />
      </div>
      <div className="grid grid-cols-4 gap-2">
        {[10, 25, 50, 100].map(preset => (
          <button
            key={preset}
            onClick={() => onSpeedChange(preset)}
            className={`py-3 rounded-xl text-sm font-bold transition touch-manipulation ${
              speed === preset
                ? 'bg-cyan-600 text-white'
                : 'bg-gray-700/80 text-gray-300 hover:bg-gray-600 border border-gray-600'
            }`}
          >
            {preset}%
          </button>
        ))}
      </div>
    </div>
    {}
    <div className="bg-gray-800/60 backdrop-blur-sm rounded-2xl p-6 border border-gray-700/50">
      <h2 className="text-lg font-semibold text-white mb-4">로봇 모드</h2>
      <button
        onClick={onToggleMode}
        className={`w-full py-5 rounded-xl font-bold text-lg transition touch-manipulation flex items-center justify-center gap-3 ${
          robotMode === 0
            ? 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white'
            : 'bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-500 hover:to-orange-500 text-white'
        }`}
      >
        <Power className="w-6 h-6" />
        {robotMode === 0 ? '자동 모드' : '수동 모드'}
      </button>
      <div className="mt-3 p-3 bg-gray-900/60 rounded-xl">
        <div className="flex items-center gap-2 text-sm">
          {robotMode === 0 ? (
            <>
              <CheckCircle className="w-4 h-4 text-green-400" />
              <span className="text-gray-300">프로그램 자동 실행 모드</span>
            </>
          ) : (
            <>
              <AlertTriangle className="w-4 h-4 text-yellow-400" />
              <span className="text-gray-300">수동 조그 제어 모드</span>
            </>
          )}
        </div>
      </div>
    </div>
    {}
    <div className="space-y-3">
      <button
        onClick={onGoHome}
        disabled={isMoving}
        className="w-full py-5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 rounded-xl text-white font-bold text-lg transition touch-manipulation flex items-center justify-center gap-3"
      >
        <Home className="w-6 h-6" />홈 위치로 이동
      </button>
      <button
        onClick={onRefresh}
        className="w-full py-4 bg-gray-700/80 hover:bg-gray-600 rounded-xl text-white font-medium transition touch-manipulation flex items-center justify-center gap-2 border border-gray-600"
      >
        <RefreshCw className="w-5 h-5" />
        위치 새로고침
      </button>
      <button
        onClick={onStop}
        className="w-full py-8 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 rounded-xl text-white font-bold text-2xl transition touch-manipulation flex items-center justify-center gap-3 shadow-lg shadow-red-500/30"
      >
        <Square className="w-8 h-8 fill-current" />
        비상 정지
      </button>
    </div>
  </div>
);
export const RightControlPanel_RightControlPanel = RightControlPanel;
interface TcpDisplayProps {
  tcp: RobotTCF;
  controlMode: 'joint' | 'cartesian';
  onSetControlMode: (mode: 'cartesian') => void;
}
export const TcpDisplay: React.FC<TcpDisplayProps> = ({
  tcp, controlMode, onSetControlMode,
}) => (
  <div className="bg-gray-800/60 backdrop-blur-sm rounded-2xl p-5 border border-gray-700/50">
    <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
      <Thermometer className="w-5 h-5 text-cyan-400" />
      TCP 위치
    </h2>
    <div className="grid grid-cols-2 gap-2">
      {(Object.entries(tcp) as [string, number | string][]).map(([key, value]) => (
        <button
          key={key}
          onClick={() => onSetControlMode('cartesian')}
          className={`p-3 rounded-xl transition touch-manipulation ${
            controlMode === 'cartesian'
              ? 'bg-cyan-600/30 border-2 border-cyan-500'
              : 'bg-gray-900/60 border border-gray-700/50 hover:bg-gray-700/50'
          }`}
        >
          <div className="text-gray-500 text-xs font-medium">{key.toUpperCase()}</div>
          <div className="text-cyan-400 font-mono">
            {typeof value === 'number' ? value.toFixed(1) : value}
          </div>
        </button>
      ))}
    </div>
  </div>
);
export const TcpDisplay_TcpDisplay = TcpDisplay;
