import axios, { InternalAxiosRequestConfig, AxiosRequestHeaders, AxiosResponse } from 'axios';
export * from './mockApi/index';
export * from './robotApi/index';
export const APP_VERSION = '0.1.219';
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
      meta: { skipErrorLog: true }
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
const apiLogger = createLogger('axios');
interface TokenData {
  accessToken: string;
  refreshToken: string;
}
interface CustomAxiosRequestConfig extends InternalAxiosRequestConfig {
  meta?: {
    startTime?: number;
    skipAuth?: boolean;
    skipErrorLog?: boolean;
  };
  _retry?: boolean;
}
const POSSIBLE_PORTS = [8080, 8000, 8001];
const STORAGE_KEY = 'api_base_url';
const getInitialBaseURL = (): string => {
  return `http://localhost:${POSSIBLE_PORTS[0]}`;
};
const api = axios.create({
  baseURL: getInitialBaseURL(),
  timeout: 60000,
});
export const emergencyApi = axios.create({
  baseURL: getInitialBaseURL(),
  timeout: 2000,
});
let isDetecting = false;
const detectBackendPort = async (): Promise<string | null> => {
  if (isDetecting) return null;
  isDetecting = true;
  for (const port of POSSIBLE_PORTS) {
    const url = `http://localhost:${port}`;
    try {
      const response = await axios.get(`${url}/system/version`, { timeout: 2000 });
      if (response.status === 200) {
        if (API_DEBUG) console.log(`[API] 백엔드 감지됨: ${url}`);
        isDetecting = false;
        return url;
      }
    } catch {
    }
  }
  isDetecting = false;
  return null;
};
export const initializeApi = async (): Promise<void> => {
  const detectedUrl = await detectBackendPort();
  if (detectedUrl) {
    api.defaults.baseURL = detectedUrl;
    emergencyApi.defaults.baseURL = detectedUrl;
    localStorage.setItem(STORAGE_KEY, detectedUrl);
    apiLogger.info('api_init', `백엔드 연결됨: ${detectedUrl}`);
  } else {
    apiLogger.warn('api_init', `백엔드 서버를 찾을 수 없습니다. 기본값 사용: ${api.defaults.baseURL}`);
  }
};
export const getApiBaseUrl = (): string => {
  return api.defaults.baseURL || getInitialBaseURL();
};
const API_DEBUG = false;
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const customConfig = config as CustomAxiosRequestConfig;
    if (API_DEBUG) {
      const fullUrl = `${customConfig.baseURL || api.defaults.baseURL}${customConfig.url}`;
      console.log(`[API 요청] ${customConfig.method?.toUpperCase()} ${fullUrl}`);
    }
    if (!customConfig.headers) {
      customConfig.headers = {} as AxiosRequestHeaders;
    }
    customConfig.meta = customConfig.meta || {};
    customConfig.meta.startTime = Date.now();
    if (customConfig.meta.skipAuth) {
      return customConfig;
    }
    const tokenStr = localStorage.getItem('token');
    if (tokenStr) {
      const tokenData: TokenData = JSON.parse(tokenStr);
      customConfig.headers.Authorization = `Bearer ${tokenData.accessToken}`;
      customConfig.headers['x-refresh-token'] = `Bearer ${tokenData.refreshToken}`;
    }
    return customConfig;
  },
  error => Promise.reject(error),
);
api.interceptors.response.use(
  (response: AxiosResponse) => {
    return response;
  },
  async error => {
    const config = error.config as CustomAxiosRequestConfig;
    if (config?._retry) {
      return Promise.reject(error);
    }
    const isNetworkError =
      error.code === 'ECONNREFUSED' ||
      error.code === 'ERR_NETWORK' ||
      error.message?.includes('Network Error') ||
      !error.response;
    const isLogRequest = config?.url?.includes('/logs');
    if (!isLogRequest && !config?.meta?.skipErrorLog) {
      const errorInfo = {
        url: config?.url || 'unknown',
        method: config?.method?.toUpperCase() || 'UNKNOWN',
        code: error.code || 'UNKNOWN',
        message: error.message || 'Unknown error',
        status: error.response?.status || null,
      };
      if (isNetworkError) {
        apiLogger.error('connection_failed', `API 연결 실패: ${errorInfo.url}`, errorInfo, {
          code: errorInfo.code,
        });
      } else if (error.response) {
        apiLogger.error('request_failed', `API 요청 실패: ${errorInfo.url} (${error.response.status})`, errorInfo, {
          code: String(error.response.status),
        });
      }
    }
    if (error.response?.status === 401 && !config?.url?.includes('/auth/login')) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (window.location.pathname !== '/login' && window.location.pathname !== '/') {
        window.location.href = '/login';
      }
      return Promise.reject(error);
    }
    if (isNetworkError && config) {
      if (API_DEBUG) console.log('[API] 연결 실패, 포트 재감지 시도...', error.code || error.message);
      const detectedUrl = await detectBackendPort();
      if (detectedUrl && detectedUrl !== api.defaults.baseURL) {
        api.defaults.baseURL = detectedUrl;
        localStorage.setItem(STORAGE_KEY, detectedUrl);
        apiLogger.info('port_changed', `새 포트로 재설정: ${detectedUrl}`);
        config._retry = true;
        config.baseURL = detectedUrl;
        return api.request(config);
      }
    }
    return Promise.reject(error);
  },
);
initializeApi();
export const Axios = api;
