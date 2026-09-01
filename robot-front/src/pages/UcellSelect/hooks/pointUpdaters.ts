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

type SetTeachingPoints = React.Dispatch<React.SetStateAction<TeachingPoint[]>>;
type SetSelectedPointId = (id: string | null) => void;
export function createPointUpdaters(
  setTeachingPoints: SetTeachingPoints,
  setSelectedPointId: SetSelectedPointId,
) {
  const updatePointSpeed = (pointId: string, speed: number) => {
    setTeachingPoints(prev =>
      prev.map(pt => pt.id === pointId ? { ...pt, moveSpeed: speed, velMode: 1 } : pt)
    );
  };
  const updatePointWeldParams = (pointId: string, voltage: number | null, current: number | null) => {
    setTeachingPoints(prev =>
      prev.map(pt => pt.id === pointId ? { ...pt, weldVoltage: voltage, weldCurrent: current } : pt)
    );
  };
  const updatePointGap = (pointId: string, gap: number) => {
    setTeachingPoints(prev =>
      prev.map(pt => pt.id === pointId ? { ...pt, gap: Math.min(6, Math.max(0, gap)) } : pt)
    );
  };
  const updatePointPosture = (pointId: string, posture: 'vertical' | 'horizontal') => {
    setTeachingPoints(prev =>
      prev.map(pt => pt.id === pointId ? { ...pt, posture } : pt)
    );
  };
  const updatePointWeaveParams = (pointId: string, params: Partial<WeaveParams>) => {
    setTeachingPoints(prev =>
      prev.map(pt => pt.id === pointId ? { ...pt, weaveParams: { ...pt.weaveParams, ...params } } : pt)
    );
  };
  const updatePointWeavingType = (pointId: string, type: string | null) => {
    setTeachingPoints(prev =>
      prev.map(pt => pt.id === pointId ? { ...pt, weavingType: type } : pt)
    );
  };
  const updatePointTouchOffset = (pointId: string, offset: { dx: number; dy: number; dz: number } | null) => {
    setTeachingPoints(prev =>
      prev.map(pt => pt.id === pointId ? { ...pt, touchOffset: offset } : pt)
    );
  };
  const clearAllTouchOffsets = () => {
    setTeachingPoints(prev => prev.map(pt => ({ ...pt, touchOffset: null })));
  };
  const reorderPoints = (activeId: string, overId: string) => {
    if (activeId === 'home' || overId === 'home' || activeId === overId) return;
    setTeachingPoints(prev => {
      const home = prev.find(pt => pt.id === 'home');
      const movablePoints = prev.filter(pt => pt.id !== 'home');
      const activeIndex = movablePoints.findIndex(pt => pt.id === activeId);
      const overIndex = movablePoints.findIndex(pt => pt.id === overId);
      if (activeIndex === -1 || overIndex === -1) return prev;
      const reordered = [...movablePoints];
      const [removed] = reordered.splice(activeIndex, 1);
      reordered.splice(overIndex, 0, removed);
      const updatedPoints = reordered.map((pt, idx) => ({ ...pt, order: idx + 1 }));
      return home ? [{ ...home, order: 0 }, ...updatedPoints] : updatedPoints;
    });
  };
  const loadPointsFromJob = (loadedPoints: TeachingPoint[]) => {
    const basePoints = createInitialTeachingPoints();
    const mergedPoints = basePoints.map(basePoint => {
      const loadedPoint = loadedPoints.find(lp => lp.id === basePoint.id);
      const baseDef = UCELL_POINT_DEFINITIONS.find(def => def.id === basePoint.id);
      if (loadedPoint) {
        return {
          ...basePoint, ...loadedPoint,
          name: baseDef?.name || loadedPoint.name,
          order: baseDef?.order ?? basePoint.order,
        };
      }
      return basePoint;
    });
    setTeachingPoints(mergedPoints);
    setSelectedPointId(null);
  };
  return {
    updatePointSpeed,
    updatePointWeldParams,
    updatePointGap,
    updatePointPosture,
    updatePointWeaveParams,
    updatePointWeavingType,
    updatePointTouchOffset,
    clearAllTouchOffsets,
    reorderPoints,
    loadPointsFromJob,
  };
}
