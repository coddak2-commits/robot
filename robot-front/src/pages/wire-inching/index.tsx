// 와이어 인칭 수동 제어 화면
// C++ Robot Core 엔드포인트 사용:
//   POST /robot_sdk/wire/forward  { ioType, wireFeed }
//   POST /robot_sdk/wire/reverse  { ioType, wireFeed }
//
// 원리: wireFeed는 모터 on/off 스위치. 특정 길이 밀려면 시작 → 시간 대기 → 정지
// ⚠ FEED_SPEED_MM_PER_SEC은 아직 실측되지 않은 값입니다. 실제 피더 속도와
//   다르면 요청한 길이의 배수만큼 과송급/과소송급될 수 있으니, 실측 전에는
//   소량(1mm)으로만 테스트하세요.

import React, { useState } from 'react';
import { Axios as api } from '../../lib';
import { RequireRole } from '../../contexts/gapAuth';
import { useAlert } from '../../contexts';

// 기본 송급 속도 (mm/s) — 미실측 placeholder 값. 실제 용접기/피더로 캘리브레이션 후 반드시 교체할 것
const FEED_SPEED_MM_PER_SEC = 1.0;

const TARGET_STICKOUT_MM = 25;

const STEP_OPTIONS = [1.0, 2.5, 5.0];

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

const WireInchingInner: React.FC = () => {
  const { show: showAlert } = useAlert();
  const [stepMm, setStepMm] = useState<number>(1.0);
  const [ioType] = useState<number>(0);
  const [busy, setBusy] = useState(false);
  const [lastAction, setLastAction] = useState<string>('');

  const startStop = async (direction: 'forward' | 'reverse', amountMm: number) => {
    setBusy(true);
    setLastAction('');
    const durationMs = Math.round((amountMm / FEED_SPEED_MM_PER_SEC) * 1000);
    try {
      // 1. 모터 시작
      await api.post(`/robot_sdk/wire/${direction}`, { ioType, wireFeed: 1 });
      setLastAction(`${direction === 'forward' ? '▶ 밀기' : '◀ 당기기'} ${amountMm}mm 진행 중 (${durationMs}ms)...`);
      // 2. 목표 시간만큼 대기
      await sleep(durationMs);
      // 3. 모터 정지
      await api.post(`/robot_sdk/wire/${direction}`, { ioType, wireFeed: 0 });
      setLastAction(`✓ ${direction === 'forward' ? '밀기' : '당기기'} ${amountMm}mm 완료`);
    } catch (e: any) {
      // 안전: 에러 나도 정지 시도
      try {
        await api.post(`/robot_sdk/wire/${direction}`, { ioType, wireFeed: 0 });
      } catch {}
      showAlert(`실패: ${e.response?.data?.detail || e.message}`, { type: 'error' });
      setLastAction(`✗ 실패`);
    } finally {
      setBusy(false);
    }
  };

  const emergencyStop = async () => {
    try {
      await api.post(`/robot_sdk/wire/forward`, { ioType, wireFeed: 0 });
      await api.post(`/robot_sdk/wire/reverse`, { ioType, wireFeed: 0 });
      setLastAction('■ 정지됨');
    } catch (e: any) {
      showAlert(`정지 실패: ${e.message}`, { type: 'error' });
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 700, margin: '0 auto', color: '#fff' }}>
      <h2 style={{ marginBottom: 8 }}>와이어 인칭 수동 제어</h2>
      <div style={{ marginBottom: 16, fontSize: 14, color: '#aaa' }}>
        목표 스틱아웃: <strong style={{ color: '#fff' }}>{TARGET_STICKOUT_MM}mm</strong>
        {' '} · 기본 송급 속도: {FEED_SPEED_MM_PER_SEC}mm/s
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
