import axios, { InternalAxiosRequestConfig, AxiosRequestHeaders, AxiosResponse } from 'axios';

interface CustomAxiosRequestConfig extends InternalAxiosRequestConfig {
  meta?: {
    startTime?: number;
    skipAuth?: boolean;
    skipErrorLog?: boolean;
  };
  _retry?: boolean;
}
interface TokenData {
  accessToken: string;
  refreshToken: string;
}
const POSSIBLE_PORTS = [8080, 8000, 8001];
const STORAGE_KEY = 'api_base_url';
const API_DEBUG = false;
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
emergencyApi.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const customConfig = config as CustomAxiosRequestConfig;
    if (!customConfig.headers) {
      customConfig.headers = {} as AxiosRequestHeaders;
    }
    const tokenStr = localStorage.getItem('token');
    if (tokenStr) {
      const tokenData: TokenData = JSON.parse(tokenStr);
      customConfig.headers.Authorization = `Bearer ${tokenData.accessToken}`;
    }
    return customConfig;
  },
  error => Promise.reject(error),
);
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
    } catch { /* ignore */ }
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
    console.info(`[API] 백엔드 연결됨: ${detectedUrl}`);
  } else {
    console.warn(`[API] 백엔드 서버를 찾을 수 없습니다. 기본값 사용: ${api.defaults.baseURL}`);
  }
};
export const getApiBaseUrl = (): string => {
  return api.defaults.baseURL || getInitialBaseURL();
};
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
        console.error(`[API] 연결 실패: ${errorInfo.url}`, errorInfo);
      } else if (error.response) {
        console.error(`[API] 요청 실패: ${errorInfo.url} (${error.response.status})`, errorInfo);
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
        console.info(`[API] 새 포트로 재설정: ${detectedUrl}`);
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
