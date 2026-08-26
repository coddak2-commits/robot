import React, { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, History } from 'lucide-react';
import { useTeachingPoints, useRobotControl, useJobManagement, useWeldingOperations, usePathTracking, useSchematicCalculations, usePathVisualization, useCenterlineNavigation, useWeldingHandlers, useWireControl, useCellSelectionHandlers, useAutoSavePoints } from './hooks';
import { UnifiedWorkspaceCanvas, UCellConfig, TeachingTabContent, JobListModal, OperationHistoryPanel, LeftSidebar, SecondarySidebar, ToolbarControls } from './components/index';
import { useRobotWebSocket } from '../../hooks';
import { createLogger } from '../../lib';
import { getTeachingJobs, getRealtimeRobotStatus } from '../../lib';
import { getRobotError, resetRobotError } from '../../lib/robotApi/index';
import { useAlert } from '../../contexts';
import Ucell01 from './img/Ucell01.png';
import Ucell02 from './img/Ucell02.png';
import Ucell03 from './img/Ucell03.png';
import Ucell04 from './img/Ucell04.png';
import CollarUcell01 from './img/CollarUcell01.png';
import CollarUcell02 from './img/CollarUcell02.png';
import CollarUcell03 from './img/CollarUcell03.png';
import CollarUcell04 from './img/CollarUcell04.png';
const log = createLogger('CellSelectionCore');
interface CellSelectionCoreProps {
  onNavigate?: (screen: string, data?: unknown) => void;
  selectedHeight?: number;
  selectedType?: 'normal' | 'collar_plate';
  selectedWidth?: number;
  selectedCell?: UCellData | null;
  onStateChange: (data: {
    height?: number;
    type?: 'normal' | 'collar_plate';
    width?: number;
    selectedCell?: UCellData | null;
  }) => void;
}
export function CellSelectionCore({
  selectedHeight: propSelectedHeight,
  selectedType: propSelectedType,
  selectedWidth: propSelectedWidth,
  selectedCell: propSelectedCell,
  onStateChange,
}: CellSelectionCoreProps) {
  const navigate = useNavigate();
  const { show: showAlert } = useAlert();
  const [activeTab, setActiveTab] = useState<'history' | 'teaching'>('teaching');
  const [manualMoveSpeed, setManualMoveSpeed] = useState(40);
  const [autoTouchSensing, setAutoTouchSensing] = useState(false);
  // 갭 시스템 파라미터 조회용 작업 레벨 판두께 (18/20/22/23mm)
  const [hasRobotError, setHasRobotError] = useState(false);
  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const err = await getRobotError();
        if (alive) setHasRobotError(!!err?.has_error);
      } catch { if (alive) setHasRobotError(false); }
    };
    check();
    const i = setInterval(check, 5000);
    return () => { alive = false; clearInterval(i); };
  }, []);
  const [thicknessMm, setThicknessMm] = useState<number>(() => {
    const v = typeof localStorage !== 'undefined' ? localStorage.getItem('gap_thickness_mm') : null;
    return v ? Number(v) : 20;
  });
  const handleThicknessChange = (v: number) => {
    setThicknessMm(v);
    if (typeof localStorage !== 'undefined') localStorage.setItem('gap_thickness_mm', String(v));
  };
  const {
    teachingPoints,
    selectedPointId,
    setSelectedPointId,
    saveCurrentPositionToPoint,
    clearPoint,
    clearAllPoints,
    loadPointsFromJob,
    updatePointSpeed,
    updatePointWeldParams,
    updatePointGap,
    updatePointWeaveParams,
    updatePointWeavingType,
    updatePointTouchOffset,
    clearAllTouchOffsets,
    reorderPoints,
  } = useTeachingPoints();
  const {
    isRobotMoving,
    teachingRobotState,
    isTeachingPolling,
    moveToPoint,
    startTeachingPolling,
    stopTeachingPolling,
    isAtPosition,
  } = useRobotControl();
  const {
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
  } = useJobManagement();
  const {
    isWelding,
    isTouchSensing,
    currentPointIndex,
    simulationMode,
    dryRunMode,
    startTouchSensing,
    stopTouchSensing,
    startWelding,
    stopWelding,
    setSimulationMode,
    setDryRunMode,
  } = useWeldingOperations();
  const {
    robotState: wsRobotState,
    pathHistory: wsPathHistory,
    isConnected: wsConnected,
    connect: wsConnect,
    disconnect: wsDisconnect,
    clearPathHistory: wsClearPathHistory,
  } = useRobotWebSocket({ autoConnect: false });
  const {
    pathHistory: trackingPathHistory,
    currentPosition: trackingCurrentPosition,
    isTracking,
    startTracking,
    stopTracking,
    clearPath: clearTrackingPath,
  } = usePathTracking();
  const {
    wireContinuous,
    setWireContinuous,
    wireFeeding,
    handleWireIn,
    handleWireOut,
    handleWireStop,
  } = useWireControl();
  const {
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
  } = useCellSelectionHandlers({
    teachingPoints,
    teachingRobotState,
    manualMoveSpeed,
    isAtPosition,
    moveToPoint,
    saveJob,
    loadJob,
    requestDeleteJob,
    updateJobName,
    loadPointsFromJob,
    editingJobName,
    onStateChange,
  });
  const savedPointsCount = useMemo(
    () => teachingPoints.filter(pt => pt.isSaved).length,
    [teachingPoints],
  );
  const partSavedPointCounts = useMemo<Record<number, number>>(() => {
    const counts: Record<number, number> = {};
    WELDING_PARTS.forEach((part, index) => {
      let savedCount = 0;
      for (const pointId of part.points) {
        const pt = teachingPoints.find(p => p.id === pointId);
        if (pt?.isSaved) savedCount++;
      }
      counts[index] = savedCount;
    });
    return counts;
  }, [teachingPoints]);
  const { getSchematicPosition, centerlinePath, fiveMMPoints } = useSchematicCalculations({
    selectedWidth,
    selectedHeight,
    teachingPoints,
  });
  const { robotPathHistory, currentRobotPosition } = usePathVisualization({
    isTracking,
    trackingPathHistory,
    trackingCurrentPosition,
    wsPathHistory,
    wsRobotState,
    fiveMMPoints,
  });
  const { handleCenterlinePointClick } = useCenterlineNavigation({
    teachingRobotState,
    teachingPoints,
    manualMoveSpeed,
    showAlert,
  });
  const {
    handleStartWelding,
    handleStartWeldingTest,
    handleContinueWelding,
    handleStartTouchSensing,
    handleGlobalEmergencyStop,
    applyParamsToAllPoints,
    applyParamsToBlock,
  } = useWeldingHandlers({
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
  });
  const currentJobName = useMemo(
    () => jobList.find(j => j.id === currentJobId)?.name ?? null,
    [jobList, currentJobId],
  );
  const { autoSaveStatus, lastSavedAt } = useAutoSavePoints({
    teachingPoints,
    currentJobId,
    currentJobName,
    cellType: selectedType ?? '',
    cellId: selectedCell?.id ?? null,
    height: selectedHeight ?? null,
    width: selectedWidth,
  });
  const clearPathHistory = useCallback(() => {
    wsClearPathHistory();
    clearTrackingPath();
  }, [wsClearPathHistory, clearTrackingPath]);
  const ucellConfig = useMemo<UCellConfig | undefined>(() => {
    if (!selectedCell || !selectedType) return undefined;
    return {
      type: selectedType,
      cellName: selectedCell.name,
      width: selectedWidth,
      height: selectedHeight || 300,
      thickness: 24,
    };
  }, [selectedCell, selectedType, selectedWidth, selectedHeight]);
  const teachingWeldPoints = useMemo(() => {
    return teachingPoints.map(pt => {
      const pos = getSchematicPosition(pt.id);
      return {
        id: pt.id,
        x: pos.x,
        y: pos.y,
        z: 0,
        order: pt.order,
        completed: pt.isSaved,
        tcp: pt.tcp ? { x: pt.tcp.x, y: pt.tcp.y, z: pt.tcp.z } : null,
      };
    });
  }, [teachingPoints, getSchematicPosition]);
  useEffect(() => {
    log.info('mount', '페이지 진입, 폴링 시작');
    startTeachingPolling();
    return () => stopTeachingPolling();
  }, [startTeachingPolling, stopTeachingPolling]);
  useEffect(() => {
    const checkToolCoord = async () => {
      try {
        const status = await getRealtimeRobotStatus();
        if (
          status.connected &&
          status.current_tool_num !== null &&
          status.current_tool_num !== undefined
        ) {
          if (status.current_tool_num !== 3) {
            showAlert(
              `현재 로봇의 도구좌표계가 toolcoord${status.current_tool_num}입니다.\n티칭 전에 펜던트에서 toolcoord3로 변경해주세요.`,
              { type: 'warning', title: '도구좌표계 불일치' },
            );
          }
        }
      } catch {
      }
    };
    const timer = setTimeout(checkToolCoord, 1000);
    return () => clearTimeout(timer);
  }, [showAlert]);
  useEffect(() => {
    const loadLastJob = async () => {
      try {
        const response = await getTeachingJobs();
        const jobs = response?.data?.jobs ?? [];
        const jobWithPoints = jobs.find(
          (job: { total_points?: number }) => (job.total_points ?? 0) > 0,
        );
        if (jobWithPoints) {
          const points = await loadJob(jobWithPoints.id);
          if (points) {
            loadPointsFromJob(points);
            log.info(
              'autoLoad',
              `마지막 작업 자동 로드: ${jobWithPoints.name} (포인트 ${jobWithPoints.total_points}개)`,
            );
          }
        }
      } catch {
      }
    };
    loadLastJob();
  }, [loadJob, loadPointsFromJob]);
  useEffect(() => {
    if (propSelectedHeight !== undefined) setSelectedHeight(propSelectedHeight);
    if (propSelectedType !== undefined) {
      setSelectedType(propSelectedType);
      setShowSecondarySidebar(true);
    }
    if (propSelectedWidth !== undefined) setSelectedWidth(propSelectedWidth);
    if (propSelectedCell !== undefined) setSelectedCell(propSelectedCell);
  }, [
    propSelectedHeight,
    propSelectedType,
    propSelectedWidth,
    propSelectedCell,
    setSelectedHeight,
    setSelectedType,
    setShowSecondarySidebar,
    setSelectedWidth,
    setSelectedCell,
  ]);
  const displayCells = selectedType === 'collar_plate' ? COLLAR_PLATE_CELLS : NORMAL_CELLS;
  return (
    <div className="flex-1 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 overflow-hidden flex flex-col">
      {hasRobotError && (
        <button
          onClick={async () => {
            try {
              await resetRobotError();
              showAlert('로봇 에러 리셋 완료', { type: 'success' });
              setHasRobotError(false);
            } catch (e: any) {
              showAlert(`에러 리셋 실패: ${e.response?.data?.detail || e.message}`, { type: 'error' });
            }
          }}
          style={{
            position: 'fixed', top: 16, right: 16, zIndex: 100,
            padding: '10px 16px', fontSize: 14, fontWeight: 'bold',
            background: '#a16207', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer',
          }}
        >에러 리셋</button>
      )}
      <div className="flex flex-1 min-h-0 pt-2">
        <LeftSidebar
          selectedType={selectedType}
          onTypeSelect={handleTypeSelect}
          onNavigate={navigate}
          onAdminClick={() => navigate('/settings')}
        />
        {showSecondarySidebar && (
          <SecondarySidebar
            selectedType={selectedType}
            selectedHeight={selectedHeight}
            selectedCell={selectedCell}
            displayCells={displayCells}
            selectedWidth={selectedWidth}
            onClose={() => setShowSecondarySidebar(false)}
            onHeightChange={height => {
              setSelectedHeight(height);
              onStateChange({
                height,
                type: selectedType || undefined,
                width: selectedWidth,
                selectedCell,
              });
            }}
            onCellSelect={handleCellSelect}
          />
        )}
        <div className="flex-1 overflow-hidden px-3 pb-2 flex flex-col">
          <div className="flex items-center border-b border-gray-700/50 flex-shrink-0">
            {(selectedHeight || selectedType || selectedCell) && (
              <div className="flex items-center gap-3 px-3 py-1.5 flex-1 min-w-0">
                <h2 className="text-base font-semibold text-white whitespace-nowrap">
                  {selectedCell ? selectedCell.name : 'U-Cell 선택'}
                </h2>
                {selectedCell && (
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium bg-gradient-to-r ${selectedCell.color} text-white whitespace-nowrap`}
                  >
                    {selectedType === 'normal' ? '일반' : '컬러플레이트'}
                  </span>
                )}
                <ToolbarControls
                  wsConnected={wsConnected}
                  isTracking={isTracking}
                  robotPathHistoryLength={robotPathHistory.length}
                  wireFeeding={wireFeeding}
                  wireContinuous={wireContinuous}
                  autoTouchSensing={autoTouchSensing}
                  selectedWidth={selectedWidth}
                  selectedHeight={selectedHeight}
                  onToggleWsConnection={wsConnected ? wsDisconnect : wsConnect}
                  onClearPathHistory={clearPathHistory}
                  onWireIn={handleWireIn}
                  onWireOut={handleWireOut}
                  onWireStop={handleWireStop}
                  onWireContinuousChange={setWireContinuous}
                  onAutoTouchSensingChange={setAutoTouchSensing}
                  onWidthChange={handleWidthChange}
                  onHeightChange={handleHeightChange}
                />
              </div>
            )}
            <div className="flex ml-auto flex-shrink-0 items-center">
              {currentJobName && (
                <div className="mr-4 px-3 py-1 text-xs font-bold rounded bg-slate-800/80 border border-slate-700 text-slate-300">
                  작업: <span className="text-white">{currentJobName}</span>
                </div>
              )}
              <button
                onClick={() => setActiveTab('teaching')}
                className={`px-5 py-2.5 text-sm font-medium transition whitespace-nowrap ${activeTab === 'teaching' ? 'text-purple-400 border-b-2 border-purple-400' : 'text-gray-500 hover:text-gray-300'}`}
              >
                <MapPin className="w-4 h-4 inline mr-1.5" />
                티칭
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`px-5 py-2.5 text-sm font-medium transition whitespace-nowrap ${activeTab === 'history' ? 'text-cyan-400 border-b-2 border-cyan-400' : 'text-gray-500 hover:text-gray-300'}`}
              >
                <History className="w-4 h-4 inline mr-1.5" />
                작업내역
              </button>
            </div>
          </div>
          {activeTab === 'teaching' ? (
            <div className="flex-1 min-h-0 flex gap-3 mt-2">
              <div className="flex-1 flex flex-col gap-2 min-h-0">
                <div className="bg-gray-800/60 backdrop-blur-sm rounded-2xl border border-gray-700/50 flex flex-col items-center justify-center p-6 relative flex-1">
                  {selectedCell ? (
                    <>
                      <UnifiedWorkspaceCanvas
                        ucellConfig={ucellConfig}
                        workspaceConfig={{
                          bounds: { minX: -400, maxX: 400, minY: -400, maxY: 400 },
                          showGrid: true,
                          gridSpacing: 100,
                        }}
                        pathHistory={robotPathHistory}
                        currentPosition={
                          wsConnected || isTracking ? currentRobotPosition : undefined
                        }
                        weldPoints={teachingWeldPoints}
                        onWeldPointClick={handleWeldPointClick}
                        onReorderPoints={reorderPoints}
                        centerlinePath={centerlinePath}
                        centerlinePoints={fiveMMPoints}
                        onCenterlinePointClick={handleCenterlinePointClick}
                        partWeldEnabled={partWeldEnabled}
                        partSavedPointCounts={partSavedPointCounts}
                        onPartWeldToggle={handlePartWeldToggle}
                        ucellWidth={selectedWidth}
                        ucellHeight={selectedHeight || 550}
                        canvasWidth={1100}
                        canvasHeight={800}
                        animated={true}
                        currentPointId={isWelding && currentPointIndex >= 0 ? teachingWeldPoints[currentPointIndex]?.id ?? null : null}
                      />
                      <div className="w-full mt-4 flex items-center justify-center gap-4 text-gray-400 text-sm">
                        <span>폭: {selectedWidth}mm x 높이: {selectedHeight || '---'}mm</span>
                        <span className="flex items-center gap-1.5">
                          <span className="text-gray-500">판두께:</span>
                          <select
                            value={thicknessMm}
                            onChange={e => handleThicknessChange(Number(e.target.value))}
                            className="px-2 py-1 bg-gray-900 border border-gray-700 rounded text-white text-xs focus:outline-none focus:border-cyan-500"
                            title="갭 시스템 파라미터 조회에 사용되는 작업 판두께"
                          >
                            <option value={18}>18mm</option>
                            <option value={20}>20mm</option>
                            <option value={22}>22mm</option>
                            <option value={23}>23mm</option>
                          </select>
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center justify-center h-full text-gray-500">
                      좌측에서 용접부 타입과 셀을 선택하세요
                    </div>
                  )}
                </div>
              </div>
              <div className="w-[580px] bg-gray-900/80 border-l border-gray-800 flex flex-col">
                {}
                {currentJobId && (
                  <div className="px-4 py-1.5 text-xs border-b border-gray-800 flex items-center gap-2">
                    {autoSaveStatus === 'saving' && (
                      <span className="text-cyan-400 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                        자동 저장 중…
                      </span>
                    )}
                    {autoSaveStatus === 'saved' && (
                      <span className="text-green-400 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                        저장 완료 {lastSavedAt && `(${lastSavedAt.toLocaleTimeString('ko-KR')})`}
                      </span>
                    )}
                    {autoSaveStatus === 'error' && (
                      <span className="text-red-400 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                        자동 저장 실패
                      </span>
                    )}
                    {autoSaveStatus === 'idle' && (
                      <span className="text-gray-500">
                        파라미터 변경 시 자동 저장{' '}
                        {lastSavedAt && `· 마지막: ${lastSavedAt.toLocaleTimeString('ko-KR')}`}
                      </span>
                    )}
                  </div>
                )}
                <div className="flex-1 overflow-y-auto p-4">
                  <TeachingTabContent
                    teachingPoints={teachingPoints}
                    selectedPointId={selectedPointId}
                    isRobotMoving={isRobotMoving}
                    isWelding={isWelding}
                    isTouchSensing={isTouchSensing}
                    isTeachingPolling={isTeachingPolling}
                    teachingRobotState={teachingRobotState}
                    manualMoveSpeed={manualMoveSpeed}
                    simulationMode={simulationMode}
                    dryRunMode={dryRunMode}
                    currentPointIndex={currentPointIndex}
                    savedPointsCount={savedPointsCount}
                    isSavingJob={isSavingJob}
                    onSelectPoint={setSelectedPointId}
                    onSavePosition={saveCurrentPositionToPoint}
                    onClearPoint={clearPoint}
                    onClearAllPoints={clearAllPoints}
                    onMoveToPoint={handleMoveToPoint}
                    onSpeedChange={setManualMoveSpeed}
                    onSimulationModeChange={setSimulationMode}
                    onDryRunModeChange={setDryRunMode}
                    onStartTouchSensing={handleStartTouchSensing}
                    onStopTouchSensing={stopTouchSensing}
                    onStartWelding={handleStartWelding}
                    onStartWeldingTest={handleStartWeldingTest}
                    onContinueWelding={handleContinueWelding}
                    onStopWelding={stopWelding}
                    onOpenJobList={() => {
                      fetchJobList();
                      setIsJobListModalOpen(true);
                    }}
                    onSaveJob={handleSaveJob}
                    onUpdatePointSpeed={updatePointSpeed}
                    onUpdatePointWeldParams={updatePointWeldParams}
                    onUpdatePointGap={updatePointGap}
                    gapThicknessMm={thicknessMm}
                    onGapThicknessChange={handleThicknessChange}
                    onUpdatePointWeaveParams={updatePointWeaveParams}
                    onUpdatePointWeavingType={updatePointWeavingType}
                    onApplyParamsToBlock={applyParamsToBlock}
                    onApplyParamsToAll={applyParamsToAllPoints}
                    onReorderPoints={reorderPoints}
                    onGlobalEmergencyStop={handleGlobalEmergencyStop}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 min-h-0 mt-2">
              <div className="bg-gray-800/60 backdrop-blur-sm rounded-2xl border border-gray-700/50 h-full overflow-hidden">
                <OperationHistoryPanel />
              </div>
            </div>
          )}
        </div>
      </div>
      <JobListModal
        isOpen={isJobListModalOpen}
        jobList={jobList}
        currentJobId={currentJobId}
        jobListPage={jobListPage}
        editingJobId={editingJobId}
        editingJobName={editingJobName}
        JOBS_PER_PAGE={JOBS_PER_PAGE}
        onClose={() => {
          setIsJobListModalOpen(false);
          setEditingJobId(null);
          setJobListPage(1);
        }}
        onLoadJob={handleLoadJob}
        onDeleteJob={handleDeleteJob}
        pendingDeleteJobIds={pendingDeleteJobIds}
        onUndoDeleteJob={undoDeleteJob}
        onEditJobId={setEditingJobId}
        onEditJobName={setEditingJobName}
        onSaveJobName={handleSaveJobName}
        onPageChange={setJobListPage}
      />
    </div>
  );
}
export const CellSelectionCore_CellSelectionCore = CellSelectionCore;
export const DEFAULT_WELDING_PARTS = [
  { name: '파트1 (하단 좌측)', points: ['p4', 'p5', 'p6'] },
  { name: '파트2 (좌측)', points: ['p3', 'p2', 'p1'] },
  { name: '파트3 (하단 우측)', points: ['p10', 'p11', 'p12'] },
  { name: '파트4 (우측)', points: ['p9', 'p8', 'p7'] },
] as const;
export const WELDING_PARTS = DEFAULT_WELDING_PARTS;
let _dynamicParts: { name: string; points: string[] }[] | null = null;
export function setWeldingPartOrder(order: { part_name: string; points: string[] }[]) {
  _dynamicParts = order.map(o => ({ name: o.part_name, points: o.points }));
}
export function getWeldingParts(): readonly { name: string; points: readonly string[] }[] {
  return _dynamicParts ?? DEFAULT_WELDING_PARTS;
}
export function getBlockPointIds(pointId: string): string[] {
  for (const part of WELDING_PARTS) {
    if ((part.points as readonly string[]).includes(pointId)) {
      return [...part.points];
    }
  }
  return [];
}
export function getBlockName(pointId: string): string {
  for (const part of WELDING_PARTS) {
    if ((part.points as readonly string[]).includes(pointId)) {
      return part.name;
    }
  }
  return '';
}
export interface ExecutablePart {
  name: string;
  pointIds: readonly string[];
  savedPoints: TeachingPoint[];
  shouldExecute: boolean;
}
export type PartWeldEnabled = Record<number, boolean>;
export const DEFAULT_PART_WELD_ENABLED: PartWeldEnabled = {
  0: true,
  1: true,
  2: true,
  3: true,
};
export const getExecutableParts = (
  teachingPoints: TeachingPoint[],
  partWeldEnabled?: PartWeldEnabled,
): ExecutablePart[] => {
  const parts = getWeldingParts();
  return parts.map((part, index) => {
    const savedPoints = part.points
      .map(pointId => teachingPoints.find(pt => pt.id === pointId))
      .filter(
        (pt): pt is TeachingPoint =>
          pt !== undefined && pt.isSaved && pt.joints !== null && pt.joints.length > 0,
      );
    const physicalIndex = DEFAULT_WELDING_PARTS.findIndex(dp =>
      dp.points.some(p => part.points.includes(p)),
    );
    const enableKey = physicalIndex >= 0 ? physicalIndex : index;
    const isEnabled = partWeldEnabled?.[enableKey] ?? true;
    return {
      name: part.name,
      pointIds: part.points as readonly string[],
      savedPoints,
      shouldExecute: savedPoints.length >= 2 && isEnabled,
    };
  });
};
export const flattenExecutableParts = (executableParts: ExecutablePart[]): TeachingPoint[] => {
  const result: TeachingPoint[] = [];
  for (const part of executableParts) {
    if (part.shouldExecute) {
      result.push(...part.savedPoints);
    }
  }
  return result;
};
export interface PartBoundaryInfo {
  pointPartIndices: number[];
  partStartIndices: number[];
  partEndIndices: number[];
}
export const getPartBoundaryInfo = (executableParts: ExecutablePart[]): PartBoundaryInfo => {
  const pointPartIndices: number[] = [];
  const partStartIndices: number[] = [];
  const partEndIndices: number[] = [];
  let currentIndex = 0;
  executableParts.forEach((part, partIndex) => {
    if (part.shouldExecute && part.savedPoints.length > 0) {
      partStartIndices.push(currentIndex);
      partEndIndices.push(currentIndex + part.savedPoints.length - 1);
      for (let i = 0; i < part.savedPoints.length; i++) {
        pointPartIndices.push(partIndex);
        currentIndex++;
      }
    }
  });
  return { pointPartIndices, partStartIndices, partEndIndices };
};
export interface UCellData {
  id: number;
  name: string;
  color: string;
}
export interface WeaveParams {
  weaveFrequency: number;
  weaveRange: number;
  weaveLeftRange: number;
  weaveRightRange: number;
  weaveLeftStayTime: number;
  weaveRightStayTime: number;
  weaveCircleRadio: number;
  weaveYawAngle: number;
  weaveRotAngle: number;
}
export const DEFAULT_WEAVE_PARAMS: WeaveParams = {
  weaveFrequency: 2.0,
  weaveRange: 5.0,
  weaveLeftRange: 5.0,
  weaveRightRange: 5.0,
  weaveLeftStayTime: 800,
  weaveRightStayTime: 800,
  weaveCircleRadio: 50,
  weaveYawAngle: 0,
  weaveRotAngle: 0,
};
export interface TeachingPoint {
  id: string;
  name: string;
  order: number;
  tcp: { x: number; y: number; z: number; rx: number; ry: number; rz: number } | null;
  joints: number[] | null;
  isSaved: boolean;
  toolNum: number;
  userNum: number;
  moveSpeed: number;
  velMode: 0 | 1;
  weldVoltage: number | null;
  weldCurrent: number | null;
  weavingType: string | null;
  weaveParams: WeaveParams;
  gap: number;
  posture?: 'vertical' | 'horizontal';  // 자세 (갭 시스템 파라미터 조회용)
  touchDirection: 1 | -1;
  touchBottom: boolean;
  touchOffset: {
    dx: number;
    dy: number;
    dz: number;
  } | null;
}
export const UCELL_POINT_DEFINITIONS: Omit<
  TeachingPoint,
  'tcp' | 'joints' | 'isSaved' | 'touchOffset'
>[] = [
  {
    id: 'home',
    name: 'Home',
    order: 0,
    toolNum: 3,
    userNum: 0,
    moveSpeed: 50,
    velMode: 1,
    weldVoltage: null,
    weldCurrent: null,
    weavingType: null,
    weaveParams: { ...DEFAULT_WEAVE_PARAMS },
    gap: 0,
    touchDirection: 1,
    touchBottom: false,
  },
  {
    id: 'p1',
    name: 'P1 (좌측 상단)',
    order: 1,
    toolNum: 3,
    userNum: 0,
    moveSpeed: 15,
    velMode: 1,
    weldVoltage: 28,
    weldCurrent: 300,
    weavingType: 'none',
    weaveParams: { ...DEFAULT_WEAVE_PARAMS },
    gap: 0,
    touchDirection: 1,
    touchBottom: true,
  },
  {
    id: 'p2',
    name: 'P2 (좌측 중간)',
    order: 2,
    toolNum: 3,
    userNum: 0,
    moveSpeed: 15,
    velMode: 1,
    weldVoltage: 28,
    weldCurrent: 300,
    weavingType: 'none',
    weaveParams: { ...DEFAULT_WEAVE_PARAMS },
    gap: 0,
    touchDirection: 1,
    touchBottom: false,
  },
  {
    id: 'p3',
    name: 'P3 (좌측 하단)',
    order: 3,
    toolNum: 3,
    userNum: 0,
    moveSpeed: 15,
    velMode: 1,
    weldVoltage: 28,
    weldCurrent: 300,
    weavingType: 'none',
    weaveParams: { ...DEFAULT_WEAVE_PARAMS },
    gap: 0,
    touchDirection: 1,
    touchBottom: false,
  },
  {
    id: 'p4',
    name: 'P4 (하단 좌측)',
    order: 4,
    toolNum: 3,
    userNum: 0,
    moveSpeed: 30,
    velMode: 1,
    weldVoltage: 24,
    weldCurrent: 220,
    weavingType: 'none',
    weaveParams: { ...DEFAULT_WEAVE_PARAMS },
    gap: 0,
    touchDirection: 1,
    touchBottom: false,
  },
  {
    id: 'p5',
    name: 'P5 (하단 중앙)',
    order: 5,
    toolNum: 3,
    userNum: 0,
    moveSpeed: 30,
    velMode: 1,
    weldVoltage: 24,
    weldCurrent: 220,
    weavingType: 'none',
    weaveParams: { ...DEFAULT_WEAVE_PARAMS },
    gap: 0,
    touchDirection: 1,
    touchBottom: false,
  },
  {
    id: 'p6',
    name: 'P6 (하단 우측)',
    order: 6,
    toolNum: 3,
    userNum: 0,
    moveSpeed: 30,
    velMode: 1,
    weldVoltage: 24,
    weldCurrent: 220,
    weavingType: 'none',
    weaveParams: { ...DEFAULT_WEAVE_PARAMS },
    gap: 0,
    touchDirection: -1,
    touchBottom: false,
  },
  {
    id: 'p7',
    name: 'P7 (우측 상단)',
    order: 7,
    toolNum: 3,
    userNum: 0,
    moveSpeed: 15,
    velMode: 1,
    weldVoltage: 28,
    weldCurrent: 300,
    weavingType: 'none',
    weaveParams: { ...DEFAULT_WEAVE_PARAMS },
    gap: 0,
    touchDirection: -1,
    touchBottom: false,
  },
  {
    id: 'p8',
    name: 'P8 (우측 중간)',
    order: 8,
    toolNum: 3,
    userNum: 0,
    moveSpeed: 15,
    velMode: 1,
    weldVoltage: 28,
    weldCurrent: 300,
    weavingType: 'none',
    weaveParams: { ...DEFAULT_WEAVE_PARAMS },
    gap: 0,
    touchDirection: -1,
    touchBottom: false,
  },
  {
    id: 'p9',
    name: 'P9 (우측 하단)',
    order: 9,
    toolNum: 3,
    userNum: 0,
    moveSpeed: 15,
    velMode: 1,
    weldVoltage: 28,
    weldCurrent: 300,
    weavingType: 'none',
    weaveParams: { ...DEFAULT_WEAVE_PARAMS },
    gap: 0,
    touchDirection: -1,
    touchBottom: false,
  },
  {
    id: 'p10',
    name: 'P10 (하단 우측)',
    order: 10,
    toolNum: 3,
    userNum: 0,
    moveSpeed: 30,
    velMode: 1,
    weldVoltage: 24,
    weldCurrent: 220,
    weavingType: 'none',
    weaveParams: { ...DEFAULT_WEAVE_PARAMS },
    gap: 0,
    touchDirection: -1,
    touchBottom: false,
  },
  {
    id: 'p11',
    name: 'P11 (하단 중앙우)',
    order: 11,
    toolNum: 3,
    userNum: 0,
    moveSpeed: 30,
    velMode: 1,
    weldVoltage: 24,
    weldCurrent: 220,
    weavingType: 'none',
    weaveParams: { ...DEFAULT_WEAVE_PARAMS },
    gap: 0,
    touchDirection: -1,
    touchBottom: false,
  },
  {
    id: 'p12',
    name: 'P12 (하단 중앙)',
    order: 12,
    toolNum: 3,
    userNum: 0,
    moveSpeed: 50,
    velMode: 1,
    weldVoltage: null,
    weldCurrent: null,
    weavingType: null,
    weaveParams: { ...DEFAULT_WEAVE_PARAMS },
    gap: 0,
    touchDirection: -1,
    touchBottom: false,
  },
];
export const WEAVING_TYPE_OPTIONS = [
  { value: 'none', label: '없음', code: -1 },
  { value: 'plane_triangle', label: '평면 삼각파', code: 0 },
  { value: 'vertical_l_triangle', label: '수직 L형 삼각파', code: 1 },
  { value: 'circle_cw', label: '원형 (시계방향)', code: 2 },
  { value: 'circle_ccw', label: '원형 (반시계방향)', code: 3 },
  { value: 'plane_sine', label: '평면 사인파', code: 4 },
  { value: 'vertical_l_sine', label: '수직 L형 사인파', code: 5 },
  { value: 'vertical_triangle', label: '수직 삼각파', code: 6 },
  { value: 'vertical_sine', label: '수직 사인파', code: 7 },
];
export const HEIGHT_OPTIONS = [
  { value: 475, label: '475mm' },
  { value: 500, label: '500mm' },
  { value: 550, label: '550mm' },
];
export const NORMAL_CELLS: UCellData[] = [
  { id: 1, name: 'U-cell (1번)', color: 'from-cyan-500 to-blue-600' },
  { id: 2, name: 'U-cell (2번)', color: 'from-cyan-500 to-blue-600' },
  { id: 3, name: 'U-cell (3번)', color: 'from-cyan-500 to-blue-600' },
  { id: 4, name: 'U-cell (4번)', color: 'from-cyan-500 to-blue-600' },
  { id: 5, name: 'U-cell (5번)', color: 'from-cyan-500 to-blue-600' },
];
export const COLLAR_PLATE_CELLS: UCellData[] = [
  { id: 6, name: 'Collar (1번)', color: 'from-orange-500 to-red-600' },
  { id: 7, name: 'Collar (2번)', color: 'from-orange-500 to-red-600' },
  { id: 8, name: 'Collar (3번)', color: 'from-orange-500 to-red-600' },
  { id: 9, name: 'Collar (4번)', color: 'from-orange-500 to-red-600' },
];
export const createInitialTeachingPoints = (): TeachingPoint[] => {
  return UCELL_POINT_DEFINITIONS.map(
    def =>
      ({
        ...def,
        tcp: null,
        joints: null,
        isSaved: false,
        touchOffset: null,
      }) as TeachingPoint,
  );
};
export const ucell_images: Record<string, string> = {
  'U-cell(1번)': Ucell01,
  'U-cell(2번)': Ucell02,
  'U-cell(3번)': Ucell03,
  'U-cell(4번)': Ucell04,
  'Collar U-cell(1번)': CollarUcell01,
  'Collar U-cell(2번)': CollarUcell02,
  'Collar U-cell(3번)': CollarUcell03,
  'Collar U-cell(4번)': CollarUcell04,
};
export const UNIFIED_COLOR = '#6B7280';
interface SimpleViewProps {
  width: number;
  height: number;
  thickness: number;
  className: string;
}
export const UCellSimpleView: React.FC<SimpleViewProps> = ({ width, height, thickness, className }) => (
  <div className={`flex items-center justify-center ${className}`}>
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="drop-shadow-lg">
      <rect x="0" y="0" width={thickness} height={height} fill={UNIFIED_COLOR} className="transition-colors duration-200" />
      <rect x={width - thickness} y="0" width={thickness} height={height} fill={UNIFIED_COLOR} className="transition-colors duration-200" />
      <rect x="0" y={height - thickness} width={width} height={thickness} fill={UNIFIED_COLOR} className="transition-colors duration-200" />
      <rect x="2" y="2" width={thickness - 4} height={height - thickness - 2} fill="rgba(255,255,255,0.1)" />
      <rect x={width - thickness + 2} y="2" width={thickness - 4} height={height - thickness - 2} fill="rgba(255,255,255,0.1)" />
      <rect x="2" y={height - thickness + 2} width={width - 4} height={thickness - 4} fill="rgba(255,255,255,0.1)" />
    </svg>
  </div>
);
interface Normal3ViewProps {
  scaledWidth: number;
  scaledHeight: number;
  strokeWidth: number;
  className: string;
}
export const UCellNormal3View: React.FC<Normal3ViewProps> = ({ scaledWidth, scaledHeight, strokeWidth, className }) => (
  <div className={`flex items-center justify-center ${className}`}>
    <svg
      width={scaledWidth}
      height={scaledHeight}
      viewBox="0 0 460 420"
      className="drop-shadow-lg"
      style={{ '--unified-color': UNIFIED_COLOR, '--stroke-width': strokeWidth } as React.CSSProperties}
    >
      <line x1="104" y1="40" x2="104" y2="270" stroke="var(--unified-color)" strokeWidth="var(--stroke-width)" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="356" y1="40" x2="356" y2="270" stroke="var(--unified-color)" strokeWidth="var(--stroke-width)" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M104 270 Q 180 270 170 335" stroke="var(--unified-color)" strokeWidth="var(--stroke-width)" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M356 270 Q 280 270 290 335" stroke="var(--unified-color)" strokeWidth="var(--stroke-width)" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <line x1="170" y1="335" x2="290" y2="335" stroke="var(--unified-color)" strokeWidth="var(--stroke-width)" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </div>
);
interface CollarPlateViewProps {
  thickness: number;
}
export const CollarPlateSvg: React.FC<CollarPlateViewProps> = ({ thickness }) => (
  <>
    <line x1={thickness / 2} y1="0" x2={thickness / 2} y2="300" stroke={UNIFIED_COLOR} strokeWidth={thickness} strokeLinecap="round" />
    <line x1={400 - thickness / 2} y1="0" x2={400 - thickness / 2} y2="300" stroke={UNIFIED_COLOR} strokeWidth={thickness} strokeLinecap="round" />
    <line x1="0" y1={300 - thickness / 2} x2="400" y2={300 - thickness / 2} stroke={UNIFIED_COLOR} strokeWidth={thickness} strokeLinecap="round" />
    <line x1={thickness + 220} y1="100" x2={thickness + 220} y2="300" stroke={UNIFIED_COLOR} strokeWidth={thickness} strokeLinecap="round" />
    <line x1={thickness + 220} y1="100" x2={400 - thickness - 0} y2="100" stroke={UNIFIED_COLOR} strokeWidth={thickness} strokeLinecap="round" />
  </>
);
interface DefaultUCellSvgProps {
  thickness: number;
}
export const DefaultUCellSvg: React.FC<DefaultUCellSvgProps> = ({ thickness }) => (
  <>
    <rect x="0" y="0" width={thickness} height={300} fill={UNIFIED_COLOR} className="transition-colors duration-200" />
    <rect x={400 - thickness} y="0" width={thickness} height={300} fill={UNIFIED_COLOR} className="transition-colors duration-200" />
    <rect x="0" y={300 - thickness} width={400} height={thickness} fill={UNIFIED_COLOR} className="transition-colors duration-200" />
    <rect x="2" y="2" width={thickness - 4} height={300 - thickness - 2} fill="rgba(255,255,255,0.1)" />
    <rect x={400 - thickness + 2} y="2" width={thickness - 4} height={300 - thickness - 2} fill="rgba(255,255,255,0.1)" />
    <rect x="2" y={300 - thickness + 2} width={400 - 4} height={thickness - 4} fill="rgba(255,255,255,0.1)" />
  </>
);
interface UCellVisualizationProps {
  width?: number;
  height?: number;
  leftBarColor?: string;
  rightBarColor?: string;
  bottomBarColor?: string;
  thickness?: number;
  className?: string;
  variant?: 'simple' | 'realistic';
  cellName?: string;
  onWidthChange?: (width: number) => void;
  onHeightChange?: (height: number) => void;
  onSegmentChange?: (bar: 'left' | 'right' | 'bottom', segment: number, value: number) => void;
  onModalOpen?: (isOpen: boolean) => void;
}
const UCellVisualizationComponent = ({
  width = 300,
  height = 200,
  thickness = 20,
  className = '',
  variant = 'realistic',
  cellName = '',
  onSegmentChange,
  onModalOpen, // eslint-disable-line @typescript-eslint/no-unused-vars
}: UCellVisualizationProps) => {
  const [leftSegments, setLeftSegments] = useState([5, 3, 2]);
  const [rightSegments, setRightSegments] = useState([1, 2, 1]);
  const [bottomSegments, setBottomSegments] = useState([1, 1, 1]);
  const isCollarPlate = useMemo(
    () => cellName.includes('Collar') || cellName.includes('칼라'),
    [cellName],
  );
  const normal3Scale = useMemo(() => {
    if (cellName !== 'U-cell(3번)') return null;
    return {
      scale: Math.min(width / 460, height / 420),
      scaledWidth: 460 * Math.min(width / 460, height / 420),
      scaledHeight: 420 * Math.min(width / 460, height / 420),
      strokeWidth: thickness * 0.8,
    };
  }, [cellName, width, height, thickness]);
  const handleSegmentChange = (
    bar: 'left' | 'right' | 'bottom',
    segment: number,
    value: number,
  ) => {
    if (bar === 'left') {
      const newSegments = [...leftSegments];
      newSegments[segment] = value;
      setLeftSegments(newSegments);
    } else if (bar === 'right') {
      const newSegments = [...rightSegments];
      newSegments[segment] = value;
      setRightSegments(newSegments);
    } else if (bar === 'bottom') {
      const newSegments = [...bottomSegments];
      newSegments[segment] = value;
      setBottomSegments(newSegments);
    }
    onSegmentChange?.(bar, segment, value);
  };
  const SegmentPicker: React.FC<{ value: number; onChange: (v: number) => void }> = ({ value, onChange }) => (
    <select
      value={value}
      onChange={e => onChange(Number(e.target.value))}
      className="w-20 h-12 pr-6 text-[#00F9FF] text-center rounded focus:outline-none focus:border-blue-500"
      style={{ background: '#003333', color: '#00F9FF', fontSize: '1.5rem' }}
    >
      {[1, 2, 3, 4, 5].map(v => (
        <option key={v} value={v} style={{ color: '#00F9FF', fontSize: '1.5rem' }}>{v}</option>
      ))}
    </select>
  );
  if (variant === 'simple') {
    return <UCellSimpleView width={width} height={height} thickness={thickness} className={className} />;
  }
  if (cellName === 'U-cell(3번)' && normal3Scale) {
    return (
      <UCellNormal3View
        scaledWidth={normal3Scale.scaledWidth}
        scaledHeight={normal3Scale.scaledHeight}
        strokeWidth={normal3Scale.strokeWidth}
        className={className}
      />
    );
  }
  return (
    <div className={`relative flex items-center justify-center ${className}`}>
      <svg width={400} height={300} viewBox="0 0 400 300" className="drop-shadow-lg">
        {isCollarPlate ? <CollarPlateSvg thickness={thickness} /> : <DefaultUCellSvg thickness={thickness} />}
      </svg>
      {}
      <div className="absolute left-[-100px] top-[45%] transform -translate-y-1/2 flex flex-col gap-16">
        {leftSegments.map((value, index) => (
          <SegmentPicker key={index} value={value} onChange={v => handleSegmentChange('left', index, v)} />
        ))}
      </div>
      {}
      <div className="absolute right-[-100px] top-[45%] transform -translate-y-1/2 flex flex-col gap-16">
        {rightSegments.map((value, index) => (
          <SegmentPicker key={index} value={value} onChange={v => handleSegmentChange('right', index, v)} />
        ))}
      </div>
      {}
      <div className="absolute bottom-[-60px] left-1/2 transform -translate-x-1/2 flex gap-20">
        {bottomSegments.map((value, index) => (
          <SegmentPicker key={index} value={value} onChange={v => handleSegmentChange('bottom', index, v)} />
        ))}
      </div>
    </div>
  );
};
export const UCellVisualization = memo(UCellVisualizationComponent);
export const UCellColorPresets = {
  normal: {
    leftBar: UNIFIED_COLOR,
    rightBar: UNIFIED_COLOR,
    bottomBar: UNIFIED_COLOR,
  },
};
