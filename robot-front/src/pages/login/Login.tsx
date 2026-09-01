import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import styles from './Login.module.css';
import { loginGap, userApi } from '../../lib/gapApi';
import { useAlert } from '../../contexts';
const Login: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = new URLSearchParams(location.search).get('redirect') || '/menu';
  const { show: showAlert } = useAlert();
  const [isLoading, setIsLoading] = useState(false);
  React.useEffect(() => {
    const previousInlineStyle = document.body.getAttribute('style') || '';
    document.body.style.background = '#000';
    document.body.style.minHeight = '100vh';
    document.body.style.display = 'flex';
    document.body.style.justifyContent = 'center';
    document.body.style.alignItems = 'center';
    return () => {
      document.body.setAttribute('style', previousInlineStyle);
    };
  }, []);
  const loginBtn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    const target = e.target as typeof e.target & {
      user_id: { value: string };
      user_pw: { value: string };
    };
    const userId = target.user_id.value;
    const userPw = target.user_pw.value;
    try {
      // 인증은 robot-back(FastAPI) 한 곳에서만 처리한다. robot-core(8080)는 이 JWT를
      // 검증만 하므로, 같은 토큰을 그대로 재사용한다(로그인 요청은 한 번만 발생).
      const gapUser = await loginGap(userId, userPw);
      localStorage.setItem('gap_token', gapUser.access_token);
      localStorage.setItem('gap_user', JSON.stringify(gapUser));
      localStorage.setItem(
        'token',
        JSON.stringify({ accessToken: gapUser.access_token, refreshToken: gapUser.access_token }),
      );
      try {
        const me = await userApi.me();
        localStorage.setItem(
          'user',
          JSON.stringify({
            id: me.id,
            username: me.username,
            name: me.full_name,
            email: me.email,
            role: me.role,
          }),
        );
      } catch (e) {
        console.warn('사용자 프로필 조회 실패 (기본 정보로 대체):', e);
        localStorage.setItem(
          'user',
          JSON.stringify({ username: gapUser.username, name: gapUser.full_name, role: gapUser.role }),
        );
      }
      window.location.href = redirectTo;
    } catch (error: any) {
      console.error('로그인 오류:', error);
      if (error.message) {
        showAlert(`로그인 실패: ${error.message}`, { type: 'error' });
      } else {
        showAlert('로그인 실패: 아이디 또는 비밀번호를 확인해주세요.', { type: 'error' });
      }
    } finally {
      setIsLoading(false);
    }
  };
  return (
    <>
      <div className={styles['login-container']}>
        <h2>로그인</h2>
        <form onSubmit={loginBtn}>
          <label htmlFor="user_id">아이디</label>
          <input
            type="text"
            id="user_id"
            name="user_id"
            placeholder="아이디를 입력하세요"
            required
            autoComplete="username"
            aria-required="true"
            style={{ minHeight: '48px', fontSize: '16px' }}
          />
          <label htmlFor="user_pw">비밀번호</label>
          <input
            type="password"
            id="user_pw"
            name="user_pw"
            placeholder="비밀번호를 입력하세요"
            required
            autoComplete="current-password"
            aria-required="true"
            style={{ minHeight: '48px', fontSize: '16px' }}
          />
          <button
            type="submit"
            disabled={isLoading}
            style={{
              minHeight: '56px',
              fontSize: '18px',
              opacity: isLoading ? 0.7 : 1,
              cursor: isLoading ? 'wait' : 'pointer',
            }}
          >
            {isLoading ? '로그인 중...' : '로그인'}
          </button>
        </form>
      </div>
    </>
  );
};
export default Login;
