// 갭 시스템 전용 로그인 화면 (기존 login과 별개, 새 백엔드에 붙음)
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGapAuth } from '../../contexts/gapAuth';
import { useAlert } from '../../contexts';

const GapLoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useGapAuth();
  const { show: showAlert } = useAlert();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const u = await login(username, password);
      showAlert(`${u.full_name || u.username}님 로그인`, { type: 'success' });
      navigate('/gap/params');
    } catch (e: any) {
      showAlert(`로그인 실패: ${e.response?.data?.detail || e.message}`, { type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#000' }}>
      <form onSubmit={submit} style={{
        background: '#1a1a1a', padding: 32, borderRadius: 8, minWidth: 340, color: '#fff',
      }}>
        <h2 style={{ marginBottom: 20, textAlign: 'center' }}>갭 시스템 로그인</h2>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', marginBottom: 4 }}>아이디</label>
          <input
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            required
            autoFocus
            style={{ width: '100%', padding: 10, fontSize: 16, background: '#222', color: '#fff', border: '1px solid #444', borderRadius: 4 }}
          />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', marginBottom: 4 }}>비밀번호</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            style={{ width: '100%', padding: 10, fontSize: 16, background: '#222', color: '#fff', border: '1px solid #444', borderRadius: 4 }}
          />
        </div>
        <button type="submit" disabled={loading} style={{
          width: '100%', padding: 12, fontSize: 16, background: '#2b7ae6', color: '#fff',
          border: 'none', borderRadius: 4, cursor: loading ? 'wait' : 'pointer',
        }}>
          {loading ? '로그인 중...' : '로그인'}
        </button>
      </form>
    </div>
  );
};

export default GapLoginPage;
