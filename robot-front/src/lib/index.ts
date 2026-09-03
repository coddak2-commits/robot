import { Axios as api } from './http';
export * from './mockApi/index';
export * from './robotApi/index';
export {
  ROBOT_ERROR_CODES,
  ROBOT_ALARM_CODES,
  getRobotAlarmMessage,
  getErrorMessage,
  formatApiError,
  extractResultCode,
  isApiSuccess,
  saveTeachingPoint,
  getTouchSensingConfig,
  updateTouchSensingConfig,
} from './api/index';
export { Axios, emergencyApi, initializeApi, getApiBaseUrl } from './http';
export const APP_VERSION = '1.1.61';
export const AuthKey = {
  ACCESS_TOKEN: '@access',
  REFRESH_TOKEN: '@refresh',
  UID: '@uid',
};
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';
interface LogEntry {
  level: LogLevel;
  source: 'frontend' | 'backend';
  page: string;
  action: string;
  message: string;
  data?: unknown;
  duration_ms?: number;
  error_code?: string;
  error_stack?: string;
}
let logBuffer: LogEntry[] = [];
let flushTimeout: ReturnType<typeof setTimeout> | null = null;
const FLUSH_INTERVAL = 5000;
const MAX_BUFFER_SIZE = 50;
const flushLogs = async () => {
  if (logBuffer.length === 0) return;
  const logsToSend = [...logBuffer];
  logBuffer = [];
  try {
    await api.post('/logs/batch', { logs: logsToSend }, {
      meta: { skipErrorLog: true },
    } as any);
  } catch (error) {
    console.error('[Logger] 로그 전송 실패:', error);
    if (logBuffer.length < MAX_BUFFER_SIZE) {
      logBuffer = [...logsToSend.slice(0, MAX_BUFFER_SIZE - logBuffer.length), ...logBuffer];
    }
  }
};
const addToBuffer = (entry: LogEntry) => {
  logBuffer.push(entry);
  if (logBuffer.length >= MAX_BUFFER_SIZE) {
    if (flushTimeout) {
      clearTimeout(flushTimeout);
      flushTimeout = null;
    }
    flushLogs();
    return;
  }
  if (!flushTimeout) {
    flushTimeout = setTimeout(() => {
      flushTimeout = null;
      flushLogs();
    }, FLUSH_INTERVAL);
  }
};
const CONSOLE_LOG_LEVELS: LogLevel[] = ['fatal', 'error', 'warn'];
export const createLogger = (page: string) => {
  const log = (
    level: LogLevel,
    action: string,
    message: string,
    data?: unknown,
    options?: { duration_ms?: number; error_code?: string; error_stack?: string }
  ) => {
    const entry: LogEntry = {
      level,
      source: 'frontend',
      page,
      action,
      message,
      data,
      ...options,
    };
    if (CONSOLE_LOG_LEVELS.includes(level)) {
      const consoleMethod = (level === 'fatal' || level === 'error') ? console.error : console.warn;
      const timestamp = new Date().toISOString();
      if (data) {
        consoleMethod(`[${timestamp}] [${page}] ${action}: ${message}`, data);
      } else {
        consoleMethod(`[${timestamp}] [${page}] ${action}: ${message}`);
      }
    }
    addToBuffer(entry);
  };
  return {
    debug: (action: string, message: string, data?: unknown) => log('debug', action, message, data),
    info: (action: string, message: string, data?: unknown) => log('info', action, message, data),
    warn: (action: string, message: string, data?: unknown) => log('warn', action, message, data),
    error: (action: string, message: string, data?: unknown, errorInfo?: { code?: string; stack?: string }) =>
      log('error', action, message, data, { error_code: errorInfo?.code, error_stack: errorInfo?.stack }),
    fatal: (action: string, message: string, data?: unknown, errorInfo?: { code?: string; stack?: string }) =>
      log('fatal', action, message, data, { error_code: errorInfo?.code, error_stack: errorInfo?.stack }),
    robotCommError: (operation: string, resultCode: number, details?: unknown) =>
      log('error', 'robot_comm_error', `로봇 통신 실패 [${operation}] code=${resultCode}`, {
        operation,
        result_code: resultCode,
        details,
      }, { error_code: `ROBOT_${resultCode}` }),
    weldStep: (
      step: string,
      status: 'start' | 'success' | 'fail',
      data?: unknown,
      errorInfo?: { code?: string; stack?: string }
    ) => {
      const lvl: LogLevel = status === 'fail' ? 'error' : status === 'start' ? 'info' : 'info';
      log(lvl, `weld_step_${status}`, `용접 단계 [${step}] ${status}`, data,
        status === 'fail' ? { error_code: errorInfo?.code, error_stack: errorInfo?.stack } : undefined);
    },
    startTimer: () => {
      const startTime = performance.now();
      return {
        end: (action: string, message: string, data?: unknown, level: LogLevel = 'info') => {
          const duration_ms = performance.now() - startTime;
          log(level, action, message, data, { duration_ms });
          return duration_ms;
        },
        endError: (action: string, message: string, data?: unknown, errorInfo?: { code?: string; stack?: string }) => {
          const duration_ms = performance.now() - startTime;
          log('error', action, message, data, {
            duration_ms,
            error_code: errorInfo?.code,
            error_stack: errorInfo?.stack
          });
          return duration_ms;
        },
      };
    },
  };
};
export const flushLogsImmediately = async () => {
  if (flushTimeout) {
    clearTimeout(flushTimeout);
    flushTimeout = null;
  }
  await flushLogs();
};
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (logBuffer.length > 0) {
      const data = JSON.stringify({ logs: logBuffer });
      navigator.sendBeacon('/api/logs/batch', data);
    }
  });
}
export const logger = createLogger('App');
export const Logger = logger;
