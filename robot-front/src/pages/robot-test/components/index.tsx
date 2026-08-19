import React, { useState } from 'react';
const ArrowUp = () => (
  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
  </svg>
);
const ArrowDown = () => (
  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
);
const ArrowLeft = () => (
  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
  </svg>
);
const ArrowRight = () => (
  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
);
const RotateCcw = () => (
  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);
const RotateCw = () => (
  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 4v5h-.582M4.582 9A8.001 8.001 0 0119.418 9m0 0H15m-11 11v-5h.581m0 0a8.003 8.003 0 0015.357 2M4.581 15H9" />
  </svg>
);
const ArrowCartesianJogPanel: React.FC<{
  tcp: number[];
  onJogStart: (axis: number, direction: number) => void;
  onJogStop: () => void;
  activeJog: ActiveJog | null;
  disabled?: boolean;
}> = ({ tcp, onJogStart, onJogStop, disabled }) => {
  return (
    <div className="flex flex-col md:flex-row gap-6 justify-center items-center">
      {}
      <div className="text-center">
        <div className="text-gray-400 text-sm mb-2 font-medium">XY 평면</div>
        <div className="grid grid-cols-3 gap-2">
          <div></div>
          <ArrowJogButton icon={<ArrowUp />} label="+Y" onStart={() => onJogStart(2, 1)} onStop={onJogStop} disabled={disabled} />
          <div></div>
          <ArrowJogButton icon={<ArrowLeft />} label="-X" onStart={() => onJogStart(1, 0)} onStop={onJogStop} disabled={disabled} />
          <div className="w-[70px] h-[70px] bg-gray-900/60 rounded-xl border border-gray-700/50 flex flex-col items-center justify-center">
            <span className="text-orange-400 text-xs font-bold">XY</span>
            <span className="text-gray-400 text-[10px] mt-1">
              {tcp[0]?.toFixed(1)}, {tcp[1]?.toFixed(1)}
            </span>
          </div>
          <ArrowJogButton icon={<ArrowRight />} label="+X" onStart={() => onJogStart(1, 1)} onStop={onJogStop} disabled={disabled} />
          <div></div>
          <ArrowJogButton icon={<ArrowDown />} label="-Y" onStart={() => onJogStart(2, 0)} onStop={onJogStop} disabled={disabled} />
          <div></div>
        </div>
      </div>
      {}
      <div className="text-center">
        <div className="text-gray-400 text-sm mb-2 font-medium">Z축</div>
        <div className="flex flex-col gap-2">
          <ArrowJogButton icon={<ArrowUp />} label="+Z" onStart={() => onJogStart(3, 1)} onStop={onJogStop} disabled={disabled} />
          <div className="w-[70px] h-[40px] bg-gray-900/60 rounded-xl border border-gray-700/50 flex items-center justify-center">
            <span className="text-orange-400 text-xs font-mono">{tcp[2]?.toFixed(1)}</span>
          </div>
          <ArrowJogButton icon={<ArrowDown />} label="-Z" onStart={() => onJogStart(3, 0)} onStop={onJogStop} disabled={disabled} />
        </div>
      </div>
      {}
      <div className="text-center">
        <div className="text-gray-400 text-sm mb-2 font-medium">RZ 회전</div>
        <div className="flex gap-2">
          <ArrowJogButton icon={<RotateCcw />} label="-RZ" onStart={() => onJogStart(6, 0)} onStop={onJogStop} disabled={disabled} />
          <ArrowJogButton icon={<RotateCw />} label="+RZ" onStart={() => onJogStart(6, 1)} onStop={onJogStop} disabled={disabled} />
        </div>
        <div className="mt-2 text-orange-400 text-xs font-mono">{tcp[5]?.toFixed(1)}°</div>
      </div>
      {}
      <div className="text-center">
        <div className="text-gray-400 text-sm mb-2 font-medium">RX/RY</div>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <ArrowJogButton icon={<span className="text-lg font-bold">↻</span>} label="+RX" onStart={() => onJogStart(4, 1)} onStop={onJogStop} disabled={disabled} className="min-w-[60px] min-h-[50px]" />
            <ArrowJogButton icon={<span className="text-lg font-bold">↺</span>} label="-RX" onStart={() => onJogStart(4, 0)} onStop={onJogStop} disabled={disabled} className="min-w-[60px] min-h-[50px]" />
          </div>
          <div className="flex flex-col gap-1">
            <ArrowJogButton icon={<span className="text-lg font-bold">↻</span>} label="+RY" onStart={() => onJogStart(5, 1)} onStop={onJogStop} disabled={disabled} className="min-w-[60px] min-h-[50px]" />
            <ArrowJogButton icon={<span className="text-lg font-bold">↺</span>} label="-RY" onStart={() => onJogStart(5, 0)} onStop={onJogStop} disabled={disabled} className="min-w-[60px] min-h-[50px]" />
          </div>
        </div>
      </div>
    </div>
  );
};
export const ArrowCartesianJogPanel_ArrowCartesianJogPanel = ArrowCartesianJogPanel;
const ArrowJointJogPanel: React.FC<{
  joints: number[];
  onJogStart: (axis: number, direction: number) => void;
  onJogStop: () => void;
  activeJog: ActiveJog | null;
  disabled?: boolean;
}> = ({ joints, onJogStart, onJogStop, activeJog, disabled }) => {
  const RotateCw = () => (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 4v5h-.581M4.582 9A8.001 8.001 0 0119.418 9m0 0H15m-11 11v-5h.581m0 0a8.003 8.003 0 0015.357 2M4.581 15H9" />
    </svg>
  );
  const RotateCcw = () => (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
  const jointColors = [
    { bg: 'from-cyan-600 to-cyan-700', text: 'text-cyan-400', border: 'border-cyan-500/50' },
    { bg: 'from-blue-600 to-blue-700', text: 'text-blue-400', border: 'border-blue-500/50' },
    { bg: 'from-indigo-600 to-indigo-700', text: 'text-indigo-400', border: 'border-indigo-500/50' },
    { bg: 'from-purple-600 to-purple-700', text: 'text-purple-400', border: 'border-purple-500/50' },
    { bg: 'from-pink-600 to-pink-700', text: 'text-pink-400', border: 'border-pink-500/50' },
    { bg: 'from-rose-600 to-rose-700', text: 'text-rose-400', border: 'border-rose-500/50' },
  ];
  const JointControl: React.FC<{ index: number }> = ({ index }) => {
    const color = jointColors[index];
    const isActive = activeJog?.axis === index + 1;
    const [isPlusPressed, setIsPlusPressed] = useState(false);
    const [isMinusPressed, setIsMinusPressed] = useState(false);
    const handlePlusStart = () => {
      if (!disabled) {
        setIsPlusPressed(true);
        onJogStart(index + 1, 1);
      }
    };
    const handleMinusStart = () => {
      if (!disabled) {
        setIsMinusPressed(true);
        onJogStart(index + 1, 0);
      }
    };
    const handleStop = () => {
      setIsPlusPressed(false);
      setIsMinusPressed(false);
      onJogStop();
    };
    return (
      <div className={`
        flex flex-col items-center p-3 rounded-2xl
        bg-gradient-to-b from-gray-800/80 to-gray-900/80
        border-2 transition-all duration-200
        ${isActive ? `${color.border} shadow-lg` : 'border-gray-700/50'}
      `}>
        {}
        <button
          onMouseDown={handlePlusStart}
          onMouseUp={handleStop}
          onMouseLeave={() => { if (isPlusPressed) handleStop(); }}
          onTouchStart={(e) => { e.preventDefault(); handlePlusStart(); }}
          onTouchEnd={(e) => { e.preventDefault(); handleStop(); }}
          disabled={disabled}
          className={`
            w-14 h-12 rounded-xl flex items-center justify-center
            transition-all duration-100 touch-manipulation
            ${disabled
              ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
              : isPlusPressed
                ? `bg-gradient-to-b ${color.bg} text-white scale-95`
                : 'bg-gray-700/80 hover:bg-gray-600 text-white border border-gray-600'
            }
          `}
        >
          <RotateCw />
        </button>
        {}
        <div className="my-2 text-center">
          <div className={`text-xl font-bold ${color.text}`}>J{index + 1}</div>
          <div className="text-sm font-mono text-white mt-1">
            {joints[index]?.toFixed(1)}°
          </div>
          {isActive && (
            <div className={`text-xs mt-1 ${color.text} animate-pulse`}>
              {activeJog?.direction === 1 ? '↻ +' : '↺ -'}
            </div>
          )}
        </div>
        {}
        <button
          onMouseDown={handleMinusStart}
          onMouseUp={handleStop}
          onMouseLeave={() => { if (isMinusPressed) handleStop(); }}
          onTouchStart={(e) => { e.preventDefault(); handleMinusStart(); }}
          onTouchEnd={(e) => { e.preventDefault(); handleStop(); }}
          disabled={disabled}
          className={`
            w-14 h-12 rounded-xl flex items-center justify-center
            transition-all duration-100 touch-manipulation
            ${disabled
              ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
              : isMinusPressed
                ? `bg-gradient-to-b ${color.bg} text-white scale-95`
                : 'bg-gray-700/80 hover:bg-gray-600 text-white border border-gray-600'
            }
          `}
        >
          <RotateCcw />
        </button>
      </div>
    );
  };
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="text-gray-400 text-sm font-medium">
        관절 회전 제어 (J1 ~ J6)
      </div>
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <JointControl key={index} index={index} />
        ))}
      </div>
      <div className="flex items-center gap-4 text-xs text-gray-500">
        <div className="flex items-center gap-1">
          <RotateCw />
          <span>양(+) 방향</span>
        </div>
        <div className="flex items-center gap-1">
          <RotateCcw />
          <span>음(-) 방향</span>
        </div>
      </div>
    </div>
  );
};
export const ArrowJointJogPanel_ArrowJointJogPanel = ArrowJointJogPanel;
interface ConnectionPanelProps {
  robotIp: string;
  setRobotIp: (ip: string) => void;
  isConnected: boolean;
  isConnecting: boolean;
  connectRobot: () => void;
  disconnectRobot: () => void;
  robotStatus: RobotStatusInfo;
  isServoLoading: boolean;
  enableServo: () => void;
  disableServo: () => void;
  jogSpeed: number;
  setJogSpeed: (speed: number) => void;
  emergencyStop: () => void;
  error: string | null;
}
const ConnectionPanel: React.FC<ConnectionPanelProps> = ({
  robotIp,
  setRobotIp,
  isConnected,
  isConnecting,
  connectRobot,
  disconnectRobot,
  robotStatus,
  isServoLoading,
  enableServo,
  disableServo,
  jogSpeed,
  setJogSpeed,
  emergencyStop,
  error,
}) => {
  return (
    <div
      className="bg-white/5 backdrop-blur rounded-xl p-4 mb-4 border border-white/10"
      data-audit="dup"
      data-audit-note="중복: 로봇 연결/해제·에러 — /robot-control 와 전역 Header(상단 연결/에러 초기화)에 중복"
      data-audit-loc="src/pages/robot-test/components/ConnectionPanel.tsx:38"
    >
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex flex-col">
          <label className="text-xs text-gray-400 mb-1">로봇 IP</label>
          <input
            type="text"
            value={robotIp}
            onChange={e => setRobotIp(e.target.value)}
            disabled={isConnected}
            className="px-3 py-2 text-sm rounded-lg border border-gray-600 bg-gray-800 disabled:bg-gray-700 text-white w-36 focus:outline-none focus:border-cyan-500"
          />
        </div>
        {!isConnected ? (
          <button
            onClick={connectRobot}
            disabled={isConnecting}
            className={`px-5 py-2 text-sm font-bold rounded-lg border-none transition-colors ${
              isConnecting
                ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                : 'bg-cyan-500 hover:bg-cyan-400 text-black cursor-pointer'
            }`}
          >
            {isConnecting ? '연결 중...' : '연결'}
          </button>
        ) : (
          <button
            onClick={disconnectRobot}
            className="px-5 py-2 text-sm font-bold rounded-lg border-none bg-red-500 hover:bg-red-400 text-white cursor-pointer transition-colors"
          >
            연결 해제
          </button>
        )}
        <div className="flex items-center gap-2">
          <div
            className={`w-3 h-3 rounded-full ${
              isConnected
                ? 'bg-green-400 shadow-[0_0_10px_#00ff88]'
                : 'bg-red-500 shadow-[0_0_10px_#ff4757]'
            }`}
          />
          <span className={`text-sm ${isConnected ? 'text-green-400' : 'text-red-500'}`}>
            {isConnected ? '연결됨' : '연결 안됨'}
          </span>
        </div>
        {}
        {isConnected && (
          <div className="flex items-center gap-2">
            <span className="text-gray-400 text-sm">서보:</span>
            <div
              className={`flex items-center gap-1 px-2 py-1 rounded text-sm ${
                robotStatus.servo_enabled === true
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                  : robotStatus.servo_enabled === false
                    ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                    : 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
              }`}
            >
              <div
                className={`w-2 h-2 rounded-full ${
                  robotStatus.servo_enabled === true
                    ? 'bg-blue-400'
                    : robotStatus.servo_enabled === false
                      ? 'bg-yellow-400 animate-pulse'
                      : 'bg-gray-400'
                }`}
              />
              <span>
                {robotStatus.servo_enabled === true
                  ? 'ON'
                  : robotStatus.servo_enabled === false
                    ? 'OFF'
                    : '-'}
              </span>
            </div>
            <button
              onClick={enableServo}
              disabled={isServoLoading || robotStatus.servo_enabled === true}
              className={`px-2 py-1 text-xs font-bold rounded transition-colors ${
                isServoLoading || robotStatus.servo_enabled === true
                  ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-500 text-white cursor-pointer'
              }`}
            >
              {isServoLoading ? '...' : 'ON'}
            </button>
            <button
              onClick={disableServo}
              disabled={isServoLoading || robotStatus.servo_enabled !== true}
              className={`px-2 py-1 text-xs font-bold rounded transition-colors ${
                isServoLoading || robotStatus.servo_enabled !== true
                  ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                  : 'bg-yellow-600 hover:bg-yellow-500 text-white cursor-pointer'
              }`}
            >
              {isServoLoading ? '...' : 'OFF'}
            </button>
            <span className="text-gray-500">|</span>
            <span className="text-gray-400 text-sm">상태:</span>
            <span
              className={`px-2 py-1 rounded text-sm ${
                robotStatus.error_code === 0
                  ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                  : 'bg-red-500/20 text-red-400 border border-red-500/30'
              }`}
            >
              {robotStatus.error_code ?? '-'}
            </span>
          </div>
        )}
        {}
        {isConnected && (
          <>
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-xs text-gray-400">속도:</span>
              <input
                type="range"
                min="1"
                max="100"
                value={jogSpeed}
                onChange={e => setJogSpeed(Number(e.target.value))}
                className="w-24 accent-cyan-500"
              />
              <input
                type="number"
                min="1"
                max="100"
                value={jogSpeed}
                onChange={e => {
                  const val = Math.min(100, Math.max(1, Number(e.target.value) || 1));
                  setJogSpeed(val);
                }}
                className="w-14 px-2 py-1 text-sm text-center rounded border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 focus:outline-none focus:border-cyan-400 font-mono"
              />
              <span className="text-sm text-gray-400">%</span>
            </div>
            <button
              onClick={emergencyStop}
              className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg transition-colors"
            >
              비상정지
            </button>
          </>
        )}
      </div>
      {error && (
        <div className="mt-3 p-2 bg-red-500/20 rounded-lg text-red-400 text-sm border border-red-500/30">
          {error}
        </div>
      )}
      {}
      {isConnected && (robotStatus.error_message || robotStatus.warning) && (
        <div className="mt-3 p-3 bg-black/30 rounded-lg border border-white/10">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            {robotStatus.error_message && (
              <span className={robotStatus.error_code === 0 ? 'text-green-400' : 'text-yellow-400'}>
                {robotStatus.error_message}
              </span>
            )}
            {robotStatus.warning && (
              <span className="text-orange-400">⚠️ {robotStatus.warning}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
export const ConnectionPanel_ConnectionPanel = ConnectionPanel;
export const JogButton: React.FC<{
  label: string;
  direction: 'up' | 'down';
  color: string;
  onStart: () => void;
  onStop: () => void;
  disabled?: boolean;
}> = ({ label, direction, color, onStart, onStop, disabled }) => {
  const [isPressed, setIsPressed] = useState(false);
  const handleMouseDown = () => {
    console.log('[JogButton] mouseDown:', { label, disabled });
    if (!disabled) {
      setIsPressed(true);
      onStart();
    }
  };
  const handleMouseUp = () => {
    if (isPressed) {
      setIsPressed(false);
      onStop();
    }
  };
  const handleMouseLeave = () => {
    if (isPressed) {
      setIsPressed(false);
      onStop();
    }
  };
  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    if (!disabled) {
      setIsPressed(true);
      onStart();
    }
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    e.preventDefault();
    if (isPressed) {
      setIsPressed(false);
      onStop();
    }
  };
  const isUp = direction === 'up';
  return (
    <button
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      disabled={disabled}
      className={`
        w-full h-12 flex items-center justify-center
        font-bold text-sm select-none
        transition-all duration-100
        ${disabled
          ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
          : `bg-gradient-to-${isUp ? 'b' : 't'} ${color} hover:brightness-110 active:scale-95 cursor-pointer`
        }
        ${isUp ? 'rounded-t-xl' : 'rounded-b-xl'}
      `}
      style={{
        background: disabled ? undefined : `linear-gradient(${isUp ? '180deg' : '0deg'}, ${color.includes('cyan') ? '#06b6d4' : '#f97316'}, ${color.includes('cyan') ? '#0891b2' : '#ea580c'})`
      }}
    >
      <span className="text-white drop-shadow-md">
        {isUp ? '▲' : '▼'} {label}
      </span>
    </button>
  );
};
export const ArrowJogButton: React.FC<{
  icon: React.ReactNode;
  label: string;
  onStart: () => void;
  onStop: () => void;
  disabled?: boolean;
  className?: string;
}> = ({ icon, label, onStart, onStop, disabled, className = '' }) => {
  const [isPressed, setIsPressed] = useState(false);
  const handleMouseDown = () => {
    if (!disabled) {
      setIsPressed(true);
      onStart();
    }
  };
  const handleMouseUp = () => {
    if (isPressed) {
      setIsPressed(false);
      onStop();
    }
  };
  const handleMouseLeave = () => {
    if (isPressed) {
      setIsPressed(false);
      onStop();
    }
  };
  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    if (!disabled) {
      setIsPressed(true);
      onStart();
    }
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    e.preventDefault();
    if (isPressed) {
      setIsPressed(false);
      onStop();
    }
  };
  return (
    <button
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      disabled={disabled}
      className={`
        flex flex-col items-center justify-center rounded-xl p-3
        transition-all duration-100 touch-manipulation font-medium
        ${disabled
          ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
          : isPressed
            ? 'bg-orange-500 text-white scale-95'
            : 'bg-gray-700/80 hover:bg-gray-600 active:bg-orange-500 text-white border border-gray-600'
        }
        min-w-[70px] min-h-[70px] ${className}
      `}
    >
      {icon}
      <span className="text-xs mt-1 opacity-80">{label}</span>
    </button>
  );
};
interface DanceStep {
  name: string;
  joints: number[];
}
interface MoveTargetPanelProps {
  joints: number[];
  targetJoints: number[];
  setTargetJoints: (joints: number[]) => void;
  jogSpeed: number;
  isMoving: boolean;
  moveResult: MoveResult | null;
  moveToTarget: () => void;
  copyCurrentToTarget: () => void;
  updateTargetJoint: (index: number, value: string) => void;
  addToAllJoints: (delta: number) => void;
  isDancing: boolean;
  danceStep: number;
  danceSequence: DanceStep[];
  startDance: () => void;
  stopDance: () => void;
}
const MoveTargetPanel: React.FC<MoveTargetPanelProps> = ({
  targetJoints,
  setTargetJoints,
  jogSpeed,
  isMoving,
  moveResult,
  moveToTarget,
  copyCurrentToTarget,
  updateTargetJoint,
  addToAllJoints,
  isDancing,
  danceStep,
  danceSequence,
  startDance,
  stopDance,
}) => {
  return (
    <>
      <div
        className="mt-4 bg-white/5 backdrop-blur rounded-xl p-4 border border-white/10"
        data-audit="dup"
        data-audit-note="중복: 지정 위치로 MoveJ 이동 — /robot-control 와 /settings/robot(포인트테이블 '실행')에 중복"
        data-audit-loc="src/pages/robot-test/components/MoveTargetPanel.tsx:47"
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-purple-400">목표 위치로 이동 (MoveJ)</h3>
          <span className="text-sm text-gray-400">속도: {jogSpeed}%</span>
        </div>
        {}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-4">
          {JOINT_LABELS.map((label, index) => (
            <div key={label} className="flex flex-col">
              <label className="text-xs text-purple-300 mb-1 text-center">{label}</label>
              <input
                type="number"
                step="0.1"
                value={targetJoints[index]}
                onChange={e => updateTargetJoint(index, e.target.value)}
                className="px-2 py-2 text-center text-sm rounded-lg border border-purple-500/30 bg-purple-500/10 text-white focus:outline-none focus:border-purple-400 font-mono"
              />
            </div>
          ))}
        </div>
        {}
        <div className="flex flex-wrap gap-2 items-center">
          <button
            onClick={copyCurrentToTarget}
            className="px-3 py-2 text-sm rounded-lg bg-gray-600 hover:bg-gray-500 text-white transition-colors"
          >
            현재 위치 복사
          </button>
          <button
            onClick={() => addToAllJoints(5)}
            className="px-3 py-2 text-sm rounded-lg bg-green-600 hover:bg-green-500 text-white transition-colors"
          >
            전체 +5°
          </button>
          <button
            onClick={() => addToAllJoints(-5)}
            className="px-3 py-2 text-sm rounded-lg bg-red-600 hover:bg-red-500 text-white transition-colors"
          >
            전체 -5°
          </button>
          <button
            onClick={() => addToAllJoints(15)}
            className="px-3 py-2 text-sm rounded-lg bg-green-700 hover:bg-green-600 text-white transition-colors"
          >
            전체 +15°
          </button>
          <button
            onClick={() => addToAllJoints(-15)}
            className="px-3 py-2 text-sm rounded-lg bg-red-700 hover:bg-red-600 text-white transition-colors"
          >
            전체 -15°
          </button>
          <button
            onClick={() => setTargetJoints([0, 0, 0, 0, 0, 0])}
            className="px-3 py-2 text-sm rounded-lg bg-gray-700 hover:bg-gray-600 text-white transition-colors"
          >
            초기화 (0°)
          </button>
          <button
            onClick={moveToTarget}
            disabled={isMoving}
            className={`px-6 py-2 text-sm font-bold rounded-lg transition-all ${
              isMoving
                ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                : 'bg-purple-600 hover:bg-purple-500 text-white cursor-pointer shadow-lg shadow-purple-500/30 hover:shadow-purple-500/50'
            }`}
          >
            {isMoving ? '이동 중...' : '이동'}
          </button>
          {!isDancing ? (
            <button
              onClick={startDance}
              className="px-6 py-2 text-sm font-bold rounded-lg bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white cursor-pointer shadow-lg shadow-pink-500/30 hover:shadow-pink-500/50 transition-all"
            >
              댄스 시작
            </button>
          ) : (
            <button
              onClick={stopDance}
              className="px-6 py-2 text-sm font-bold rounded-lg bg-red-600 hover:bg-red-500 text-white cursor-pointer shadow-lg shadow-red-500/30 transition-all animate-pulse"
            >
              댄스 정지
            </button>
          )}
          {}
          {moveResult && (
            <div
              className={`px-4 py-2 rounded-lg text-sm ${
                moveResult.success
                  ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                  : 'bg-red-500/20 text-red-400 border border-red-500/30'
              }`}
            >
              {moveResult.message}
            </div>
          )}
        </div>
      </div>
      {}
      {isDancing && (
        <div className="mt-4 bg-white/5 backdrop-blur rounded-xl p-4 border border-white/10">
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-sm text-pink-300 animate-pulse">
              댄스 Step {danceStep}/{danceSequence.length + 1}
            </span>
            <div className="flex gap-2">
              {danceSequence.map((step, idx) => (
                <div
                  key={idx}
                  className={`px-2 py-1 text-xs rounded ${
                    danceStep === idx + 1
                      ? 'bg-pink-500 text-white'
                      : danceStep > idx + 1
                        ? 'bg-green-500/30 text-green-400'
                        : 'bg-gray-700 text-gray-500'
                  }`}
                >
                  {step.name}
                </div>
              ))}
              <div
                className={`px-2 py-1 text-xs rounded ${
                  danceStep === danceSequence.length + 1
                    ? 'bg-pink-500 text-white'
                    : 'bg-gray-700 text-gray-500'
                }`}
              >
                복귀
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
export const MoveTargetPanel_MoveTargetPanel = MoveTargetPanel;
interface PositionDisplayProps {
  joints: number[];
  tcp: number[];
}
const PositionDisplay: React.FC<PositionDisplayProps> = ({ joints, tcp }) => {
  return (
    <div
      className="grid grid-cols-1 md:grid-cols-2 gap-4"
      data-audit="dup"
      data-audit-note="중복: 현재 위치(조인트/TCP) 표시 — /robot-control, /settings/robot(포인트테이블 실시간행), /dashboard(mock)에 중복"
      data-audit-loc="src/pages/robot-test/components/PositionDisplay.tsx:11"
    >
      {}
      <div className="bg-white/5 backdrop-blur rounded-xl p-4 border border-white/10">
        <h3 className="text-sm font-semibold mb-3 text-cyan-400">현재 관절 위치</h3>
        <div className="grid grid-cols-3 gap-2">
          {JOINT_LABELS.map((label, index) => (
            <div
              key={label}
              className="flex justify-between items-center px-3 py-2 bg-cyan-500/10 rounded-lg"
            >
              <span className="text-xs font-bold text-cyan-400">{label}</span>
              <span className="text-sm font-mono text-white">
                {(joints[index] || 0).toFixed(2)}°
              </span>
            </div>
          ))}
        </div>
      </div>
      {}
      <div className="bg-white/5 backdrop-blur rounded-xl p-4 border border-white/10">
        <h3 className="text-sm font-semibold mb-3 text-orange-400">현재 TCP 위치</h3>
        <div className="grid grid-cols-3 gap-2">
          {TCP_LABELS.map((label, index) => (
            <div
              key={label}
              className="flex justify-between items-center px-3 py-2 bg-orange-500/10 rounded-lg"
            >
              <span className="text-xs font-bold text-orange-400">{label}</span>
              <span className="text-sm font-mono text-white">
                {index < 3 ? `${(tcp[index] || 0).toFixed(2)}` : `${(tcp[index] || 0).toFixed(2)}°`}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
export const PositionDisplay_PositionDisplay = PositionDisplay;
export interface RobotStatus {
  connected: boolean;
  joints?: number[];
  tcp?: number[];
  error?: string;
  error_code?: number;
  error_message?: string;
  servo_enabled?: boolean;
  reason?: string;
  warning?: string;
}
export interface ActiveJog {
  axis: number;
  direction: number;
}
export interface RobotStatusInfo {
  error_code?: number;
  error_message?: string;
  servo_enabled?: boolean;
  warning?: string;
}
export interface MoveResult {
  success: boolean;
  message: string;
}
export const JOINT_LABELS = ['J1', 'J2', 'J3', 'J4', 'J5', 'J6'] as const;
export const TCP_LABELS = ['X', 'Y', 'Z', 'RX', 'RY', 'RZ'] as const;
