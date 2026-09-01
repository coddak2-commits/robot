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

interface ChildProps {
  robotJoints: RobotMoveData[];
  addJoint: (joint: RobotMoveData) => void;
  resetJoints: () => void;
}
export const RobotJoint = ({ robotJoints, addJoint, resetJoints }: ChildProps) => {
  const { show: showAlert } = useAlert();
  const handleJointsAdd = async () => {
    const status = await getRealtimeRobotStatus();
    if (!status.connected || !status.joints || !status.tcp) {
      showAlert('로봇 연결 상태를 확인해주세요.', { type: 'error' });
      console.log('로봇 상태 조회 실패');
      return;
    }
    const data = {
      joints: {
        j1: status.joints[0] || 0,
        j2: status.joints[1] || 0,
        j3: status.joints[2] || 0,
        j4: status.joints[3] || 0,
        j5: status.joints[4] || 0,
        j6: status.joints[5] || 0,
      },
      tcf: {
        x: status.tcp[0] || 0,
        y: status.tcp[1] || 0,
        z: status.tcp[2] || 0,
        rx: status.tcp[3] || 0,
        ry: status.tcp[4] || 0,
        rz: status.tcp[5] || 0,
      },
      speed: '10',
      acc: '180',
      ovl: '100',
    };
    console.log(data);
    addJoint(data);
  };
  const handleJointRemove = () => {
    return '';
  };
  const handleJointReset = () => {
    if (robotJoints.length === 0) {
      showAlert('초기화할 데이터가 없습니다.', { type: 'warning' });
      return;
    }
    showAlert('모든 작업 목록을 초기화하시겠습니까?', {
      type: 'warning',
      title: '초기화 확인',
      onConfirm: () => {
        resetJoints();
      },
    });
  };
  return (
    <div>
      <div className={`p-2 h-22 bg-[#000] overflow-auto`}>
        <ul className={`text-white`}>
          {robotJoints.map((step, index) => (
            <li key={index}>
              <strong>Step {index + 1}</strong>
              <div>
                J1: {step.joints.j1}, J2: {step.joints.j2}, J3: {step.joints.j3}
              </div>
              <div>
                J4: {step.joints.j4}, J5: {step.joints.j5}, J6: {step.joints.j6}
              </div>
              <div>
                TCF: x={step.tcf.x}, y={step.tcf.y}, z={step.tcf.z}, rx={step.tcf.rx}, ry=
                {step.tcf.ry}, rz={step.tcf.rz}
              </div>
              <div>
                Speed: {step.speed}, Acc: {step.acc}, OVL: {step.ovl}
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className={`mt-3`}>
        <div className={`flex justify-between mt-3`}>
          <Button className={`flex-1 mr-1`} onClick={() => handleJointsAdd()}>
            추가
          </Button>
          <Button className={`flex-1`} onClick={() => handleJointRemove()}>
            삭제
          </Button>
        </div>
        <div className={`mt-2`}>
          <Button variant="destructive" className={`w-full`} onClick={() => handleJointReset()}>
            초기화
          </Button>
        </div>
      </div>
    </div>
  );
};
