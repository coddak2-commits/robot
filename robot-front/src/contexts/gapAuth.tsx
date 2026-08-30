// 갭 시스템 전용 인증 컨텍스트 (기존 login과 별개)
import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { AuthUser, UserRole, loginGap } from '../lib/gapApi';

interface GapAuthContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  role: UserRole | null;
  isAdmin: boolean;
  isOperator: boolean;
  login: (username: string, password: string) => Promise<AuthUser>;
  logout: () => void;
}

const GapAuthContext = createContext<GapAuthContextType | undefined>(undefined);

export const GapAuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem('gap_user');
    const token = localStorage.getItem('gap_token');
    if (raw && token) {
      try {
        setUser(JSON.parse(raw));
      } catch {
        localStorage.removeItem('gap_user');
        localStorage.removeItem('gap_token');
      }
    }
  }, []);

  // 401 응답, 유휴 타임아웃, 다른 화면에서의 로그아웃 등 컨텍스트 밖에서
  // 토큰이 지워졌을 때도 컴포넌트 상태를 같이 비워줌
  useEffect(() => {
    const onExpired = () => setUser(null);
    window.addEventListener('gap-auth-expired', onExpired);
    return () => window.removeEventListener('gap-auth-expired', onExpired);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const u = await loginGap(username, password);
    localStorage.setItem('gap_token', u.access_token);
    localStorage.setItem('gap_user', JSON.stringify(u));
    setUser(u);
    return u;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('gap_token');
    localStorage.removeItem('gap_user');
    setUser(null);
  }, []);

  const role = user?.role ?? null;
  const value: GapAuthContextType = {
    user,
    isAuthenticated: !!user,
    role,
    isAdmin: role === 'admin',
    isOperator: role === 'admin' || role === 'operator',
    login,
    logout,
  };

  return <GapAuthContext.Provider value={value}>{children}</GapAuthContext.Provider>;
};

export const useGapAuth = (): GapAuthContextType => {
  const ctx = useContext(GapAuthContext);
  if (!ctx) throw new Error('useGapAuth must be used within GapAuthProvider');
  return ctx;
};

// 역할 기반 접근 가드 컴포넌트
interface RequireRoleProps {
  roles: UserRole[];
  children: ReactNode;
  fallback?: ReactNode;
}

export const RequireRole: React.FC<RequireRoleProps> = ({ roles, children, fallback }) => {
  const { role, isAuthenticated } = useGapAuth();
  if (!isAuthenticated) return <>{fallback ?? <div style={{ padding: 40, textAlign: 'center' }}>로그인이 필요합니다</div>}</>;
  if (!role || !roles.includes(role)) {
    return <>{fallback ?? <div style={{ padding: 40, textAlign: 'center', color: 'red' }}>접근 권한이 없습니다 (필요 권한: {roles.join(', ')})</div>}</>;
  }
  return <>{children}</>;
};
