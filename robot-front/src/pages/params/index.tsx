// 관리자용 파라미터 매트릭스 CRUD 화면
import React, { useState, useEffect, useCallback } from 'react';
import { paramApi, WeldingParam, WeldingParamCreate, Posture } from '../../lib/gapApi';
import { RequireRole } from '../../contexts/gapAuth';
import { useAlert } from '../../contexts';

const THICKNESS_OPTIONS = [18, 20, 22, 23];
const GAP_OPTIONS = [0, 1, 2, 3, 4, 5, 6];

const ParamsInner: React.FC = () => {
  const { show: showAlert } = useAlert();
  const [posture, setPosture] = useState<Posture>('vertical');
  const [thickness, setThickness] = useState<number>(20);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [rows, setRows] = useState<WeldingParam[]>([]);
  const [editing, setEditing] = useState<WeldingParam | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await paramApi.list({ posture, thickness, include_inactive: includeInactive });
      setRows(list);
    } catch (e: any) {
      showAlert(`목록 조회 실패: ${e.response?.data?.detail || e.message}`, { type: 'error' });
    }
  }, [posture, thickness, includeInactive, showAlert]);

  useEffect(() => { load(); }, [load]);

  const handleDeactivate = async (p: WeldingParam) => {
    const reason = window.prompt(`"${p.posture}/Gap ${p.gap_mm}/${p.thickness_mm}mm" 삭제 사유 (필수):`);
    if (!reason) return;
    try {
      await paramApi.deactivate(p.id, reason);
      showAlert('비활성 처리 완료', { type: 'success' });
      load();
    } catch (e: any) {
      showAlert(`실패: ${e.response?.data?.detail || e.message}`, { type: 'error' });
    }
  };

  const handleRestore = async (p: WeldingParam) => {
    if (!window.confirm(`복원하시겠습니까?`)) return;
    try {
      await paramApi.restore(p.id);
      showAlert('복원 완료', { type: 'success' });
      load();
    } catch (e: any) {
      showAlert(`실패: ${e.response?.data?.detail || e.message}`, { type: 'error' });
    }
  };

  return (
    <div style={{ padding: 24, color: '#fff' }}>
      <h2 style={{ marginBottom: 20 }}>파라미터 매트릭스 관리 (관리자)</h2>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <label style={{ display: 'block', fontSize: 12 }}>자세</label>
          <select value={posture} onChange={e => setPosture(e.target.value as Posture)} style={{ padding: 8, background: '#222', color: '#fff', border: '1px solid #555', borderRadius: 4 }}>
            <option value="vertical">수직 (3G)</option>
            <option value="horizontal">수평 (2G)</option>
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 12 }}>두께 (mm)</label>
          <select value={thickness} onChange={e => setThickness(parseFloat(e.target.value))} style={{ padding: 8, background: '#222', color: '#fff', border: '1px solid #555', borderRadius: 4 }}>
            {THICKNESS_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <label>
          <input type="checkbox" checked={includeInactive} onChange={e => setIncludeInactive(e.target.checked)} />
          {' '}비활성 포함
        </label>

        <button onClick={load} style={{ padding: '8px 16px', background: '#333', color: '#fff', border: '1px solid #555', borderRadius: 4, cursor: 'pointer' }}>새로고침</button>
        <button onClick={() => setCreating(true)} style={{ padding: '8px 16px', background: '#0a5', color: '#fff', border: 'none', borderRadius: 4 }}>
          + 신규 등록
        </button>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', background: '#1a1a1a' }}>
        <thead>
          <tr style={{ background: '#333' }}>
            <th style={cellStyle}>Gap</th>
            <th style={cellStyle}>전류(A)</th>
            <th style={cellStyle}>전압(V)</th>
            <th style={cellStyle}>속도(cpm)</th>
            <th style={cellStyle}>스틱아웃</th>
            <th style={cellStyle}>위빙</th>
            <th style={cellStyle}>상태</th>
            <th style={cellStyle}>액션</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(p => (
            <tr key={p.id} style={{ opacity: p.active ? 1 : 0.5 }}>
              <td style={cellStyle}>{p.gap_mm}</td>
              <td style={cellStyle}>{p.current_a}</td>
              <td style={cellStyle}>{p.voltage_v}</td>
              <td style={cellStyle}>{p.speed_cpm}</td>
              <td style={cellStyle}>{p.stickout_mm}</td>
              <td style={cellStyle}>{p.weave_enabled ? `${p.weave_freq_hz}Hz/${p.weave_range_mm}mm` : 'OFF'}</td>
              <td style={cellStyle}>{p.active ? '활성' : '비활성'}</td>
              <td style={cellStyle}>
                {p.active ? (
                  <>
                    <button onClick={() => setEditing(p)} style={btnStyle}>편집</button>
                    <button onClick={() => handleDeactivate(p)} style={{ ...btnStyle, background: '#a30' }}>삭제</button>
                  </>
                ) : (
                  <button onClick={() => handleRestore(p)} style={{ ...btnStyle, background: '#07a' }}>복원</button>
                )}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={8} style={{ ...cellStyle, textAlign: 'center', padding: 20 }}>데이터 없음</td></tr>
          )}
        </tbody>
      </table>

      {(editing || creating) && (
        <ParamEditModal
          param={editing}
          initialPosture={posture}
          initialThickness={thickness}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSaved={() => { setEditing(null); setCreating(false); load(); }}
        />
      )}
    </div>
  );
};

const cellStyle: React.CSSProperties = { padding: '8px 12px', borderBottom: '1px solid #333', textAlign: 'left' };
const btnStyle: React.CSSProperties = { padding: '4px 10px', margin: '0 2px', border: 'none', borderRadius: 3, cursor: 'pointer', color: '#fff', background: '#555' };

// 편집/신규 모달
interface ModalProps {
  param: WeldingParam | null;
  initialPosture: Posture;
  initialThickness: number;
  onClose: () => void;
  onSaved: () => void;
}

const ParamEditModal: React.FC<ModalProps> = ({ param, initialPosture, initialThickness, onClose, onSaved }) => {
  const { show: showAlert } = useAlert();
  const [form, setForm] = useState<WeldingParamCreate>({
    posture: param?.posture ?? initialPosture,
    gap_mm: param?.gap_mm ?? 1,
    current_a: param?.current_a ?? 200,
    voltage_v: param?.voltage_v ?? 24,
    speed_cpm: param?.speed_cpm ?? 15,
    stickout_mm: param?.stickout_mm ?? 20,
    weave_enabled: param?.weave_enabled ?? true,
    weave_freq_hz: param?.weave_freq_hz ?? 1.5,
    weave_range_mm: param?.weave_range_mm ?? 3.0,
    material: 'SS400',
    thickness_mm: param?.thickness_mm ?? initialThickness,
    joint_type: 'fillet',
    notes: param?.notes ?? '',
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      if (param) {
        await paramApi.update(param.id, form);
      } else {
        await paramApi.create(form);
      }
      showAlert(param ? '수정 완료' : '등록 완료', { type: 'success' });
      onSaved();
    } catch (e: any) {
      showAlert(`저장 실패: ${e.response?.data?.detail || e.message}`, { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const update = <K extends keyof WeldingParamCreate>(key: K, value: WeldingParamCreate[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#222', padding: 24, borderRadius: 8, minWidth: 500, color: '#fff', maxHeight: '90vh', overflowY: 'auto',
      }}>
        <h3>{param ? `편집 (id=${param.id})` : '신규 등록'}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, margin: '16px 0' }}>
          <label>자세
            <select value={form.posture} onChange={e => update('posture', e.target.value as Posture)} disabled={!!param} style={{ width: '100%', padding: 6, background: '#222', color: '#fff', border: '1px solid #555', borderRadius: 4 }}>
              <option value="vertical">수직</option>
              <option value="horizontal">수평</option>
            </select>
          </label>
          <label>갭 (mm)
            <select value={form.gap_mm} onChange={e => update('gap_mm', parseFloat(e.target.value))} disabled={!!param} style={{ width: '100%', padding: 6, background: '#222', color: '#fff', border: '1px solid #555', borderRadius: 4 }}>
              {GAP_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </label>
          <label>두께 (mm)
            <select value={form.thickness_mm} onChange={e => update('thickness_mm', parseFloat(e.target.value))} disabled={!!param} style={{ width: '100%', padding: 6, background: '#222', color: '#fff', border: '1px solid #555', borderRadius: 4 }}>
              {THICKNESS_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label>전류 (A)
            <input type="number" value={form.current_a} onChange={e => update('current_a', parseInt(e.target.value))} style={{ width: '100%', padding: 6, background: '#222', color: '#fff', border: '1px solid #555', borderRadius: 4 }} />
          </label>
          <label>전압 (V)
            <input type="number" step={0.1} value={form.voltage_v} onChange={e => update('voltage_v', parseFloat(e.target.value))} style={{ width: '100%', padding: 6, background: '#222', color: '#fff', border: '1px solid #555', borderRadius: 4 }} />
          </label>
          <label>속도 (cpm)
            <input type="number" value={form.speed_cpm} onChange={e => update('speed_cpm', parseInt(e.target.value))} style={{ width: '100%', padding: 6, background: '#222', color: '#fff', border: '1px solid #555', borderRadius: 4 }} />
          </label>
          <label>스틱아웃 (mm)
            <input type="number" value={form.stickout_mm} onChange={e => update('stickout_mm', parseInt(e.target.value))} style={{ width: '100%', padding: 6, background: '#222', color: '#fff', border: '1px solid #555', borderRadius: 4 }} />
          </label>
          <label>위빙 주파수 (Hz)
            <input type="number" step={0.1} value={form.weave_freq_hz} onChange={e => update('weave_freq_hz', parseFloat(e.target.value))} style={{ width: '100%', padding: 6, background: '#222', color: '#fff', border: '1px solid #555', borderRadius: 4 }} />
          </label>
          <label>위빙 폭 (mm)
            <input type="number" step={0.1} value={form.weave_range_mm} onChange={e => update('weave_range_mm', parseFloat(e.target.value))} style={{ width: '100%', padding: 6, background: '#222', color: '#fff', border: '1px solid #555', borderRadius: 4 }} />
          </label>
          <label>
            <input type="checkbox" checked={form.weave_enabled} onChange={e => update('weave_enabled', e.target.checked)} />
            {' '}위빙 사용
          </label>
        </div>
        <label style={{ display: 'block' }}>메모
          <textarea value={form.notes || ''} onChange={e => update('notes', e.target.value)} style={{ width: '100%', padding: 6, minHeight: 60 }} />
        </label>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={onClose} style={{ padding: '8px 16px', background: '#333', color: '#fff', border: '1px solid #555', borderRadius: 4, cursor: 'pointer' }}>취소</button>
          <button onClick={save} disabled={saving} style={{ padding: '8px 16px', background: '#0a5', color: '#fff', border: 'none' }}>
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
};

const ParamsPage: React.FC = () => (
  <RequireRole roles={['admin']}>
    <ParamsInner />
  </RequireRole>
);

export default ParamsPage;
