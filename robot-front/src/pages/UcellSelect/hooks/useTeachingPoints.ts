import { TeachingPoint, WeaveParams, createInitialTeachingPoints, UCELL_POINT_DEFINITIONS, UCellData, NORMAL_CELLS, COLLAR_PLATE_CELLS, PartWeldEnabled, DEFAULT_PART_WELD_ENABLED, DEFAULT_WEAVE_PARAMS, WELDING_PARTS } from '..';
import { moveToJointPositionNonBlocking, moveToCartesianPositionNonBlocking, checkMotionDone, getWeldingConfig, updateTeachingJob, TeachingPointData, RealtimeRobotStatus, enableRobot, createTeachingJob, getTeachingJobs, getTeachingJob, deleteTeachingJob, updateTeachingJobName, TeachingJob, getRealtimeRobotStatus, stopRobotSDK, emergencyStop, endArc, endWeave, arcOff, arcTraceControl, wireSearchEnd, forwardWireFeed, reverseWireFeed, stopForwardWireFeed, stopReverseWireFeed } from '../../../lib';
import { getErrorMessage, extractResultCode } from '../../../lib/api';
import { createLogger } from '../../../lib';
import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useAlert } from '../../../contexts';
import { playSaveOkBeep, playErrorBeep } from '../../../lib/audio';
import { RobotPosition } from '../components/index';
import { getBlockPointIds, getBlockName } from '..';
import { TouchSensingOptions, TouchSensingResult, WeldingStartOptions, WeldingResult, ClosestCenterlineResult, UseWeldingOperationsReturn, findClosestCenterlinePoint as findClosestCenterlinePointFn, executeTouchSensing, TouchSensingContext, executeArcTest, ArcTestContext, executeWelding, WeldingExecutionContext } from './weldingCore';
import { createPointUpdaters } from './pointUpdaters';

export interface UseTeachingPointsReturn {
  teachingPoints: TeachingPoint[];
  selectedPointId: string | null;
  setSelectedPointId: (id: string | null) => void;
  saveCurrentPositionToPoint: (pointId: string) => Promise<void>;
  clearPoint: (pointId: string) => void;
  clearAllPoints: () => void;
  updatePointSpeed: (pointId: string, speed: number, velMode?: 0 | 1) => void;
  updatePointWeldParams: (pointId: string, voltage: number | null, current: number | null) => void;
  updatePointGap: (pointId: string, gap: number) => void;
  updatePointPosture: (pointId: string, posture: 'vertical' | 'horizontal') => void;
  updatePointWeaveParams: (pointId: string, params: Partial<WeaveParams>) => void;
  updatePointWeavingType: (pointId: string, type: string | null) => void;
  updatePointTouchOffset: (pointId: string, offset: { dx: number; dy: number; dz: number } | null) => void;
  clearAllTouchOffsets: () => void;
  loadPointsFromJob: (points: TeachingPoint[]) => void;
  reorderPoints: (activeId: string, overId: string) => void;
  getSavedPoints: () => TeachingPoint[];
  getPointById: (id: string) => TeachingPoint | undefined;
}
export function useTeachingPoints(): UseTeachingPointsReturn {
  const [teachingPoints, setTeachingPoints] = useState<TeachingPoint[]>(createInitialTeachingPoints);
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const updaters = useMemo(
    () => createPointUpdaters(setTeachingPoints, setSelectedPointId),
    []
  );
  const saveCurrentPositionToPoint = useCallback(async (pointId: string) => {
    try {
      const latestStatus = await getRealtimeRobotStatus();
      if (!latestStatus?.tcp || latestStatus.tcp.length < 6) {
        alert('로봇 위치 정보를 가져올 수 없습니다. 로봇 연결을 확인해주세요.');
        return;
      }
      const toolNum = latestStatus.current_tool_num ?? 3;
      const userNum = latestStatus.current_user_num ?? 0;
      const tcp = {
        x: latestStatus.tcp[0], y: latestStatus.tcp[1], z: latestStatus.tcp[2],
        rx: latestStatus.tcp[3], ry: latestStatus.tcp[4], rz: latestStatus.tcp[5],
      };
      const joints = latestStatus.joints || null;
      console.log(`포인트 ${pointId} 저장:`, tcp, `tool=${toolNum}, user=${userNum}`);
      setTeachingPoints(prev => {
        const updated = prev.map(pt =>
          pt.id === pointId ? { ...pt, tcp, joints, toolNum, userNum, isSaved: true } : pt
        );
        const currentIndex = updated.findIndex(pt => pt.id === pointId);
        if (currentIndex < updated.length - 1) {
          setSelectedPointId(updated[currentIndex + 1].id);
        }
        return updated;
      });
    } catch (error) {
      console.error('포인트 저장 실패:', error);
      alert('포인트 저장에 실패했습니다.');
    }
  }, []);
  const clearPoint = useCallback((pointId: string) => {
    setTeachingPoints(prev =>
      prev.map(pt => pt.id === pointId ? { ...pt, tcp: null, joints: null, isSaved: false } : pt)
    );
  }, []);
  const clearAllPoints = useCallback(() => {
    setTeachingPoints(createInitialTeachingPoints());
    setSelectedPointId(null);
  }, []);
  const getSavedPoints = useCallback(() => {
    return teachingPoints.filter(pt => pt.isSaved);
  }, [teachingPoints]);
  const getPointById = useCallback((id: string) => {
    return teachingPoints.find(pt => pt.id === id);
  }, [teachingPoints]);
  return {
    teachingPoints,
    selectedPointId,
    setSelectedPointId,
    saveCurrentPositionToPoint,
    clearPoint,
    clearAllPoints,
    updatePointSpeed: updaters.updatePointSpeed,
    updatePointWeldParams: updaters.updatePointWeldParams,
    updatePointGap: updaters.updatePointGap,
    updatePointPosture: updaters.updatePointPosture,
    updatePointWeaveParams: updaters.updatePointWeaveParams,
    updatePointWeavingType: updaters.updatePointWeavingType,
    updatePointTouchOffset: updaters.updatePointTouchOffset,
    clearAllTouchOffsets: updaters.clearAllTouchOffsets,
    loadPointsFromJob: updaters.loadPointsFromJob,
    reorderPoints: updaters.reorderPoints,
    getSavedPoints,
    getPointById,
  };
}
