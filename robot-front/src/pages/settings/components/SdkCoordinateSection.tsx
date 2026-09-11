import React, { useState } from 'react';
import { Compass, Box, Weight, ShieldAlert, RefreshCw, Save } from 'lucide-react';
import {
  getCurToolCoord,
  getCurWObjCoord,
  getToolCoordWithID,
  getWObjCoordWithID,
  setToolCoord,
  setWObjCoord,
  getTargetPayloadWithID,
  setLoadWeight,
  setLoadCoord,
  getSafetyStopState,
  getDOState,
  getToolDOState,
} from '../../../lib';

const inputCls =
  'w-full px-2 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:border-cyan-500 focus:outline-none disabled:opacity-50';
const smallInputCls =
  'w-full px-2 py-1.5 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm';

const AxisGrid: React.FC<{ labels: string[]; coord: number[]; onChange: (idx: number, v: number) => void }> = ({
  labels,
  coord,
  onChange,
}) => (
  <div className={`grid gap-2 ${labels.length === 6 ? 'grid-cols-3 md:grid-cols-6' : 'grid-cols-3'}`}>
    {labels.map((label, idx) => (
      <div key={label}>
        <label className="block text-gray-500 text-xs mb-1">{label}</label>
        <input
          type="number"
          step="0.01"
          value={coord[idx] ?? 0}
          onChange={e => onChange(idx, parseFloat(e.target.value) || 0)}
          className={inputCls}
        />
      </div>
    ))}
  </div>
);

const AXIS6 = ['X', 'Y', 'Z', 'Rx', 'Ry', 'Rz'];
const AXIS3 = ['X', 'Y', 'Z'];

const IdField: React.FC<{ id: number; onChange: (id: number) => void }> = ({ id, onChange }) => (
  <input
    type="number"
    min={0}
    max={14}
    value={id}
    onChange={e => onChange(parseInt(e.target.value) || 0)}
    className="w-16 px-2 py-1 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm text-center"
  />
);

const CardFooter: React.FC<{ message: string | null; saving: boolean; onSave: () => void }> = ({
  message,
  saving,
  onSave,
}) => (
  <div className="flex items-center justify-between mt-3">
    <span className="text-xs text-gray-500">{message}</span>
    <button
      onClick={onSave}
      disabled={saving}
      className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-600 rounded-lg text-white text-sm flex items-center gap-2"
    >
      <Save className="w-4 h-4" />
      {saving ? '저장 중...' : '저장'}
    </button>
  </div>
);

const ToolCoordCard: React.FC = () => {
  const [id, setId] = useState(0);
  const [coord, setCoord] = useState<number[]>([0, 0, 0, 0, 0, 0]);
  const [type, setType] = useState(0);
  const [install, setInstall] = useState(0);
  const [toolID, setToolID] = useState(0);
  const [loadNum, setLoadNum] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = async (current: boolean) => {
    setLoading(true);
    setMessage(null);
    try {
      const data = current ? await getCurToolCoord() : await getToolCoordWithID(id);
      setCoord(data.coord);
      setType(data.type ?? 0);
      setInstall(data.install ?? 0);
      setToolID(data.toolID ?? 0);
      setLoadNum(data.loadNo ?? 0);
      setMessage('조회 완료');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '조회 실패');
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await setToolCoord(id, coord, type, install, toolID, loadNum);
      setMessage('저장 완료');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-gray-800/50 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="text-white font-medium flex items-center gap-2">
          <Compass className="w-4 h-4 text-cyan-400" />
          툴 좌표계 (Tool Coord)
        </div>
        <div className="flex items-center gap-2">
          <IdField id={id} onChange={setId} />
          <button
            onClick={() => load(false)}
            disabled={loading}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-white text-xs flex items-center gap-1"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            ID 조회
          </button>
          <button
            onClick={() => load(true)}
            disabled={loading}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-white text-xs"
          >
            현재값
          </button>
        </div>
      </div>
      <AxisGrid
        labels={AXIS6}
        coord={coord}
        onChange={(idx, v) => setCoord(prev => prev.map((c, i) => (i === idx ? v : c)))}
      />
      <div className="grid grid-cols-4 gap-2 mt-3">
        <div>
          <label className="block text-gray-500 text-xs mb-1">Type</label>
          <input type="number" value={type} onChange={e => setType(parseInt(e.target.value) || 0)} className={smallInputCls} />
        </div>
        <div>
          <label className="block text-gray-500 text-xs mb-1">Install</label>
          <input type="number" value={install} onChange={e => setInstall(parseInt(e.target.value) || 0)} className={smallInputCls} />
        </div>
        <div>
          <label className="block text-gray-500 text-xs mb-1">Tool ID</label>
          <input type="number" value={toolID} onChange={e => setToolID(parseInt(e.target.value) || 0)} className={smallInputCls} />
        </div>
        <div>
          <label className="block text-gray-500 text-xs mb-1">Load No</label>
          <input type="number" value={loadNum} onChange={e => setLoadNum(parseInt(e.target.value) || 0)} className={smallInputCls} />
        </div>
      </div>
      <CardFooter message={message} saving={saving} onSave={save} />
    </div>
  );
};

const WObjCoordCard: React.FC = () => {
  const [id, setId] = useState(0);
  const [coord, setCoord] = useState<number[]>([0, 0, 0, 0, 0, 0]);
  const [refFrame, setRefFrame] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = async (current: boolean) => {
    setLoading(true);
    setMessage(null);
    try {
      const data = current ? await getCurWObjCoord() : await getWObjCoordWithID(id);
      setCoord(data.coord);
      setRefFrame(data.refFrame ?? 0);
      setMessage('조회 완료');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '조회 실패');
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await setWObjCoord(id, coord, refFrame);
      setMessage('저장 완료');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-gray-800/50 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="text-white font-medium flex items-center gap-2">
          <Box className="w-4 h-4 text-orange-400" />
          워크 좌표계 (WObj Coord)
        </div>
        <div className="flex items-center gap-2">
          <IdField id={id} onChange={setId} />
          <button
            onClick={() => load(false)}
            disabled={loading}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-white text-xs flex items-center gap-1"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            ID 조회
          </button>
          <button
            onClick={() => load(true)}
            disabled={loading}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-white text-xs"
          >
            현재값
          </button>
        </div>
      </div>
      <AxisGrid
        labels={AXIS6}
        coord={coord}
        onChange={(idx, v) => setCoord(prev => prev.map((c, i) => (i === idx ? v : c)))}
      />
      <div className="mt-3 w-32">
        <label className="block text-gray-500 text-xs mb-1">Ref Frame</label>
        <input type="number" value={refFrame} onChange={e => setRefFrame(parseInt(e.target.value) || 0)} className={smallInputCls} />
      </div>
      <CardFooter message={message} saving={saving} onSave={save} />
    </div>
  );
};

const LoadParamCard: React.FC = () => {
  const [id, setId] = useState(0);
  const [weight, setWeight] = useState(0);
  const [cog, setCog] = useState<number[]>([0, 0, 0]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const data = await getTargetPayloadWithID(id);
      setWeight(data.weight);
      setCog(data.cog);
      setMessage('조회 완료');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '조회 실패');
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await setLoadWeight(id, weight);
      await setLoadCoord(id, cog);
      setMessage('저장 완료');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-gray-800/50 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="text-white font-medium flex items-center gap-2">
          <Weight className="w-4 h-4 text-purple-400" />
          부하 파라미터 (Load)
        </div>
        <div className="flex items-center gap-2">
          <IdField id={id} onChange={setId} />
          <button
            onClick={load}
            disabled={loading}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-white text-xs flex items-center gap-1"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            조회
          </button>
        </div>
      </div>
      <div className="w-32 mb-3">
        <label className="block text-gray-500 text-xs mb-1">무게 (kg)</label>
        <input type="number" step="0.01" value={weight} onChange={e => setWeight(parseFloat(e.target.value) || 0)} className={smallInputCls} />
      </div>
      <label className="block text-gray-500 text-xs mb-1">무게중심 (COG)</label>
      <AxisGrid labels={AXIS3} coord={cog} onChange={(idx, v) => setCog(prev => prev.map((c, i) => (i === idx ? v : c)))} />
      <CardFooter message={message} saving={saving} onSave={save} />
    </div>
  );
};

const bitOn = (val: number, bit: number) => ((val >> bit) & 1) === 1;

const SafetyDoCard: React.FC = () => {
  const [safety, setSafety] = useState<{ si0_state: number; si1_state: number } | null>(null);
  const [doState, setDoState] = useState<{ do_state_h: number; do_state_l: number } | null>(null);
  const [toolDo, setToolDo] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const [s, d, t] = await Promise.all([getSafetyStopState(), getDOState(), getToolDOState()]);
      setSafety(s);
      setDoState(d);
      setToolDo(t.do_state);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '조회 실패');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gray-800/50 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-white font-medium flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-red-400" />
          세이프티 정지 / DO 상태
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-white text-xs flex items-center gap-1"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          조회
        </button>
      </div>
      {message && <p className="text-xs text-red-400 mb-2">{message}</p>}
      {safety && (
        <p className="text-sm text-gray-300 mb-1">
          SI0: <span className="font-mono">{safety.si0_state}</span> / SI1:{' '}
          <span className="font-mono">{safety.si1_state}</span>
        </p>
      )}
      {doState && (
        <p className="text-sm text-gray-300 mb-1">
          DO (0~7): {Array.from({ length: 8 }, (_, i) => (bitOn(doState.do_state_l, i) ? 1 : 0)).join(' ')}
          {'  '}DO (8~15): {Array.from({ length: 8 }, (_, i) => (bitOn(doState.do_state_h, i) ? 1 : 0)).join(' ')}
        </p>
      )}
      {toolDo !== null && (
        <p className="text-sm text-gray-300">
          Tool DO: {Array.from({ length: 2 }, (_, i) => (bitOn(toolDo, i) ? 1 : 0)).join(' ')}
        </p>
      )}
      {!safety && !doState && toolDo === null && !message && (
        <p className="text-xs text-gray-500">조회 버튼을 눌러 상태를 확인하세요.</p>
      )}
    </div>
  );
};

const SdkCoordinateSection: React.FC = () => {
  return (
    <div className="mt-8 pt-6 border-t border-gray-700">
      <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-1">
        <Compass className="w-5 h-5 text-cyan-400" />
        SDK 좌표계 / 부하 / 세이프티
      </h3>
      <p className="text-gray-400 text-sm mb-4">
        펌웨어 SDK에서 직접 조회/설정하는 값입니다. 잘못 입력 시 로봇 동작에 영향을 줄 수 있으니 신중히 다루세요.
      </p>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ToolCoordCard />
        <WObjCoordCard />
        <LoadParamCard />
        <SafetyDoCard />
      </div>
    </div>
  );
};
export const SdkCoordinateSection_SdkCoordinateSection = SdkCoordinateSection;
