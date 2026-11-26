// [v1.1.286] 수평 2패스 체크박스 + 2패스 조건 팝업 (펜던트·용접부 선택 화면 공용)
// 체크하면 팝업이 뜬다. 체크된 상태에서는 옆의 요약 버튼으로 다시 연다.
// 값을 비우면 1패스 값을 그대로 쓴다(위치 오프셋은 비울 수 없음). DB 에 저장하지 않는다.
// [v1.1.320] 왼쪽/오른쪽 수평을 탭으로 나눠 따로 입력한다. 위빙 종류도 2패스만 바꿀 수 있다.
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { SecondPassSettings, SecondPassSideSettings, DEFAULT_SECOND_PASS_SIDE, WEAVING_TYPE_OPTIONS } from '..';

type FieldKey = Exclude<keyof SecondPassSideSettings, 'weavingType'>;
type Side = 'left' | 'right';
const SIDE_LABEL: Record<Side, string> = { left: '왼쪽 수평 (P4~P6)', right: '오른쪽 수평 (P10~P12)' };

const FIELDS: { key: FieldKey; label: string; unit: string; min: number; max: number; nullable: boolean }[] = [
  // [v1.1.321] 바닥과 앞판 사이 45도 방향으로 떨어지는 거리
  // [v1.1.322] 음수 허용: 같은 45도 선을 따라 아래(루트) 쪽으로 (사용자 요청 2026-11-26, 0 에서도 아래가 안 덮임)
  { key: 'offsetZ', label: '위치 (45도 방향)', unit: 'mm', min: -10, max: 10, nullable: false },
  // [v1.1.325] 토치를 위로만 올림(자세 그대로). 와이어가 올린 만큼 더 남는다
  { key: 'liftZ', label: '높이 (위로)', unit: 'mm', min: 0, max: 10, nullable: false },
  { key: 'current', label: '전류', unit: 'A', min: 50, max: 500, nullable: true },
  { key: 'voltage', label: '전압', unit: 'V', min: 10, max: 50, nullable: true },
  { key: 'speed', label: '속도', unit: 'cpm', min: 5, max: 100, nullable: true },
  { key: 'weaveRange', label: '위빙 폭', unit: 'mm', min: 0, max: 20, nullable: true },
  { key: 'weaveFreq', label: '위빙 주파수', unit: 'Hz', min: 0.1, max: 10, nullable: true },
  // [v1.1.290] 왼쪽 수평 기준. 오른쪽 수평은 좌우를 바꿔 넣음
  { key: 'weaveLeftStay', label: '좌 체류', unit: 'ms', min: 0, max: 2000, nullable: true },
  { key: 'weaveRightStay', label: '우 체류', unit: 'ms', min: 0, max: 2000, nullable: true },
];

const summarizeSide = (s: SecondPassSideSettings): string => {
  const parts: string[] = [];
  if (s.current !== null) parts.push(`${s.current}A`);
  if (s.voltage !== null) parts.push(`${s.voltage}V`);
  if (s.speed !== null) parts.push(`${s.speed}cpm`);
  if (s.weavingType !== null)
    parts.push(WEAVING_TYPE_OPTIONS.find(o => o.value === s.weavingType)?.label ?? s.weavingType);
  if (s.weaveRange !== null) parts.push(`위빙 ${s.weaveRange}mm`);
  if (s.weaveFreq !== null) parts.push(`${s.weaveFreq}Hz`);
  if (s.weaveLeftStay !== null || s.weaveRightStay !== null)
    parts.push(`체류 ${s.weaveLeftStay ?? '-'}/${s.weaveRightStay ?? '-'}`);
  const lift = Number.isFinite(s.liftZ) && s.liftZ > 0 ? ` · 높이 ${s.liftZ}mm` : '';
  return `45° ${s.offsetZ}mm${lift} · ${parts.length ? parts.join('/') : '1패스 조건'}`;
};

export const summarizeSecondPass = (s: SecondPassSettings): string =>
  `왼 ${summarizeSide(s.left)}\n오 ${summarizeSide(s.right)}`;

interface TwoPassControlProps {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  settings: SecondPassSettings;
  onSettingsChange: (settings: SecondPassSettings) => void;
  disabled?: boolean;
}

export const TwoPassControl: React.FC<TwoPassControlProps> = ({
  enabled,
  onEnabledChange,
  settings,
  onSettingsChange,
  disabled = false,
}) => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<SecondPassSettings>(settings);
  const [side, setSide] = useState<Side>('left');
  const [activeKey, setActiveKey] = useState<FieldKey>('offsetZ');
  const [buffer, setBuffer] = useState('');

  const openPopup = () => {
    setDraft(settings);
    setSide('left');
    setActiveKey('offsetZ');
    setBuffer(String(settings.left.offsetZ));
    setOpen(true);
  };

  const commitBuffer = (base: SecondPassSettings, sd: Side, key: FieldKey, text: string): SecondPassSettings => {
    const f = FIELDS.find(x => x.key === key)!;
    const cur = base[sd];
    if (text === '')
      return { ...base, [sd]: { ...cur, [key]: f.nullable ? null : DEFAULT_SECOND_PASS_SIDE[key] } };
    const n = parseFloat(text);
    if (!Number.isFinite(n)) return base;
    const v = +Math.min(f.max, Math.max(f.min, n)).toFixed(1);
    return { ...base, [sd]: { ...cur, [key]: v } };
  };

  const selectField = (key: FieldKey) => {
    const next = commitBuffer(draft, side, activeKey, buffer);
    setDraft(next);
    setActiveKey(key);
    const v = next[side][key];
    setBuffer(v === null || v === undefined ? '' : String(v));
  };

  const selectSide = (sd: Side) => {
    if (sd === side) return;
    const next = commitBuffer(draft, side, activeKey, buffer);
    setDraft(next);
    setSide(sd);
    const v = next[sd][activeKey];
    setBuffer(v === null || v === undefined ? '' : String(v));
  };

  const setWeavingType = (value: string) => {
    setDraft(d => ({ ...d, [side]: { ...d[side], weavingType: value === '' ? null : value } }));
  };

  const pressKey = (k: string) => {
    if (k === '⌫') { setBuffer(b => b.slice(0, -1)); return; }
    if (k === '±') { setBuffer(b => (b.startsWith('-') ? b.slice(1) : `-${b}`)); return; }
    if (k === '.' && buffer.includes('.')) return;
    setBuffer(b => (b === '0' && k !== '.' ? k : b + k));
  };

  const save = () => {
    onSettingsChange(commitBuffer(draft, side, activeKey, buffer));
    setOpen(false);
  };

  const btn: React.CSSProperties = {
    padding: '16px 0', fontSize: 20, fontWeight: 'bold', background: '#1e293b', color: '#fff',
    border: '1px solid #334155', borderRadius: 8, cursor: 'pointer',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{
        display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, color: '#cbd5e1',
        cursor: disabled ? 'not-allowed' : 'pointer', padding: '10px 8px',
        background: enabled ? '#14532d' : '#1e293b', borderRadius: 8, opacity: disabled ? 0.6 : 1,
      }}>
        <input type="checkbox" checked={enabled} disabled={disabled}
          onChange={e => { onEnabledChange(e.target.checked); if (e.target.checked) openPopup(); }}
          style={{ width: 22, height: 22, cursor: disabled ? 'not-allowed' : 'pointer' }} />
        수평 2패스
      </label>
      {enabled && (
        <button onClick={openPopup} disabled={disabled}
          style={{
            padding: '8px 6px', fontSize: 12, fontWeight: 'bold', color: '#bbf7d0', background: '#0f2a1a',
            border: '1px solid #166534', borderRadius: 6, cursor: disabled ? 'not-allowed' : 'pointer', textAlign: 'center',
            whiteSpace: 'pre-line',
          }}
        >{summarizeSecondPass(settings)}</button>
      )}

      {/* [v1.1.287] 펜던트 실행 도크는 transform·overflow 가 걸려 있어 그 안의 fixed 팝업이
          도크 폭(약 180px)에 갇혀 그려졌다. body 로 portal 해서 화면 전체에 그린다. */}
      {open && createPortal(
        <div onClick={() => setOpen(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#0f172a', border: '1px solid #334155', borderRadius: 14, color: '#fff',
            padding: 16, width: 'min(560px, 94vw)', maxHeight: '92vh', overflowY: 'auto',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>수평 2패스 조건</h2>
              <button onClick={() => setOpen(false)} style={{ background: 'none', color: '#94a3b8', border: 'none', fontSize: 22, cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 10 }}>
              비워 두면 1패스 값을 그대로 씁니다. 화면을 새로 열면 초기화됩니다.<br />
              체류는 양쪽 모두 왼쪽 수평(P4~P6) 기준으로 입력하고, 오른쪽 수평은 좌우를 바꿔 넣습니다.<br />
              위치에 - 를 넣으면 같은 45도 선을 따라 아래(루트) 쪽으로 옮깁니다.<br />
              높이는 토치 자세 그대로 위로만 올립니다. 올린 만큼 와이어가 더 남습니다.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
              {(['left', 'right'] as Side[]).map(sd => (
                <button key={sd} onClick={() => selectSide(sd)}
                  style={{
                    padding: '10px 0', fontSize: 15, fontWeight: 'bold', color: '#fff', cursor: 'pointer',
                    background: side === sd ? '#166534' : '#1e293b',
                    border: `1px solid ${side === sd ? '#4ade80' : '#334155'}`, borderRadius: 8,
                  }}
                >{SIDE_LABEL[sd]}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {FIELDS.map(f => {
                  const isActive = f.key === activeKey;
                  const stored = draft[side][f.key];
                  const value = isActive ? buffer : (stored === null || stored === undefined ? '' : String(stored));
                  return (
                    <button key={f.key} onClick={() => selectField(f.key)}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '10px 10px', fontSize: 15, color: '#fff', cursor: 'pointer',
                        background: isActive ? '#1d4ed8' : '#1e293b',
                        border: `1px solid ${isActive ? '#60a5fa' : '#334155'}`, borderRadius: 8,
                      }}
                    >
                      <span>{f.label}</span>
                      <span style={{ fontWeight: 'bold', color: value === '' ? '#94a3b8' : '#fff' }}>
                        {value === '' ? (f.nullable ? '1패스와 같음' : '-') : `${value} ${f.unit}`}
                      </span>
                    </button>
                  );
                })}
                <label style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
                  padding: '6px 10px', fontSize: 15, background: '#1e293b', border: '1px solid #334155', borderRadius: 8,
                }}>
                  <span>위빙 종류</span>
                  <select value={draft[side].weavingType ?? ''} onChange={e => setWeavingType(e.target.value)}
                    style={{ fontSize: 15, padding: '6px 4px', background: '#0f172a', color: '#fff', border: '1px solid #475569', borderRadius: 6 }}>
                    <option value="">1패스와 같음</option>
                    {WEAVING_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>
              </div>
              <div style={{ width: 210, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'].map(k => (
                    <button key={k} onClick={() => pressKey(k)} style={btn}>{k}</button>
                  ))}
                </div>
                {activeKey === 'offsetZ' && (
                  <button onClick={() => pressKey('±')}
                    style={{ ...btn, fontSize: 16, padding: '10px 0', background: '#334155' }}
                  >± (부호 바꾸기)</button>
                )}
                <button onClick={() => setBuffer('')}
                  style={{ ...btn, fontSize: 14, padding: '10px 0', background: '#334155' }}
                >{FIELDS.find(f => f.key === activeKey)?.nullable ? '비우기 (1패스와 같음)' : `기본값 (${DEFAULT_SECOND_PASS_SIDE[activeKey]}mm)`}</button>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 14 }}>
              <button onClick={() => setOpen(false)}
                style={{ padding: 12, fontSize: 15, background: '#334155', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}
              >취소</button>
              <button onClick={save}
                style={{ padding: 12, fontSize: 15, fontWeight: 'bold', background: '#2b7ae6', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}
              >저장</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
};
