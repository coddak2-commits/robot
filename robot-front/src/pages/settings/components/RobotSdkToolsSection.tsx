import React, { useState } from 'react';
import { Settings, RefreshCw, Move, RotateCw, Anchor, Weight, ShieldAlert, PauseCircle, PlayCircle } from 'lucide-react';
import {
  getToolCoord, getWorkCoord, setToolCoord, setWorkCoord,
  getPayload, setPayload, pointsOffsetEnable, pointsOffsetDisable,
  pauseRobotMotion, resumeRobotMotion, getSafetyStopState, getControlBoxDOState, getToolDOState,
  relativeMoveL, relativeMoveJ,
} from '../../../lib';
import type { CoordValues } from '../../../lib';
import { useGapAuth } from '../../../contexts/gapAuth';
import { useAlert } from '../../../contexts';

const EMPTY_COORD: CoordValues = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 };
const AXES = ['x', 'y', 'z', 'rx', 'ry', 'rz'] as const;

// 백엔드는 SDK 호출이 실패해도 HTTP 200으로 응답하고 바디의 status_code에 실패를
// 담는다(예외적인 네트워크 오류만 throw). 그래서 매 응답을 이걸로 확인해야
// SDK 레벨 실패를 "성공" 토스트로 잘못 표시하지 않는다.
const isOk = (r: unknown): boolean => (r as { status_code?: number })?.status_code === 200;
const responseMessage = (r: unknown, fallback: string): string =>
  (r as { message?: string; data?: { message?: string } })?.message
  ?? (r as { data?: { message?: string } })?.data?.message
  ?? fallback;
const errorMessage = (e: unknown, fallback: string): string => {
  const detail = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
  if (detail) return detail;
  return e instanceof Error ? e.message : fallback;
};

const CoordRow: React.FC<{ coord: CoordValues; onChange: (c: CoordValues) => void }> = ({ coord, onChange }) => (
  <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
    {AXES.map(axis => (
      <div key={axis}>
        <label className="block text-gray-500 text-xs mb-1 uppercase">{axis}</label>
        <input
          type="number"
          value={coord[axis]}
          onChange={e => onChange({ ...coord, [axis]: parseFloat(e.target.value) || 0 })}
          className="w-full px-2 py-1.5 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:border-cyan-500 focus:outline-none"
        />
      </div>
    ))}
  </div>
);

// 1. 툴/워크 좌표계 + 부하(payload) - 기존엔 펜던트에서만 확인/설정 가능했음
const CoordPayloadTools: React.FC = () => {
  const { show: showAlert } = useAlert();
  const [frameId, setFrameId] = useState(0);
  const [toolCoord, setToolCoordState] = useState<CoordValues>(EMPTY_COORD);
  const [workCoord, setWorkCoordState] = useState<CoordValues>(EMPTY_COORD);
  const [payload, setPayloadState] = useState<{ weight: number; cog: { x: number; y: number; z: number } }>({
    weight: 0, cog: { x: 0, y: 0, z: 0 },
  });
  const [loading, setLoading] = useState(false);
  const fetchAll = async () => {
    setLoading(true);
    try {
      const [t, w, p] = await Promise.all([getToolCoord(frameId), getWorkCoord(frameId), getPayload(frameId)]);
      const failures: string[] = [];
      if (isOk(t) && t?.data?.coord) setToolCoordState(t.data.coord);
      else failures.push('툴 좌표계');
      if (isOk(w) && w?.data?.coord) setWorkCoordState(w.data.coord);
      else failures.push('워크 좌표계');
      if (isOk(p) && p?.data) setPayloadState({ weight: p.data.weight ?? 0, cog: p.data.cog ?? { x: 0, y: 0, z: 0 } });
      else failures.push('부하');
      if (failures.length > 0) {
        showAlert(`조회 실패: ${failures.join(', ')}`, { type: 'error' });
      }
    } catch (e) {
      showAlert('조회 실패: ' + errorMessage(e, '알 수 없는 오류'), { type: 'error' });
    } finally {
      setLoading(false);
    }
  };
  const applyTool = async () => {
    try {
      const r = await setToolCoord(frameId, toolCoord);
      if (!isOk(r)) {
        showAlert('적용 실패: ' + responseMessage(r, 'SDK 오류'), { type: 'error' });
        return;
      }
      showAlert('툴 좌표계 적용됨', { type: 'success' });
    } catch (e) {
      showAlert('적용 실패: ' + errorMessage(e, '알 수 없는 오류'), { type: 'error' });
    }
  };
  const applyWork = async () => {
    try {
      const r = await setWorkCoord(frameId, workCoord);
      if (!isOk(r)) {
        showAlert('적용 실패: ' + responseMessage(r, 'SDK 오류'), { type: 'error' });
        return;
      }
      showAlert('워크 좌표계 적용됨', { type: 'success' });
    } catch (e) {
      showAlert('적용 실패: ' + errorMessage(e, '알 수 없는 오류'), { type: 'error' });
    }
  };
  const applyPayload = async () => {
    try {
      const r = await setPayload(frameId, payload.weight, payload.cog);
      if (!isOk(r)) {
        showAlert('적용 실패: ' + responseMessage(r, 'SDK 오류'), { type: 'error' });
        return;
      }
      showAlert('부하 설정 적용됨', { type: 'success' });
    } catch (e) {
      showAlert('적용 실패: ' + errorMessage(e, '알 수 없는 오류'), { type: 'error' });
    }
  };
  return (
    <div className="bg-gray-800/50 rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Anchor className="w-4 h-4 text-cyan-400" />
          <span className="text-white font-medium">좌표계 번호</span>
          <input
            type="number" min={0} max={14} value={frameId}
            onChange={e => setFrameId(parseInt(e.target.value) || 0)}
            className="w-16 px-2 py-1 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm text-center"
          />
        </div>
        <button
          onClick={fetchAll}
          disabled={loading}
          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-white text-xs flex items-center gap-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> 조회
        </button>
      </div>
      <div>
        <div className="text-gray-400 text-xs mb-2">툴 좌표계 (mm / deg)</div>
        <CoordRow coord={toolCoord} onChange={setToolCoordState} />
        <button onClick={applyTool} className="mt-2 px-3 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 rounded-lg text-xs">
          적용
        </button>
      </div>
      <div>
        <div className="text-gray-400 text-xs mb-2">워크 좌표계 (mm / deg)</div>
        <CoordRow coord={workCoord} onChange={setWorkCoordState} />
        <button onClick={applyWork} className="mt-2 px-3 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 rounded-lg text-xs">
          적용
        </button>
      </div>
      <div>
        <div className="text-gray-400 text-xs mb-2 flex items-center gap-1.5">
          <Weight className="w-3.5 h-3.5" /> 부하(payload)
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-gray-500 text-xs">무게(kg)</span>
          <input
            type="number" step={0.1} value={payload.weight}
            onChange={e => setPayloadState(p => ({ ...p, weight: parseFloat(e.target.value) || 0 }))}
            className="w-24 px-2 py-1.5 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm"
          />
          {(['x', 'y', 'z'] as const).map(axis => (
            <input
              key={axis} type="number" value={payload.cog[axis]} placeholder={axis}
              onChange={e => setPayloadState(p => ({ ...p, cog: { ...p.cog, [axis]: parseFloat(e.target.value) || 0 } }))}
              className="w-20 px-2 py-1.5 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm"
            />
          ))}
          <button onClick={applyPayload} className="px-3 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 rounded-lg text-xs">
            적용
          </button>
        </div>
      </div>
    </div>
  );
};

// 3. 전체 경로(포인트) 오프셋 - 자재 위치가 티칭 프로그램과 살짝 어긋났을 때 재티칭 없이 보정
const PointsOffsetTools: React.FC = () => {
  const { show: showAlert } = useAlert();
  const [offset, setOffset] = useState<CoordValues>(EMPTY_COORD);
  const [flag, setFlag] = useState<0 | 2>(0);
  const [active, setActive] = useState(false);
  const enable = async () => {
    try {
      const r = await pointsOffsetEnable(offset, flag);
      if (!isOk(r)) {
        showAlert('적용 실패: ' + responseMessage(r, 'SDK 오류'), { type: 'error' });
        return;
      }
      setActive(true);
      showAlert('전체 경로 오프셋 적용됨 - 이후 이동부터 반영', { type: 'success' });
    } catch (e) {
      showAlert('적용 실패: ' + errorMessage(e, '알 수 없는 오류'), { type: 'error' });
    }
  };
  const disable = async () => {
    try {
      const r = await pointsOffsetDisable();
      if (!isOk(r)) {
        showAlert('해제 실패: ' + responseMessage(r, 'SDK 오류'), { type: 'error' });
        return;
      }
      setActive(false);
      showAlert('오프셋 해제됨', { type: 'success' });
    } catch (e) {
      showAlert('해제 실패: ' + errorMessage(e, '알 수 없는 오류'), { type: 'error' });
    }
  };
  return (
    <div className="bg-gray-800/50 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Move className="w-4 h-4 text-purple-400" />
        <span className="text-white font-medium">전체 경로 오프셋</span>
        {active && <span className="text-xs text-purple-400 bg-purple-500/20 px-2 py-0.5 rounded-full">적용중</span>}
      </div>
      <p className="text-gray-400 text-xs">
        자재 위치가 티칭 프로그램과 살짝 어긋났을 때, 포인트를 다시 티칭하지 않고 이후 실행되는 모든 이동을 한번에 보정합니다.
      </p>
      <p className="text-amber-400/80 text-xs">
        ⚠ SDK에 현재 오프셋 적용 여부를 조회하는 기능이 없어 위 "적용중" 표시는 이 화면의 임시 상태일 뿐입니다.
        새로고침하거나 페이지를 나가면 표시는 사라지지만 로봇에는 오프셋이 계속 남아있을 수 있으니,
        확인이 끝나면 반드시 "해제"를 눌러 끄세요.
      </p>
      <CoordRow coord={offset} onChange={setOffset} />
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer">
          <input type="radio" checked={flag === 0} onChange={() => setFlag(0)} /> 워크/베이스 기준
        </label>
        <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer">
          <input type="radio" checked={flag === 2} onChange={() => setFlag(2)} /> 툴 기준
        </label>
      </div>
      <div className="flex gap-2">
        <button onClick={enable} className="px-3 py-1.5 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 rounded-lg text-xs">
          적용 시작
        </button>
        <button onClick={disable} className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-xs">
          해제
        </button>
      </div>
    </div>
  );
};

// 4. 세이프티 정지 상태 / DO 상태 조회 + 소프트 정지·재개
const SafetyIOTools: React.FC = () => {
  const { show: showAlert } = useAlert();
  const [status, setStatus] = useState<{ si0?: number; si1?: number; doH?: number; doL?: number; toolDo?: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const refresh = async () => {
    setLoading(true);
    try {
      const [safety, doState, toolDo] = await Promise.all([getSafetyStopState(), getControlBoxDOState(), getToolDOState()]);
      const failures: string[] = [];
      if (!isOk(safety)) failures.push('세이프티 정지');
      if (!isOk(doState)) failures.push('컨트롤박스 DO');
      if (!isOk(toolDo)) failures.push('툴 DO');
      setStatus({
        si0: safety?.data?.si0, si1: safety?.data?.si1,
        doH: doState?.data?.do_state_h, doL: doState?.data?.do_state_l,
        toolDo: toolDo?.data?.do_state,
      });
      if (failures.length > 0) {
        showAlert(`일부 조회 실패: ${failures.join(', ')}`, { type: 'error' });
      }
    } catch (e) {
      showAlert('상태 조회 실패: ' + errorMessage(e, '알 수 없는 오류'), { type: 'error' });
    } finally {
      setLoading(false);
    }
  };
  const pause = async () => {
    try {
      const r = await pauseRobotMotion();
      if (!isOk(r)) {
        showAlert('정지 실패: ' + responseMessage(r, 'SDK 오류'), { type: 'error' });
        return;
      }
      showAlert('일시 정지됨', { type: 'success' });
    } catch (e) {
      showAlert('정지 실패: ' + errorMessage(e, '알 수 없는 오류'), { type: 'error' });
    }
  };
  const resume = async () => {
    try {
      const r = await resumeRobotMotion();
      if (!isOk(r)) {
        showAlert('재개 실패: ' + responseMessage(r, 'SDK 오류'), { type: 'error' });
        return;
      }
      showAlert('재개됨', { type: 'success' });
    } catch (e) {
      showAlert('재개 실패: ' + errorMessage(e, '알 수 없는 오류'), { type: 'error' });
    }
  };
  const toBits = (v?: number) => (v == null ? '-' : v.toString(2).padStart(8, '0'));
  return (
    <div className="bg-gray-800/50 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-yellow-400" />
          <span className="text-white font-medium">세이프티 / DO 상태</span>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-white text-xs flex items-center gap-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> 새로고침
        </button>
      </div>
      {status && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-gray-900/50 rounded-lg p-2">
            <span className="text-gray-500">세이프티 정지 SI0/SI1</span>
            <div className="text-white font-mono">{status.si0 ?? '-'} / {status.si1 ?? '-'}</div>
          </div>
          <div className="bg-gray-900/50 rounded-lg p-2">
            <span className="text-gray-500">컨트롤박스 DO (H/L)</span>
            <div className="text-white font-mono">{toBits(status.doH)} / {toBits(status.doL)}</div>
          </div>
          <div className="bg-gray-900/50 rounded-lg p-2 col-span-2">
            <span className="text-gray-500">툴 DO</span>
            <div className="text-white font-mono">{toBits(status.toolDo)}</div>
          </div>
        </div>
      )}
      <div className="flex gap-2 pt-1 border-t border-gray-700/50">
        <button onClick={pause} className="flex-1 px-3 py-2 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 rounded-lg text-xs flex items-center justify-center gap-1.5">
          <PauseCircle className="w-4 h-4" /> 일시 정지
        </button>
        <button onClick={resume} className="flex-1 px-3 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg text-xs flex items-center justify-center gap-1.5">
          <PlayCircle className="w-4 h-4" /> 재개
        </button>
      </div>
      <p className="text-gray-500 text-xs">비상정지보다 부드럽게 감속 정지하며, 재개 시 이어서 동작합니다. 용접 중(아크 On)에는 아크가 꺼지지 않으니 사용하지 마세요. AO(아날로그 출력)는 SDK 리드백이 없어 표시하지 않습니다.</p>
    </div>
  );
};

// 6. 상대이동(PTP/LIN) - 저장된 포인트 없이 현재 위치 기준으로 즉시 미세 조정
const STEP_OPTIONS = [1, 5, 10, 50];
const JOINT_LABELS = ['J1', 'J2', 'J3', 'J4', 'J5', 'J6'];
const RelativeMoveTools: React.FC = () => {
  const { show: showAlert } = useAlert();
  const [step, setStep] = useState(5);
  const [busy, setBusy] = useState(false);
  const moveLinear = async (axis: 'x' | 'y' | 'z', dir: 1 | -1) => {
    if (busy) return;
    setBusy(true);
    try {
      const delta: Partial<CoordValues> = {};
      delta[axis] = dir * step;
      const r = await relativeMoveL(delta, 3, 0, 20);
      if (!isOk(r)) {
        showAlert('이동 실패: ' + responseMessage(r, 'SDK 오류'), { type: 'error' });
      }
    } catch (e) {
      showAlert('이동 실패: ' + errorMessage(e, '알 수 없는 오류'), { type: 'error' });
    } finally {
      setBusy(false);
    }
  };
  const moveJoint = async (jointIndex: number, dir: 1 | -1) => {
    if (busy) return;
    setBusy(true);
    try {
      const deltas = [0, 0, 0, 0, 0, 0];
      deltas[jointIndex] = dir * step;
      const r = await relativeMoveJ(deltas, 3, 0, 10);
      if (!isOk(r)) {
        showAlert('이동 실패: ' + responseMessage(r, 'SDK 오류'), { type: 'error' });
      }
    } catch (e) {
      showAlert('이동 실패: ' + errorMessage(e, '알 수 없는 오류'), { type: 'error' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="bg-gray-800/50 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <RotateCw className="w-4 h-4 text-green-400" />
          <span className="text-white font-medium">상대이동 (미세조정)</span>
        </div>
        <div className="flex bg-gray-900 rounded-lg p-1">
          {STEP_OPTIONS.map(v => (
            <button
              key={v}
              onClick={() => setStep(v)}
              className={`px-2 py-1 rounded-md text-xs ${step === v ? 'bg-green-600 text-white' : 'text-gray-400'}`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
      <p className="text-gray-500 text-xs">
        현재 위치에서 직선/관절 기준으로 {step}mm(°)씩 즉시 이동합니다. 저장된 포인트를 거치지 않으므로 주변 장애물을 확인하세요.
      </p>
      <div>
        <div className="text-gray-400 text-xs mb-2">직선 이동 (mm)</div>
        <div className="flex flex-wrap gap-3">
          {(['x', 'y', 'z'] as const).map(axis => (
            <div key={axis} className="flex items-center gap-1">
              <span className="text-xs text-gray-500 uppercase w-4">{axis}</span>
              <button disabled={busy} onClick={() => moveLinear(axis, -1)} className="w-8 h-8 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded-lg text-white text-sm">-</button>
              <button disabled={busy} onClick={() => moveLinear(axis, 1)} className="w-8 h-8 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded-lg text-white text-sm">+</button>
            </div>
          ))}
        </div>
      </div>
      <div>
        <div className="text-gray-400 text-xs mb-2">관절 이동 (°)</div>
        <div className="flex flex-wrap gap-3">
          {JOINT_LABELS.map((label, i) => (
            <div key={label} className="flex items-center gap-1">
              <span className="text-xs text-gray-500 w-6">{label}</span>
              <button disabled={busy} onClick={() => moveJoint(i, -1)} className="w-8 h-8 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded-lg text-white text-sm">-</button>
              <button disabled={busy} onClick={() => moveJoint(i, 1)} className="w-8 h-8 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded-lg text-white text-sm">+</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export const RobotSdkToolsSection: React.FC = () => {
  const { isAdmin } = useGapAuth();
  if (!isAdmin) return null;
  return (
    <div className="mt-8 pt-6 border-t border-gray-700">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <Settings className="w-5 h-5 text-cyan-400" />
          로봇 SDK 도구 <span className="text-xs text-amber-400 ml-1">관리자</span>
        </h3>
      </div>
      <p className="text-gray-400 text-sm mb-4">
        펜던트에서만 확인·조작하던 좌표계/부하 값, 경로 보정, 정지·상태 확인, 미세 이동을 앱에서 직접 다룰 수 있습니다.
      </p>
      <div className="space-y-4">
        <CoordPayloadTools />
        <PointsOffsetTools />
        <SafetyIOTools />
        <RelativeMoveTools />
      </div>
    </div>
  );
};
export const RobotSdkToolsSection_RobotSdkToolsSection = RobotSdkToolsSection;
