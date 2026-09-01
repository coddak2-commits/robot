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

interface TeachingPointPanelProps {
  teachingPoints: TeachingPoint[];
  selectedPointId: string | null;
  isRobotMoving: boolean;
  onSelectPoint: (pointId: string) => void;
  onSavePoint: (pointId: string) => void;
  onClearPoint: (pointId: string) => void;
  onMoveToPoint: (point: TeachingPoint) => void;
  onUpdateSpeed: (pointId: string, speed: number, velMode?: 0 | 1) => void;
  onUpdateWeldParams: (pointId: string, voltage: number | null, current: number | null) => void;
  onUpdateWeavingType: (pointId: string, type: string | null) => void;
}
const TeachingPointPanel: React.FC<TeachingPointPanelProps> = memo(
  ({
    teachingPoints,
    selectedPointId,
    isRobotMoving,
    onSelectPoint,
    onSavePoint,
    onClearPoint,
    onMoveToPoint,
    onUpdateSpeed,
    onUpdateWeldParams,
    onUpdateWeavingType,
  }) => {
    const selectedPoint = teachingPoints.find(pt => pt.id === selectedPointId);
    return (
      <div className="flex flex-col h-full">
        {}
        <div className="flex-1 overflow-y-auto space-y-1 pr-1">
          {teachingPoints.map(point => (
            <div
              key={point.id}
              onClick={() => onSelectPoint(point.id)}
              className={`
              flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all
              ${
                selectedPointId === point.id
                  ? 'bg-cyan-500/20 border border-cyan-500/50'
                  : 'bg-gray-800/50 border border-transparent hover:bg-gray-700/50'
              }
            `}
            >
              <div className="flex items-center gap-2">
                {point.id === 'home' ? (
                  <Home
                    className={`w-4 h-4 ${point.isSaved ? 'text-green-400' : 'text-gray-500'}`}
                  />
                ) : (
                  <Circle
                    className={`w-4 h-4 ${point.isSaved ? 'text-cyan-400' : 'text-gray-500'}`}
                  />
                )}
                <span className={`text-sm ${point.isSaved ? 'text-white' : 'text-gray-500'}`}>
                  {point.name}
                </span>
              </div>
              <div className="flex items-center gap-1">
                {point.isSaved && (
                  <span className="text-xs text-green-400 bg-green-400/10 px-1.5 py-0.5 rounded">
                    저장됨
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
        {}
        {selectedPoint && (
          <div className="mt-3 p-3 bg-gray-800/80 rounded-lg border border-gray-700 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                <MapPin className="w-4 h-4 text-cyan-400" />
                {selectedPoint.name}
              </h4>
              <div className="flex gap-1">
                <button
                  onClick={() => onSavePoint(selectedPoint.id)}
                  className="p-1.5 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded transition"
                  title="현재 위치 저장"
                >
                  <Save className="w-4 h-4" />
                </button>
                {selectedPoint.isSaved && (
                  <>
                    <button
                      onClick={() => onMoveToPoint(selectedPoint)}
                      disabled={isRobotMoving}
                      className="p-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 rounded transition disabled:opacity-50"
                      title="이 위치로 이동"
                    >
                      <Navigation className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onClearPoint(selectedPoint.id)}
                      className="p-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded transition"
                      title="포인트 삭제"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            </div>
            {}
            {selectedPoint.isSaved && selectedPoint.tcp && (
              <div className="text-xs text-gray-400 space-y-1">
                <div className="grid grid-cols-3 gap-2">
                  <span>X: {selectedPoint.tcp.x.toFixed(2)}</span>
                  <span>Y: {selectedPoint.tcp.y.toFixed(2)}</span>
                  <span>Z: {selectedPoint.tcp.z.toFixed(2)}</span>
                </div>
              </div>
            )}
            {}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 w-16">이동속도</span>
                <div className="flex-1 flex items-center gap-2">
                  {}
                  <div className="flex bg-gray-700 rounded overflow-hidden">
                    <button
                      onClick={() =>
                        onUpdateSpeed(
                          selectedPoint.id,
                          selectedPoint.velMode === 1 ? 20 : selectedPoint.moveSpeed,
                          0,
                        )
                      }
                      className={`px-2 py-0.5 text-xs transition ${
                        selectedPoint.velMode === 0
                          ? 'bg-cyan-500 text-white'
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      %
                    </button>
                    <button
                      onClick={() =>
                        onUpdateSpeed(
                          selectedPoint.id,
                          selectedPoint.velMode === 0 ? 30 : selectedPoint.moveSpeed,
                          1,
                        )
                      }
                      className={`px-2 py-0.5 text-xs transition ${
                        selectedPoint.velMode === 1
                          ? 'bg-cyan-500 text-white'
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      CPM
                    </button>
                  </div>
                  {}
                  {selectedPoint.velMode === 0 ? (
                    <>
                      <input
                        type="range"
                        min="1"
                        max="100"
                        value={selectedPoint.moveSpeed}
                        onChange={e => onUpdateSpeed(selectedPoint.id, Number(e.target.value), 0)}
                        className="flex-1 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                      />
                      <span className="text-xs text-cyan-400 w-12 text-right">
                        {selectedPoint.moveSpeed}%
                      </span>
                    </>
                  ) : (
                    <>
                      <input
                        type="number"
                        min="1"
                        max="200"
                        value={selectedPoint.moveSpeed}
                        onChange={e => onUpdateSpeed(selectedPoint.id, Number(e.target.value), 1)}
                        className="w-16 px-2 py-0.5 bg-gray-700 border border-gray-600 rounded text-sm text-white text-center"
                      />
                      <span className="text-xs text-cyan-400">cm/min</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            {}
            {selectedPoint.id !== 'home' && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">용접전압 (V)</label>
                    <input
                      type="number"
                      value={selectedPoint.weldVoltage ?? ''}
                      onChange={e =>
                        onUpdateWeldParams(
                          selectedPoint.id,
                          e.target.value ? Number(e.target.value) : null,
                          selectedPoint.weldCurrent,
                        )
                      }
                      className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-white"
                      placeholder="22"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">용접전류 (A)</label>
                    <input
                      type="number"
                      value={selectedPoint.weldCurrent ?? ''}
                      onChange={e =>
                        onUpdateWeldParams(
                          selectedPoint.id,
                          selectedPoint.weldVoltage,
                          e.target.value ? Number(e.target.value) : null,
                        )
                      }
                      className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-white"
                      placeholder="200"
                    />
                  </div>
                </div>
                {}
                <div>
                  <label className="text-xs text-gray-400 block mb-1">위빙 타입</label>
                  <select
                    value={selectedPoint.weavingType ?? 'none'}
                    onChange={e =>
                      onUpdateWeavingType(
                        selectedPoint.id,
                        e.target.value === 'none' ? null : e.target.value,
                      )
                    }
                    className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-white"
                  >
                    {WEAVING_TYPE_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    );
  },
);
TeachingPointPanel.displayName = 'TeachingPointPanel';
export const TeachingPointPanel_TeachingPointPanel = TeachingPointPanel;
