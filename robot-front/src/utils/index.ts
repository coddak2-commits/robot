import { AxiosError } from 'axios';
import { Axios as api, createLogger } from '../lib';
const log = createLogger('apiRetry');
interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  retryServerErrors?: boolean;
}
function isNetworkError(error: AxiosError): boolean {
  return (
    !error.response &&
    (error.code === 'ECONNREFUSED' ||
      error.code === 'ERR_NETWORK' ||
      error.code === 'ECONNABORTED' ||
      error.message?.includes('Network Error') ||
      error.message?.includes('timeout'))
  );
}
function isRetryable(error: AxiosError, retryServerErrors: boolean): boolean {
  if (isNetworkError(error)) return true;
  if (retryServerErrors && error.response && error.response.status >= 500) return true;
  return false;
}
function getBackoffDelay(attempt: number, baseDelay: number, maxDelay: number): number {
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * baseDelay * 0.5;
  return Math.min(exponentialDelay + jitter, maxDelay);
}
export async function withRetry<T>(
  apiCall: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 10000,
    retryServerErrors = false,
  } = options;
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await apiCall();
    } catch (error) {
      lastError = error as Error;
      const axiosError = error as AxiosError;
      if (!isRetryable(axiosError, retryServerErrors)) {
        throw error;
      }
      if (attempt >= maxRetries) {
        log.error('retry.exhausted', `API 재시도 소진 (${maxRetries}회)`, {
          url: axiosError.config?.url,
          code: axiosError.code,
        });
        throw error;
      }
      const delay = getBackoffDelay(attempt, baseDelay, maxDelay);
      log.warn('retry.attempt', `API 재시도 ${attempt + 1}/${maxRetries} (${delay.toFixed(0)}ms 후)`, {
        url: axiosError.config?.url,
        code: axiosError.code,
      });
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}
export async function emergencyWeldingShutdown(): Promise<{
  success: boolean;
  steps: Array<{ step: string; result: number; error?: string }>;
}> {
  try {
    const response = await api.post('/api/welding/emergency-shutdown', {}, {
      timeout: 5000,
    });
    return response.data?.data ? JSON.parse(response.data.data) : response.data;
  } catch (error) {
    log.error('emergencyShutdown.failed', '비상 종료 API 호출 실패', { error: String(error) });
    return { success: false, steps: [] };
  }
}
const STORAGE_KEY = 'auditOverlayEnabled';
const ALLOWED_HOSTS = ['localhost', '127.0.0.1'];
const STYLE_ID = 'audit-overlay-style';
const PANEL_ID = 'audit-overlay-panel';
let initialized = false;
function isAllowedHost(): boolean {
  return ALLOWED_HOSTS.includes(window.location.hostname);
}
export function isAuditEnabled(): boolean {
  return localStorage.getItem(STORAGE_KEY) === 'true';
}
const OVERLAY_CSS = `
  [data-audit~="unused"] { outline: 2px dashed #ff3b30 !important; outline-offset: -2px !important; }
  [data-audit~="dup"]    { outline: 2px dashed #0a84ff !important; outline-offset: -2px !important; }
  [data-audit~="unused"][data-audit~="dup"] { outline-color: #ff9f0a !important; }
  #${PANEL_ID} { font-family: 'Consolas','Monaco',monospace; }
`;
function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = OVERLAY_CSS;
  document.head.appendChild(style);
}
function removeStyle() {
  document.getElementById(STYLE_ID)?.remove();
}
interface AuditItem {
  kind: 'unused' | 'dup' | 'both';
  note: string;
  loc: string;
}
function collectItems(): AuditItem[] {
  const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-audit]'));
  return nodes.map(el => {
    const v = (el.getAttribute('data-audit') || '').toLowerCase();
    const isUnused = v.includes('unused');
    const isDup = v.includes('dup');
    const kind: AuditItem['kind'] = isUnused && isDup ? 'both' : isDup ? 'dup' : 'unused';
    return {
      kind,
      note: el.getAttribute('data-audit-note') || '(메모 없음)',
      loc: el.getAttribute('data-audit-loc') || '(위치 미지정)',
    };
  });
}
function buildPanel() {
  removePanel();
  const items = collectItems();
  const unusedCount = items.filter(i => i.kind !== 'dup').length;
  const dupCount = items.filter(i => i.kind !== 'unused').length;
  const panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.style.cssText = `
    position: fixed; bottom: 16px; left: 16px; z-index: 100000;
    width: 360px; max-height: 60vh; overflow: auto;
    background: #14151a; color: #e6e6e6; border: 1px solid #333;
    border-radius: 10px; padding: 12px 14px; font-size: 12px; line-height: 1.5;
    box-shadow: 0 6px 24px rgba(0,0,0,0.4);
  `;
  const rows =
    items.length === 0
      ? `<div style="opacity:.6">태그된 항목이 없습니다 (data-audit 속성 추가 필요)</div>`
      : items
          .map(i => {
            const dot = i.kind === 'dup' ? '🔵' : i.kind === 'both' ? '🟠' : '🔴';
            return `<div style="padding:6px 0;border-top:1px solid #262830">
          <div>${dot} ${escapeHtml(i.note)}</div>
          <div style="opacity:.65;font-size:11px">📁 ${escapeHtml(i.loc)}</div>
        </div>`;
          })
          .join('');
  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <strong>🔍 UI 감사 오버레이</strong>
      <span>
        <button id="audit-refresh" style="${btn()}">새로고침</button>
        <button id="audit-close" style="${btn()}">닫기</button>
      </span>
    </div>
    <div style="margin-bottom:8px">
      🔴 미사용 ${unusedCount} · 🔵 중복 ${dupCount}
      <span style="opacity:.6">(🟠 둘다)</span>
    </div>
    ${rows}
  `;
  document.body.appendChild(panel);
  document.getElementById('audit-refresh')?.addEventListener('click', buildPanel);
  document.getElementById('audit-close')?.addEventListener('click', () => setAuditEnabled(false));
}
function btn(): string {
  return `background:#2a2d36;color:#ddd;border:1px solid #3a3d46;border-radius:6px;
    padding:3px 8px;margin-left:6px;cursor:pointer;font-size:11px;`;
}
function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"]/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] || c,
  );
}
function removePanel() {
  document.getElementById(PANEL_ID)?.remove();
}
export function setAuditEnabled(enabled: boolean): void {
  localStorage.setItem(STORAGE_KEY, String(enabled));
  if (enabled) {
    injectStyle();
    buildPanel();
    console.log(
      '%c[Audit] UI 감사 오버레이 ON — 🔴 미사용 / 🔵 중복',
      'color:#0a84ff;font-weight:bold',
    );
  } else {
    removeStyle();
    removePanel();
    console.log('%c[Audit] UI 감사 오버레이 OFF', 'color:#888');
  }
}
export function toggleAudit(): boolean {
  const next = !isAuditEnabled();
  setAuditEnabled(next);
  return next;
}
export function initAuditOverlay(): void {
  if (initialized) return;
  if (!isAllowedHost()) return;
  initialized = true;
  document.addEventListener('keydown', e => {
    if (e.ctrlKey && e.shiftKey && (e.key === 'A' || e.key === 'a')) {
      e.preventDefault();
      toggleAudit();
    }
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).toggleAudit = toggleAudit;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).enableAudit = () => setAuditEnabled(true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).disableAudit = () => setAuditEnabled(false);
  if (isAuditEnabled()) setAuditEnabled(true);
  console.log('%c[Audit] 준비됨 — toggleAudit() 또는 Ctrl+Shift+A', 'color:#888');
}
export const formatDateTime = (
  dateStr?: string,
  options?: {
    includeYear?: boolean;
    includeSeconds?: boolean;
  }
): string => {
  if (!dateStr) return '-';
  const formatOptions: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  };
  if (options?.includeYear) {
    formatOptions.year = 'numeric';
  }
  if (options?.includeSeconds) {
    formatOptions.second = '2-digit';
  }
  return new Date(dateStr).toLocaleString('ko-KR', formatOptions);
};
export const formatDate = (dateStr?: string): string => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};
export const formatTime = (dateStr?: string): string => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  });
};
export const formatRelativeTime = (dateStr?: string): string => {
  if (!dateStr) return '-';
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  if (diffSec < 60) return '방금 전';
  if (diffMin < 60) return `${diffMin}분 전`;
  if (diffHour < 24) return `${diffHour}시간 전`;
  if (diffDay < 7) return `${diffDay}일 전`;
  return formatDate(dateStr);
};
export interface DevDebugConfig {
  storageKey?: string;
  devOnly?: boolean;
  allowedHosts?: string[];
  formatCopyText?: (info: ElementInfo) => string;
  formatTooltip?: (info: ElementInfo) => string;
  theme?: {
    primary?: string;
    background?: string;
    text?: string;
    border?: string;
  };
}
export interface ElementInfo {
  className: string;
  filePath: string | null;
  lineNumber: string | null;
  componentName: string | null;
  tagName: string;
}
function normalizeRepoPath(p: string | null): string | null {
  if (!p) return null;
  let path = p.replace(/\\/g, '/');
  const srcIdx = path.indexOf('src/');
  if (srcIdx !== -1) path = path.substring(srcIdx);
  if (path.startsWith('src/')) path = 'robot-front/' + path;
  return path;
}
const DEFAULT_CONFIG: Required<DevDebugConfig> = {
  storageKey: 'devDebugEnabled',
  devOnly: true,
  allowedHosts: ['localhost', '127.0.0.1'],
  formatCopyText: info => {
    const path = normalizeRepoPath(info.filePath);
    const cls = info.className ? ` class="${info.className}"` : '';
    const desc = info.componentName
      ? `${info.componentName} · <${info.tagName}${cls}>`
      : `<${info.tagName}${cls}>`;
    if (path) {
      return `${path}${info.lineNumber ? `:${info.lineNumber}` : ''}\n${desc}`;
    }
    return `(위치 미상 — 운영 빌드에 data-loc 주입 필요)\n${desc}`;
  },
  formatTooltip: info => {
    const path = normalizeRepoPath(info.filePath);
    let result = '';
    if (path) {
      result += `📁 ${path}`;
      if (info.lineNumber) result += `:${info.lineNumber}`;
      result += '\n';
    } else {
      result += `📁 (위치 미상)\n`;
    }
    if (info.componentName) result += `⚛️ ${info.componentName}\n`;
    result += `🏷️ ${info.className.length > 60 ? info.className.substring(0, 60) + '...' : info.className}`;
    return result;
  },
  theme: {
    primary: '#00ff88',
    background: '#1a1a2e',
    text: '#00ff88',
    border: '#00ff88',
  },
};
let isInitialized = false;
let isActive = false;
let config: Required<DevDebugConfig> = DEFAULT_CONFIG;
let contextMenuHandler: ((e: MouseEvent) => void) | null = null;
let mouseMoveHandler: ((e: MouseEvent) => void) | null = null;
let keyDownHandler: ((e: KeyboardEvent) => void) | null = null;
let keyUpHandler: ((e: KeyboardEvent) => void) | null = null;
function attachEventListeners() {
  let ctrlPressed = false;
  keyDownHandler = (e: KeyboardEvent) => {
    if (e.key === 'Control') ctrlPressed = true;
  };
  keyUpHandler = (e: KeyboardEvent) => {
    if (e.key === 'Control') {
      ctrlPressed = false;
      hideTooltip();
    }
  };
  mouseMoveHandler = (e: MouseEvent) => {
    if (!isActive || !ctrlPressed) {
      hideTooltip();
      return;
    }
    const target = e.target as HTMLElement;
    if (!target) {
      hideTooltip();
      return;
    }
    const info = getElementInfo(target);
    if (!info) {
      hideTooltip();
      return;
    }
    const tooltipText = config.formatTooltip(info);
    showTooltip(e, `[Ctrl+우클릭: 복사]\n${tooltipText}`, config);
  };
  contextMenuHandler = (e: MouseEvent) => {
    if (!isActive || !ctrlPressed) return;
    const target = e.target as HTMLElement;
    if (!target) return;
    const info = getElementInfo(target);
    if (!info) return;
    e.preventDefault();
    const copyText = config.formatCopyText(info);
    navigator.clipboard
      .writeText(copyText)
      .then(() => {
        showCopyNotification(copyText, config);
      })
      .catch(err => {
        console.error('[DevDebug] 복사 실패:', err);
      });
  };
  document.addEventListener('keydown', keyDownHandler);
  document.addEventListener('keyup', keyUpHandler);
  document.addEventListener('mousemove', mouseMoveHandler);
  document.addEventListener('contextmenu', contextMenuHandler);
}
function detachEventListeners() {
  if (keyDownHandler) document.removeEventListener('keydown', keyDownHandler);
  if (keyUpHandler) document.removeEventListener('keyup', keyUpHandler);
  if (mouseMoveHandler) document.removeEventListener('mousemove', mouseMoveHandler);
  if (contextMenuHandler) document.removeEventListener('contextmenu', contextMenuHandler);
  removeTooltip();
}
export function isDebugEnabled(): boolean {
  return localStorage.getItem(config.storageKey) === 'true';
}
export function setDebugEnabled(enabled: boolean): void {
  localStorage.setItem(config.storageKey, enabled.toString());
  isActive = enabled;
  if (enabled) {
    console.log(
      '%c[DevDebug] 디버그 모드 활성화됨\n%c• Ctrl + 마우스 이동: 요소 정보 미리보기\n• Ctrl + 우클릭: 클립보드에 복사',
      'color: #00ff88; font-weight: bold; font-size: 14px;',
      'color: #888; font-size: 12px;',
    );
  } else {
    hideTooltip();
    console.log('%c[DevDebug] 디버그 모드 비활성화됨', 'color: #ff6b6b;');
  }
}
export function toggleDebugMode(): boolean {
  const newState = !isDebugEnabled();
  setDebugEnabled(newState);
  return newState;
}
export function initDevDebugHelper(userConfig: DevDebugConfig = {}): void {
  if (isInitialized) {
    console.warn('[DevDebug] 이미 초기화되었습니다.');
    return;
  }
  config = {
    ...DEFAULT_CONFIG,
    ...userConfig,
    theme: { ...DEFAULT_CONFIG.theme, ...userConfig.theme },
  };
  if (config.devOnly) {
    const isDev = config.allowedHosts.includes(window.location.hostname);
    if (!isDev) {
      console.log('[DevDebug] 프로덕션 환경에서는 비활성화됨');
      return;
    }
  }
  isInitialized = true;
  isActive = isDebugEnabled();
  attachEventListeners();
  if (isActive) {
    console.log(
      '%c[DevDebug] 디버그 헬퍼 v2.0 활성화됨\n%c• Ctrl + 마우스 이동: 요소 정보 미리보기\n• Ctrl + 우클릭: 클립보드에 복사',
      'color: #00ff88; font-weight: bold; font-size: 14px;',
      'color: #888; font-size: 12px;',
    );
  } else {
    console.log(
      '%c[DevDebug] 디버그 헬퍼 대기 중\n%c콘솔에서 toggleDevDebug() 또는 enableDevDebug() 실행',
      'color: #888; font-size: 12px;',
      'color: #666; font-size: 11px;',
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).toggleDevDebug = toggleDebugMode;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).enableDevDebug = () => setDebugEnabled(true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).disableDevDebug = () => setDebugEnabled(false);
}
export function destroyDevDebugHelper(): void {
  if (!isInitialized) return;
  detachEventListeners();
  isInitialized = false;
  isActive = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (window as any).toggleDevDebug;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (window as any).enableDevDebug;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (window as any).disableDevDebug;
  console.log('[DevDebug] 디버그 헬퍼 제거됨');
}
export const DevDebugHelper = {
  init: initDevDebugHelper,
  destroy: destroyDevDebugHelper,
  enable: () => setDebugEnabled(true),
  disable: () => setDebugEnabled(false),
  toggle: toggleDebugMode,
  isEnabled: isDebugEnabled,
};
export function getReactSourceInfo(element: HTMLElement): Partial<ElementInfo> {
  const result: Partial<ElementInfo> = {
    filePath: null,
    lineNumber: null,
    componentName: null,
  };
  try {
    const fiberKey = Object.keys(element).find(
      key => key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$'),
    );
    if (!fiberKey) return result;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let fiber = (element as any)[fiberKey];
    let maxDepth = 20;
    while (fiber && maxDepth > 0) {
      if (fiber._debugSource) {
        const source = fiber._debugSource;
        if (source.fileName) {
          let filePath = source.fileName;
          const srcIndex = filePath.indexOf('/src/');
          if (srcIndex !== -1) {
            filePath = filePath.substring(srcIndex + 1);
          } else {
            const lastSlash = filePath.lastIndexOf('/');
            if (lastSlash !== -1) {
              filePath = filePath.substring(lastSlash + 1);
            }
          }
          result.filePath = filePath;
          result.lineNumber = source.lineNumber?.toString() || null;
        }
      }
      if (fiber.type) {
        const typeName = fiber.type.displayName || fiber.type.name;
        if (typeName && !result.componentName) {
          if (typeof fiber.type !== 'string') {
            result.componentName = typeName;
          }
        }
      }
      if (result.filePath && result.componentName) break;
      fiber = fiber.return;
      maxDepth--;
    }
  } catch (e) {
    console.debug('[DevDebug] Failed to extract React source info:', e);
  }
  return result;
}
export function getElementInfo(element: HTMLElement): ElementInfo | null {
  const className = typeof element.className === 'string' ? element.className : '';
  const reactInfo = getReactSourceInfo(element);
  let filePath = reactInfo.filePath || null;
  let lineNumber = reactInfo.lineNumber || null;
  const locAttr =
    element.closest('[data-loc]')?.getAttribute('data-loc') ||
    element.closest('[data-audit-loc]')?.getAttribute('data-audit-loc') ||
    null;
  if (locAttr) {
    const m = locAttr.match(/^(.*?):(\d+)(?::\d+)?$/);
    if (m) {
      filePath = m[1];
      lineNumber = m[2];
    } else {
      filePath = locAttr;
    }
  }
  if (!filePath && !className) return null;
  return {
    className,
    tagName: element.tagName.toLowerCase(),
    filePath,
    lineNumber,
    componentName: reactInfo.componentName || null,
  };
}
let tooltip: HTMLDivElement | null = null;
export function createTooltip(config: Required<DevDebugConfig>): HTMLDivElement {
  if (tooltip) return tooltip;
  tooltip = document.createElement('div');
  tooltip.id = 'dev-debug-tooltip';
  tooltip.style.cssText = `
    position: fixed;
    background: ${config.theme.background};
    color: ${config.theme.text};
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 12px;
    font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
    z-index: 99999;
    pointer-events: none;
    max-width: 500px;
    white-space: pre-wrap;
    word-break: break-all;
    border: 1px solid ${config.theme.border};
    box-shadow: 0 4px 16px rgba(0, 255, 136, 0.15);
    display: none;
    line-height: 1.5;
  `;
  document.body.appendChild(tooltip);
  return tooltip;
}
export function showTooltip(e: MouseEvent, text: string, config: Required<DevDebugConfig>) {
  const tip = createTooltip(config);
  tip.textContent = text;
  tip.style.display = 'block';
  tip.style.left = `${e.clientX + 15}px`;
  tip.style.top = `${e.clientY + 15}px`;
  requestAnimationFrame(() => {
    const rect = tip.getBoundingClientRect();
    if (rect.right > window.innerWidth - 10) {
      tip.style.left = `${e.clientX - rect.width - 15}px`;
    }
    if (rect.bottom > window.innerHeight - 10) {
      tip.style.top = `${e.clientY - rect.height - 15}px`;
    }
  });
}
export function hideTooltip() {
  if (tooltip) {
    tooltip.style.display = 'none';
  }
}
export function removeTooltip() {
  if (tooltip) {
    tooltip.remove();
    tooltip = null;
  }
}
export function showCopyNotification(text: string, config: Required<DevDebugConfig>) {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: ${config.theme.primary};
    color: ${config.theme.background};
    padding: 14px 20px;
    border-radius: 10px;
    font-size: 13px;
    font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
    z-index: 99999;
    max-width: 600px;
    white-space: pre-wrap;
    word-break: break-all;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  `;
  const lines = text.split('\n');
  const preview = lines.length > 3 ? lines.slice(0, 3).join('\n') + '\n...' : text;
  const displayText = preview.length > 150 ? preview.substring(0, 150) + '...' : preview;
  notification.innerHTML = `
    <div style="font-weight: bold; margin-bottom: 6px; font-size: 14px;">✓ 클립보드에 복사됨</div>
    <div style="opacity: 0.85; font-size: 11px;">${displayText.replace(/\n/g, '<br>')}</div>
  `;
  document.body.appendChild(notification);
  setTimeout(() => {
    notification.style.opacity = '0';
    notification.style.transform = 'translateY(10px)';
    notification.style.transition = 'all 0.3s ease';
    setTimeout(() => notification.remove(), 300);
  }, 2500);
}
interface StatusConfig {
  color: string;
  text: string;
  bgColor: string;
  borderColor: string;
  label: string;
}
const statusConfigs: Record<string, StatusConfig> = {
  running: {
    color: 'text-green-400',
    text: '작업 중',
    bgColor: 'bg-green-500/20',
    borderColor: 'border-green-500/50',
    label: '진행중',
  },
  idle: {
    color: 'text-cyan-400',
    text: '대기 중',
    bgColor: 'bg-cyan-500/20',
    borderColor: 'border-cyan-500/50',
    label: '대기',
  },
  error: {
    color: 'text-red-400',
    text: '오류 발생',
    bgColor: 'bg-red-500/20',
    borderColor: 'border-red-500/50',
    label: '오류',
  },
  maintenance: {
    color: 'text-yellow-400',
    text: '점검 중',
    bgColor: 'bg-yellow-500/20',
    borderColor: 'border-yellow-500/50',
    label: '점검',
  },
  pending: {
    color: 'text-gray-300',
    text: '대기',
    bgColor: 'bg-gray-500/20',
    borderColor: 'border-gray-500/50',
    label: '대기',
  },
  completed: {
    color: 'text-green-400',
    text: '완료',
    bgColor: 'bg-green-500/20',
    borderColor: 'border-green-500/50',
    label: '완료',
  },
  paused: {
    color: 'text-orange-400',
    text: '일시정지',
    bgColor: 'bg-orange-500/20',
    borderColor: 'border-orange-500/50',
    label: '일시정지',
  },
  cancelled: {
    color: 'text-gray-400',
    text: '취소됨',
    bgColor: 'bg-gray-600/20',
    borderColor: 'border-gray-600/50',
    label: '취소',
  },
  failed: {
    color: 'text-red-400',
    text: '실패',
    bgColor: 'bg-red-500/20',
    borderColor: 'border-red-500/50',
    label: '실패',
  },
  connected: {
    color: 'text-green-400',
    text: '연결됨',
    bgColor: 'bg-green-500/20',
    borderColor: 'border-green-500/50',
    label: '연결',
  },
  disconnected: {
    color: 'text-red-400',
    text: '연결 끊김',
    bgColor: 'bg-red-500/20',
    borderColor: 'border-red-500/50',
    label: '연결 끊김',
  },
};
const defaultConfig: StatusConfig = {
  color: 'text-gray-400',
  text: '알 수 없음',
  bgColor: 'bg-gray-500/20',
  borderColor: 'border-gray-500/50',
  label: '알 수 없음',
};
export const getStatusColor = (status: string): string =>
  statusConfigs[status]?.color || defaultConfig.color;
export const getStatusText = (status: string): string =>
  statusConfigs[status]?.text || defaultConfig.text;
export const getStatusBg = (status: string): string =>
  `${statusConfigs[status]?.bgColor || defaultConfig.bgColor} ${
    statusConfigs[status]?.borderColor || defaultConfig.borderColor
  }`;
export const getStatusLabel = (status: string): string =>
  statusConfigs[status]?.label || defaultConfig.label;
export const getStatusBadgeClasses = (status: string): string => {
  const config = statusConfigs[status] || defaultConfig;
  return `${config.bgColor} ${config.color} ${config.borderColor} border`;
};
export const getFullStatusConfig = (status: string): StatusConfig =>
  statusConfigs[status] || defaultConfig;
