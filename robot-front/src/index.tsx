import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import Modal from 'react-modal';
import './index.css';
import './styles/global.css';
import './styles/dark.css';
import './styles/white.css';
import { initDevDebugHelper, initAuditOverlay } from './utils';
import Router from './router';
import { LoadingPage_LoadingPage as LoadingPage } from './components';
import { AlertProvider, UpdaterProvider, useUpdaterContext, ThemeProvider, LangProvider } from './contexts';
import { GapAuthProvider } from './contexts/gapAuth';
import { AlertModal_AlertModal as AlertModal, ErrorBoundary_ErrorBoundary as ErrorBoundary, NetworkStatusBanner_NetworkStatusBanner as NetworkStatusBanner, UpdateDialog_UpdateDialog as UpdateDialog } from './components/common';
import { ReportHandler } from 'web-vitals';
initDevDebugHelper();
initAuditOverlay();
const rootElement = document.getElementById('root');
Modal.setAppElement('#root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
function GlobalUpdateDialog() {
  const updater = useUpdaterContext();
  return (
    <UpdateDialog
      status={updater.status}
      currentVersion={updater.currentVersion}
      onStart={() => {
        if (updater.status.kind === 'available' || updater.status.kind === 'pending') {
          updater.startUpdate(updater.status.release);
        }
      }}
      onDismiss={updater.dismiss}
    />
  );
}
function AppInner() {
  const [isLoading, setIsLoading] = useState(true);
  useEffect(() => {
    if (sessionStorage.getItem('loading')) {
      setIsLoading(false);
      return;
    }
    const timer = setTimeout(() => {
      setIsLoading(false);
      sessionStorage.setItem('loading', 'true');
    }, 5000);
    return () => clearTimeout(timer);
  }, []);
  return (
    <>
      {isLoading ? (
        <LoadingPage />
      ) : (
        <AlertProvider>
          <GapAuthProvider>
            <NetworkStatusBanner />
            <Router />
            <AlertModal />
          </GapAuthProvider>
        </AlertProvider>
      )}
      {}
      <GlobalUpdateDialog />
    </>
  );
}
function App() {
  return (
    <ThemeProvider>
      <LangProvider>
        <ErrorBoundary name="App">
          <UpdaterProvider>
            <AppInner />
          </UpdaterProvider>
        </ErrorBoundary>
      </LangProvider>
    </ThemeProvider>
  );
}
export const App_App = App;
const reportWebVitals = (onPerfEntry?: ReportHandler): void => {
  if (onPerfEntry && onPerfEntry instanceof Function) {
    import('web-vitals').then(({ getCLS, getFID, getFCP, getLCP, getTTFB }) => {
      getCLS(onPerfEntry);
      getFID(onPerfEntry);
      getFCP(onPerfEntry);
      getLCP(onPerfEntry);
      getTTFB(onPerfEntry);
    });
  }
};
export const ReportWebVitals = reportWebVitals;
