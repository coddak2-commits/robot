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
const log = createLogger('moveToPointLogic');
export async function waitForMotionComplete(
  stopMoveRef: React.MutableRefObject<boolean>,
  timeout: number,
  logPrefix: string,
): Promise<boolean> {
  const startTime = Date.now();
  await new Promise(resolve => setTimeout(resolve, 200));
  while (Date.now() - startTime < timeout) {
    if (stopMoveRef.current) {
      log.info(`${logPrefix}.stopped`, '이동 중 중단됨');
      return false;
    }
    try {
      const motionResult = await checkMotionDone();
      if (motionResult?.done) {
        log.info(`${logPrefix}.done`, '이동 완료');
        return true;
      }
    } catch {
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  return true;
}
export async function executeRetract(
  currentTcp: number[] | null,
  speed: number,
  toolNum: number,
  userNum: number,
  stopMoveRef: React.MutableRefObject<boolean>,
): Promise<boolean> {
  if (!currentTcp || currentTcp.length < 6) {
    log.info('retract.noTcp', 'TCP 데이터 없음, 후퇴 스킵');
    return true;
  }
  let approachOffset = 100;
  try {
    const config = await getWeldingConfig();
    if (config) approachOffset = config.touch_sensing_approach_offset ?? 100;
  } catch {
    log.warn('retract.configError', '설정 로드 실패, 기본값 사용');
  }
  const [px, py, pz, prx, pry, prz] = currentTcp;
  log.info('retract.start', `직교좌표계 +X 방향 후퇴 (dx=+${approachOffset}mm)`);
  const retractResult = await moveToCartesianPositionNonBlocking(
    { x: px, y: py, z: pz, rx: prx, ry: pry, rz: prz },
    speed,
    100,
    100,
    toolNum,
    userNum,
    1,
    [approachOffset, 0, 0, 0, 0, 0],
  );
  const retractResultCode = extractResultCode(retractResult);
  if (retractResult?.status_code !== 200 || retractResultCode !== 0) {
    log.warn('retract.failed', 'TCP 후퇴 실패, MoveJ로 직접 이동');
    return true;
  }
  return await waitForMotionComplete(stopMoveRef, 30000, 'retract');
}
export async function executeApproachWithOffset(
  point: TeachingPoint,
  speed: number,
  toolNum: number,
  userNum: number,
  stopMoveRef: React.MutableRefObject<boolean>,
): Promise<boolean> {
  const { x: destX, y: destY, z: destZ, rx: destRx, ry: destRy, rz: destRz } = point.tcp!;
  let approachOffset = 100;
  try {
    const config = await getWeldingConfig();
    if (config) approachOffset = config.touch_sensing_approach_offset ?? 100;
  } catch {
    log.warn('approach.configError', '설정 로드 실패, 기본값 사용');
  }
  log.info(
    'approach.offset',
    `${point.name} 목표 +X 오프셋 위치로 이동 (dx=+${approachOffset}mm)`,
  );
  const approachResult = await moveToCartesianPositionNonBlocking(
    { x: destX, y: destY, z: destZ, rx: destRx, ry: destRy, rz: destRz },
    speed,
    100,
    100,
    toolNum,
    userNum,
    1,
    [approachOffset, 0, 0, 0, 0, 0],
  );
  const approachResultCode = extractResultCode(approachResult);
  if (approachResult?.status_code !== 200 || approachResultCode !== 0) {
    const errorMsg = getErrorMessage(approachResultCode);
    log.error('approach.offset.failed', `${point.name} 오프셋 위치 이동 실패`, { errorMsg });
    alert(`${point.name} 오프셋 접근 실패: ${errorMsg}`);
    return false;
  }
  if (!(await waitForMotionComplete(stopMoveRef, 300000, 'approach.offset'))) return false;
  log.info('approach.final', `${point.name} 정확한 목표 위치로 접근`);
  const finalResult = await moveToCartesianPositionNonBlocking(
    { x: destX, y: destY, z: destZ, rx: destRx, ry: destRy, rz: destRz },
    speed,
    100,
    100,
    toolNum,
    userNum,
    0,
    [0, 0, 0, 0, 0, 0],
  );
  const finalResultCode = extractResultCode(finalResult);
  if (finalResult?.status_code !== 200 || finalResultCode !== 0) {
    const errorMsg = getErrorMessage(finalResultCode);
    log.error('approach.final.failed', `${point.name} 최종 위치 이동 실패`, { errorMsg });
    alert(`${point.name} 최종 접근 실패: ${errorMsg}`);
    return false;
  }
  return await waitForMotionComplete(stopMoveRef, 300000, 'approach.final');
}
export async function executeHomeSafeApproach(
  currentTcp: number[] | null,
  homePoint: TeachingPoint,
  speed: number,
  stopMoveRef: React.MutableRefObject<boolean>,
): Promise<boolean> {
  const toolNum = homePoint.toolNum ?? 0;
  const userNum = homePoint.userNum ?? 0;
  if (currentTcp && currentTcp.length >= 6) {
    const [px, py, pz, prx, pry, prz] = currentTcp;
    log.info('home.baseZUp', '현재 위치 base Z+100mm 상승 (모재 위로 이탈)');
    const riseResult = await moveToCartesianPositionNonBlocking(
      { x: px, y: py, z: pz, rx: prx, ry: pry, rz: prz },
      Math.min(speed, 30),
      50,
      50,
      toolNum,
      userNum,
      1,
      [0, 0, 100, 0, 0, 0],
    );
    const rc = extractResultCode(riseResult);
    if (riseResult?.status_code !== 200 || rc !== 0) {
      log.warn('home.baseZUp.failed', '고도 상승 실패 — MoveJ로 진행', { code: rc });
      return true;
    }
    if (!(await waitForMotionComplete(stopMoveRef, 30000, 'home.baseZUp'))) return false;
  }
  return true;
}
// 저장된 관절값을 현재 관절 기준 최단 경로로 정규화 (±360° wrap, 손목 360도 회전 방지)
function normalizeJointsToShortest(target: number[], current: number[] | null | undefined): number[] {
  if (!current || current.length !== target.length) return target;
  return target.map((t, i) => {
    let v = t;
    let diff = v - current[i];
    while (diff > 180) { v -= 360; diff -= 360; }
    while (diff < -180) { v += 360; diff += 360; }
    return v;
  });
}

export async function executeMoveJ(
  point: TeachingPoint,
  speed: number,
  toolNum: number,
  userNum: number,
  stopMoveRef: React.MutableRefObject<boolean>,
  currentJoints?: number[] | null,
): Promise<boolean> {
  log.info('moveJ', `${point.name} TCP 없음, MoveJ로 이동`);
  const normalized = normalizeJointsToShortest(point.joints!, currentJoints);
  const wrapped = normalized.some((v, i) => Math.abs(v - point.joints![i]) > 1e-6);
  if (wrapped) {
    log.info('moveJ.normalize', `${point.name} 관절 최단경로 정규화 적용`, {
      original: point.joints,
      normalized,
    });
  }
  const result = await moveToJointPositionNonBlocking(
    normalized,
    speed,
    100,
    100,
    toolNum,
    userNum,
  );
  const moveResult = extractResultCode(result);
  if (result?.status_code !== 200 || moveResult !== 0) {
    const errorMsg = getErrorMessage(moveResult);
    log.error('moveJ.failed', `${point.name} 이동 명령 실패`, { errorMsg });
    alert(`${point.name} 이동 실패: ${errorMsg}`);
    return false;
  }
  return await waitForMotionComplete(stopMoveRef, 300000, 'moveJ');
}
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
interface UseCellSelectionHandlersProps {
  teachingPoints: TeachingPoint[];
  teachingRobotState: { connected?: boolean; joints?: number[] | null } | null;
  manualMoveSpeed: number;
  isWelding?: boolean;
  isTouchSensing?: boolean;
  isArcTesting?: boolean;
  isAtPosition: (joints1: number[], joints2: number[]) => boolean;
  moveToPoint: (
    point: TeachingPoint,
    opts: { overrideSpeed: number; skipRetract: boolean },
  ) => void;
  saveJob: (
    points: TeachingPoint[],
    type: string,
    cellId: number,
    height: number,
    width: number,
    jobName?: string,
  ) => Promise<boolean>;
  loadJob: (jobId: number) => Promise<TeachingPoint[] | null>;
  requestDeleteJob: (jobId: number, jobName: string) => void;
  updateJobName: (jobId: number, name: string) => Promise<boolean>;
  loadPointsFromJob: (points: TeachingPoint[]) => void;
  editingJobName: string;
  onStateChange: (data: {
    height?: number;
    type?: 'normal' | 'collar_plate';
    width?: number;
    selectedCell?: UCellData | null;
  }) => void;
}
export function useCellSelectionHandlers({
  teachingPoints,
  teachingRobotState,
  manualMoveSpeed,
  isWelding,
  isTouchSensing,
  isArcTesting,
  isAtPosition,
  moveToPoint,
  saveJob,
  loadJob,
  requestDeleteJob,
  updateJobName,
  loadPointsFromJob,
  editingJobName,
  onStateChange,
}: UseCellSelectionHandlersProps) {
  const { show: showAlert } = useAlert();
  const [selectedHeight, setSelectedHeight] = useState<number | null>(550);
  const [selectedWidth, setSelectedWidth] = useState<number>(600);
  const [selectedType, setSelectedType] = useState<'normal' | 'collar_plate' | null>('normal');
  const [selectedCell, setSelectedCell] = useState<UCellData | null>(NORMAL_CELLS[0]);
  const [showSecondarySidebar, setShowSecondarySidebar] = useState(false);
  const [partWeldEnabled, setPartWeldEnabled] = useState<PartWeldEnabled>({
    ...DEFAULT_PART_WELD_ENABLED,
  });
  const handleTypeSelect = useCallback(
    (type: 'normal' | 'collar_plate') => {
      if (selectedType === type && showSecondarySidebar) {
        setShowSecondarySidebar(false);
      } else {
        setSelectedType(type);
        setShowSecondarySidebar(true);
      }
    },
    [selectedType, showSecondarySidebar],
  );
  const handleCellSelect = useCallback(
    (cellId: number) => {
      if (!selectedHeight || !selectedType) return;
      const allCells = [...NORMAL_CELLS, ...COLLAR_PLATE_CELLS];
      const cell = allCells.find(c => c.id === cellId);
      if (cell) {
        setSelectedCell(cell);
        onStateChange({
          height: selectedHeight,
          type: selectedType,
          width: selectedWidth,
          selectedCell: cell,
        });
        setShowSecondarySidebar(false);
      }
    },
    [selectedHeight, selectedType, selectedWidth, onStateChange],
  );
  const handleWidthChange = useCallback(
    (value: string) => {
      const newWidth = parseInt(value);
      if (!isNaN(newWidth) && newWidth > 0) {
        setSelectedWidth(newWidth);
        onStateChange({
          height: selectedHeight || undefined,
          type: selectedType || undefined,
          width: newWidth,
          selectedCell,
        });
      }
    },
    [selectedHeight, selectedType, selectedCell, onStateChange],
  );
  const handleHeightChange = useCallback(
    (value: string) => {
      const h = parseInt(value);
      if (!isNaN(h) && h > 0) {
        setSelectedHeight(h);
        onStateChange({
          height: h,
          type: selectedType || undefined,
          width: selectedWidth,
          selectedCell,
        });
      }
    },
    [selectedType, selectedWidth, selectedCell, onStateChange],
  );
  const handlePartWeldToggle = useCallback((partIndex: number) => {
    setPartWeldEnabled(prev => ({ ...prev, [partIndex]: !prev[partIndex] }));
  }, []);
  const handleSaveJob = useCallback(async () => {
    if (!selectedCell || !selectedType) {
      showAlert('셀 타입과 셀을 먼저 선택해주세요.', { type: 'warning', title: '저장 실패' });
      return;
    }
    if (!teachingPoints.some(pt => pt.isSaved)) {
      playErrorBeep();
      showAlert('저장할 포인트가 없습니다.', { type: 'warning', title: '저장 실패' });
      return;
    }
    const defaultName = `작업_${new Date().toLocaleString('ko-KR')}`;
    const name = window.prompt('작업 이름을 입력하세요', defaultName);
    if (name === null) return; // 취소
    const success = await saveJob(
      teachingPoints,
      selectedType,
      selectedCell.id,
      selectedHeight || 0,
      selectedWidth,
      name,
    );
    if (success) {
      playSaveOkBeep();
      showAlert('작업이 저장되었습니다.', { type: 'success', title: '저장 완료' });
    } else {
      playErrorBeep();
      showAlert('작업 저장에 실패했습니다.', { type: 'error', title: '저장 실패' });
    }
  }, [
    selectedCell,
    selectedType,
    teachingPoints,
    selectedHeight,
    selectedWidth,
    saveJob,
    showAlert,
  ]);
  const handleLoadJob = useCallback(
    async (jobId: number) => {
      const points = await loadJob(jobId);
      if (points) loadPointsFromJob(points);
    },
    [loadJob, loadPointsFromJob],
  );
  const handleDeleteJob = useCallback(
    (jobId: number, jobName: string) => {
      requestDeleteJob(jobId, jobName);
    },
    [requestDeleteJob],
  );
  const handleSaveJobName = useCallback(
    async (jobId: number) => {
      await updateJobName(jobId, editingJobName);
    },
    [updateJobName, editingJobName],
  );
  const isAtSavedNonHomePoint = useCallback(() => {
    const robotJoints = teachingRobotState?.joints;
    if (!robotJoints) return false;
    return teachingPoints.some(
      pt =>
        pt.id !== 'home' &&
        pt.isSaved &&
        pt.joints != null &&
        pt.joints.length === 6 &&
        isAtPosition(robotJoints, pt.joints),
    );
  }, [teachingPoints, teachingRobotState, isAtPosition]);
  const isRobotBusy = useCallback(
    () => !!(isWelding || isTouchSensing || isArcTesting),
    [isWelding, isTouchSensing, isArcTesting],
  );
  const handleMoveToPoint = useCallback(
    (point: TeachingPoint) => {
      if (isRobotBusy()) {
        showAlert('용접/터치센싱/아크테스트 진행 중에는 포인트로 이동할 수 없습니다.', { type: 'warning' });
        return;
      }
      const skipRetract = !isAtSavedNonHomePoint();
      moveToPoint(point, { overrideSpeed: manualMoveSpeed, skipRetract });
    },
    [isAtSavedNonHomePoint, moveToPoint, manualMoveSpeed, isRobotBusy, showAlert],
  );
  const handleWeldPointClick = useCallback(
    (weldPoint: { id: string }) => {
      if (isRobotBusy()) {
        showAlert('용접/터치센싱/아크테스트 진행 중에는 포인트로 이동할 수 없습니다.', { type: 'warning' });
        return;
      }
      const teachingPoint = teachingPoints.find(pt => pt.id === weldPoint.id);
      if (!teachingPoint) return;
      if (!teachingPoint.isSaved) {
        showAlert(`${teachingPoint.name} 포인트가 저장되어 있지 않습니다.`, { type: 'warning' });
        return;
      }
      const skipRetract = !isAtSavedNonHomePoint();
      moveToPoint(teachingPoint, { overrideSpeed: manualMoveSpeed, skipRetract });
    },
    [teachingPoints, manualMoveSpeed, moveToPoint, showAlert, isAtSavedNonHomePoint, isRobotBusy],
  );
  return {
    selectedHeight,
    setSelectedHeight,
    selectedWidth,
    setSelectedWidth,
    selectedType,
    setSelectedType,
    selectedCell,
    setSelectedCell,
    showSecondarySidebar,
    setShowSecondarySidebar,
    partWeldEnabled,
    handleTypeSelect,
    handleCellSelect,
    handleWidthChange,
    handleHeightChange,
    handlePartWeldToggle,
    handleSaveJob,
    handleLoadJob,
    handleDeleteJob,
    handleSaveJobName,
    handleMoveToPoint,
    handleWeldPointClick,
  };
}
const log_useCenterlineNavigation = createLogger('CenterlineNavigation');
const DEFAULT_WEAVE: WeaveParams = {
  weaveFrequency: 2,
  weaveRange: 5,
  weaveLeftRange: 0,
  weaveRightRange: 0,
  weaveLeftStayTime: 0,
  weaveRightStayTime: 0,
  weaveCircleRadio: 0,
  weaveYawAngle: 0,
  weaveRotAngle: 0,
};
interface UseCenterlineNavigationProps {
  teachingRobotState: RealtimeRobotStatus | null;
  teachingPoints: TeachingPoint[];
  manualMoveSpeed: number;
  showAlert: (
    message: string,
    options?: { type?: 'error' | 'warning' | 'info' | 'success' },
  ) => void;
}
export function useCenterlineNavigation({
  teachingRobotState,
  teachingPoints,
  manualMoveSpeed,
  showAlert,
}: UseCenterlineNavigationProps) {
  const stopRef = useRef(false);
  const handleCenterlinePointClick = useCallback(
    async (point: CenterlinePoint) => {
      log_useCenterlineNavigation.info('centerline.pointClick', '센터라인 포인트 클릭 (후퇴 → 목표 뒤쪽 경유 → 정위치)', {
        tcp: `[${point.tcp.x.toFixed(1)}, ${point.tcp.y.toFixed(1)}, ${point.tcp.z.toFixed(1)}]`,
        segmentStartPointId: point.segmentStartPointId,
        segmentEndPointId: point.segmentEndPointId,
        segmentRatio: point.segmentRatio.toFixed(3),
      });
      try {
        let interpolatedOffset: { dx: number; dy: number; dz: number } | null = null;
        const segStartPoint = teachingPoints.find(pt => pt.id === point.segmentStartPointId);
        const segEndPoint = teachingPoints.find(pt => pt.id === point.segmentEndPointId);
        if (
          segStartPoint &&
          segEndPoint &&
          (segStartPoint.touchOffset || segEndPoint.touchOffset)
        ) {
          const so = segStartPoint.touchOffset ?? { dx: 0, dy: 0, dz: 0 };
          const eo = segEndPoint.touchOffset ?? { dx: 0, dy: 0, dz: 0 };
          interpolatedOffset = {
            dx: so.dx + point.segmentRatio * (eo.dx - so.dx),
            dy: so.dy + point.segmentRatio * (eo.dy - so.dy),
            dz: so.dz + point.segmentRatio * (eo.dz - so.dz),
          };
          log_useCenterlineNavigation.info('centerline.touchOffset.interpolated', '보간 터치 오프셋', {
            ratio: point.segmentRatio.toFixed(3),
            offset: `[${interpolatedOffset.dx.toFixed(2)}, ${interpolatedOffset.dy.toFixed(2)}, ${interpolatedOffset.dz.toFixed(2)}]`,
          });
        }
        const toolNum = point.toolNum;
        const userNum = point.userNum;
        const virtualPoint: TeachingPoint = {
          id: `centerline_${point.segmentStartPointId}_${point.segmentRatio.toFixed(3)}`,
          name: `센터라인 (${point.segmentStartPointId?.toUpperCase()}→${point.segmentEndPointId?.toUpperCase()} ${(point.segmentRatio * 100).toFixed(0)}%)`,
          order: 0,
          isSaved: true,
          joints: null,
          tcp: {
            x: point.tcp.x,
            y: point.tcp.y,
            z: point.tcp.z,
            rx: point.orientation.rx,
            ry: point.orientation.ry,
            rz: point.orientation.rz,
          },
          moveSpeed: manualMoveSpeed,
          velMode: 0,
          toolNum,
          userNum,
          weldVoltage: null,
          weldCurrent: null,
          weavingType: null,
          weaveParams: DEFAULT_WEAVE,
          gap: 0,
          touchOffset: interpolatedOffset,
          touchDirection: 1,
          touchBottom: false,
        };
        stopRef.current = false;
        if (!teachingRobotState?.servo_enabled) {
          log_useCenterlineNavigation.info('centerline.enableServo', '서보 활성화');
          await enableRobot();
        }
        const robotJoints = teachingRobotState?.joints;
        const atSavedPoint =
          !!robotJoints &&
          teachingPoints.some(
            pt =>
              pt.id !== 'home' &&
              pt.isSaved &&
              pt.joints != null &&
              pt.joints.length === 6 &&
              pt.joints.every((v, i) => Math.abs(v - robotJoints[i]) <= 0.5),
          );
        if (atSavedPoint) {
          const retractOk = await executeRetract(
            teachingRobotState?.tcp ?? null,
            manualMoveSpeed,
            toolNum,
            userNum,
            stopRef,
          );
          if (!retractOk) {
            showAlert('센터라인 후퇴 중단', { type: 'warning' });
            return;
          }
        }
        const approachOk = await executeApproachWithOffset(
          virtualPoint,
          manualMoveSpeed,
          toolNum,
          userNum,
          stopRef,
        );
        if (!approachOk) {
          showAlert('센터라인 이동 실패', { type: 'error' });
          return;
        }
        log_useCenterlineNavigation.info('centerline.done', '센터라인 이동 완료');
      } catch (error) {
        log_useCenterlineNavigation.error('centerline.moveError', '센터라인 이동 오류', { error: String(error) });
        showAlert(`이동 오류: ${error}`, { type: 'error' });
      }
    },
    [teachingRobotState, teachingPoints, manualMoveSpeed, showAlert],
  );
  return { handleCenterlinePointClick };
}
export type UseCenterlineNavigationReturn = ReturnType<typeof useCenterlineNavigation>;
export interface UseJobManagementReturn {
  jobList: TeachingJob[];
  currentJobId: number | null;
  isSavingJob: boolean;
  isJobListModalOpen: boolean;
  jobListPage: number;
  editingJobId: number | null;
  editingJobName: string;
  setIsJobListModalOpen: (open: boolean) => void;
  setJobListPage: (page: number) => void;
  setEditingJobId: (id: number | null) => void;
  setEditingJobName: (name: string) => void;
  fetchJobList: () => Promise<void>;
  saveJob: (teachingPoints: TeachingPoint[], cellType: string, cellId: number, height: number, width: number, jobName?: string) => Promise<boolean>;
  loadJob: (jobId: number) => Promise<TeachingPoint[] | null>;
  pendingDeleteJobIds: number[];
  requestDeleteJob: (jobId: number, jobName: string) => void;
  undoDeleteJob: (jobId: number) => void;
  updateJobName: (jobId: number, newName: string) => Promise<boolean>;
  JOBS_PER_PAGE: number;
}
export function useJobManagement(): UseJobManagementReturn {
  const [jobList, setJobList] = useState<TeachingJob[]>([]);
  const [currentJobId, setCurrentJobId] = useState<number | null>(null);
  const [isSavingJob, setIsSavingJob] = useState(false);
  const [isJobListModalOpen, setIsJobListModalOpen] = useState(false);
  const [jobListPage, setJobListPage] = useState(1);
  const [editingJobId, setEditingJobId] = useState<number | null>(null);
  const [editingJobName, setEditingJobName] = useState('');
  const JOBS_PER_PAGE = 5;
  const fetchJobList = useCallback(async () => {
    try {
      const response = await getTeachingJobs();
      const jobsArray = response?.data?.jobs ?? [];
      setJobList(jobsArray);
    } catch (error) {
      console.error('작업 목록 조회 실패:', error);
      setJobList([]);
    }
  }, []);
  const saveJob = useCallback(async (
    teachingPoints: TeachingPoint[],
    cellType: string,
    cellId: number,
    height: number,
    width: number,
    jobName?: string
  ): Promise<boolean> => {
    const savedPoints = teachingPoints.filter(pt => pt.isSaved);
    if (savedPoints.length === 0) {
      return false;
    }
    setIsSavingJob(true);
    try {
      const pointsData: TeachingPointData[] = savedPoints.map(pt => ({
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
      const result = await createTeachingJob({
        name: jobName?.trim() || `작업_${new Date().toLocaleString('ko-KR')}`,
        cell_type: cellType,
        cell_id: cellId,
        height,
        width,
        points: pointsData,
      });
      if (result?.id) {
        setCurrentJobId(result.id);
        await fetchJobList();
        return true;
      }
      return false;
    } catch (error) {
      console.error('작업 저장 실패:', error);
      return false;
    } finally {
      setIsSavingJob(false);
    }
  }, [fetchJobList]);
  const loadJob = useCallback(async (jobId: number): Promise<TeachingPoint[] | null> => {
    try {
      const response = await getTeachingJob(jobId);
      const jobData = response?.data;
      if (!jobData?.points) {
        alert('작업 데이터를 불러올 수 없습니다.');
        return null;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const loadedPoints: TeachingPoint[] = jobData.points.map((pt: any) => {
        const tcpData = pt.tcp;
        return {
          id: pt.point_id,
          name: pt.name,
          order: pt.order,
          tcp: tcpData ? {
            x: tcpData.x,
            y: tcpData.y,
            z: tcpData.z,
            rx: tcpData.rx,
            ry: tcpData.ry,
            rz: tcpData.rz,
          } : null,
          joints: pt.joints,
          isSaved: true,
          toolNum: pt.tool_num ?? 3,
          userNum: pt.user_num ?? 0,
          moveSpeed: pt.move_speed,
          velMode: (pt.vel_mode ?? 0) as 0 | 1,
          weldVoltage: pt.weld_voltage,
          weldCurrent: pt.weld_current,
          weavingType: pt.weaving_type,
          weaveParams: pt.weave_params ? {
            weaveFrequency: pt.weave_params.weaveFrequency ?? DEFAULT_WEAVE_PARAMS.weaveFrequency,
            weaveRange: pt.weave_params.weaveRange ?? DEFAULT_WEAVE_PARAMS.weaveRange,
            weaveLeftRange: pt.weave_params.weaveLeftRange ?? DEFAULT_WEAVE_PARAMS.weaveLeftRange,
            weaveRightRange: pt.weave_params.weaveRightRange ?? DEFAULT_WEAVE_PARAMS.weaveRightRange,
            weaveLeftStayTime: pt.weave_params.weaveLeftStayTime ?? DEFAULT_WEAVE_PARAMS.weaveLeftStayTime,
            weaveRightStayTime: pt.weave_params.weaveRightStayTime ?? DEFAULT_WEAVE_PARAMS.weaveRightStayTime,
            weaveCircleRadio: pt.weave_params.weaveCircleRadio ?? DEFAULT_WEAVE_PARAMS.weaveCircleRadio,
            weaveYawAngle: pt.weave_params.weaveYawAngle ?? DEFAULT_WEAVE_PARAMS.weaveYawAngle,
            weaveRotAngle: pt.weave_params.weaveRotAngle ?? DEFAULT_WEAVE_PARAMS.weaveRotAngle,
          } : { ...DEFAULT_WEAVE_PARAMS },
          gap: pt.gap ?? 0,
        };
      });
      setCurrentJobId(jobId);
      setIsJobListModalOpen(false);
      return loadedPoints;
    } catch (error) {
      console.error('작업 불러오기 실패:', error);
      alert('작업 불러오기에 실패했습니다.');
      return null;
    }
  }, []);
  const JOB_DELETE_UNDO_WINDOW_MS = 7000;
  const pendingDeleteJobsRef = useRef<Map<number, { name: string; timer: ReturnType<typeof setTimeout> }>>(new Map());
  const [pendingDeleteJobIds, setPendingDeleteJobIds] = useState<number[]>([]);
  useEffect(() => {
    return () => {
      pendingDeleteJobsRef.current.forEach(entry => clearTimeout(entry.timer));
    };
  }, []);
  const finalizeDeleteJob = useCallback(async (jobId: number): Promise<boolean> => {
    try {
      await deleteTeachingJob(jobId);
      await fetchJobList();
      if (currentJobId === jobId) {
        setCurrentJobId(null);
      }
      return true;
    } catch (error) {
      console.error('작업 삭제 실패:', error);
      return false;
    }
  }, [currentJobId, fetchJobList]);
  const requestDeleteJob = useCallback((jobId: number, jobName: string) => {
    if (!window.confirm(`"${jobName}" 작업을 삭제하시겠습니까? (삭제 후 7초 이내에는 실행취소할 수 있습니다)`)) {
      return;
    }
    const timer = setTimeout(async () => {
      pendingDeleteJobsRef.current.delete(jobId);
      setPendingDeleteJobIds(Array.from(pendingDeleteJobsRef.current.keys()));
      const ok = await finalizeDeleteJob(jobId);
      if (!ok) {
        alert('작업 삭제에 실패했습니다.');
      }
    }, JOB_DELETE_UNDO_WINDOW_MS);
    pendingDeleteJobsRef.current.set(jobId, { name: jobName, timer });
    setPendingDeleteJobIds(Array.from(pendingDeleteJobsRef.current.keys()));
  }, [finalizeDeleteJob]);
  const undoDeleteJob = useCallback((jobId: number) => {
    const entry = pendingDeleteJobsRef.current.get(jobId);
    if (!entry) return;
    clearTimeout(entry.timer);
    pendingDeleteJobsRef.current.delete(jobId);
    setPendingDeleteJobIds(Array.from(pendingDeleteJobsRef.current.keys()));
  }, []);
  const updateJobName = useCallback(async (jobId: number, newName: string): Promise<boolean> => {
    if (!newName.trim()) {
      alert('작업명을 입력해주세요.');
      return false;
    }
    try {
      await updateTeachingJobName(jobId, newName.trim());
      await fetchJobList();
      setEditingJobId(null);
      setEditingJobName('');
      return true;
    } catch (error) {
      console.error('작업명 수정 실패:', error);
      alert('작업명 수정에 실패했습니다.');
      return false;
    }
  }, [fetchJobList]);
  return {
    jobList,
    currentJobId,
    isSavingJob,
    isJobListModalOpen,
    jobListPage,
    editingJobId,
    editingJobName,
    setIsJobListModalOpen,
    setJobListPage,
    setEditingJobId,
    setEditingJobName,
    fetchJobList,
    saveJob,
    loadJob,
    pendingDeleteJobIds,
    requestDeleteJob,
    undoDeleteJob,
    updateJobName,
    JOBS_PER_PAGE,
  };
}
const log_usePathTracking = createLogger('usePathTracking');
const POLL_INTERVAL_MS = 120;
const MIN_DISTANCE_THRESHOLD = 0.5;
const MAX_PATH_POINTS = 1000;
export interface PathPoint {
  x: number;
  y: number;
  z: number;
  isWelding: boolean;
  timestamp: number;
}
export interface CurrentPosition {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
  isWelding: boolean;
}
export interface UsePathTrackingReturn {
  pathHistory: PathPoint[];
  currentPosition: CurrentPosition | null;
  isTracking: boolean;
  startTracking: (isWelding?: boolean) => void;
  stopTracking: () => void;
  clearPath: () => void;
  fetchCurrentPosition: () => Promise<CurrentPosition | null>;
}
const calculateDistance = (
  p1: { x: number; y: number; z: number },
  p2: { x: number; y: number; z: number }
): number => {
  return Math.sqrt(
    Math.pow(p2.x - p1.x, 2) +
    Math.pow(p2.y - p1.y, 2) +
    Math.pow(p2.z - p1.z, 2)
  );
};
export function usePathTracking(): UsePathTrackingReturn {
  const [pathHistory, setPathHistory] = useState<PathPoint[]>([]);
  const [currentPosition, setCurrentPosition] = useState<CurrentPosition | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isWeldingRef = useRef(false);
  const lastPositionRef = useRef<PathPoint | null>(null);
  const fetchCurrentPosition = useCallback(async (): Promise<CurrentPosition | null> => {
    try {
      const status = await getRealtimeRobotStatus();
      if (!status?.tcp || status.tcp.length < 6) {
        return null;
      }
      const position: CurrentPosition = {
        x: status.tcp[0],
        y: status.tcp[1],
        z: status.tcp[2],
        rx: status.tcp[3],
        ry: status.tcp[4],
        rz: status.tcp[5],
        isWelding: isWeldingRef.current,
      };
      setCurrentPosition(position);
      return position;
    } catch (error) {
      log_usePathTracking.error('fetchCurrentPosition.error', '위치 조회 실패', { error: String(error) });
      return null;
    }
  }, []);
  const pollFailCountRef = useRef(0);
  const pollPosition = useCallback(async () => {
    try {
      const status = await getRealtimeRobotStatus();
      if (!status?.tcp || status.tcp.length < 3) {
        pollFailCountRef.current++;
        if (pollFailCountRef.current % 10 === 0) {
          log_usePathTracking.warn('pollPosition.noTcp', `TCP 데이터 없음 (연속 ${pollFailCountRef.current}회)`);
        }
        return;
      }
      pollFailCountRef.current = 0;
      const now = Date.now();
      const newPoint: PathPoint = {
        x: status.tcp[0],
        y: status.tcp[1],
        z: status.tcp[2],
        isWelding: isWeldingRef.current,
        timestamp: now,
      };
      setCurrentPosition({
        x: status.tcp[0],
        y: status.tcp[1],
        z: status.tcp[2],
        rx: status.tcp[3] || 0,
        ry: status.tcp[4] || 0,
        rz: status.tcp[5] || 0,
        isWelding: isWeldingRef.current,
      });
      const lastPos = lastPositionRef.current;
      if (!lastPos || calculateDistance(lastPos, newPoint) >= MIN_DISTANCE_THRESHOLD) {
        setPathHistory(prev => {
          const updated = [...prev, newPoint];
          if (updated.length > MAX_PATH_POINTS) {
            return updated.slice(-MAX_PATH_POINTS);
          }
          return updated;
        });
        lastPositionRef.current = newPoint;
      }
    } catch (error) {
      pollFailCountRef.current++;
      if (pollFailCountRef.current % 10 === 0) {
        log_usePathTracking.warn('pollPosition.error', `폴링 오류 (연속 ${pollFailCountRef.current}회)`, { error: String(error) });
      }
    }
  }, []);
  const startTracking = useCallback((isWelding = false) => {
    if (pollingIntervalRef.current) {
      log_usePathTracking.warn('startTracking.alreadyRunning', '이미 추적 중');
      return;
    }
    log_usePathTracking.info('startTracking', '경로 추적 시작', { isWelding, pollInterval: POLL_INTERVAL_MS });
    isWeldingRef.current = isWelding;
    setIsTracking(true);
    pollPosition();
    pollingIntervalRef.current = setInterval(pollPosition, POLL_INTERVAL_MS);
  }, [pollPosition]);
  const stopTracking = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    isWeldingRef.current = false;
    setIsTracking(false);
    log_usePathTracking.info('stopTracking', '경로 추적 중지', { pathPoints: pathHistory.length });
  }, [pathHistory.length]);
  const clearPath = useCallback(() => {
    setPathHistory([]);
    lastPositionRef.current = null;
    log_usePathTracking.info('clearPath', '경로 히스토리 초기화');
  }, []);
  return {
    pathHistory,
    currentPosition,
    isTracking,
    startTracking,
    stopTracking,
    clearPath,
    fetchCurrentPosition,
  };
}
export interface PathPoint_usePathVisualization {
  x: number;
  y: number;
  z: number;
  isWelding: boolean;
  timestamp: number;
}
export interface CurrentPosition_usePathVisualization {
  x: number;
  y: number;
  z: number;
  isWelding: boolean;
}
export interface UsePathVisualizationProps {
  isTracking: boolean;
  trackingPathHistory: PathPoint_usePathVisualization[];
  trackingCurrentPosition: CurrentPosition_usePathVisualization | null;
  wsPathHistory: PathPoint_usePathVisualization[];
  wsRobotState: {
    tcp_position?: number[];
    is_welding?: boolean;
  } | null;
  fiveMMPoints: CenterlinePoint[];
}
export interface UsePathVisualizationReturn {
  robotPathHistory: RobotPosition[];
  currentRobotPosition: RobotPosition | undefined;
}
const MAX_CENTERLINE_DIST = 50;
const WEAVE_SCALE = 3.0;
const MAX_WEAVE_OFFSET = 15;
function findClosestCenterlinePoint(
  tcpX: number,
  tcpY: number,
  tcpZ: number,
  centerlinePoints: CenterlinePoint[]
): { point: CenterlinePoint; distance: number; perpOffset: number } | null {
  if (centerlinePoints.length === 0) return null;
  let bestPoint = centerlinePoints[0];
  let bestDist = Infinity;
  let bestPerpOffset = 0;
  for (const pt of centerlinePoints) {
    const dx = tcpX - pt.tcp.x;
    const dy = tcpY - pt.tcp.y;
    const dz = tcpZ - pt.tcp.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist < bestDist) {
      bestDist = dist;
      bestPoint = pt;
      bestPerpOffset = Math.abs(dx) > Math.abs(dy)
        ? (Math.abs(dx) > Math.abs(dz) ? dx : dz)
        : (Math.abs(dy) > Math.abs(dz) ? dy : dz);
    }
  }
  return { point: bestPoint, distance: bestDist, perpOffset: bestPerpOffset };
}
function tcpToSchematic(
  tcpX: number,
  tcpY: number,
  tcpZ: number,
  centerlinePoints: CenterlinePoint[],
  isWelding: boolean,
  timestamp?: number,
  skipDistanceCheck?: boolean
): RobotPosition | null {
  const result = findClosestCenterlinePoint(tcpX, tcpY, tcpZ, centerlinePoints);
  if (!result) return null;
  const { point, distance, perpOffset } = result;
  if (!skipDistanceCheck && distance > MAX_CENTERLINE_DIST) {
    return null;
  }
  let schemX = point.schematic.x;
  let schemY = point.schematic.y;
  const startPt = centerlinePoints.find(p => p.segmentStartPointId === point.segmentStartPointId && p.segmentRatio === 0);
  const endPt = centerlinePoints.find(p => p.segmentEndPointId === point.segmentEndPointId && p.segmentRatio === 1);
  if (startPt && endPt) {
    const segDx = endPt.schematic.x - startPt.schematic.x;
    const segDy = endPt.schematic.y - startPt.schematic.y;
    const segLen = Math.sqrt(segDx * segDx + segDy * segDy);
    if (segLen > 0.1) {
      const perpX = -segDy / segLen;
      const perpY = segDx / segLen;
      let weaveOffset = perpOffset * WEAVE_SCALE;
      weaveOffset = Math.max(-MAX_WEAVE_OFFSET, Math.min(MAX_WEAVE_OFFSET, weaveOffset));
      schemX += weaveOffset * perpX;
      schemY += weaveOffset * perpY;
    }
  } else {
    let weaveOffset = perpOffset * WEAVE_SCALE;
    weaveOffset = Math.max(-MAX_WEAVE_OFFSET, Math.min(MAX_WEAVE_OFFSET, weaveOffset));
    if (point.partIndex === 0 || point.partIndex === 2) {
      schemY += weaveOffset;
    } else {
      schemX += weaveOffset;
    }
  }
  return {
    x: schemX,
    y: schemY,
    z: tcpZ,
    isWelding,
    timestamp,
  };
}
interface MoveDirection {
  firstTcp: { x: number; y: number; z: number };
  dirX: number; dirY: number; dirZ: number;
  schemStartX: number; schemStartY: number;
  schemEndX: number; schemEndY: number;
  schemDx: number; schemDy: number; schemLen: number;
  schemPerpX: number; schemPerpY: number;
  totalTcpDist: number;
}
export function usePathVisualization({
  isTracking,
  trackingPathHistory,
  trackingCurrentPosition,
  wsPathHistory,
  wsRobotState,
  fiveMMPoints,
}: UsePathVisualizationProps): UsePathVisualizationReturn {
  const moveDirRef = useRef<MoveDirection | null>(null);
  useEffect(() => { if (!isTracking) moveDirRef.current = null; }, [isTracking]);
  const mapTcpToSchematic = useCallback((tcpX: number, tcpY: number, tcpZ: number, dir: MoveDirection): { x: number; y: number } => {
    const dx = tcpX - dir.firstTcp.x;
    const dy = tcpY - dir.firstTcp.y;
    const dz = tcpZ - dir.firstTcp.z;
    const proj = dx * dir.dirX + dy * dir.dirY + dz * dir.dirZ;
    const ratio = Math.max(0, Math.min(1.1, proj / dir.totalTcpDist));
    const px = dx - proj * dir.dirX;
    const py = dy - proj * dir.dirY;
    const pz = dz - proj * dir.dirZ;
    const perpDist = Math.sqrt(px * px + py * py + pz * pz);
    const sign = (px * (-dir.dirY) + py * dir.dirX) > 0 ? 1 : -1;
    const weave = Math.max(-MAX_WEAVE_OFFSET, Math.min(MAX_WEAVE_OFFSET, perpDist * sign * WEAVE_SCALE));
    return {
      x: dir.schemStartX + ratio * dir.schemDx + weave * dir.schemPerpX,
      y: dir.schemStartY + ratio * dir.schemDy + weave * dir.schemPerpY,
    };
  }, []);
  const robotPathHistory = useMemo<RobotPosition[]>(() => {
    const pathData = (isTracking || trackingPathHistory.length > 0) ? trackingPathHistory : wsPathHistory;
    if (pathData.length < 3 || fiveMMPoints.length === 0) return [];
    const fp = pathData[0];
    const lp = pathData[pathData.length - 1];
    const tcpDx = lp.x - fp.x; const tcpDy = lp.y - fp.y; const tcpDz = lp.z - fp.z;
    const tcpLen = Math.sqrt(tcpDx * tcpDx + tcpDy * tcpDy + tcpDz * tcpDz);
    if (tcpLen < 3) return [];
    const fcl = findClosestCenterlinePoint(fp.x, fp.y, fp.z, fiveMMPoints);
    const lcl = findClosestCenterlinePoint(lp.x, lp.y, lp.z, fiveMMPoints);
    if (!fcl || !lcl) return [];
    const sdx = lcl.point.schematic.x - fcl.point.schematic.x;
    const sdy = lcl.point.schematic.y - fcl.point.schematic.y;
    const slen = Math.sqrt(sdx * sdx + sdy * sdy);
    if (slen < 1) return [];
    const dir: MoveDirection = {
      firstTcp: { x: fp.x, y: fp.y, z: fp.z },
      dirX: tcpDx / tcpLen, dirY: tcpDy / tcpLen, dirZ: tcpDz / tcpLen,
      schemStartX: fcl.point.schematic.x, schemStartY: fcl.point.schematic.y,
      schemEndX: lcl.point.schematic.x, schemEndY: lcl.point.schematic.y,
      schemDx: sdx, schemDy: sdy, schemLen: slen,
      schemPerpX: -sdy / slen, schemPerpY: sdx / slen,
      totalTcpDist: tcpLen,
    };
    moveDirRef.current = dir;
    return pathData.map(p => {
      const s = mapTcpToSchematic(p.x, p.y, p.z, dir);
      return { x: s.x, y: s.y, z: 0, isWelding: p.isWelding ?? true, timestamp: p.timestamp };
    });
  }, [isTracking, trackingPathHistory, wsPathHistory, fiveMMPoints, mapTcpToSchematic]);
  const currentRobotPosition = useMemo<RobotPosition | undefined>(() => {
    let tcpPos: { x: number; y: number; z: number; isWelding: boolean } | null = null;
    if (isTracking && trackingCurrentPosition) {
      tcpPos = {
        x: trackingCurrentPosition.x,
        y: trackingCurrentPosition.y,
        z: trackingCurrentPosition.z,
        isWelding: trackingCurrentPosition.isWelding,
      };
    } else if (wsRobotState?.tcp_position && wsRobotState.tcp_position.length >= 3) {
      tcpPos = {
        x: wsRobotState.tcp_position[0],
        y: wsRobotState.tcp_position[1],
        z: wsRobotState.tcp_position[2],
        isWelding: wsRobotState.is_welding ?? false,
      };
    }
    if (!tcpPos || fiveMMPoints.length === 0) return undefined;
    const dir = moveDirRef.current;
    if (dir) {
      const s = mapTcpToSchematic(tcpPos.x, tcpPos.y, tcpPos.z, dir);
      return { x: s.x, y: s.y, z: 0, isWelding: tcpPos.isWelding };
    }
    const cl = findClosestCenterlinePoint(tcpPos.x, tcpPos.y, tcpPos.z, fiveMMPoints);
    if (cl) return { x: cl.point.schematic.x, y: cl.point.schematic.y, z: 0, isWelding: tcpPos.isWelding };
    return undefined;
  }, [isTracking, trackingCurrentPosition, trackingPathHistory, wsPathHistory, wsRobotState, fiveMMPoints]);
  return {
    robotPathHistory,
    currentRobotPosition,
  };
}
const log_useRobotControl = createLogger('useRobotControl');
export interface MoveToPointOptions {
  overrideSpeed?: number;
  skipRetract?: boolean;
}
export interface UseRobotControlReturn {
  isRobotMoving: boolean;
  teachingRobotState: RealtimeRobotStatus | null;
  isTeachingPolling: boolean;
  moveToPoint: (point: TeachingPoint, options?: MoveToPointOptions | number) => Promise<boolean>;
  stopMove: () => Promise<void>;
  startTeachingPolling: () => void;
  stopTeachingPolling: () => void;
  isAtPosition: (
    current: number[] | null | undefined,
    target: number[],
    tolerance?: number,
  ) => boolean;
}
const JOINT_JUMP_WARN_DEG = 45;
export function useRobotControl(): UseRobotControlReturn {
  const [isRobotMoving, setIsRobotMoving] = useState(false);
  const [teachingRobotState, setTeachingRobotState] = useState<RealtimeRobotStatus | null>(null);
  const [isTeachingPolling, setIsTeachingPolling] = useState(false);
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopMoveRef = useRef(false);
  const isAtPosition = useCallback(
    (current: number[] | null | undefined, target: number[], tolerance: number = 0.5): boolean => {
      if (!current || current.length !== target.length) return false;
      return current.every((val, idx) => Math.abs(val - target[idx]) <= tolerance);
    },
    [],
  );
  const startTeachingPolling = useCallback(() => {
    if (pollingIntervalRef.current) return;
    setIsTeachingPolling(true);
    const poll = async () => {
      try {
        const status = await getRealtimeRobotStatus();
        setTeachingRobotState(status);
      } catch (error) {
        console.error('폴링 오류:', error);
      }
    };
    poll();
    pollingIntervalRef.current = setInterval(poll, 200);
  }, []);
  const stopTeachingPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    setIsTeachingPolling(false);
  }, []);
  const moveToPoint = useCallback(
    async (point: TeachingPoint, options?: MoveToPointOptions | number): Promise<boolean> => {
      const opts: MoveToPointOptions =
        typeof options === 'number' ? { overrideSpeed: options } : (options ?? {});
      if (isRobotMoving) {
        log_useRobotControl.warn('moveToPoint.busy', '로봇이 이동 중');
        return false;
      }
      if (!point.joints || point.joints.length < 6) {
        alert('유효한 관절 데이터가 없습니다.');
        return false;
      }
      if (point.joints.every(j => j === 0)) {
        alert('관절 데이터가 모두 0입니다.');
        return false;
      }
      const targetJoints = point.joints;
      const currentJoints = teachingRobotState?.joints;
      if (!isAtPosition(currentJoints, targetJoints)) {
        let confirmMsg = `${point.name ?? point.id} 위치로 이동하시겠습니까?`;
        if (currentJoints && currentJoints.length === targetJoints.length) {
          const diffs = currentJoints.map((v, i) => Math.abs(v - targetJoints[i]));
          const maxDiff = Math.max(...diffs);
          if (maxDiff > JOINT_JUMP_WARN_DEG) {
            const jointIdx = diffs.indexOf(maxDiff) + 1;
            confirmMsg = `⚠ 이동 거리가 큽니다 (J${jointIdx} 관절 약 ${maxDiff.toFixed(1)}도 이동).\n${point.name ?? point.id} 위치로 이동하시겠습니까?`;
          }
        }
        if (!window.confirm(confirmMsg)) {
          return false;
        }
      }
      const speed = opts.overrideSpeed ?? point.moveSpeed;
      const totalTimer = log_useRobotControl.startTimer();
      setIsRobotMoving(true);
      stopMoveRef.current = false;
      try {
        if (!teachingRobotState?.servo_enabled) {
          const enableResult = await enableRobot().catch(e => ({ error: e }));
          if ((enableResult as { error?: Error }).error) throw new Error('서보 활성화 실패');
        }
        if (isAtPosition(teachingRobotState?.joints, point.joints)) {
          totalTimer.end('moveToPoint.skip', `${point.name} 이미 위치에 있음`);
          return true;
        }
        log_useRobotControl.info('moveToPoint.start', `${point.name}(으)로 이동 시작`, {
          pointId: point.id,
          speed,
        });
        const toolNum = point.toolNum ?? 0;
        const userNum = point.userNum ?? 0;
        const skipRetract = opts.skipRetract ?? false;
        if (!skipRetract) {
          const retractOk = await executeRetract(
            teachingRobotState?.tcp ?? null,
            speed,
            toolNum,
            userNum,
            stopMoveRef,
          );
          if (!retractOk) return false;
        }
        const moveJOk = await executeMoveJ(point, speed, toolNum, userNum, stopMoveRef, teachingRobotState?.joints);
        if (!moveJOk) return false;
        totalTimer.end('moveToPoint.done', `${point.name} 이동 완료`);
        return true;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        log_useRobotControl.error('moveToPoint.error', '이동 오류', { error: errorMsg });
        return false;
      } finally {
        setIsRobotMoving(false);
      }
    },
    [isRobotMoving, teachingRobotState, isAtPosition],
  );
  const stopMove = useCallback(async () => {
    stopMoveRef.current = true;
    try {
      await stopRobotSDK();
      log_useRobotControl.info('stopMove', '로봇 정지 완료');
    } catch {
      log_useRobotControl.error('stopMove.error', '정지 오류');
    }
    setIsRobotMoving(false);
  }, []);
  return {
    isRobotMoving,
    teachingRobotState,
    isTeachingPolling,
    moveToPoint,
    stopMove,
    startTeachingPolling,
    stopTeachingPolling,
    isAtPosition,
  };
}
export interface CenterlinePoint {
  schematic: { x: number; y: number };
  tcp: { x: number; y: number; z: number };
  distance: number;
  segmentIndex: number;
  segmentRatio: number;
  partIndex: number;
  segmentStartPointId: string;
  segmentEndPointId: string;
  orientation: { rx: number; ry: number; rz: number };
  toolNum: number;
  userNum: number;
}
export interface UseSchematicCalculationsProps {
  selectedWidth: number;
  selectedHeight: number | null;
  teachingPoints: TeachingPoint[];
}
export interface UseSchematicCalculationsReturn {
  getSchematicPosition: (pointId: string) => { x: number; y: number };
  centerlinePath: { x: number; y: number }[];
  fiveMMPoints: CenterlinePoint[];
}
export function useSchematicCalculations({
  selectedWidth,
  selectedHeight,
  teachingPoints,
}: UseSchematicCalculationsProps): UseSchematicCalculationsReturn {
  const getSchematicEndpoints = useCallback(() => {
    const halfWidth = (selectedWidth || 600) / 2;
    const halfHeight = (selectedHeight || 550) / 2;
    const margin = 50;
    return {
      p1: { x: -halfWidth - margin, y: halfHeight },
      p3: { x: -halfWidth - margin, y: -halfHeight },
      p4: { x: -halfWidth, y: -halfHeight - margin },
      p6: { x: -margin / 2, y: -halfHeight - margin },
      p7: { x: halfWidth + margin, y: halfHeight },
      p9: { x: halfWidth + margin, y: -halfHeight },
      p10: { x: halfWidth, y: -halfHeight - margin },
      p12: { x: margin / 2, y: -halfHeight - margin },
    };
  }, [selectedWidth, selectedHeight]);
  const getSchematicPosition = useCallback((pointId: string) => {
    const endpoints = getSchematicEndpoints();
    switch (pointId) {
      case 'home': return { x: 0, y: 0 };
      case 'p1': return endpoints.p1;
      case 'p3': return endpoints.p3;
      case 'p4': return endpoints.p4;
      case 'p6': return endpoints.p6;
      case 'p7': return endpoints.p7;
      case 'p9': return endpoints.p9;
      case 'p10': return endpoints.p10;
      case 'p12': return endpoints.p12;
    }
    const calcMiddlePosition = (
      startId: string,
      middleId: string,
      endId: string,
      startPos: { x: number; y: number },
      endPos: { x: number; y: number }
    ): { x: number; y: number } => {
      const startPt = teachingPoints.find(pt => pt.id === startId);
      const middlePt = teachingPoints.find(pt => pt.id === middleId);
      const endPt = teachingPoints.find(pt => pt.id === endId);
      if (!startPt?.tcp || !middlePt?.tcp || !endPt?.tcp) {
        return {
          x: (startPos.x + endPos.x) / 2,
          y: (startPos.y + endPos.y) / 2,
        };
      }
      const d1 = Math.sqrt(
        Math.pow(middlePt.tcp.x - startPt.tcp.x, 2) +
        Math.pow(middlePt.tcp.y - startPt.tcp.y, 2) +
        Math.pow(middlePt.tcp.z - startPt.tcp.z, 2)
      );
      const d2 = Math.sqrt(
        Math.pow(endPt.tcp.x - middlePt.tcp.x, 2) +
        Math.pow(endPt.tcp.y - middlePt.tcp.y, 2) +
        Math.pow(endPt.tcp.z - middlePt.tcp.z, 2)
      );
      const totalDist = d1 + d2;
      const ratio = totalDist > 0 ? d1 / totalDist : 0.5;
      return {
        x: startPos.x + (endPos.x - startPos.x) * ratio,
        y: startPos.y + (endPos.y - startPos.y) * ratio,
      };
    };
    switch (pointId) {
      case 'p2':
        return calcMiddlePosition('p3', 'p2', 'p1', endpoints.p3, endpoints.p1);
      case 'p5':
        return calcMiddlePosition('p4', 'p5', 'p6', endpoints.p4, endpoints.p6);
      case 'p8':
        return calcMiddlePosition('p9', 'p8', 'p7', endpoints.p9, endpoints.p7);
      case 'p11':
        return calcMiddlePosition('p10', 'p11', 'p12', endpoints.p10, endpoints.p12);
      default:
        return { x: 0, y: 0 };
    }
  }, [teachingPoints, getSchematicEndpoints]);
  const { centerlinePath, fiveMMPoints } = useMemo<{
    centerlinePath: { x: number; y: number }[];
    fiveMMPoints: CenterlinePoint[];
  }>(() => {
    const allPaths: { x: number; y: number }[] = [];
    const allPoints: CenterlinePoint[] = [];
    WELDING_PARTS.forEach((part, partIndex) => {
      const partPoints = part.points
        .map(pointId => teachingPoints.find(pt => pt.id === pointId))
        .filter((pt): pt is TeachingPoint =>
          pt !== undefined && pt.isSaved && pt.tcp !== null
        );
      if (partPoints.length < 2) return;
      const firstPartPoint = partPoints[0];
      const partOrientation = {
        rx: firstPartPoint.tcp!.rx,
        ry: firstPartPoint.tcp!.ry,
        rz: firstPartPoint.tcp!.rz,
      };
      const partToolNum = firstPartPoint.toolNum ?? 0;
      const partUserNum = firstPartPoint.userNum ?? 0;
      let partDistance = 0;
      for (let i = 0; i < partPoints.length; i++) {
        const pt = partPoints[i];
        const schematic = getSchematicPosition(pt.id);
        allPaths.push(schematic);
        if (i === 0 && partPoints.length > 1) {
          allPoints.push({
            schematic,
            tcp: { x: pt.tcp!.x, y: pt.tcp!.y, z: pt.tcp!.z },
            distance: 0,
            segmentIndex: 0,
            segmentRatio: 0,
            partIndex,
            segmentStartPointId: pt.id,
            segmentEndPointId: partPoints[1].id,
            orientation: partOrientation,
            toolNum: partToolNum,
            userNum: partUserNum,
          });
        }
      }
      for (let i = 0; i < partPoints.length - 1; i++) {
        const startPt = partPoints[i];
        const endPt = partPoints[i + 1];
        const startTcp = startPt.tcp!;
        const endTcp = endPt.tcp!;
        const startSchem = getSchematicPosition(startPt.id);
        const endSchem = getSchematicPosition(endPt.id);
        const tcpDx = endTcp.x - startTcp.x;
        const tcpDy = endTcp.y - startTcp.y;
        const tcpDz = endTcp.z - startTcp.z;
        const segLength = Math.sqrt(tcpDx * tcpDx + tcpDy * tcpDy + tcpDz * tcpDz);
        const INTERVAL = 5;
        const numPoints = Math.floor(segLength / INTERVAL);
        const startOrientation = { rx: startTcp.rx, ry: startTcp.ry, rz: startTcp.rz };
        const endOrientation = { rx: endTcp.rx, ry: endTcp.ry, rz: endTcp.rz };
        for (let j = 1; j <= numPoints; j++) {
          const ratio = (j * INTERVAL) / segLength;
          const distFromStart = partDistance + j * INTERVAL;
          const tcpX = startTcp.x + tcpDx * ratio;
          const tcpY = startTcp.y + tcpDy * ratio;
          const tcpZ = startTcp.z + tcpDz * ratio;
          const schemX = startSchem.x + (endSchem.x - startSchem.x) * ratio;
          const schemY = startSchem.y + (endSchem.y - startSchem.y) * ratio;
          const interpolatedOrientation = {
            rx: startOrientation.rx + ratio * (endOrientation.rx - startOrientation.rx),
            ry: startOrientation.ry + ratio * (endOrientation.ry - startOrientation.ry),
            rz: startOrientation.rz + ratio * (endOrientation.rz - startOrientation.rz),
          };
          allPoints.push({
            schematic: { x: schemX, y: schemY },
            tcp: { x: tcpX, y: tcpY, z: tcpZ },
            distance: distFromStart,
            segmentIndex: i,
            segmentRatio: ratio,
            partIndex,
            segmentStartPointId: startPt.id,
            segmentEndPointId: endPt.id,
            orientation: interpolatedOrientation,
            toolNum: partToolNum,
            userNum: partUserNum,
          });
        }
        partDistance += segLength;
      }
    });
    return { centerlinePath: allPaths, fiveMMPoints: allPoints };
  }, [teachingPoints, getSchematicPosition]);
  return {
    getSchematicPosition,
    centerlinePath,
    fiveMMPoints,
  };
}
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
const log_useWeldingHandlers = createLogger('WeldingHandlers');
interface UseWeldingHandlersProps {
  teachingPoints: TeachingPoint[];
  teachingRobotState: RealtimeRobotStatus | null;
  simulationMode: boolean;
  dryRunMode: boolean;
  manualMoveSpeed: number;
  autoTouchSensing: boolean;
  partWeldEnabled: PartWeldEnabled;
  currentJobId: number | null;
  jobList: Array<{ id: number; name: string }>;
  showAlert: (
    message: string,
    options?: { type?: 'error' | 'warning' | 'info' | 'success'; title?: string },
  ) => void;
  startWelding: (
    teachingPoints: TeachingPoint[],
    robotState: RealtimeRobotStatus | null,
    simulationMode: boolean,
    jobId?: number,
    jobName?: string,
    options?: WeldingStartOptions,
  ) => Promise<WeldingResult | null>;
  stopWelding: () => Promise<void>;
  startTouchSensing: (
    teachingPoints: TeachingPoint[],
    robotState: RealtimeRobotStatus | null,
    options?: TouchSensingOptions,
  ) => Promise<TouchSensingResult[]>;
  stopTouchSensing: () => Promise<void>;
  clearAllTouchOffsets: () => void;
  updatePointTouchOffset: (
    pointId: string,
    offset: { dx: number; dy: number; dz: number } | null,
  ) => void;
  updatePointSpeed: (pointId: string, speed: number, velMode?: 0 | 1) => void;
  updatePointWeldParams: (pointId: string, voltage: number | null, current: number | null) => void;
  updatePointGap: (pointId: string, gap: number) => void;
  updatePointWeaveParams: (pointId: string, params: Partial<WeaveParams>) => void;
  updatePointWeavingType: (pointId: string, type: string | null) => void;
  startTracking: (isWelding: boolean) => void;
  stopTracking: () => void;
  clearTrackingPath: () => void;
  wsClearPathHistory: () => void;
}
export function useWeldingHandlers({
  teachingPoints,
  teachingRobotState,
  simulationMode,
  dryRunMode,
  manualMoveSpeed,
  autoTouchSensing,
  partWeldEnabled,
  currentJobId,
  jobList,
  showAlert,
  startWelding,
  stopWelding,
  startTouchSensing,
  stopTouchSensing,
  clearAllTouchOffsets,
  updatePointTouchOffset,
  updatePointSpeed,
  updatePointWeldParams,
  updatePointGap,
  updatePointWeaveParams,
  updatePointWeavingType,
  startTracking,
  stopTracking,
  clearTrackingPath,
  wsClearPathHistory,
}: UseWeldingHandlersProps) {
  const handleStartWelding = useCallback(async () => {
    const isActualWelding = !(simulationMode || dryRunMode);
    if (autoTouchSensing && isActualWelding) {
      log_useWeldingHandlers.info('welding.autoTouch.start', '용접 전 자동 터치센싱 시작');
      clearAllTouchOffsets();
      clearTrackingPath();
      startTracking(false);
      try {
        const touchResult = await startTouchSensing(teachingPoints, teachingRobotState, {
          touchBottom: false,
          depthOffset: 5,
          isDryRun: false,
          manualSpeed: manualMoveSpeed,
          partWeldEnabled,
          suppressAlerts: true,
          skipHomeReturn: true,  // 자동 용접 흐름 - 용접이 끝나면 홈으로 감
          onUpdatePoint: (pointId: string, offset: { dx: number; dy: number; dz: number }) => {
            updatePointTouchOffset(pointId, offset);
          },
        });
        const savedPointsForTouch = teachingPoints.filter(pt => pt.isSaved && pt.id !== 'home');
        if (!touchResult || touchResult.length < savedPointsForTouch.length) {
          showAlert('터치센싱이 완료되지 않아 용접을 중단합니다.', { type: 'warning' });
          stopTracking();
          return;
        }
        log_useWeldingHandlers.info('welding.autoTouch.done', '자동 터치센싱 완료, 용접 진행');
      } catch (error) {
        showAlert(`터치센싱 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`, {
          type: 'error',
        });
        stopTracking();
        return;
      }
      stopTracking();
    }
    clearTrackingPath();
    startTracking(isActualWelding);
    const currentJob = jobList.find(job => job.id === currentJobId);
    try {
      await startWelding(
        teachingPoints,
        teachingRobotState,
        simulationMode || dryRunMode,
        currentJobId ?? undefined,
        currentJob?.name,
        { isDryRun: dryRunMode, partWeldEnabled },
      );
    } finally {
      stopTracking();
    }
  }, [
    teachingPoints,
    teachingRobotState,
    simulationMode,
    dryRunMode,
    manualMoveSpeed,
    autoTouchSensing,
    partWeldEnabled,
    currentJobId,
    jobList,
    showAlert,
    startWelding,
    startTouchSensing,
    clearAllTouchOffsets,
    updatePointTouchOffset,
    startTracking,
    stopTracking,
    clearTrackingPath,
  ]);
  const handleContinueWelding = useCallback(async () => {
    if (!teachingRobotState?.tcp || teachingRobotState.tcp.length < 3) {
      showAlert('로봇 TCP 위치를 가져올 수 없습니다.', { type: 'error' });
      return;
    }
    const isActualWelding = !(simulationMode || dryRunMode);
    startTracking(isActualWelding);
    const currentJob = jobList.find(job => job.id === currentJobId);
    try {
      await startWelding(
        teachingPoints,
        teachingRobotState,
        simulationMode || dryRunMode,
        currentJobId ?? undefined,
        currentJob?.name,
        {
          startFromClosest: true,
          currentTcp: teachingRobotState.tcp,
          manualMoveSpeed,
          isDryRun: dryRunMode,
          partWeldEnabled,
        },
      );
    } finally {
      stopTracking();
    }
  }, [
    teachingPoints,
    teachingRobotState,
    simulationMode,
    dryRunMode,
    manualMoveSpeed,
    currentJobId,
    jobList,
    partWeldEnabled,
    showAlert,
    startWelding,
    startTracking,
    stopTracking,
  ]);
  const handleStartTouchSensing = useCallback(async () => {
    if (!dryRunMode) clearAllTouchOffsets();
    if (dryRunMode) {
      clearTrackingPath();
      wsClearPathHistory();
    } else {
      clearTrackingPath();
      startTracking(false);
    }
    try {
      await startTouchSensing(teachingPoints, teachingRobotState, {
        touchBottom: false,
        depthOffset: 5,
        isDryRun: dryRunMode,
        manualSpeed: manualMoveSpeed,
        partWeldEnabled,
        onUpdatePoint: (pointId: string, offset: { dx: number; dy: number; dz: number }) => {
          updatePointTouchOffset(pointId, offset);
        },
      });
    } finally {
      if (!dryRunMode) {
        stopTracking();
      }
    }
  }, [
    teachingPoints,
    teachingRobotState,
    dryRunMode,
    manualMoveSpeed,
    partWeldEnabled,
    clearAllTouchOffsets,
    updatePointTouchOffset,
    startTouchSensing,
    startTracking,
    stopTracking,
    clearTrackingPath,
    wsClearPathHistory,
  ]);
  const handleGlobalEmergencyStop = useCallback(async () => {
    log_useWeldingHandlers.warn('emergency.globalStop', 'Global emergency stop');
    try {
      stopTracking();
      await emergencyStop().catch(() => {});
      await Promise.all([stopTouchSensing().catch(() => {}), stopWelding().catch(() => {})]);
      showAlert('비상 정지 완료', { type: 'warning' });
    } catch (error) {
      log_useWeldingHandlers.error('emergency.globalStop.error', '비상 정지 중 오류', { error });
    }
  }, [showAlert, stopTouchSensing, stopWelding, stopTracking]);
  const applyParamsToAllPoints = useCallback(
    (sourcePointId: string) => {
      const sourcePoint = teachingPoints.find(pt => pt.id === sourcePointId);
      if (!sourcePoint) return;
      teachingPoints.forEach(pt => {
        if (pt.id !== 'home' && pt.id !== sourcePointId) {
          updatePointSpeed(pt.id, sourcePoint.moveSpeed, sourcePoint.velMode);
          updatePointWeldParams(pt.id, sourcePoint.weldVoltage, sourcePoint.weldCurrent);
          updatePointWeavingType(pt.id, sourcePoint.weavingType);
          updatePointWeaveParams(pt.id, sourcePoint.weaveParams);
          updatePointGap(pt.id, sourcePoint.gap);
        }
      });
      showAlert('모든 용접 포인트에 파라미터가 적용되었습니다.', { type: 'success' });
    },
    [
      teachingPoints,
      showAlert,
      updatePointSpeed,
      updatePointWeldParams,
      updatePointWeavingType,
      updatePointWeaveParams,
      updatePointGap,
    ],
  );
  const applyParamsToBlock = useCallback(
    (sourcePointId: string) => {
      const sourcePoint = teachingPoints.find(pt => pt.id === sourcePointId);
      if (!sourcePoint) return;
      const blockPointIds = getBlockPointIds(sourcePointId);
      if (blockPointIds.length === 0) return;
      const blockName = getBlockName(sourcePointId);
      blockPointIds.forEach(pid => {
        if (pid !== sourcePointId) {
          updatePointSpeed(pid, sourcePoint.moveSpeed, sourcePoint.velMode);
          updatePointWeldParams(pid, sourcePoint.weldVoltage, sourcePoint.weldCurrent);
          updatePointWeavingType(pid, sourcePoint.weavingType);
          updatePointWeaveParams(pid, sourcePoint.weaveParams);
          updatePointGap(pid, sourcePoint.gap);
        }
      });
      showAlert(
        `${blockName} (${blockPointIds.map(id => id.toUpperCase()).join(', ')})에 파라미터가 적용되었습니다.`,
        { type: 'success' },
      );
    },
    [
      teachingPoints,
      showAlert,
      updatePointSpeed,
      updatePointWeldParams,
      updatePointWeavingType,
      updatePointWeaveParams,
      updatePointGap,
    ],
  );
  const handleStartWeldingTest = useCallback(async () => {
    clearTrackingPath();
    startTracking(false);
    const currentJob = jobList.find(job => job.id === currentJobId);
    try {
      await startWelding(
        teachingPoints,
        teachingRobotState,
        false,
        currentJobId ?? undefined,
        currentJob?.name,
        { isDryRun: true, partWeldEnabled, isWeldingTest: true },
      );
    } finally {
      stopTracking();
    }
  }, [
    teachingPoints,
    teachingRobotState,
    partWeldEnabled,
    currentJobId,
    jobList,
    startWelding,
    startTracking,
    stopTracking,
    clearTrackingPath,
  ]);
  return {
    handleStartWelding,
    handleStartWeldingTest,
    handleContinueWelding,
    handleStartTouchSensing,
    handleGlobalEmergencyStop,
    applyParamsToAllPoints,
    applyParamsToBlock,
  };
}
export type UseWeldingHandlersReturn = ReturnType<typeof useWeldingHandlers>;
export type {
  TouchSensingResult,
  TouchSensingOptions,
  ClosestCenterlineResult,
  WeldingStartOptions,
  WeldingResult,
  UseWeldingOperationsReturn,
};
const log_useWeldingOperations = createLogger('useWeldingOperations');
export function useWeldingOperations(): UseWeldingOperationsReturn {
  const [isArcTesting, setIsArcTesting] = useState(false);
  const [isWelding, setIsWelding] = useState(false);
  const [arcActive, setArcActive] = useState(false);
  const [isTouchSensing, setIsTouchSensing] = useState(false);
  const [currentPointIndex, setCurrentPointIndex] = useState(-1);
  const [simulationMode, setSimulationMode] = useState(false);
  const [dryRunMode, setDryRunMode] = useState(false);
  const [lastWeldingResult, setLastWeldingResult] = useState<WeldingResult | null>(null);
  const stopRef = useRef(false);
  const { show: showAlert } = useAlert();
  const startTouchSensing = useCallback(async (
    teachingPoints: TeachingPoint[],
    robotState: RealtimeRobotStatus | null,
    options?: TouchSensingOptions
  ): Promise<TouchSensingResult[]> => {
    if (isArcTesting || isWelding || isTouchSensing) return [];
    setIsTouchSensing(true);
    stopRef.current = false;
    const context: TouchSensingContext = {
      stopRef,
      setCurrentPointIndex,
      showAlert,
    };
    try {
      return await executeTouchSensing(teachingPoints, robotState, options, context);
    } finally {
      setIsTouchSensing(false);
      setCurrentPointIndex(-1);
    }
  }, [isArcTesting, isWelding, isTouchSensing, showAlert]);
  const stopTouchSensing = useCallback(async () => {
    log_useWeldingOperations.warn('touchSensing.stop', '터치 센싱 긴급 정지');
    stopRef.current = true;
    try {
      await emergencyStop().catch(() => {});
      await Promise.all([
        stopRobotSDK().catch(() => {}),
        wireSearchEnd({}).catch(() => {})
      ]);
    } catch {  }
    setIsTouchSensing(false);
    setCurrentPointIndex(-1);
  }, []);
  const startArcTest = useCallback(async (
    teachingPoints: TeachingPoint[],
    robotState: RealtimeRobotStatus | null,
    manualSpeed: number,
    isSimulation: boolean
  ) => {
    if (isArcTesting || isWelding) return;
    setIsArcTesting(true);
    stopRef.current = false;
    setCurrentPointIndex(0);
    const context: ArcTestContext = {
      stopRef,
      setCurrentPointIndex,
      showAlert,
    };
    try {
      await executeArcTest(teachingPoints, robotState, manualSpeed, isSimulation, context);
    } catch (error) {
      const testType = isSimulation ? '포인트 테스트' : '아크 테스트';
      log_useWeldingOperations.error('arcTest.error', `${testType} 오류`, { error: String(error) });
      showAlert(`${testType} 중 오류가 발생했습니다: ${String(error)}`, { type: 'error', title: `${testType} 오류` });
      if (!isSimulation) {
        try { await endArc(); } catch {  }
      }
    } finally {
      setIsArcTesting(false);
      setCurrentPointIndex(-1);
    }
  }, [isArcTesting, isWelding, showAlert]);
  const stopArcTest = useCallback(async () => {
    log_useWeldingOperations.warn('arcTest.stop', '아크 테스트 긴급 정지');
    stopRef.current = true;
    try {
      await emergencyStop().catch(() => {});
      await Promise.all([
        stopRobotSDK().catch(() => {}),
        endArc().catch(() => {}),
        endWeave().catch(() => {})
      ]);
    } catch {  }
    setIsArcTesting(false);
    setCurrentPointIndex(-1);
  }, []);
  const findClosestCenterlinePoint = useCallback((
    teachingPoints: TeachingPoint[],
    currentTcp: number[],
    partWeldEnabled?: PartWeldEnabled
  ): ClosestCenterlineResult | null => {
    return findClosestCenterlinePointFn(teachingPoints, currentTcp, partWeldEnabled);
  }, []);
  const startWelding = useCallback(async (
    teachingPoints: TeachingPoint[],
    robotState: RealtimeRobotStatus | null,
    simMode: boolean,
    jobId?: number,
    jobName?: string,
    options?: WeldingStartOptions
  ): Promise<WeldingResult | null> => {
    if (isArcTesting || isWelding) return null;
    setIsWelding(true);
    stopRef.current = false;
    const context: WeldingExecutionContext = {
      stopRef,
      setCurrentPointIndex,
      showAlert,
      setLastWeldingResult,
      currentPointIndex,
      setArcActive,
    };
    try {
      const result = await executeWelding(
        teachingPoints, robotState, simMode, context, jobId, jobName, options
      );
      return result;
    } finally {
      setIsWelding(false);
      setArcActive(false);
      setCurrentPointIndex(-1);
    }
  }, [isArcTesting, isWelding, currentPointIndex, showAlert]);
  const stopWelding = useCallback(async () => {
    log_useWeldingOperations.warn('welding.stop', '용접 긴급 정지');
    stopRef.current = true;
    try {
      await emergencyStop().catch(() => {});
      await stopRobotSDK().catch(() => {});
      await endWeave().catch(() => {});
      await arcOff(0, 0, 1000, 200).catch(() => {});
      await arcTraceControl({ flag: 0 }).catch(() => {});
    } catch {  }
    setIsWelding(false);
    setArcActive(false);
    setCurrentPointIndex(-1);
  }, []);
  return {
    isArcTesting,
    isWelding,
    arcActive,
    isTouchSensing,
    currentPointIndex,
    simulationMode,
    dryRunMode,
    lastWeldingResult,
    startArcTest,
    stopArcTest,
    startTouchSensing,
    stopTouchSensing,
    startWelding,
    stopWelding,
    setSimulationMode,
    setDryRunMode,
    findClosestCenterlinePoint,
  };
}
const WIRE_FORWARD_DURATION_MS = 200;
const WIRE_REVERSE_DURATION_MS = 400;
export interface UseWireControlReturn {
  wireContinuous: boolean;
  setWireContinuous: (v: boolean) => void;
  wireFeeding: 'in' | 'out' | null;
  handleWireIn: () => Promise<void>;
  handleWireOut: () => Promise<void>;
  handleWireStop: () => Promise<void>;
}
export function useWireControl(): UseWireControlReturn {
  const [wireContinuous, setWireContinuous] = useState(false);
  const [wireFeeding, setWireFeeding] = useState<'in' | 'out' | null>(null);
  const handleWireIn = useCallback(async () => {
    try {
      if (wireContinuous) {
        setWireFeeding('in');
        await reverseWireFeed(0, 1);
      } else {
        await reverseWireFeed(0, 1);
        setTimeout(async () => {
          await stopReverseWireFeed(0);
        }, WIRE_REVERSE_DURATION_MS);
      }
    } catch (error) {
      console.error('Wire In 오류:', error);
    }
  }, [wireContinuous]);
  const handleWireOut = useCallback(async () => {
    try {
      if (wireContinuous) {
        setWireFeeding('out');
        await forwardWireFeed(0, 1);
      } else {
        await forwardWireFeed(0, 1);
        setTimeout(async () => {
          await stopForwardWireFeed(0);
        }, WIRE_FORWARD_DURATION_MS);
      }
    } catch (error) {
      console.error('Wire Out 오류:', error);
    }
  }, [wireContinuous]);
  const handleWireStop = useCallback(async () => {
    try {
      if (wireFeeding === 'in') await stopReverseWireFeed(0);
      else if (wireFeeding === 'out') await stopForwardWireFeed(0);
      setWireFeeding(null);
    } catch (error) {
      console.error('Wire Stop 오류:', error);
    }
  }, [wireFeeding]);
  return {
    wireContinuous,
    setWireContinuous,
    wireFeeding,
    handleWireIn,
    handleWireOut,
    handleWireStop,
  };
}
