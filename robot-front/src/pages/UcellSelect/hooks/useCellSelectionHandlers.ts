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
      const skipRetract = point.id !== 'home' && !isAtSavedNonHomePoint();
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
