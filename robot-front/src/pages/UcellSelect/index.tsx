import React, { useState, useEffect, useMemo, useCallback, useRef, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, History } from 'lucide-react';
import { useTeachingPoints, useRobotControl, useJobManagement, useWeldingOperations, usePathTracking, useSchematicCalculations, usePathVisualization, useCenterlineNavigation, useWeldingHandlers, useWireControl, useCellSelectionHandlers, useAutoSavePoints } from './hooks';
import { UnifiedWorkspaceCanvas, UCellConfig, TeachingTabContent, JobListModal, OperationHistoryPanel, LeftSidebar, SecondarySidebar, ToolbarControls } from './components/index';
import { useRobotWebSocket } from '../../hooks';
import { createLogger } from '../../lib';
import { getTeachingJobs, getRealtimeRobotStatus, getWeldingPartOrder } from '../../lib';
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
const LAST_JOB_ID_KEY = 'vot.lastJobId';
// 브라우저 저장소를 쓸 수 없는 환경(차단/시크릿 등)에서도 화면이 동작하도록 실패는 무시한다.
function readLastJobId(): number | null {
  try {
    const v = localStorage.getItem(LAST_JOB_ID_KEY);
    if (v === null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}
function writeLastJobId(id: number): void {
  try {
    localStorage.setItem(LAST_JOB_ID_KEY, String(id));
  } catch {
    // 무시
  }
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
    isArcTesting,
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
  } = useWireControl(isWelding);
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
  });
  const savedPointsCount = useMemo(
    () => teachingPoints.filter(pt => pt.isSaved).length,
    [teachingPoints],
  );
  // [v1.1.229] 체크박스 활성 판정(포인트 2개 이상)은 PART_ENABLE_GROUPS 기준으로
  // 센다. WELDING_PARTS(=DEFAULT_WELDING_PARTS) 를 쓰면 묶음이 둘로 갈려 드리프트한다.
  // 예전 기준은 묶음 0 에 P4 를 함께 세고 있었다.
  const partSavedPointCounts = useMemo<Record<number, number>>(() => {
    const counts: Record<number, number> = {};
    PART_ENABLE_GROUPS.forEach((group, index) => {
      let savedCount = 0;
      for (const pointId of group) {
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
  // [v1.1.231] 화면에 들어올 때 DB 파트 구성을 먼저 읽어 둔다.
  // setWeldingPartOrder 는 그동안 startWelding 안에서만 불렸다. 그래서 용접을 한 번
  // 돌리기 전에는 getWeldingParts() 가 DEFAULT_WELDING_PARTS(구 4파트)를 돌려줬고,
  // 거기에 기대는 UI 가 전부 옛 묶음으로 동작했다.
  // 2026-10-08 현장: P10 에서 '블록 적용'을 눌렀더니 P10·P11·P12 가 같이 바뀌었다.
  // 새 구성의 모서리 우 파트는 [P10,P9] 인데, 구 4파트의 [P10,P11,P12] 가 잡힌 것이다.
  // 블록 적용·블록 이름이 영향을 받는다. 실행 경로는 startWelding 이 직접 읽으므로
  // 무사했다.
  useEffect(() => {
    let cancelled = false;
    getWeldingPartOrder()
      .then(order => {
        if (cancelled || order.length === 0) return;
        setWeldingPartOrder(order.map(o => ({ part_name: o.part_name, points: o.points })));
        log.info('mount.partOrder', '용접 파트 구성 로드', {
          parts: order.map(o => `${o.execution_order}:${o.part_name}`),
        });
      })
      .catch(() => {
        log.warn('mount.partOrder.fail', '파트 구성을 읽지 못했다. 기본 4파트로 동작한다');
      });
    return () => { cancelled = true; };
  }, []);
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
  // 마지막으로 연 작업 자동 로드 (v1.1.151)
  // v1.1.150까지의 문제 두 가지:
  // 1) 목록(생성일 최신순)의 첫 작업을 불러와서, 마지막으로 연 작업이 아니라 가장 최근에 만든 작업이 열렸다.
  // 2) handleLoadJob이 셀/높이/폭 선택과 onStateChange에 따라 새로 만들어지는데 이 effect가 그걸
  //    의존성으로 가져서, 사용 중에도 다시 실행돼 최신 작업으로 되돌아가고 터치센싱 보정값도 지워졌다.
  // 이제 연 작업 번호를 저장해 두고, 화면이 열릴 때 한 번만 불러온다.
  const autoLoadDoneRef = useRef(false);
  useEffect(() => {
    if (autoLoadDoneRef.current) return;
    autoLoadDoneRef.current = true;
    const loadLastJob = async () => {
      try {
        await fetchJobList();
        const response = await getTeachingJobs();
        const jobs = response?.data?.jobs ?? [];
        const hasPoints = (job: { total_points?: number }) => (job.total_points ?? 0) > 0;
        const savedId = readLastJobId();
        const savedJob =
          savedId !== null
            ? jobs.find((job: { id: number; total_points?: number }) => job.id === savedId && hasPoints(job))
            : undefined;
        const target = savedJob ?? jobs.find(hasPoints);
        if (target) {
          await handleLoadJob(target.id);
          log.info(
            'autoLoad',
            `마지막 작업 자동 로드: ${target.name} (포인트 ${target.total_points}개, ${savedJob ? '마지막으로 연 작업' : '저장된 작업 없음 → 최신 작업'})`,
          );
        } else {
          log.warn('autoLoad.empty', '자동 로드할 작업이 없음 (jobs 목록이 비어있거나 포인트 있는 작업 없음)', {
            jobCount: jobs.length,
          });
        }
      } catch (err) {
        log.error('autoLoad.error', '마지막 작업 자동 로드 실패', { error: String(err) });
      }
    };
    loadLastJob();
  }, [handleLoadJob, fetchJobList]);
  // 현재 작업이 바뀔 때마다 번호를 저장한다 (불러오기, 새로 저장 모두 포함).
  useEffect(() => {
    if (currentJobId != null) writeLastJobId(currentJobId);
  }, [currentJobId]);
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
  // 반응형: 캔버스를 남은 영역에 맞춰 축소한다(최대 1100x800, 비율 유지). 큰 화면에서는 그대로 1100x800.
  // 공통 레이아웃의 본문 영역이 화면 높이로 제한되지 않아, 이 화면의 높이를 남은 창 높이로 직접 맞춘다.
  const rootRef = useRef<HTMLDivElement>(null);
  const [rootH, setRootH] = useState<number | undefined>(undefined);
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const update = () => {
      const top = el.getBoundingClientRect().top;
      setRootH(Math.max(300, Math.floor(window.innerHeight - top)));
    };
    update();
    window.addEventListener('resize', update);
    const header = el.parentElement?.previousElementSibling;
    const ro = header ? new ResizeObserver(update) : null;
    if (header && ro) ro.observe(header);
    return () => {
      window.removeEventListener('resize', update);
      ro?.disconnect();
    };
  }, []);
  const canvasBoxRef = useRef<HTMLDivElement>(null);
  const [canvasBox, setCanvasBox] = useState({ w: 1100, h: 800 });
  useEffect(() => {
    const el = canvasBoxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const r = entries[0].contentRect;
      setCanvasBox({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [activeTab, selectedCell]);
  const canvasFitW = Math.max(200, Math.min(1100, canvasBox.w, (canvasBox.h - (window.innerWidth <= 1279 || window.innerHeight <= 719 ? 38 : 48)) * (1100 / 800)));
  const canvasFitH = canvasFitW * (800 / 1100);
  const displayCells = selectedType === 'collar_plate' ? COLLAR_PLATE_CELLS : NORMAL_CELLS;
  return (
    <div ref={rootRef} style={rootH ? { height: rootH } : undefined} className="flex-1 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 overflow-hidden flex flex-col">
      <style>{`@media (max-width: 1279px), (max-height: 719px) { .tb-compact button, .tb-compact input { min-height: 40px; } .tb-compact button, .tb-compact label { flex-shrink: 0; } .cv-box.cv-box { padding: 8px; } .cv-cap.cv-cap { margin-top: 4px; } .cv-cap select { min-height: 28px; } .tb-job { max-width: 96px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-right: 8px !important; padding-left: 6px !important; padding-right: 6px !important; } .tb-compact .tb-tab { padding-left: 12px; padding-right: 12px; } .wp-circle { r: 10px; } .wp-num { font-size: 12px; } }`}</style>
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
                  wireBlocked={isWelding}
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
            <div className="tb-compact flex ml-auto flex-shrink-0 items-center">
              {currentJobName && (
                <div className="tb-job mr-4 px-3 py-1 text-xs font-bold rounded bg-slate-800/80 border border-slate-700 text-slate-300">
                  작업: <span className="text-white">{currentJobName}</span>
                </div>
              )}
              <button
                onClick={() => setActiveTab('teaching')}
                className={`tb-tab px-5 py-2.5 text-sm font-medium transition whitespace-nowrap ${activeTab === 'teaching' ? 'text-purple-400 border-b-2 border-purple-400' : 'text-gray-500 hover:text-gray-300'}`}
              >
                <MapPin className="w-4 h-4 inline mr-1.5" />
                티칭
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`tb-tab px-5 py-2.5 text-sm font-medium transition whitespace-nowrap ${activeTab === 'history' ? 'text-cyan-400 border-b-2 border-cyan-400' : 'text-gray-500 hover:text-gray-300'}`}
              >
                <History className="w-4 h-4 inline mr-1.5" />
                작업내역
              </button>
            </div>
          </div>
          {activeTab === 'teaching' ? (
            <div className="flex-1 min-h-0 flex gap-3 mt-2">
              <div className="flex-1 flex flex-col gap-2 min-h-0 min-w-0">
                <div ref={canvasBoxRef} className="cv-box bg-gray-800/60 backdrop-blur-sm rounded-2xl border border-gray-700/50 flex flex-col items-center justify-center p-6 relative flex-1 min-h-0 min-w-0 overflow-hidden">
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
                        canvasWidth={canvasFitW}
                        canvasHeight={canvasFitH}
                        animated={true}
                        currentPointId={isWelding && currentPointIndex >= 0 ? teachingWeldPoints[currentPointIndex]?.id ?? null : null}
                      />
                      <div className="cv-cap w-full mt-4 flex items-center justify-center gap-4 text-gray-400 text-sm">
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
              <div style={{ width: 'min(580px, max(360px, calc(100vw - 720px)))' }} className="flex-shrink-0 bg-gray-900/80 border-l border-gray-800 flex flex-col">
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
// 실행할 파트 목록의 기본값. welding_part_order 테이블이 비어 있을 때만 쓰인다
// (getWeldingParts 가 _dynamicParts ?? DEFAULT_WELDING_PARTS 를 돌려준다).
// [v1.1.228] 실제 구성은 이제 DB 쪽 6파트다(migrations/012_corner_part_split.sql).
// 이 기본값은 012 이전의 4파트 그대로다. DB 읽기가 실패하면 모서리 파트가 빠진
// 경로로 돌아 바닥 20mm 가 안 깔린다(충돌은 나지 않는다). 로그 welding.partOrder
// 에 파트가 6개로 찍히는지 매번 확인할 것.
// 체크박스 묶음은 아래 PART_ENABLE_GROUPS 가 따로 정한다. 여기를 건드리지 말 것.
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
// [v1.1.237] 파트의 용접 조건(전류·전압·위빙·속도·트래킹)을 읽는 포인트.
// 기본은 파트 첫 포인트다. 모서리 파트만 예외로 모서리 바닥(P4/P10)에서 읽는다.
// 모서리를 위에서 아래로(P3->P4, P9->P10) 돌리면 첫 포인트 P3/P9 가 수직 파트의
// 첫 포인트와 같아진다. 첫 포인트 규칙을 그대로 쓰면 모서리와 수직이 같은 값으로
// 돌아 모서리 조건을 따로 줄 수 없다.
// 파트에 P4/P10 이 같이 들어 있을 때만 바꾸므로 수직 파트([P3,P2,P1])는 그대로
// P3 에서 읽고, 예전 방향([P4,P3])도 첫 포인트가 P4 라 결과가 같다.
const CORNER_CONDITION_POINT: Record<string, string> = { p3: 'p4', p9: 'p10' };
export function getPartConditionPointId(partPoints: readonly string[]): string | undefined {
  const first = partPoints[0];
  if (!first) return undefined;
  const cornerId = CORNER_CONDITION_POINT[first.toLowerCase()];
  return cornerId && partPoints.includes(cornerId) ? cornerId : first;
}
// [v1.1.228] 한 포인트가 두 파트에 들어갈 수 있게 됐다. 모서리 파트와 수직 파트가
// P3/P9 를 함께 쓴다(이어지는 자리라 좌표를 공유한다).
// 그냥 includes 로 훑으면 배열에서 먼저 나오는 파트가 이기므로, 포인트를 집었을
// 때는 그 포인트에서 조건을 읽는 파트를 우선 돌려준다. 없으면 기존처럼 훑는다.
// [v1.1.237] '시작점인 파트' -> '조건 포인트인 파트'. P3 -> 수직, P4 -> 모서리.
const findPartForPoint = (pointId: string) => {
  const parts = getWeldingParts();
  return (
    parts.find(part => getPartConditionPointId(part.points) === pointId) ??
    parts.find(part => part.points.includes(pointId))
  );
};
export function getBlockPointIds(pointId: string): string[] {
  const part = findPartForPoint(pointId);
  return part ? [...part.points] : [];
}
export function getBlockName(pointId: string): string {
  return findPartForPoint(pointId)?.name ?? '';
}
/** 어느 파트든 조건 포인트인 id 집합. 블록 적용이 덮어쓰면 안 되는 자리다. */
export function getPartConditionPointIds(): Set<string> {
  const ids = new Set<string>();
  getWeldingParts().forEach(part => {
    const id = getPartConditionPointId(part.points);
    if (id) ids.add(id);
  });
  return ids;
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
// [v1.1.228] 패스(skip) 체크박스 4개에 어떤 포인트가 묶이는지. 화면의 체크박스는
// 4개로 고정이고 실행 파트는 DB 에서 6개가 올 수 있으므로, 파트 -> 체크박스 키를
// 여기서 역산한다.
//
// 227 까지는 이 역산을 DEFAULT_WELDING_PARTS 로 했는데, 그것은 welding_part_order
// 가 비었을 때의 '실행 기본값'이기도 하다. 체크박스 묶음을 바꾸려고 그쪽을 손대면
// 실행 경로가 같이 바뀐다. 두 역할을 분리한다.
//
// 모서리 파트는 수직과 같은 묶음에 넣는다(사용자 요청 2026-10-07). 모서리는
// 수직선을 타는 용접이라 작업자가 수직과 한 덩어리로 생각한다.
//   0: 수평 좌 (P5-P6)
//   1: 수직 좌 + 모서리 좌 (P1-P3, P4)
//   2: 수평 우 (P11-P12)
//   3: 수직 우 + 모서리 우 (P7-P9, P10)
// 주의: 수평 좌만 끄고 돌리면 모서리 파트가 아크를 켜는 자리(P4)에 수평 비드가
// 없다. 차가운 맨 모서리에서 시작하므로 시작부가 얇게 깔린다. 수평을 건너뛸 때는
// 그걸 감안할 것.
// 한 포인트는 한 묶음에만 들어간다. every 로 판정하므로 파트가 두 묶음에 걸치면
// -1 이 되고 index 로 떨어져 그 파트는 항상 실행된다(안전한 쪽).
// [v1.1.230] 수직 묶음을 용접 방향(아래->위)으로 적는다.
// useSchematicCalculations 가 이 배열 순서대로 중심선을 누적하므로, 위->아래로
// 적어두면 거리 숫자가 반대 끝에서 세어지고 구간 라벨도 뒤집혀 보인다.
// 이동 좌표와 터치 보정 보간은 start/end/ratio 가 서로 맞아떨어져 영향이 없었으나,
// 화면 숫자가 실제와 반대라 혼동된다.
// 다른 소비처(getExecutableParts 의 every, partSavedPointCounts, partOrderMap)는
// 전부 순서를 보지 않으므로 뒤집어도 안전하다.
export const PART_ENABLE_GROUPS: readonly (readonly string[])[] = [
  ['p5', 'p6'],
  ['p4', 'p3', 'p2', 'p1'],
  ['p11', 'p12'],
  ['p10', 'p9', 'p8', 'p7'],
];
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
    const physicalIndex = PART_ENABLE_GROUPS.findIndex(g =>
      part.points.every(p => g.includes(p)),
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
// 수직 파트(P1~P3, P7~P9) 기본 위빙 — 수직 삼각파
export const VERTICAL_WEAVE_PARAMS: WeaveParams = {
  weaveFrequency: 2.0,
  weaveRange: 3.0,
  weaveLeftRange: 3.0,
  weaveRightRange: 3.0,
  weaveLeftStayTime: 300,
  weaveRightStayTime: 300,
  weaveCircleRadio: 50,
  weaveYawAngle: 0,
  weaveRotAngle: 0,
};
// [v1.1.228] 모서리 파트 기본 위빙 — 수직 삼각파, 폭만 넓힘.
// [v1.1.237] 모서리는 P3->P4, P9->P10(위->아래)로 돌고 조건은 P4/P10 에서 읽는다.
// 수직선을 타는 용접이라 평면 삼각파가 아니라 수직 삼각파다. P4/P10 은 227 까지
// 수평 파트의 시작점이었으므로 기본값이 plane_triangle + 수평 위빙이었다. 그대로
// 두면 모서리 20mm 를 엉뚱한 평면으로 흔든다.
// 아래 폭 5.0 은 수직 기본 3.0 보다 넓힌 출발값일 뿐이고 실측으로 맞춰야 한다.
// 실제로 쓰이는 값은 teaching_points 에 저장된 값이다(작업 불러오기가 이 기본값을
// 덮는다). 여기 값은 새로 티칭을 시작할 때만 들어간다.
// 참고: robot_settings.min_weaving_distance 가 50mm 인데 모서리 구간은 20mm 라
// welding.weaving.shortSegment 경고가 로그에 찍힌다. 경고만 남기고 위빙은 그대로
// 진행하며(weldingExecution 629행), robot-core 도 이 값을 SDK 로 넘기지 않는다.
export const CORNER_WEAVE_PARAMS: WeaveParams = {
  weaveFrequency: 2.0,
  weaveRange: 5.0,
  weaveLeftRange: 5.0,
  weaveRightRange: 5.0,
  weaveLeftStayTime: 300,
  weaveRightStayTime: 300,
  weaveCircleRadio: 50,
  weaveYawAngle: 0,
  weaveRotAngle: 0,
};
// 좌측 수평 파트(P5~P6) 기본 위빙 — 평면 삼각파
export const HORIZONTAL_LEFT_WEAVE_PARAMS: WeaveParams = {
  weaveFrequency: 2.0,
  weaveRange: 1.5,
  weaveLeftRange: 5.0,
  weaveRightRange: 5.0,
  weaveLeftStayTime: 300,
  weaveRightStayTime: 0,
  weaveCircleRadio: 50,
  weaveYawAngle: 0,
  weaveRotAngle: 0,
};
// 우측 수평 파트(P10~P12) 기본 위빙 — 평면 삼각파(체류 좌우 반전)
export const HORIZONTAL_RIGHT_WEAVE_PARAMS: WeaveParams = {
  weaveFrequency: 2.0,
  weaveRange: 1.5,
  weaveLeftRange: 5.0,
  weaveRightRange: 5.0,
  weaveLeftStayTime: 0,
  weaveRightStayTime: 300,
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
// 새 작업 생성 시 포인트에 들어가는 기본값 (createInitialTeachingPoints가 그대로 복사).
// moveSpeed = 용접 이동 속도(cm/min).
// v1.1.157: 현장 값으로 갱신.
//   수직(p1~p3, p7~p9) 속도 17 / 250A / 28V
//   수평(p4~p6, p10~p12) 속도 26 / 290A / 32V   (p12는 비어 있던 전류·전압을 같이 채움)
// v1.1.143: 현장 용접 테스트 결과로 정정. 수직 18 / 수평 25 (전류·전압은 수직 300A·28V, 수평 220A·24V)
// v1.1.137의 값(수직 27.5 / 수평 16.7)은 목표 시간에서 역산한 값이었는데,
// 실제 용접 결과 수직/수평이 뒤바뀐 배분이었음이 확인됐다. 위 값은 계산이 아니라
// 실제로 비드가 제대로 나온 조건이다.
// v1.1.130에서 WELD_BATCH_SPEED_SCALE을 0.431로 바로잡은 뒤로 이 숫자가 실제 cm/min과
// 일치한다. 임의로 올리면 그대로 과속이 되므로 실측 없이 바꾸지 말 것.
// (p12는 예전에 '종료점'으로 설계돼 혼자 50이었으나, 현장에서는 정상 용접 포인트로 쓰므로
//  같은 파트인 p10/p11과 동일하게 맞춤.)
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
    moveSpeed: 16,
    velMode: 1,
    weldVoltage: 28,
    weldCurrent: 250,
    weavingType: 'vertical_triangle',
    weaveParams: { ...VERTICAL_WEAVE_PARAMS },
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
    moveSpeed: 16,
    velMode: 1,
    weldVoltage: 28,
    weldCurrent: 250,
    weavingType: 'vertical_triangle',
    weaveParams: { ...VERTICAL_WEAVE_PARAMS },
    gap: 0,
    touchDirection: 1,
    touchBottom: false,
  },
  {
    id: 'p3',
    name: 'P3 (좌측 하단, 모서리+20mm)',
    order: 3,
    toolNum: 3,
    userNum: 0,
    moveSpeed: 16,
    velMode: 1,
    weldVoltage: 28,
    weldCurrent: 250,
    weavingType: 'vertical_triangle',
    weaveParams: { ...VERTICAL_WEAVE_PARAMS },
    gap: 0,
    touchDirection: 1,
    touchBottom: false,
  },
  {
    id: 'p4',
    // [v1.1.228] P4 는 모서리 파트(P4->P3)의 시작점이다. 수직 조건으로 바꿨다.
    name: 'P4 (좌측 모서리)',
    order: 4,
    toolNum: 3,
    userNum: 0,
    moveSpeed: 16,
    velMode: 1,
    weldVoltage: 28,
    weldCurrent: 250,
    weavingType: 'vertical_triangle',
    weaveParams: { ...CORNER_WEAVE_PARAMS },
    gap: 0,
    touchDirection: 1,
    touchBottom: false,
  },
  {
    id: 'p5',
    // [v1.1.228] 수평 파트의 시작점이 P4 에서 여기로 옮겨왔다. 자리는 모서리다.
    name: 'P5 (하단 좌측 시작)',
    order: 5,
    toolNum: 3,
    userNum: 0,
    moveSpeed: 26,
    velMode: 1,
    weldVoltage: 32,
    weldCurrent: 290,
    weavingType: 'plane_triangle',
    weaveParams: { ...HORIZONTAL_LEFT_WEAVE_PARAMS },
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
    moveSpeed: 26,
    velMode: 1,
    weldVoltage: 32,
    weldCurrent: 290,
    weavingType: 'plane_triangle',
    weaveParams: { ...HORIZONTAL_LEFT_WEAVE_PARAMS },
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
    moveSpeed: 16,
    velMode: 1,
    weldVoltage: 28,
    weldCurrent: 250,
    weavingType: 'vertical_triangle',
    weaveParams: { ...VERTICAL_WEAVE_PARAMS },
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
    moveSpeed: 16,
    velMode: 1,
    weldVoltage: 28,
    weldCurrent: 250,
    weavingType: 'vertical_triangle',
    weaveParams: { ...VERTICAL_WEAVE_PARAMS },
    gap: 0,
    touchDirection: -1,
    touchBottom: false,
  },
  {
    id: 'p9',
    name: 'P9 (우측 하단, 모서리+20mm)',
    order: 9,
    toolNum: 3,
    userNum: 0,
    moveSpeed: 16,
    velMode: 1,
    weldVoltage: 28,
    weldCurrent: 250,
    weavingType: 'vertical_triangle',
    weaveParams: { ...VERTICAL_WEAVE_PARAMS },
    gap: 0,
    touchDirection: -1,
    touchBottom: false,
  },
  {
    id: 'p10',
    // [v1.1.228] P10 은 모서리 파트(P10->P9)의 시작점이다. 수직 조건으로 바꿨다.
    name: 'P10 (우측 모서리)',
    order: 10,
    toolNum: 3,
    userNum: 0,
    moveSpeed: 16,
    velMode: 1,
    weldVoltage: 28,
    weldCurrent: 250,
    weavingType: 'vertical_triangle',
    weaveParams: { ...CORNER_WEAVE_PARAMS },
    gap: 0,
    touchDirection: -1,
    touchBottom: false,
  },
  {
    id: 'p11',
    // [v1.1.228] 우측 수평 파트의 시작점이 P10 에서 여기로 옮겨왔다. 자리는 모서리다.
    name: 'P11 (하단 우측 시작)',
    order: 11,
    toolNum: 3,
    userNum: 0,
    moveSpeed: 26,
    velMode: 1,
    weldVoltage: 32,
    weldCurrent: 290,
    weavingType: 'plane_triangle',
    weaveParams: { ...HORIZONTAL_RIGHT_WEAVE_PARAMS },
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
    moveSpeed: 26,
    velMode: 1,
    weldVoltage: 32,
    weldCurrent: 290,
    weavingType: 'plane_triangle',
    weaveParams: { ...HORIZONTAL_RIGHT_WEAVE_PARAMS },
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
