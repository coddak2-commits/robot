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
import { PointItem } from './PointItem';
import { SortablePointItem } from './SortablePointItem';

export interface TeachingTabContentProps {
  teachingPoints: TeachingPoint[];
  selectedPointId: string | null;
  isRobotMoving: boolean;
  isWelding: boolean;
  isTouchSensing: boolean;
  isTeachingPolling: boolean;
  teachingRobotState: { connected?: boolean } | null;
  manualMoveSpeed: number;
  simulationMode: boolean;
  dryRunMode: boolean;
  currentPointIndex: number;
  savedPointsCount: number;
  isSavingJob: boolean;
  onSelectPoint: (id: string | null) => void;
  onSavePosition: (id: string) => void;
  onClearPoint: (id: string) => void;
  onClearAllPoints: () => void;
  onMoveToPoint: (point: TeachingPoint) => void;
  onSpeedChange: (speed: number) => void;
  onSimulationModeChange: (enabled: boolean) => void;
  onDryRunModeChange: (enabled: boolean) => void;
  onStartTouchSensing: () => void;
  onStopTouchSensing: () => void;
  onStartWelding: () => void;
  onStartWeldingTest?: () => void;
  onContinueWelding: () => void;
  onStopWelding: () => void;
  onOpenJobList: () => void;
  onSaveJob: () => void;
  onUpdatePointSpeed: (pointId: string, speed: number, velMode?: 0 | 1) => void;
  onUpdatePointWeldParams: (pointId: string, voltage: number | null, current: number | null) => void;
  onUpdatePointGap: (pointId: string, gap: number) => void;
  gapThicknessMm: number;
  onGapThicknessChange: (v: number) => void;
  onUpdatePointWeaveParams: (pointId: string, params: Partial<WeaveParams>) => void;
  onUpdatePointWeavingType: (pointId: string, type: string | null) => void;
  onApplyParamsToBlock: (sourcePointId: string) => void;
  onApplyParamsToAll: (sourcePointId: string) => void;
  onReorderPoints: (activeId: string, overId: string) => void;
  onGlobalEmergencyStop: () => void;
  onPauseRobot: () => void;
  onResumeRobot: () => void;
}
export function TeachingTabContent({
  teachingPoints,
  selectedPointId,
  isRobotMoving,
  isWelding,
  isTouchSensing,
  isTeachingPolling,
  teachingRobotState,
  manualMoveSpeed,
  simulationMode,
  dryRunMode,
  currentPointIndex,
  savedPointsCount,
  isSavingJob,
  onSelectPoint,
  onSavePosition,
  onClearPoint,
  onClearAllPoints,
  onMoveToPoint,
  onSpeedChange,
  onSimulationModeChange,
  onDryRunModeChange,
  onStartTouchSensing,
  onStopTouchSensing,
  onStartWelding,
  onStartWeldingTest,
  onContinueWelding,
  onStopWelding,
  onOpenJobList,
  onSaveJob,
  onUpdatePointSpeed,
  onUpdatePointWeldParams,
  onUpdatePointGap,
  gapThicknessMm,
  onGapThicknessChange,
  onUpdatePointWeaveParams,
  onUpdatePointWeavingType,
  onApplyParamsToBlock,
  onApplyParamsToAll,
  onReorderPoints,
  onGlobalEmergencyStop,
  onPauseRobot,
  onResumeRobot,
}: TeachingTabContentProps) {
  const { show: showAlert } = useAlert();
  const isRunning = isRobotMoving || isWelding || isTouchSensing;
  const savedPoints = teachingPoints.filter(pt => pt.id !== 'home' && pt.isSaved);
  const { isAdmin } = useGapAuth();
  const handleClearAllPoints = () => {
    showAlert(`저장된 ${savedPointsCount}개 포인트를 모두 초기화하시겠습니까? 이 작업은 되돌릴 수 없습니다.`, {
      type: 'warning',
      title: '전체 초기화 확인',
      onConfirm: onClearAllPoints,
    });
  };
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      onReorderPoints(active.id as string, over.id as string);
    }
  };
  const sortableIds = teachingPoints
    .filter(pt => pt.id !== 'home')
    .map(pt => pt.id);
  return (
    <div className="space-y-4">
      {}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MapPin className="w-5 h-5 text-purple-400" />
          <span className="text-white font-medium">포인트 티칭</span>
          <span className="text-xs text-gray-400">({savedPointsCount}/{teachingPoints.length})</span>
        </div>
        <div className="flex gap-1 items-center">
          <button onClick={onOpenJobList} className="p-1.5 flex items-center justify-center bg-cyan-500/20 text-cyan-400 rounded hover:bg-cyan-500/30" title="불러오기">
            <FolderOpen className="w-4 h-4" />
          </button>
          <button onClick={onSaveJob} disabled={savedPointsCount === 0 || isSavingJob} className="p-1.5 flex items-center justify-center bg-green-500/20 text-green-400 rounded hover:bg-green-500/30 disabled:opacity-50" title="저장">
            <Save className="w-4 h-4" />
          </button>
          <button onClick={handleClearAllPoints} disabled={savedPointsCount === 0} className="p-1.5 flex items-center justify-center bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 disabled:opacity-50" title="초기화">
            <Trash2 className="w-4 h-4" />
          </button>
          <div className="w-px h-5 bg-gray-700 mx-1" />
          <button
            onClick={() => onSimulationModeChange(!simulationMode)}
            className={`px-2 py-1 text-xs rounded flex items-center gap-1 ${simulationMode ? 'bg-yellow-500/20 text-yellow-400' : 'bg-gray-600 text-gray-400'}`}
            title="시뮬레이션 모드"
          >
            <Zap className="w-3 h-3" />
            {simulationMode ? 'SIM ON' : 'SIM OFF'}
          </button>
        </div>
      </div>
      {}
      {isAdmin && (
        <div className="bg-gray-800/50 rounded-lg p-3">
          <div className="flex justify-between mb-2">
            <span className="text-xs text-gray-400">이동 속도 <span className="text-amber-400 ml-1">관리자</span></span>
            <span className="text-xs text-cyan-400 font-mono">{manualMoveSpeed}%</span>
          </div>
          <input
            type="range"
            min="1"
            max="100"
            value={manualMoveSpeed}
            onChange={(e) => onSpeedChange(Number(e.target.value))}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
          />
        </div>
      )}
      {}
      {!simulationMode && (
        <div>
          <label className={`flex items-center justify-between p-2.5 bg-gray-800/50 rounded-lg cursor-pointer hover:bg-gray-800/70 transition-colors ${isRunning ? 'opacity-50 cursor-not-allowed' : ''}`}>
            <div className="flex items-center gap-2">
              <Settings className={`w-4 h-4 ${dryRunMode ? 'text-orange-400' : 'text-gray-400'}`} />
              <span className={`text-sm ${dryRunMode ? 'text-orange-300' : 'text-gray-300'}`}>DryRun 모드</span>
              <span className="text-xs text-gray-500">(아크/가스 없이 이동만)</span>
            </div>
            <div
              onClick={(e) => { if (!isRunning) { e.preventDefault(); onDryRunModeChange(!dryRunMode); } }}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                dryRunMode ? 'bg-orange-500' : 'bg-gray-600'
              }`}
            >
              <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                dryRunMode ? 'translate-x-5' : 'translate-x-0'
              }`} />
            </div>
          </label>
        </div>
      )}
      {}
      {!isWelding && !isTouchSensing ? (
        <div className="flex gap-1.5">
          {!simulationMode && (
            <button
              onClick={onStartTouchSensing}
              disabled={isRunning || savedPoints.length === 0}
              className={`flex-1 py-2.5 ${
                dryRunMode ? 'bg-purple-500/80 hover:bg-purple-400/80' : 'bg-purple-600 hover:bg-purple-500'
              } disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg flex flex-col items-center justify-center`}
            >
              <Crosshair className="w-4 h-4 mb-0.5" />
              {dryRunMode ? '터치테스트' : '터치센싱'}
            </button>
          )}
          {}
          {!simulationMode && onStartWeldingTest && (
            <button
              onClick={onStartWeldingTest}
              disabled={isRunning || savedPoints.length === 0}
              className="flex-1 py-2.5 bg-yellow-600 hover:bg-yellow-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg flex flex-col items-center justify-center"
            >
              <span>용접</span>
              <span>테스트</span>
            </button>
          )}
          <button
            onClick={onStartWelding}
            disabled={isRunning || savedPoints.length === 0}
            className="flex-1 py-2.5 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg flex flex-col items-center justify-center"
          >
            {simulationMode ? <Zap className="w-4 h-4 mb-0.5" /> : null}
            <span>{simulationMode ? '시뮬레이션' : (dryRunMode ? 'DryRun' : '용접')}</span>
            {!simulationMode && <span>시작</span>}
          </button>
          {!simulationMode && (
            <button
              onClick={onContinueWelding}
              disabled={isRunning || savedPoints.length === 0}
              className="flex-1 py-2.5 bg-orange-600 hover:bg-orange-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg flex flex-col items-center justify-center"
            >
              <span>{dryRunMode ? 'DryRun' : '용접'}</span>
              <span>계속</span>
            </button>
          )}
          <button
            onClick={onGlobalEmergencyStop}
            className={`flex-1 py-2.5 text-white text-xs font-bold rounded-lg flex flex-col items-center justify-center border-2 transition ${
              isRunning
                ? 'bg-red-600 hover:bg-red-500 border-red-400 animate-pulse'
                : 'bg-red-700 hover:bg-red-600 border-red-500'
            }`}
          >
            <Square className="w-4 h-4 mb-0.5" />
            비상정지
          </button>
        </div>
      ) : (
        <div className="flex gap-1.5">
          <div className={`flex-1 p-2.5 rounded-lg border animate-pulse ${
            isTouchSensing ? 'bg-purple-900/30 border-purple-500/30' : 'bg-yellow-900/30 border-yellow-500/30'
          }`}>
            <p className={`text-sm font-medium ${isTouchSensing ? 'text-purple-400' : 'text-yellow-400'}`}>
              {isTouchSensing
                ? (dryRunMode ? '터치 테스트' : '터치 센싱')
                : (dryRunMode ? 'DryRun' : '용접')
              } 진행 중: {currentPointIndex + 1} / {savedPoints.length}
            </p>
          </div>
          {(() => {
            const arcActive = !isTouchSensing && !dryRunMode;
            const pauseDisabledClass = 'px-3 py-2.5 bg-gray-800/60 text-gray-600 text-xs font-medium rounded-lg flex flex-col items-center justify-center border border-gray-700/50 cursor-not-allowed';
            const pauseMsg = '용접(아크 On) 중에는 일시정지를 사용할 수 없습니다 - 모션만 멈추고 아크는 꺼지지 않습니다';
            const resumeMsg = '용접(아크 On) 중에는 재개를 사용할 수 없습니다';
            // disabled 버튼은 터치에서 title 툴팁이 안 보여서 이유를 알 방법이 없었다.
            // 클릭은 항상 받되, 막힌 상태면 실제 동작 대신 이유를 알림으로 띄운다.
            return (
              <>
                <button
                  onClick={() => (arcActive ? showAlert(pauseMsg, { type: 'warning' }) : onPauseRobot())}
                  title={arcActive ? pauseMsg : undefined}
                  className={arcActive ? pauseDisabledClass : 'px-3 py-2.5 bg-yellow-900/60 hover:bg-yellow-800/60 text-yellow-400 text-xs font-medium rounded-lg flex flex-col items-center justify-center border border-yellow-600/50'}
                >
                  <Pause className="w-4 h-4 mb-0.5" />
                  일시정지
                </button>
                <button
                  onClick={() => (arcActive ? showAlert(resumeMsg, { type: 'warning' }) : onResumeRobot())}
                  title={arcActive ? resumeMsg : undefined}
                  className={arcActive ? pauseDisabledClass : 'px-3 py-2.5 bg-green-900/60 hover:bg-green-800/60 text-green-400 text-xs font-medium rounded-lg flex flex-col items-center justify-center border border-green-600/50'}
                >
                  <RotateCcw className="w-4 h-4 mb-0.5" />
                  재개
                </button>
              </>
            );
          })()}
          <button
            onClick={onGlobalEmergencyStop}
            className="px-4 py-2.5 text-white text-xs font-bold rounded-lg flex flex-col items-center justify-center border-2 bg-red-600 hover:bg-red-500 border-red-400 animate-pulse"
          >
            <Square className="w-4 h-4 mb-0.5" />
            비상정지
          </button>
        </div>
      )}
      {}
      <div className="space-y-0.5">
        {}
        {teachingPoints.filter(pt => pt.id === 'home').map((point) => (
          <PointItem
            key={point.id}
            point={point}
            isSelected={selectedPointId === point.id}
            isRunning={isRunning}
            isTeachingPolling={isTeachingPolling}
            teachingRobotConnected={teachingRobotState?.connected ?? false}
            isDraggable={false}
            onSelect={() => onSelectPoint(selectedPointId === point.id ? null : point.id)}
            onSavePosition={() => onSavePosition(point.id)}
            onClearPoint={() => onClearPoint(point.id)}
            onMoveToPoint={() => onMoveToPoint(point)}
            onUpdateSpeed={(speed, velMode) => onUpdatePointSpeed(point.id, speed, velMode)}
            onUpdateWeldParams={(voltage, current) => onUpdatePointWeldParams(point.id, voltage, current)}
            onUpdateGap={(gap) => onUpdatePointGap(point.id, gap)}
            gapThicknessMm={gapThicknessMm}
            onUpdateWeaveParams={(params) => onUpdatePointWeaveParams(point.id, params)}
            onUpdateWeavingType={(type) => onUpdatePointWeavingType(point.id, type)}
            onApplyParamsToBlock={() => onApplyParamsToBlock(point.id)}
            onApplyParamsToAll={() => onApplyParamsToAll(point.id)}
            onSaveJob={onSaveJob}
          />
        ))}
        {}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
            {teachingPoints.filter(pt => pt.id !== 'home').map((point) => (
              <SortablePointItem
                key={point.id}
                point={point}
                isSelected={selectedPointId === point.id}
                isRunning={isRunning}
                isTeachingPolling={isTeachingPolling}
                teachingRobotConnected={teachingRobotState?.connected ?? false}
                onSelect={() => onSelectPoint(selectedPointId === point.id ? null : point.id)}
                onSavePosition={() => onSavePosition(point.id)}
                onClearPoint={() => onClearPoint(point.id)}
                onMoveToPoint={() => onMoveToPoint(point)}
                onUpdateSpeed={(speed, velMode) => onUpdatePointSpeed(point.id, speed, velMode)}
                onUpdateWeldParams={(voltage, current) => onUpdatePointWeldParams(point.id, voltage, current)}
                onUpdateGap={(gap) => onUpdatePointGap(point.id, gap)}
                    gapThicknessMm={gapThicknessMm}
                onUpdateWeaveParams={(params) => onUpdatePointWeaveParams(point.id, params)}
                onUpdateWeavingType={(type) => onUpdatePointWeavingType(point.id, type)}
                onApplyParamsToBlock={() => onApplyParamsToBlock(point.id)}
                onApplyParamsToAll={() => onApplyParamsToAll(point.id)}
                onSaveJob={onSaveJob}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}
export const TeachingTabContent_TeachingTabContent = TeachingTabContent;
