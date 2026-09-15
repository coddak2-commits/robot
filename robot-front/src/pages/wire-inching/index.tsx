// 와이어 인칭 수동 제어 화면
//
// 송급 로직은 lib/wireFeed.ts 공용 모듈을 쓴다 (v1.1.136 통합).
// 이 파일에는 화면 구성만 남긴다 — 송급 속도/정지 재시도를 여기서 따로 정의하지 말 것.

import React, { useState } from 'react';
import { pulseWireFeed, stopAllWireFeed, wireFeedDurationMs, WIRE_FEED_SPEED_MM_PER_SEC, WIRE_STOP_FAILED_MESSAGE } from '../../lib';
import { RequireRole } from '../../contexts/gapAuth';
import { useAlert } from '../../contexts';

const TARGET_STICKOUT_MM = 25;

const STEP_OPTIONS = [1.0, 2.5, 5.0];

const WireInchingInner: React.FC = () => {
  const { show: showAlert } = useAlert();
  const [stepMm, setStepMm] = useState<number>(1.0);
  const [ioType] = useState<number>(0);
  const [busy, setBusy] = useState(false);
  const [lastAction, setLastAction] = useState<string>('');

  const startStop = async (direction: 'forward' | 'reverse', amountMm: number) => {
    const label = direction === 'forward' ? '밀기' : '당기기';
    setBusy(true);
    setLastAction(`${direction === 'forward' ? '▶' : '◀'} ${label} ${amountMm}mm 진행 중 (${wireFeedDurationMs(amountMm)}ms)...`);
    const result = await pulseWireFeed(direction, amountMm, ioType);
    if (result.ok) {
      setLastAction(`✓ ${label} ${amountMm}mm 완료`);
    } else if (!result.stopped) {
      showAlert(WIRE_STOP_FAILED_MESSAGE, { type: 'error' });
      setLastAction('✗ 정지 실패');
    } else {
      showAlert(`실패: ${result.error ?? '송급 시작 실패'}`, { type: 'error' });
      setLastAction('✗ 실패');
    }
    setBusy(false);
  };

  const emergencyStop = async () => {
    if (await stopAllWireFeed(ioType)) {
      setLastAction('■ 정지됨');
    } else {
      showAlert(WIRE_STOP_FAILED_MESSAGE, { type: 'error' });
      setLastAction('✗ 정지 실패');
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 700, margin: '0 auto', color: '#fff' }}>
      <h2 style={{ marginBottom: 8 }}>와이어 인칭 수동 제어</h2>
      <div style={{ marginBottom: 16, fontSize: 14, color: '#aaa' }}>
        목표 스틱아웃: <strong style={{ color: '#fff' }}>{TARGET_STICKOUT_MM}mm</strong>
        {' '} · 기본 송급 속도: {WIRE_FEED_SPEED_MM_PER_SEC}mm/s
      </div>

<div style={{ marginBottom: 20 }}>
        <label style={{ display: 'block', marginBottom: 6, fontSize: 14 }}>1회 조작량 (mm)</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {STEP_OPTIONS.map(v => (
            <button
              key={v}
              onClick={() => setStepMm(v)}
              disabled={busy}
              style={{
                padding: '10px 20px',
                background: stepMm === v ? '#2b7ae6' : '#333',
                color: '#fff',
                border: '1px solid #555',
                borderRadius: 4,
                cursor: busy ? 'not-allowed' : 'pointer',
                minWidth: 80,
                fontSize: 15,
                fontWeight: stepMm === v ? 'bold' : 'normal',
              }}
            >
              {v}mm
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
        <button
          onClick={() => startStop('reverse', stepMm)}
          disabled={busy}
          style={{
            padding: 24, fontSize: 20, fontWeight: 'bold',
            background: busy ? '#555' : '#a30',
            color: '#fff', border: 'none', borderRadius: 8,
            cursor: busy ? 'wait' : 'pointer',
          }}
        >
          ◀ 당기기 (-{stepMm}mm)
        </button>
        <button
          onClick={() => startStop('forward', stepMm)}
          disabled={busy}
          style={{
            padding: 24, fontSize: 20, fontWeight: 'bold',
            background: busy ? '#555' : '#0a5',
            color: '#fff', border: 'none', borderRadius: 8,
            cursor: busy ? 'wait' : 'pointer',
          }}
        >
          밀기 (+{stepMm}mm) ▶
        </button>
      </div>

      <button
        onClick={emergencyStop}
        style={{
          width: '100%', padding: 14, fontSize: 16, fontWeight: 'bold',
          background: '#600', color: '#fff', border: 'none', borderRadius: 6,
          cursor: 'pointer',
        }}
      >
        ■ 즉시 정지
      </button>

      {lastAction && (
        <div style={{
          marginTop: 20, padding: 12, background: '#222',
          borderRadius: 4, fontSize: 14, color: '#8f8',
          border: '1px solid #444',
        }}>
          {lastAction}
        </div>
      )}

      <div style={{ marginTop: 30, padding: 16, background: '#1a1a1a', borderRadius: 6, fontSize: 13, color: '#aaa' }}>
        <strong style={{ color: '#fff' }}>동작 방식:</strong>
        <ul style={{ marginTop: 8, paddingLeft: 20 }}>
          <li>모터 시작 → 목표 시간만큼 대기 → 모터 정지 (시간 = 길이 ÷ 송급 속도)</li>
          <li>실제 밀린/당겨진 길이는 피더 성능에 따라 오차 있음</li>
          <li>정확한 스틱아웃은 자로 측정하며 조정 권장</li>
          <li>자동 25mm 세팅은 LiDAR 도입 후 가능 (향후)</li>
        </ul>
      </div>
    </div>
  );
};

const WireInchingPage: React.FC = () => (
  <RequireRole roles={['admin', 'operator']}>
    <WireInchingInner />
  </RequireRole>
);

export default WireInchingPage;
