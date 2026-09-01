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

const log_useAutoSavePoints = createLogger('useAutoSavePoints');
const DEBOUNCE_MS = 1500;
export type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error';
export interface UseAutoSavePointsOptions {
  teachingPoints: TeachingPoint[];
  currentJobId: number | null;
  currentJobName: string | null;
  cellType: string;
  cellId: number | null;
  height: number | null;
  width: number;
}
export interface UseAutoSavePointsReturn {
  autoSaveStatus: AutoSaveStatus;
  lastSavedAt: Date | null;
}
function buildSignature(points: TeachingPoint[]): string {
  return JSON.stringify(
    points.map(pt => ({
      id: pt.id,
      isSaved: pt.isSaved,
      moveSpeed: pt.moveSpeed,
      velMode: pt.velMode,
      weldVoltage: pt.weldVoltage,
      weldCurrent: pt.weldCurrent,
      weavingType: pt.weavingType,
      weaveParams: pt.weaveParams,
      gap: pt.gap,
      tcp: pt.tcp,
      joints: pt.joints,
      touchOffset: pt.touchOffset,
      toolNum: pt.toolNum,
      userNum: pt.userNum,
    })),
  );
}
function buildPointsData(points: TeachingPoint[]): TeachingPointData[] {
  return points
    .filter(pt => pt.isSaved)
    .map(pt => ({
      point_id: pt.id,
      name: pt.name,
      order: pt.order,
      tcp_x: pt.tcp?.x ?? 0,
      tcp_y: pt.tcp?.y ?? 0,
      tcp_z: pt.tcp?.z ?? 0,
      tcp_rx: pt.tcp?.rx ?? 0,
      tcp_ry: pt.tcp?.ry ?? 0,
      tcp_rz: pt.tcp?.rz ?? 0,
      joints: pt.joints ?? [],
      is_saved: true,
      tool_num: pt.toolNum ?? 0,
      user_num: pt.userNum ?? 0,
      move_speed: pt.moveSpeed,
      vel_mode: pt.velMode ?? 0,
      weld_voltage: pt.weldVoltage ?? undefined,
      weld_current: pt.weldCurrent ?? undefined,
      weaving_type: pt.weavingType ?? undefined,
      weave_params: pt.weaveParams,
      gap: pt.gap ?? 0,
    }));
}
export function useAutoSavePoints({
  teachingPoints,
  currentJobId,
  currentJobName,
  cellType,
  cellId,
  height,
  width,
}: UseAutoSavePointsOptions): UseAutoSavePointsReturn {
  const [autoSaveStatus, setAutoSaveStatus] = useState<AutoSaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedSignatureRef = useRef<string>('');
  const initializedRef = useRef(false);
  const prevJobIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (prevJobIdRef.current !== currentJobId) {
      prevJobIdRef.current = currentJobId;
      lastSavedSignatureRef.current = buildSignature(teachingPoints);
      initializedRef.current = true;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setAutoSaveStatus('idle');
      return;
    }
    if (!initializedRef.current) {
      initializedRef.current = true;
      lastSavedSignatureRef.current = buildSignature(teachingPoints);
      return;
    }
    if (!currentJobId || !cellId) return;
    const currentSignature = buildSignature(teachingPoints);
    if (currentSignature === lastSavedSignatureRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    setAutoSaveStatus('saving');
    timerRef.current = setTimeout(async () => {
      try {
        const pointsData = buildPointsData(teachingPoints);
        if (pointsData.length === 0) {
          setAutoSaveStatus('idle');
          return;
        }
        await updateTeachingJob(currentJobId, {
          name: currentJobName ?? '',
          cell_type: cellType,
          cell_id: cellId,
          height: height ?? 0,
          width,
          points: pointsData,
        });
        lastSavedSignatureRef.current = currentSignature;
        setLastSavedAt(new Date());
        setAutoSaveStatus('saved');
        log_useAutoSavePoints.info('autoSave.success', '자동 저장 완료', {
          jobId: currentJobId,
          points: pointsData.length,
        });
        setTimeout(() => setAutoSaveStatus(prev => (prev === 'saved' ? 'idle' : prev)), 2000);
      } catch (err) {
        log_useAutoSavePoints.error('autoSave.error', '자동 저장 실패', { error: String(err) });
        setAutoSaveStatus('error');
        setTimeout(() => setAutoSaveStatus(prev => (prev === 'error' ? 'idle' : prev)), 3000);
      }
    }, DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [teachingPoints, currentJobId, currentJobName, cellType, cellId, height, width]);
  return { autoSaveStatus, lastSavedAt };
}
