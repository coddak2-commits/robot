import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { useUpdater, UseUpdaterReturn } from '../hooks';
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
    setAlertState({
      isOpen: true,
      message,
      title: options?.title || '알림',
      type: options?.type || 'info',
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
  const updater = useUpdater({ disableAutoCheck: true });
  return <UpdaterContext.Provider value={updater}>{children}</UpdaterContext.Provider>;
}
export function useUpdaterContext(): UseUpdaterReturn {
  const ctx = useContext(UpdaterContext);
  if (!ctx) {
    throw new Error('useUpdaterContext must be used within UpdaterProvider');
  }
  return ctx;
}
