import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useTeachingPoints, useRobotControl, useSchematicCalculations, useJobManagement, useWeldingOperations, usePathTracking, useWeldingHandlers } from '../UcellSelect/hooks';
import { DEFAULT_PART_WELD_ENABLED } from '../UcellSelect';
import { UnifiedWorkspaceCanvas, TorchOrientationIndicator, UCellConfig } from '../UcellSelect/components';
import { paramApi, Posture, WeldingParam, ParamLookupResult, deviationApi, overrideApi } from '../../lib/gapApi';
import { Axios as api } from '../../lib';
import { getRobotError } from '../../lib/robotApi/index';
import { RequireRole } from '../../contexts/gapAuth';
import { useAlert } from '../../contexts';

const CELL_CONFIG: UCellConfig = {
  type: 'normal',
  cellName: 'U-cell (1번)',
  width: 550,
  height: 550,
  thickness: 20,
};

const THICKNESS_OPTIONS = [18, 20, 22, 23];
const STEP_OPTIONS = [1.0, 2.5, 5.0];
const FEED_SPEED_MM_PER_SEC = 1.0;
const LOOKUP_DEBOUNCE_MS = 400;

const SEGMENTS: { key: string; startId: string; endId: string; label: string; offsetX?: number; offsetY?: number }[] = [
  { key: 'p1-p2', startId: 'p1', endId: 'p2', label: '1-2', offsetX: -40 },
  { key: 'p2-p3', startId: 'p2', endId: 'p3', label: '2-3', offsetX: -40 },
  { key: 'p4-p6', startId: 'p4', endId: 'p6', label: '4-6', offsetY: 65 },
  { key: 'p7-p8', startId: 'p7', endId: 'p8', label: '7-8', offsetX: 40 },
  { key: 'p8-p9', startId: 'p8', endId: 'p9', label: '8-9', offsetX: 40 },
  { key: 'p10-p12', startId: 'p10', endId: 'p12', label: '10-12', offsetY: 65 },
];

const CANVAS_W = 1100;
const CANVAS_H = 800;
const BOUNDS = { minX: -400, maxX: 400, minY: -400, maxY: 400 };
const worldToCanvas = (p: { x: number; y: number }) => ({
  x: (p.x - BOUNDS.minX) * (CANVAS_W / (BOUNDS.maxX - BOUNDS.minX)),
  y: CANVAS_H - (p.y - BOUNDS.minY) * (CANVAS_H / (BOUNDS.maxY - BOUNDS.minY)),
});

const getPosture = (pointId: string): Posture => {
  const m = pointId.match(/^p(\d+)$/i);
  if (!m) return 'vertical';
  const n = Number(m[1]);
  if ([1, 2, 3, 7, 8, 9].includes(n)) return 'vertical';
  return 'horizontal';
};

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

type RealAlert = { id: string; type: 'error' | 'warning' | 'info'; message: string; timestamp: string };

const fetchRealAlerts = async (): Promise<RealAlert[]> => {
  const alerts: RealAlert[] = [];
  try {
    const err = await getRobotError();
    if (err?.has_error) {
      alerts.push({
        id: `robot-err-${err.main_code}-${err.sub_code}`,
        type: 'error',
        message: `로봇 오류: ${err.message} (${err.main_code}-${err.sub_code})`,
        timestamp: new Date().toISOString(),
      });
    }
  } catch {}
  if (typeof localStorage !== 'undefined' && localStorage.getItem('gap_token')) {
    try {
      const devs = await deviationApi.listRecent(10);
      devs.forEach(d => {
        const type: RealAlert['type'] = d.level >= 3 ? 'error' : d.level === 2 ? 'warning' : 'info';
        alerts.push({
          id: `dev-${d.id}`,
          type,
          message: `편차 [L${d.level}] ${d.point_code ?? '-'} ${d.field_name}: 지시 ${d.command_value} → 실측 ${d.actual_value} (${Number(d.deviation_pct).toFixed(1)}%)`,
          timestamp: d.created_at,
        });
      });
    } catch {}
  }
  return alerts.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
};

const PendantInner: React.FC = () => {
  const { show: showAlert } = useAlert();
  const {
    teachingPoints,
    saveCurrentPositionToPoint,
    updatePointSpeed,
    updatePointWeldParams,
    updatePointGap,
    updatePointWeaveParams,
    updatePointWeavingType,
    updatePointTouchOffset,
    clearAllTouchOffsets,
    loadPointsFromJob,
  } = useTeachingPoints();

  const { teachingRobotState, isRobotMoving, moveToPoint, startTeachingPolling, stopTeachingPolling } = useRobotControl();

  const { currentJobId, jobList, fetchJobList, loadJob } = useJobManagement();
  const {
    isWelding,
    currentPointIndex,
    startWelding,
    stopWelding,
    startTouchSensing,
    stopTouchSensing,
  } = useWeldingOperations();
  const [jobPickerOpen, setJobPickerOpen] = useState(false);
  const currentJobName = jobList.find(j => j.id === currentJobId)?.name ?? null;
  const savedCount = teachingPoints.filter(p => p.id !== 'home' && p.isSaved).length;
  const openJobPicker = async () => {
    await fetchJobList();
    setJobPickerOpen(true);
  };
  const pickJob = async (jobId: number) => {
    const pts = await loadJob(jobId);
    if (pts) loadPointsFromJob(pts);
    setJobPickerOpen(false);
  };
  const {
    startTracking,
    stopTracking,
    clearPath: clearTrackingPath,
  } = usePathTracking();

  const MANUAL_SPEED_FOR_WELD = 40;

  const {
    handleStartWelding,
    handleContinueWelding,
    handleGlobalEmergencyStop,
  } = useWeldingHandlers({
    teachingPoints,
    teachingRobotState,
    simulationMode: false,
    dryRunMode: false,
    manualMoveSpeed: MANUAL_SPEED_FOR_WELD,
    autoTouchSensing: false,
    partWeldEnabled: DEFAULT_PART_WELD_ENABLED,
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
    wsClearPathHistory: () => {},
  });

  const homePoint = teachingPoints.find(p => p.id === 'home');
  const homeSaved = !!homePoint?.isSaved;

  const handleSaveHome = async () => {
    try {
      await saveCurrentPositionToPoint('home');
      showAlert('홈 위치 저장됨', { type: 'success' });
    } catch (e: any) {
      showAlert(`홈 저장 실패: ${e.message}`, { type: 'error' });
    }
  };

  const handleMoveHome = () => {
    if (!homePoint || !homeSaved) return;
    moveToPoint(homePoint, { overrideSpeed: 50 });
  };

  const { getSchematicPosition } = useSchematicCalculations({
    selectedWidth: CELL_CONFIG.width,
    selectedHeight: CELL_CONFIG.height,
    teachingPoints,
  });

  useEffect(() => {
    startTeachingPolling();
    return () => stopTeachingPolling();
  }, [startTeachingPolling, stopTeachingPolling]);

  const weldPoints = useMemo(() => teachingPoints.filter(pt => pt.id !== 'home').map(pt => {
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
  }), [teachingPoints, getSchematicPosition]);

  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [gapEditSeg, setGapEditSeg] = useState<{ startId: string; label: string } | null>(null);
  const [gapEditValue, setGapEditValue] = useState<string>('');
  const [teachPointId, setTeachPointId] = useState<string | null>(null);
  const [teachBusy, setTeachBusy] = useState(false);
  const [thickness, setThickness] = useState<number>(() => {
    const v = typeof localStorage !== 'undefined' ? localStorage.getItem('gap_thickness_mm') : null;
    return v ? Number(v) : 20;
  });
  const changeThickness = (v: number) => {
    setThickness(v);
    if (typeof localStorage !== 'undefined') localStorage.setItem('gap_thickness_mm', String(v));
  };
  const [gap, setGap] = useState<number>(2);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ParamLookupResult | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [alerts, setAlerts] = useState<RealAlert[]>([]);
  const [alertsOpen, setAlertsOpen] = useState(false);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const a = await fetchRealAlerts();
      if (alive) setAlerts(a);
    };
    load();
    const i = setInterval(load, 5000);
    return () => { alive = false; clearInterval(i); };
  }, []);
  const errorCount = alerts.filter(a => a.type === 'error').length;
  const warningCount = alerts.filter(a => a.type === 'warning').length;

  const [wireOpen, setWireOpen] = useState(false);
  const [stepMm, setStepMm] = useState<number>(1.0);
  const [busy, setBusy] = useState(false);
  const [lastAction, setLastAction] = useState<string>('');
  const ioType = 0;

  const [overriding, setOverriding] = useState(false);
  const [editCurrent, setEditCurrent] = useState<number>(0);
  const [editVoltage, setEditVoltage] = useState<number>(0);
  const [editSpeed, setEditSpeed] = useState<number>(0);
  const [overrideReason, setOverrideReason] = useState<string>('');

  const openPoint = (pointId: string) => {
    setSelectedPointId(pointId);
    const pt = teachingPoints.find(p => p.id === pointId);
    setGap(pt?.gap ?? 2);
    setResult(null);
    setOverriding(false);
    setOverrideReason('');
  };

  const closePoint = () => {
    setSelectedPointId(null);
    setResult(null);
    setOverriding(false);
  };

  useEffect(() => {
    if (result?.param) {
      setEditCurrent(Number(result.param.current_a));
      setEditVoltage(Number(result.param.voltage_v));
      setEditSpeed(Number(result.param.speed_cpm));
    }
  }, [result]);

  const runLookup = async (pid: string, g: number, t: number) => {
    if (isNaN(g)) return;
    setLoading(true);
    try {
      const res = await paramApi.lookup({
        posture: getPosture(pid),
        gap: g,
        thickness: t,
        material: 'SS400',
        joint: 'fillet',
      });
      setResult(res);
    } catch (e: any) {
      showAlert(`조회 실패: ${e.response?.data?.detail || e.message}`, { type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedPointId) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runLookup(selectedPointId, gap, thickness), LOOKUP_DEBOUNCE_MS);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [selectedPointId, gap, thickness]);

  const applyToPoint = async () => {
    if (!selectedPointId || !result?.param) return;
    const p = result.param;

    const finalCurrent = overriding ? editCurrent : Number(p.current_a);
    const finalVoltage = overriding ? editVoltage : Number(p.voltage_v);
    const finalSpeed = overriding ? editSpeed : Number(p.speed_cpm);

    if (overriding) {
      if (!currentJobId) {
        showAlert('오버라이드를 저장하려면 작업(job)을 먼저 선택하세요', { type: 'warning' });
        return;
      }
      const changes: { field: string; original: number; value: number }[] = [];
      if (finalCurrent !== Number(p.current_a)) changes.push({ field: 'current_a', original: Number(p.current_a), value: finalCurrent });
      if (finalVoltage !== Number(p.voltage_v)) changes.push({ field: 'voltage_v', original: Number(p.voltage_v), value: finalVoltage });
      if (finalSpeed !== Number(p.speed_cpm)) changes.push({ field: 'speed_cpm', original: Number(p.speed_cpm), value: finalSpeed });
      try {
        for (const c of changes) {
          await overrideApi.create({
            job_id: currentJobId,
            point_code: selectedPointId,
            posture: getPosture(selectedPointId),
            gap_mm: Number(p.gap_mm),
            material: p.material,
            thickness_mm: Number(p.thickness_mm),
            joint_type: p.joint_type,
            field_name: c.field,
            original_value: c.original,
            override_value: c.value,
            reason: overrideReason || undefined,
          });
        }
      } catch (e: any) {
        showAlert(`오버라이드 저장 실패: ${e.response?.data?.detail || e.message}`, { type: 'error' });
        return;
      }
    }

    updatePointGap(selectedPointId, gap);
    updatePointWeldParams(selectedPointId, finalVoltage, finalCurrent);
    updatePointSpeed(selectedPointId, finalSpeed);
    if (p.weave_enabled) {
      updatePointWeavingType(selectedPointId, 'plane_sine');
      updatePointWeaveParams(selectedPointId, {
        weaveFrequency: p.weave_freq_hz,
        weaveRange: p.weave_range_mm,
        weaveLeftRange: p.weave_range_mm / 2,
        weaveRightRange: p.weave_range_mm / 2,
      });
    } else {
      updatePointWeavingType(selectedPointId, 'none');
    }
    showAlert(`${selectedPointId.toUpperCase()} ${overriding ? '오버라이드' : '파라미터'} 적용됨`, { type: 'success' });
    closePoint();
  };

  const bumpGap = (d: number) => setGap(v => Math.min(6, Math.max(0, v + d)));

  const startStop = async (direction: 'forward' | 'reverse', amountMm: number) => {
    setBusy(true);
    setLastAction('');
    const durationMs = Math.round((amountMm / FEED_SPEED_MM_PER_SEC) * 1000);
    try {
      await api.post(`/robot_sdk/wire/${direction}`, { ioType, wireFeed: 1 });
      setLastAction(`${direction === 'forward' ? '▶ 밀기' : '◀ 당기기'} ${amountMm}mm 진행 중...`);
      await sleep(durationMs);
      await api.post(`/robot_sdk/wire/${direction}`, { ioType, wireFeed: 0 });
      setLastAction(`✓ ${direction === 'forward' ? '밀기' : '당기기'} ${amountMm}mm 완료`);
    } catch (e: any) {
      try { await api.post(`/robot_sdk/wire/${direction}`, { ioType, wireFeed: 0 }); } catch {}
      showAlert(`실패: ${e.response?.data?.detail || e.message}`, { type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const wireStopAll = async () => {
    try {
      await api.post(`/robot_sdk/wire/forward`, { ioType, wireFeed: 0 });
      await api.post(`/robot_sdk/wire/reverse`, { ioType, wireFeed: 0 });
      setLastAction('■ 정지됨');
    } catch (e: any) {
      showAlert(`정지 실패: ${e.message}`, { type: 'error' });
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0d1220', color: '#fff', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'relative', width: '100%', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ position: 'relative', width: CANVAS_W, height: CANVAS_H }}>
        <UnifiedWorkspaceCanvas
          ucellConfig={CELL_CONFIG}
          workspaceConfig={{ bounds: BOUNDS, showGrid: true, gridSpacing: 100 }}
          weldPoints={weldPoints}
          onWeldPointClick={pt => setTeachPointId(pt.id)}
          ucellWidth={CELL_CONFIG.width}
          ucellHeight={CELL_CONFIG.height}
          canvasWidth={CANVAS_W}
          canvasHeight={CANVAS_H}
          animated
        />

        {/* 세그먼트별 갭 입력 오버레이 */}
        {SEGMENTS.map(seg => {
          const a = getSchematicPosition(seg.startId);
          const b = getSchematicPosition(seg.endId);
          const mid = worldToCanvas({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
          const left = mid.x + (seg.offsetX ?? 0);
          const top = mid.y + (seg.offsetY ?? 0);
          const pt = teachingPoints.find(p => p.id === seg.startId);
          const g = pt?.gap ?? 0;
          const dec = () => updatePointGap(seg.startId, Math.max(0, g - 1));
          const inc = () => updatePointGap(seg.startId, Math.min(6, g + 1));
          return (
            <div key={seg.key} style={{
              position: 'absolute', left, top, transform: 'translate(-50%, -50%) scale(0.8)', transformOrigin: 'center',
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'rgba(15, 23, 42, 0.95)', border: '1px solid #334155', borderRadius: 4, padding: '2px 4px',
              zIndex: 5,
            }}>
              <button onClick={dec} disabled={g <= 0}
                style={{ width: 10, height: 10, boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: '#1e293b', color: '#fff', border: 'none', borderRadius: 2, cursor: g <= 0 ? 'not-allowed' : 'pointer', fontSize: 10, fontWeight: 'bold', opacity: g <= 0 ? 0.4 : 1, padding: 0, lineHeight: 1 }}
              >−</button>
              <button onClick={() => { setGapEditSeg({ startId: seg.startId, label: seg.label }); setGapEditValue(String(g)); }}
                style={{ minWidth: 30, textAlign: 'center', fontSize: 14, fontWeight: 'bold', background: 'transparent', color: '#fff', border: 'none', cursor: 'pointer', padding: '0 2px' }}
              >{g}</button>
              <button onClick={inc} disabled={g >= 6}
                style={{ width: 10, height: 10, boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: '#1e293b', color: '#fff', border: 'none', borderRadius: 2, cursor: g >= 6 ? 'not-allowed' : 'pointer', fontSize: 10, fontWeight: 'bold', opacity: g >= 6 ? 0.4 : 1, padding: 0, lineHeight: 1 }}
              >+</button>
            </div>
          );
        })}
        </div>

        {/* 중앙 통합 허브 (U-셀 내부) */}
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -55%)',
          width: 340, background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(6px)',
          border: '1px solid #334155', borderRadius: 14, padding: 16, zIndex: 10,
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          {/* 진행 상황 (용접 중) */}
          {isWelding && (
            <div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
                <span>진행 중</span>
                <span style={{ color: '#86efac', fontWeight: 'bold' }}>
                  {currentPointIndex + 1} / {savedCount}
                </span>
              </div>
              <div style={{ height: 8, background: '#020617', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{
                  width: `${savedCount > 0 ? ((currentPointIndex + 1) / savedCount) * 100 : 0}%`,
                  height: '100%', background: '#10b981', transition: 'width 0.3s',
                }} />
              </div>
            </div>
          )}

          {/* 로봇 상태 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
            <span style={{ color: '#94a3b8' }}>로봇</span>
            <span style={{ color: teachingRobotState?.connected ? '#86efac' : '#f87171', fontWeight: 'bold' }}>
              {teachingRobotState?.connected ? '● 연결' : '○ 미연결'}
              {isRobotMoving && ' · 이동 중'}
            </span>
          </div>

          {/* 와이어 수동 제어 (인라인) */}
          <div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>와이어 수동 제어</div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              {STEP_OPTIONS.map(v => (
                <button key={v} onClick={() => setStepMm(v)} disabled={busy}
                  style={{
                    flex: 1, padding: '6px 0', fontSize: 12, fontWeight: 'bold',
                    background: stepMm === v ? '#2b7ae6' : '#1e293b',
                    color: '#fff', border: 'none', borderRadius: 6, cursor: busy ? 'not-allowed' : 'pointer',
                  }}
                >{v}mm</button>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>
              <button onClick={() => startStop('reverse', stepMm)} disabled={busy}
                style={{ padding: '10px 0', fontSize: 13, fontWeight: 'bold', background: busy ? '#334155' : '#a30', color: '#fff', border: 'none', borderRadius: 6, cursor: busy ? 'wait' : 'pointer' }}
              >◀ 당기기</button>
              <button onClick={() => startStop('forward', stepMm)} disabled={busy}
                style={{ padding: '10px 0', fontSize: 13, fontWeight: 'bold', background: busy ? '#334155' : '#0a5', color: '#fff', border: 'none', borderRadius: 6, cursor: busy ? 'wait' : 'pointer' }}
              >밀기 ▶</button>
            </div>
            <button onClick={wireStopAll}
              style={{ width: '100%', padding: '8px 0', fontSize: 12, fontWeight: 'bold', background: '#475569', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
            >와이어 정지</button>
            {lastAction && <div style={{ marginTop: 6, padding: 4, fontSize: 11, color: '#86efac', background: '#020617', borderRadius: 4, textAlign: 'center' }}>{lastAction}</div>}
          </div>

          {/* 홈 제어 */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: '#94a3b8' }}>홈</span>
              <span style={{ fontSize: 12, color: homeSaved ? '#86efac' : '#f87171', fontWeight: 'bold' }}>
                {homeSaved ? '저장됨' : '미저장'}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <button onClick={handleSaveHome} disabled={isRobotMoving}
                style={{
                  padding: '10px 0', fontSize: 12, fontWeight: 'bold',
                  background: '#1e293b', color: '#fff', border: '1px solid #334155',
                  borderRadius: 6, cursor: isRobotMoving ? 'not-allowed' : 'pointer',
                }}
              >현재 위치 저장</button>
              <button onClick={handleMoveHome} disabled={!homeSaved || isRobotMoving}
                style={{
                  padding: '10px 0', fontSize: 12, fontWeight: 'bold',
                  background: homeSaved ? '#2b7ae6' : '#334155', color: '#fff', border: 'none',
                  borderRadius: 6, cursor: homeSaved && !isRobotMoving ? 'pointer' : 'not-allowed',
                }}
              >홈으로 이동</button>
            </div>
          </div>

        </div>
      </div>

      {/* 좌상단 작업 선택 */}
      <div style={{ position: 'fixed', top: 16, left: 16, zIndex: 30, display: 'flex', gap: 8, alignItems: 'center' }}>
        <button onClick={openJobPicker}
          style={{
            padding: '10px 16px', fontSize: 14, fontWeight: 'bold',
            background: '#1e293b', color: '#fff', border: '1px solid #334155',
            borderRadius: 10, cursor: 'pointer',
          }}
        >
          작업: {currentJobName ?? '선택 안 됨'}
        </button>
        <span style={{ fontSize: 12, color: '#cbd5e1' }}>
          {savedCount}/{teachingPoints.length - 1} 저장됨
        </span>
      </div>

      {/* 우상단 알람 배지 */}
      <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 30 }}>
        <button onClick={() => setAlertsOpen(v => !v)}
          style={{
            padding: '10px 16px', fontSize: 14, fontWeight: 'bold',
            background: errorCount > 0 ? '#dc2626' : warningCount > 0 ? '#a16207' : '#065f46',
            color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer',
            boxShadow: errorCount > 0 ? '0 0 0 2px rgba(220,38,38,0.4)' : undefined,
          }}
        >
          {alerts.length === 0
            ? '● 정상'
            : `⚠ 알람 ${alerts.length} (오류 ${errorCount} / 경고 ${warningCount})`}
        </button>
        {alertsOpen && (
          <div style={{
            marginTop: 8, width: 420, maxHeight: '60vh', overflowY: 'auto',
            background: '#0f172a', border: '1px solid #334155', borderRadius: 12, padding: 12,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <strong style={{ fontSize: 14 }}>알람 목록</strong>
              <button onClick={() => setAlertsOpen(false)}
                style={{ background: 'none', color: '#94a3b8', border: 'none', fontSize: 18, cursor: 'pointer' }}
              >×</button>
            </div>
            {alerts.length === 0 && <div style={{ color: '#64748b', fontSize: 13, textAlign: 'center', padding: 20 }}>알람 없음</div>}
            {alerts.map(a => (
              <div key={a.id} style={{
                padding: 10, marginBottom: 6, borderRadius: 6, fontSize: 13,
                background: a.type === 'error' ? '#7f1d1d' : a.type === 'warning' ? '#78350f' : '#1e3a5f',
                borderLeft: `4px solid ${a.type === 'error' ? '#f87171' : a.type === 'warning' ? '#fbbf24' : '#60a5fa'}`,
              }}>
                <div>{a.message}</div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                  {new Date(a.timestamp).toLocaleString('ko-KR')}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 우측 세로 용접 실행 도크 */}
      <div style={{
        position: 'fixed', left: 'calc(50% + 570px)', top: '50%', transform: 'translateY(-50%)', zIndex: 20,
        display: 'flex', flexDirection: 'column', gap: 8,
        background: 'rgba(15, 23, 42, 0.9)', backdropFilter: 'blur(6px)',
        border: '1px solid #334155', borderRadius: 12, padding: 10, minWidth: 140,
      }}>
        <button onClick={handleStartWelding} disabled={isWelding || isRobotMoving}
          style={{
            padding: '14px', fontSize: 15, fontWeight: 'bold',
            background: isWelding || isRobotMoving ? '#334155' : '#0a5', color: '#fff', border: 'none',
            borderRadius: 8, cursor: isWelding || isRobotMoving ? 'not-allowed' : 'pointer',
          }}
        >용접 시작</button>
        <button onClick={handleContinueWelding} disabled={isWelding || isRobotMoving}
          style={{
            padding: '14px', fontSize: 15, fontWeight: 'bold',
            background: isWelding || isRobotMoving ? '#334155' : '#2b7ae6', color: '#fff', border: 'none',
            borderRadius: 8, cursor: isWelding || isRobotMoving ? 'not-allowed' : 'pointer',
          }}
        >용접 계속</button>
        <button onClick={handleGlobalEmergencyStop}
          style={{
            padding: '18px', fontSize: 16, fontWeight: 'bold',
            background: '#dc2626', color: '#fff', border: 'none',
            borderRadius: 8, cursor: 'pointer',
          }}
        >■ 비상 정지</button>
      </div>

      {/* 작업 선택 모달 */}
      {jobPickerOpen && (
        <div onClick={() => setJobPickerOpen(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#0f172a', border: '1px solid #334155', borderRadius: 16,
            padding: 20, width: 560, maxWidth: '90vw', maxHeight: '80vh', display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h2 style={{ margin: 0, fontSize: 20 }}>작업 선택</h2>
              <button onClick={() => setJobPickerOpen(false)} style={{ background: 'none', color: '#94a3b8', border: 'none', fontSize: 24, cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {jobList.length === 0 && <div style={{ color: '#64748b', textAlign: 'center', padding: 20 }}>작업 없음</div>}
              {jobList.map(j => (
                <button key={j.id} onClick={() => pickJob(j.id)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left', padding: 14, marginBottom: 6,
                    fontSize: 15, fontWeight: 'bold',
                    background: j.id === currentJobId ? '#1e40af' : '#1e293b',
                    color: '#fff', border: '1px solid #334155', borderRadius: 8, cursor: 'pointer',
                  }}
                >
                  {j.name} {j.id === currentJobId && ' (현재)'}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 포인트 티칭 모달 */}
      {teachPointId && (() => {
        const pt = teachingPoints.find(p => p.id === teachPointId);
        const saved = !!pt?.isSaved;
        const label = teachPointId.toUpperCase();
        const doSave = async () => {
          setTeachBusy(true);
          try {
            await saveCurrentPositionToPoint(teachPointId);
            showAlert(`${label} 위치 저장됨`, { type: 'success' });
            setTeachPointId(null);
          } catch (e: any) {
            showAlert(`저장 실패: ${e.message}`, { type: 'error' });
          } finally {
            setTeachBusy(false);
          }
        };
        const doMove = () => {
          if (!pt || !saved) return;
          moveToPoint(pt, { overrideSpeed: 40 });
          setTeachPointId(null);
        };
        return (
          <div onClick={() => setTeachPointId(null)} style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
          }}>
            <div onClick={e => e.stopPropagation()} style={{
              background: '#0f172a', border: '1px solid #334155', borderRadius: 14,
              padding: 20, width: 360,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <h2 style={{ margin: 0, fontSize: 20 }}>{label} 티칭</h2>
                <button onClick={() => setTeachPointId(null)} style={{ background: 'none', color: '#94a3b8', border: 'none', fontSize: 22, cursor: 'pointer' }}>×</button>
              </div>
              <div style={{ marginBottom: 14, fontSize: 14, color: saved ? '#86efac' : '#f87171' }}>
                상태: <strong>{saved ? '저장됨' : '미저장'}</strong>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <button onClick={doMove} disabled={!saved || isRobotMoving}
                  style={{
                    padding: '16px 0', fontSize: 15, fontWeight: 'bold',
                    background: saved && !isRobotMoving ? '#2b7ae6' : '#334155', color: '#fff', border: 'none',
                    borderRadius: 8, cursor: saved && !isRobotMoving ? 'pointer' : 'not-allowed',
                  }}
                >여기로 이동</button>
                <button onClick={doSave} disabled={teachBusy || isRobotMoving}
                  style={{
                    padding: '16px 0', fontSize: 15, fontWeight: 'bold',
                    background: teachBusy || isRobotMoving ? '#334155' : '#0a5', color: '#fff', border: 'none',
                    borderRadius: 8, cursor: teachBusy || isRobotMoving ? 'not-allowed' : 'pointer',
                  }}
                >{teachBusy ? '저장 중...' : '현재 위치 저장'}</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 갭 직접 입력 모달 */}
      {gapEditSeg && (
        <div onClick={() => setGapEditSeg(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#0f172a', border: '1px solid #334155', borderRadius: 14,
            padding: 20, width: 320,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>{gapEditSeg.label} 갭 입력 (mm)</h2>
              <button onClick={() => setGapEditSeg(null)} style={{ background: 'none', color: '#94a3b8', border: 'none', fontSize: 22, cursor: 'pointer' }}>×</button>
            </div>
            <div style={{
              width: '100%', padding: 14, fontSize: 34, fontWeight: 'bold', textAlign: 'center',
              background: '#020617', color: '#fff', border: '1px solid #334155', borderRadius: 8,
              minHeight: 60,
            }}>{gapEditValue || '0'}</div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginTop: 12 }}>
              {['1','2','3','4','5','6','7','8','9','.','0','⌫'].map(k => (
                <button key={k}
                  onClick={() => {
                    if (k === '⌫') { setGapEditValue(v => v.slice(0, -1)); return; }
                    if (k === '.' && gapEditValue.includes('.')) return;
                    setGapEditValue(v => (v === '0' && k !== '.' ? k : v + k));
                  }}
                  style={{
                    padding: '18px 0', fontSize: 22, fontWeight: 'bold',
                    background: '#1e293b', color: '#fff', border: '1px solid #334155',
                    borderRadius: 8, cursor: 'pointer',
                  }}
                >{k}</button>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 14 }}>
              <button onClick={() => setGapEditSeg(null)}
                style={{ padding: 12, fontSize: 15, background: '#334155', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}
              >취소</button>
              <button onClick={() => {
                const v = Math.min(6, Math.max(0, parseFloat(gapEditValue) || 0));
                updatePointGap(gapEditSeg.startId, +v.toFixed(1));
                setGapEditSeg(null);
              }}
                style={{ padding: 12, fontSize: 15, fontWeight: 'bold', background: '#2b7ae6', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}
              >확인</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

const ParamGrid: React.FC<{ param: WeldingParam; fallback: number; matched: boolean }> = ({ param, fallback, matched }) => (
  <>
    <div style={{
      marginBottom: 10, padding: 6, borderRadius: 6, fontSize: 12, textAlign: 'center',
      background: fallback === 1 ? '#065f46' : fallback === 2 ? '#78350f' : '#7f1d1d',
    }}>DB 매치 → 갭 {param.gap_mm}mm / {param.thickness_mm}mm / {param.posture} · 폴백 {fallback} {matched ? '(정확)' : '(폴백)'}</div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
      <Stat label="전류" value={`${param.current_a}A`} />
      <Stat label="전압" value={`${param.voltage_v}V`} />
      <Stat label="속도" value={`${param.speed_cpm}cpm`} />
      <Stat label="스틱아웃" value={`${param.stickout_mm}mm`} small />
      <Stat label="위빙" value={param.weave_enabled ? `${param.weave_freq_hz}Hz/${param.weave_range_mm}mm` : 'OFF'} small />
      <Stat label="출처" value={param.source} small />
    </div>
  </>
);

const Stat: React.FC<{ label: string; value: string; small?: boolean }> = ({ label, value, small }) => (
  <div style={{ background: '#0f172a', padding: 10, borderRadius: 6, textAlign: 'center' }}>
    <div style={{ fontSize: 11, color: '#64748b' }}>{label}</div>
    <div style={{ fontSize: small ? 14 : 24, fontWeight: 'bold', marginTop: 2 }}>{value}</div>
  </div>
);

const EditStat: React.FC<{ label: string; value: number; onChange: (v: number) => void; original: number; step?: number }> = ({ label, value, onChange, original, step = 1 }) => {
  const changed = value !== original;
  return (
    <div style={{ background: '#0f172a', padding: 10, borderRadius: 6, textAlign: 'center' }}>
      <div style={{ fontSize: 11, color: '#64748b' }}>{label}</div>
      <input type="number" step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{
          width: '100%', marginTop: 4, padding: 4, fontSize: 20, fontWeight: 'bold', textAlign: 'center',
          background: '#020617', color: changed ? '#fde68a' : '#fff',
          border: `1px solid ${changed ? '#a16207' : '#334155'}`, borderRadius: 4, boxSizing: 'border-box',
        }}
      />
      {changed && <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>DB: {original}</div>}
    </div>
  );
};

const PendantPage: React.FC = () => (
  <RequireRole roles={['admin', 'operator']}>
    <PendantInner />
  </RequireRole>
);

export default PendantPage;
