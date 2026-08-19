import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './Login.module.css';
import { login } from '../../lib';
import { useAlert } from '../../contexts';
const Login: React.FC = () => {
  const navigate = useNavigate();
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
      const user = await login(userId, userPw);
      localStorage.setItem('token', JSON.stringify(user));
      localStorage.setItem('user', JSON.stringify(user));
      navigate('/menu');
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
