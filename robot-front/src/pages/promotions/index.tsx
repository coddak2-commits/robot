// 관리자 승격 요청 검토 화면
import React, { useState, useEffect, useCallback } from 'react';
import { promotionApi, adminApi, PromotionRequest, PromotionStatus } from '../../lib/gapApi';
import { RequireRole } from '../../contexts/gapAuth';
import { useAlert } from '../../contexts';

const PromotionsInner: React.FC = () => {
  const { show: showAlert } = useAlert();
  const [status, setStatus] = useState<PromotionStatus>('pending');
  const [rows, setRows] = useState<PromotionRequest[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await promotionApi.list({ status });
      setRows(list);
    } catch (e: any) {
      showAlert(`조회 실패: ${e.response?.data?.detail || e.message}`, { type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [status, showAlert]);

  useEffect(() => { load(); }, [load]);

  const handleReview = async (req: PromotionRequest, action: 'approve' | 'reject') => {
    const note = window.prompt(`${action === 'approve' ? '승인' : '반려'} 메모 (선택):`) || undefined;
    try {
      await promotionApi.review(req.id, action, note);
      showAlert(`${action === 'approve' ? '승인 완료' : '반려 완료'}`, { type: 'success' });
      load();
    } catch (e: any) {
      showAlert(`실패: ${e.response?.data?.detail || e.message}`, { type: 'error' });
    }
  };

  const runDetection = async () => {
    if (!window.confirm('자동 감지 배치를 즉시 실행합니다. 계속?')) return;
    try {
      await adminApi.runPromotionDetection();
      showAlert('감지 배치 실행 요청 완료 (몇 초 후 재조회)', { type: 'success' });
      setTimeout(load, 2000);
    } catch (e: any) {
      showAlert(`실행 실패: ${e.response?.data?.detail || e.message}`, { type: 'error' });
    }
  };

  return (
    <div style={{ padding: 24, color: '#fff' }}>
      <h2 style={{ marginBottom: 20 }}>파라미터 승격 요청 관리 (관리자)</h2>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
        <label>상태:</label>
        <select value={status} onChange={e => setStatus(e.target.value as PromotionStatus)} style={{ padding: 6, background: '#222', color: '#fff', border: '1px solid #555', borderRadius: 4 }}>
          <option value="pending">대기</option>
          <option value="approved">승인됨</option>
          <option value="rejected">반려됨</option>
          <option value="superseded">폐기</option>
        </select>
        <button onClick={load} style={{ padding: '6px 14px', background: '#333', color: '#fff', border: '1px solid #555', borderRadius: 4, cursor: 'pointer' }}>새로고침</button>
        <button onClick={runDetection} style={{ padding: '6px 14px', background: '#a70', color: '#fff', border: 'none' }}>
          지금 감지 실행
        </button>
      </div>

      {loading && <div>로딩 중...</div>}

      {rows.length === 0 && !loading && (
        <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>
          해당 상태의 요청 없음
        </div>
      )}

      {rows.map(r => {
        const diff = ((r.requested_value - r.current_value) / r.current_value) * 100;
        return (
          <div key={r.id} style={{
            padding: 16, marginBottom: 12, background: '#1a1a1a', borderRadius: 6, border: '1px solid #333',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div>
                <strong>요청 #{r.id}</strong>
                <span style={{ marginLeft: 12, padding: '2px 8px', background: '#333', borderRadius: 4, fontSize: 12 }}>
                  {r.trigger_type}
                </span>
                <span style={{ marginLeft: 8, fontSize: 12, color: '#888' }}>
                  {new Date(r.created_at).toLocaleString('ko-KR')}
                </span>
              </div>
              <div>
                {r.status === 'pending' ? (
                  <>
                    <button onClick={() => handleReview(r, 'approve')} style={{ padding: '6px 14px', background: '#0a5', color: '#fff', border: 'none', marginRight: 6 }}>
                      승인
                    </button>
                    <button onClick={() => handleReview(r, 'reject')} style={{ padding: '6px 14px', background: '#a30', color: '#fff', border: 'none' }}>
                      반려
                    </button>
                  </>
                ) : (
                  <span style={{ padding: '4px 10px', background: r.status === 'approved' ? '#0a5' : '#a30', borderRadius: 4 }}>
                    {r.status}
                  </span>
                )}
              </div>
            </div>

            <div style={{ marginBottom: 8, color: '#ccc' }}>
              조건: <strong>{r.posture} / Gap {r.gap_mm}mm / {r.thickness_mm}mm / {r.material} / {r.joint_type}</strong>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, padding: 12, background: '#111', borderRadius: 4 }}>
              <div>
                <div style={{ fontSize: 11, color: '#888' }}>대상 필드</div>
                <div style={{ fontSize: 18 }}>{r.field_name}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#888' }}>현재값 → 요청값</div>
                <div style={{ fontSize: 18 }}>
                  {r.current_value} → <strong style={{ color: diff > 0 ? '#f96' : '#6bf' }}>{r.requested_value}</strong>
                  {' '}<span style={{ fontSize: 12, color: '#888' }}>({diff > 0 ? '+' : ''}{diff.toFixed(1)}%)</span>
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#888' }}>근거</div>
                <div style={{ fontSize: 14 }}>{r.override_count}회 / σ {r.override_stddev_pct}% / 작업자 {r.operator_count}명</div>
              </div>
            </div>

            {r.reason && (
              <div style={{ marginTop: 8, fontSize: 12, color: '#aaa' }}>사유: {r.reason}</div>
            )}
            {r.reviewer_note && (
              <div style={{ marginTop: 8, fontSize: 12, color: '#ff9' }}>관리자 메모: {r.reviewer_note}</div>
            )}
          </div>
        );
      })}
    </div>
  );
};

const PromotionsPage: React.FC = () => (
  <RequireRole roles={['admin']}>
    <PromotionsInner />
  </RequireRole>
);

export default PromotionsPage;
