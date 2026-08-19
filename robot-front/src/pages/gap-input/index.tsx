// 작업자용 갭 입력 + 파라미터 미리보기 화면
import React, { useState } from 'react';
import { paramApi, Posture, WeldingParam, ParamLookupResult } from '../../lib/gapApi';
import { RequireRole } from '../../contexts/gapAuth';
import { useAlert } from '../../contexts';

const THICKNESS_OPTIONS = [18, 20, 22, 23];
const POSTURE_OPTIONS: { value: Posture; label: string }[] = [
  { value: 'vertical', label: '수직 (3G)' },
  { value: 'horizontal', label: '수평 (2G)' },
];

const GapInputInner: React.FC = () => {
  const { show: showAlert } = useAlert();
  const [posture, setPosture] = useState<Posture>('vertical');
  const [gap, setGap] = useState<number>(2);
  const [thickness, setThickness] = useState<number>(20);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ParamLookupResult | null>(null);

  const handleLookup = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await paramApi.lookup({ posture, gap, thickness, material: 'SS400', joint: 'fillet' });
      setResult(res);
      if (res.warning) {
        showAlert(res.warning, { type: 'warning' });
      }
    } catch (e: any) {
      showAlert(`조회 실패: ${e.response?.data?.detail || e.message}`, { type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: '0 auto', color: '#fff' }}>
      <h2 style={{ marginBottom: 20 }}>갭 입력 → 파라미터 조회</h2>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 20 }}>
        <div>
          <label style={{ display: 'block', marginBottom: 4 }}>자세</label>
          <select
            value={posture}
            onChange={e => setPosture(e.target.value as Posture)}
            style={{ width: '100%', padding: 10, fontSize: 16, background: '#222', color: '#fff', border: '1px solid #555', borderRadius: 4 }}
          >
            {POSTURE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: 4 }}>갭 (mm, 0~6)</label>
          <input
            type="number"
            step={0.1}
            min={0}
            max={6}
            value={gap}
            onChange={e => setGap(parseFloat(e.target.value))}
            style={{ width: '100%', padding: 10, fontSize: 16, background: '#222', color: '#fff', border: '1px solid #555', borderRadius: 4 }}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: 4 }}>판두께 (mm)</label>
          <select
            value={thickness}
            onChange={e => setThickness(parseFloat(e.target.value))}
            style={{ width: '100%', padding: 10, fontSize: 16, background: '#222', color: '#fff', border: '1px solid #555', borderRadius: 4 }}
          >
            {THICKNESS_OPTIONS.map(t => (
              <option key={t} value={t}>{t}mm</option>
            ))}
          </select>
        </div>
      </div>

      <button
        onClick={handleLookup}
        disabled={loading}
        style={{
          width: '100%', padding: 14, fontSize: 18, fontWeight: 'bold',
          background: '#2b7ae6', color: '#fff', border: 'none', borderRadius: 6,
          cursor: loading ? 'wait' : 'pointer',
        }}
      >
        {loading ? '조회 중...' : '파라미터 조회'}
      </button>

      {result && (
        <div style={{ marginTop: 24, padding: 20, background: '#1a1a1a', borderRadius: 8, border: '1px solid #333' }}>
          <div style={{
            marginBottom: 12, padding: 8, borderRadius: 4,
            background: result.fallback_level === 1 ? '#0a5' : result.fallback_level === 2 ? '#a70' : '#a00',
          }}>
            폴백 레벨: {result.fallback_level} {result.matched ? '(정확 매치)' : '(폴백)'}
          </div>

          {result.warning && (
            <div style={{ marginBottom: 12, color: '#ff9' }}>⚠ {result.warning}</div>
          )}

          {result.param && <ParamCard param={result.param} />}

          {result.candidates && result.candidates.length > 0 && (
            <div>
              <h3>유사 조합 후보 (선택 필요):</h3>
              {result.candidates.map(c => <ParamCard key={c.id} param={c} compact />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const ParamCard: React.FC<{ param: WeldingParam; compact?: boolean }> = ({ param, compact }) => (
  <div style={{
    padding: 12, marginBottom: compact ? 6 : 12,
    background: '#222', borderRadius: 6, border: '1px solid #444',
    display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8,
  }}>
    <div><div style={{ fontSize: 11, color: '#888' }}>조건</div><div>{param.posture}/G{param.gap_mm}/{param.thickness_mm}mm</div></div>
    <div><div style={{ fontSize: 11, color: '#888' }}>전류</div><div style={{ fontSize: 20, fontWeight: 'bold' }}>{param.current_a}A</div></div>
    <div><div style={{ fontSize: 11, color: '#888' }}>전압</div><div style={{ fontSize: 20, fontWeight: 'bold' }}>{param.voltage_v}V</div></div>
    <div><div style={{ fontSize: 11, color: '#888' }}>속도</div><div style={{ fontSize: 20, fontWeight: 'bold' }}>{param.speed_cpm}cpm</div></div>
    {!compact && (
      <>
        <div><div style={{ fontSize: 11, color: '#888' }}>스틱아웃</div><div>{param.stickout_mm}mm</div></div>
        <div><div style={{ fontSize: 11, color: '#888' }}>위빙</div><div>{param.weave_enabled ? `${param.weave_freq_hz}Hz / ${param.weave_range_mm}mm` : 'OFF'}</div></div>
        <div><div style={{ fontSize: 11, color: '#888' }}>출처</div><div>{param.source}</div></div>
      </>
    )}
  </div>
);

const GapInputPage: React.FC = () => (
  <RequireRole roles={['admin', 'operator']}>
    <GapInputInner />
  </RequireRole>
);

export default GapInputPage;
