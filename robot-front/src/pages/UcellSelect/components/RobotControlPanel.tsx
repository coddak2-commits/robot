import React, { useState, useEffect, useCallback, memo, useMemo } from 'react';
import { AlertTriangle, Edit3, Trash2, Check, X, Clock, FolderOpen, ChevronLeft, ChevronRight, Target, Shield, Settings, Wrench, History, RefreshCw, Save, Home, Circle, GripVertical, Play, Square, Pause, RotateCcw, Wifi, WifiOff, Zap, MapPin, Navigation, Crosshair } from 'lucide-react';
import { WeldingLogData, getWeldingLogs, deleteWeldingLogs, updateWeldingLog, RealtimeRobotStatus, getRealtimeRobotStatus, getWeldingPartOrder } from '../../../lib';
import Modal from 'react-modal';
import { useAlert } from '../../../contexts';
import { useGapAuth } from '../../../contexts/gapAuth';
import { TeachingPoint, WeaveParams, WEAVING_TYPE_OPTIONS, UCellData, HEIGHT_OPTIONS } from '..';
import { Button } from '../../../components/common';
import { RobotMoveData } from '../../../types/RobotData';
import { useSortable, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import type { WeldingPartOrderItem } from '../../../lib';
import { DEFAULT_WORKSPACE, DEFAULT_COLORS } from './unifiedCanvas/types';
import type { PartToggleConfig, UnifiedWorkspaceCanvasProps } from './unifiedCanvas/types';
import { GridLayer } from './unifiedCanvas/GridLayer';
import { UCellLayer } from './unifiedCanvas/UCellLayer';
import { PathLayer } from './unifiedCanvas/PathLayer';
import { CenterlineLayer } from './unifiedCanvas/CenterlineLayer';
import { DimensionLinesLayer } from './unifiedCanvas/DimensionLinesLayer';
import { WeldPointsLayer } from './unifiedCanvas/WeldPointsLayer';
import { PartToggleLayer } from './unifiedCanvas/PartToggleLayer';
import { CurrentPositionLayer } from './unifiedCanvas/CurrentPositionLayer';
import { useDragAndDrop } from './unifiedCanvas/useDragAndDrop';

interface RobotControlPanelProps {
  isRobotMoving: boolean;
  isArcTesting: boolean;
  isPaused: boolean;
  isTeachingPolling: boolean;
  teachingRobotState: RealtimeRobotStatus | null;
  manualMoveSpeed: number;
  simulationMode: boolean;
  hasResumableSession: boolean;
  onStartArcTest: () => void;
  onStopArcTest: () => void;
  onStartWelding: () => void;
  onStopRobot: () => void;
  onPauseRobot: () => void;
  onResumeRobot: () => void;
  onDismissResumable: () => void;
  onStartPolling: () => void;
  onStopPolling: () => void;
  onManualMoveSpeedChange: (speed: number) => void;
  onSimulationModeChange: (enabled: boolean) => void;
}
const RobotControlPanel: React.FC<RobotControlPanelProps> = memo(({
  isRobotMoving,
  isArcTesting,
  isPaused,
  isTeachingPolling,
  teachingRobotState,
  manualMoveSpeed,
  simulationMode,
  hasResumableSession,
  onStartArcTest,
  onStopArcTest,
  onStartWelding,
  onStopRobot,
  onPauseRobot,
  onResumeRobot,
  onDismissResumable,
  onStartPolling,
  onStopPolling,
  onManualMoveSpeedChange,
  onSimulationModeChange,
}) => {
  const isRunning = isRobotMoving || isArcTesting;
  const { isAdmin } = useGapAuth();
  return (
    <div className="space-y-4">
      {}
      <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
        <div className="flex items-center gap-2">
          {isTeachingPolling ? (
            <Wifi className="w-4 h-4 text-green-400" />
          ) : (
            <WifiOff className="w-4 h-4 text-gray-500" />
          )}
          <span className="text-sm text-gray-300">
            {isTeachingPolling ? '실시간 연결됨' : '연결 안됨'}
          </span>
        </div>
        <button
          onClick={isTeachingPolling ? onStopPolling : onStartPolling}
          className={`px-3 py-1 text-xs rounded transition ${
            isTeachingPolling
              ? 'bg-gray-600 hover:bg-gray-500 text-gray-300'
              : 'bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400'
          }`}
        >
          {isTeachingPolling ? '연결 해제' : '연결'}
        </button>
      </div>
      {}
      {teachingRobotState && (
        <div className="p-3 bg-gray-800/50 rounded-lg space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">서보</span>
            <span className={teachingRobotState.servo_enabled ? 'text-green-400' : 'text-red-400'}>
              {teachingRobotState.servo_enabled ? '활성화' : '비활성화'}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">모드</span>
            <span className={teachingRobotState.robot_mode === 1 ? 'text-orange-400' : 'text-cyan-400'}>
              {teachingRobotState.robot_mode === 1 ? '수동' : '자동'}
            </span>
          </div>
          {teachingRobotState.error_code !== 0 && (
            <div className="text-xs text-red-400 bg-red-400/10 p-2 rounded">
              에러: {teachingRobotState.error_message || `코드 ${teachingRobotState.error_code}`}
            </div>
          )}
        </div>
      )}
      {}
      {isAdmin && (
        <div className="p-3 bg-gray-800/50 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-300">이동 속도 <span className="text-xs text-amber-400 ml-1">관리자</span></span>
            <span className="text-sm text-cyan-400 font-medium">{manualMoveSpeed}%</span>
          </div>
          <input
            type="range"
            min="1"
            max="100"
            value={manualMoveSpeed}
            onChange={e => onManualMoveSpeedChange(Number(e.target.value))}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
          />
        </div>
      )}
      {}
      <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
        <div className="flex items-center gap-2">
          <Zap className={`w-4 h-4 ${simulationMode ? 'text-yellow-400' : 'text-gray-500'}`} />
          <span className="text-sm text-gray-300">시뮬레이션 모드</span>
        </div>
        <button
          onClick={() => onSimulationModeChange(!simulationMode)}
          className={`px-3 py-1 text-xs rounded transition ${
            simulationMode
              ? 'bg-yellow-500/20 text-yellow-400'
              : 'bg-gray-600 text-gray-400'
          }`}
        >
          {simulationMode ? 'ON' : 'OFF'}
        </button>
      </div>
      {}
      {hasResumableSession && !isRunning && (
        <div className="p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg">
          <p className="text-sm text-orange-400 mb-2">이전에 중단된 작업이 있습니다.</p>
          <div className="flex gap-2">
            <button
              onClick={onResumeRobot}
              className="flex-1 px-3 py-1.5 bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 rounded text-sm transition"
            >
              이어서 진행
            </button>
            <button
              onClick={onDismissResumable}
              className="px-3 py-1.5 bg-gray-600 hover:bg-gray-500 text-gray-300 rounded text-sm transition"
            >
              무시
            </button>
          </div>
        </div>
      )}
      {}
      <div className="grid grid-cols-2 gap-2">
        {}
        {!isArcTesting ? (
          <button
            onClick={onStartArcTest}
            disabled={isRunning}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Play className="w-5 h-5" />
            <span>아크 테스트</span>
          </button>
        ) : (
          <button
            onClick={onStopArcTest}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition"
          >
            <Square className="w-5 h-5" />
            <span>테스트 중지</span>
          </button>
        )}
        {}
        {!isRobotMoving ? (
          <button
            onClick={onStartWelding}
            disabled={isRunning}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Zap className="w-5 h-5" />
            <span>용접 시작</span>
          </button>
        ) : (
          <button
            onClick={onStopRobot}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition"
          >
            <Square className="w-5 h-5" />
            <span>정지</span>
          </button>
        )}
        {}
        {isRobotMoving && !isPaused && (
          <button
            onClick={onPauseRobot}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 rounded-lg transition col-span-2"
          >
            <Pause className="w-5 h-5" />
            <span>일시정지</span>
          </button>
        )}
        {}
        {isPaused && (
          <button
            onClick={onResumeRobot}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg transition col-span-2"
          >
            <RotateCcw className="w-5 h-5" />
            <span>재개</span>
          </button>
        )}
      </div>
    </div>
  );
});
RobotControlPanel.displayName = 'RobotControlPanel';
export const RobotControlPanel_RobotControlPanel = RobotControlPanel;
