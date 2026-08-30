import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { useUpdater, UseUpdaterReturn } from '../hooks';
import { translations, LangCode } from '../lang';
import { isNotificationsEnabled } from '../lib/appSettings';
interface AlertState {
  isOpen: boolean;
  message: string;
  title?: string;
  type?: 'info' | 'success' | 'warning' | 'error';
  onConfirm?: () => void;
}
interface AlertContextType {
  show: (message: string, options?: Omit<AlertState, 'isOpen' | 'message'>) => void;
  hide: () => void;
  alertState: AlertState;
}
const AlertContext = createContext<AlertContextType | undefined>(undefined);
export const AlertProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [alertState, setAlertState] = useState<AlertState>({
    isOpen: false,
    message: '',
  });
  const show = useCallback((message: string, options?: Omit<AlertState, 'isOpen' | 'message'>) => {
    const type = options?.type || 'info';
    const isNonCritical = type === 'success' || type === 'info';
    if (isNonCritical && !isNotificationsEnabled()) {
      options?.onConfirm?.();
      return;
    }
    setAlertState({
      isOpen: true,
      message,
      title: options?.title || '알림',
      type,
      onConfirm: options?.onConfirm,
    });
  }, []);
  const hide = useCallback(() => {
    setAlertState(prev => ({ ...prev, isOpen: false }));
  }, []);
  return (
    <AlertContext.Provider value={{ show, hide, alertState }}>
      {children}
    </AlertContext.Provider>
  );
};
export const useAlert = (): AlertContextType => {
  const context = useContext(AlertContext);
  if (!context) {
    throw new Error('useAlert must be used within an AlertProvider');
  }
  return context;
};
export const AlertContext_AlertContext = AlertContext;
const UpdaterContext = createContext<UseUpdaterReturn | null>(null);
export function UpdaterProvider({ children }: { children: ReactNode }) {
  const updater = useUpdater();
  return <UpdaterContext.Provider value={updater}>{children}</UpdaterContext.Provider>;
}
export function useUpdaterContext(): UseUpdaterReturn {
  const ctx = useContext(UpdaterContext);
  if (!ctx) {
    throw new Error('useUpdaterContext must be used within UpdaterProvider');
  }
  return ctx;
}
export type ThemeMode = 'dark' | 'light';
const THEME_CLASS: Record<ThemeMode, string> = { dark: 'dark', light: 'white' };
const applyThemeClass = (theme: ThemeMode) => {
  document.body.classList.remove('dark', 'white');
  document.body.classList.add(THEME_CLASS[theme]);
};
interface ThemeContextType {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
}
const ThemeContext = createContext<ThemeContextType | undefined>(undefined);
export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeMode>(
    () => (localStorage.getItem('theme') as ThemeMode) || 'dark',
  );
  useEffect(() => {
    applyThemeClass(theme);
  }, [theme]);
  const setTheme = useCallback((next: ThemeMode) => {
    localStorage.setItem('theme', next);
    setThemeState(next);
  }, []);
  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
};
export const useTheme = (): ThemeContextType => {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
};
interface LangContextType {
  lang: LangCode;
  setLang: (lang: LangCode) => void;
  t: (key: string) => string;
}
const LangContext = createContext<LangContextType | undefined>(undefined);
export const LangProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<LangCode>(
    () => (localStorage.getItem('lang') as LangCode) || 'ko',
  );
  const setLang = useCallback((next: LangCode) => {
    localStorage.setItem('lang', next);
    setLangState(next);
  }, []);
  const t = useCallback(
    (key: string) => translations[lang]?.[key] ?? translations.ko[key] ?? key,
    [lang],
  );
  return <LangContext.Provider value={{ lang, setLang, t }}>{children}</LangContext.Provider>;
};
export const useLang = (): LangContextType => {
  const ctx = useContext(LangContext);
  if (!ctx) {
    throw new Error('useLang must be used within a LangProvider');
  }
  return ctx;
};
