import React, { Component, ErrorInfo, ReactNode, useState, ReactElement } from 'react';
import { useAlert } from '../../contexts';
import { CheckCircle, AlertCircle, AlertTriangle, Info, X, Home, ChevronLeft } from 'lucide-react';
import classNames from 'classnames';
import { createLogger } from '../../lib';
import { useNetworkStatus } from '../../hooks';
import { useNavigate } from 'react-router-dom';
import { UpdateStatus, displayProgress, percent } from '../../lib/updater';
const AlertModal: React.FC = () => {
  const { alertState, hide } = useAlert();
  const { isOpen, message, title, type, onConfirm } = alertState;
  if (!isOpen) return null;
  const handleConfirm = () => {
    if (onConfirm) {
      onConfirm();
    }
    hide();
  };
  const iconMap = {
    info: <Info className="w-8 h-8 text-blue-400" />,
    success: <CheckCircle className="w-8 h-8 text-green-400" />,
    warning: <AlertTriangle className="w-8 h-8 text-yellow-400" />,
    error: <AlertCircle className="w-8 h-8 text-red-400" />,
  };
  const colorMap = {
    info: 'border-blue-500/30',
    success: 'border-green-500/30',
    warning: 'border-yellow-500/30',
    error: 'border-red-500/30',
  };
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div
        className={`bg-gray-800 rounded-2xl w-full max-w-md border-2 ${colorMap[type || 'info']} shadow-2xl`}
      >
        <div className="flex items-center justify-between p-5 border-b border-gray-700">
          <div className="flex items-center gap-3">
            {iconMap[type || 'info']}
            <h2 className="text-lg font-semibold text-white">{title}</h2>
          </div>
          <button
            onClick={hide}
            className="p-2 hover:bg-gray-700 rounded-xl transition"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>
        <div className="p-6">
          <p className="text-gray-200 whitespace-pre-wrap text-base leading-relaxed">{message}</p>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t border-gray-700">
          <button
            onClick={handleConfirm}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
};
export const AlertModal_AlertModal = AlertModal;
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'success' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}
const baseClasses =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-blue-500';
const variantClasses: Record<NonNullable<ButtonProps['variant']>, string> = {
  default: 'bg-[#000000] text-white',
  destructive: 'bg-[#FF3737] text-[#FFFFFF] hover:bg-[#FF3737]/50',
  success: 'bg-[#05888b] text-[#FFFFFF] hover:bg-[#003333]',
  outline: '',
  secondary: '',
  link: '',
  ghost: 'bg-transparent text-inherit hover:bg-gray-700/50',
};
const sizeClasses: Record<NonNullable<ButtonProps['size']>, string> = {
  default: 'h-9 px-4 py-2',
  sm: 'h-8 px-3 text-xs',
  lg: 'h-10 px-8',
  icon: 'h-9 w-9 p-0',
};
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={classNames(baseClasses, variantClasses[variant], sizeClasses[size], className)}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';
export { Button };
const boundaryLogger = createLogger('ErrorBoundary');
interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  name?: string;
}
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }
  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const { onError, name = 'unknown' } = this.props;
    this.setState({ errorInfo });
    boundaryLogger.error(
      'component_crash',
      `[${name}] 컴포넌트 렌더링 에러: ${error.message}`,
      {
        boundary: name,
        componentStack: errorInfo.componentStack,
        url: window.location.pathname,
      },
      {
        code: 'REACT_RENDER_ERROR',
        stack: error.stack,
      }
    );
    onError?.(error, errorInfo);
  }
  handleReset = () => {
    boundaryLogger.info('error_recovery', `[${this.props.name || 'unknown'}] 사용자가 에러 복구 시도`);
    this.setState({ hasError: false, error: null, errorInfo: null });
  };
  handleReload = () => {
    boundaryLogger.info('error_reload', `[${this.props.name || 'unknown'}] 사용자가 페이지 새로고침`);
    window.location.reload();
  };
  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }
    if (this.props.fallback) {
      return this.props.fallback;
    }
    const { error } = this.state;
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.iconRow}>
            <span style={styles.icon}>!</span>
          </div>
          <h2 style={styles.title}>오류가 발생했습니다</h2>
          <p style={styles.message}>
            화면을 표시하는 중 문제가 발생했습니다.
          </p>
          {error && (
            <details style={styles.details}>
              <summary style={styles.summary}>오류 상세</summary>
              <pre style={styles.stack}>{error.message}</pre>
            </details>
          )}
          <div style={styles.buttonRow}>
            <button onClick={this.handleReset} style={styles.retryButton}>
              다시 시도
            </button>
            <button onClick={this.handleReload} style={styles.reloadButton}>
              새로고침
            </button>
          </div>
        </div>
      </div>
    );
  }
}
const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '200px',
    padding: '20px',
  },
  card: {
    background: 'var(--bg-secondary, #1e1e2e)',
    border: '1px solid var(--border-color, #ff4444)',
    borderRadius: '12px',
    padding: '32px',
    maxWidth: '480px',
    width: '100%',
    textAlign: 'center',
  },
  iconRow: {
    marginBottom: '16px',
  },
  icon: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    background: '#ff444420',
    color: '#ff4444',
    fontSize: '24px',
    fontWeight: 'bold',
  },
  title: {
    color: 'var(--text-primary, #ffffff)',
    fontSize: '18px',
    marginBottom: '8px',
  },
  message: {
    color: 'var(--text-secondary, #a0a0a0)',
    fontSize: '14px',
    marginBottom: '16px',
  },
  details: {
    textAlign: 'left',
    marginBottom: '16px',
  },
  summary: {
    color: 'var(--text-secondary, #a0a0a0)',
    cursor: 'pointer',
    fontSize: '13px',
    marginBottom: '8px',
  },
  stack: {
    background: 'var(--bg-primary, #0d0d1a)',
    color: '#ff6b6b',
    padding: '12px',
    borderRadius: '8px',
    fontSize: '12px',
    overflow: 'auto',
    maxHeight: '120px',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  buttonRow: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'center',
  },
  retryButton: {
    padding: '8px 20px',
    borderRadius: '8px',
    border: '1px solid var(--border-color, #333)',
    background: 'var(--bg-primary, #0d0d1a)',
    color: 'var(--text-primary, #ffffff)',
    cursor: 'pointer',
    fontSize: '14px',
  },
  reloadButton: {
    padding: '8px 20px',
    borderRadius: '8px',
    border: 'none',
    background: 'var(--accent-color, #4a9eff)',
    color: '#ffffff',
    cursor: 'pointer',
    fontSize: '14px',
  },
};
export const ErrorBoundary_ErrorBoundary = ErrorBoundary;
interface FormInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  labelSize?: 'xs' | 'sm';
  hint?: string;
  error?: string;
  unit?: string;
  focusStyle?: 'cyan' | 'blue';
  wrapperClassName?: string;
}
const FormInput = React.forwardRef<HTMLInputElement, FormInputProps>(
  (
    {
      label,
      labelSize = 'xs',
      hint,
      error,
      unit,
      focusStyle = 'cyan',
      wrapperClassName = '',
      className = '',
      ...props
    },
    ref
  ) => {
    const labelSizeClass = labelSize === 'xs' ? 'text-xs' : 'text-sm font-medium';
    const focusClass =
      focusStyle === 'cyan'
        ? 'focus:border-cyan-500 focus:outline-none'
        : 'focus:outline-none focus:ring-2 focus:ring-blue-500';
    return (
      <div className={wrapperClassName}>
        {label && (
          <label className={`block ${labelSizeClass} text-gray-400 mb-1`}>
            {label}
            {unit && <span className="text-gray-500 ml-1">({unit})</span>}
          </label>
        )}
        <input
          ref={ref}
          className={`w-full bg-gray-700 text-white px-3 py-2 rounded-lg border ${
            error ? 'border-red-500' : 'border-gray-600'
          } ${focusClass} ${className}`}
          {...props}
        />
        {hint && !error && (
          <p className="text-xs text-gray-500 mt-1">{hint}</p>
        )}
        {error && (
          <p className="text-xs text-red-400 mt-1">{error}</p>
        )}
      </div>
    );
  }
);
FormInput.displayName = 'FormInput';
export const FormInput_FormInput = FormInput;
interface LoadingScreenProps {
  text?: string;
}
const LoadingScreen: React.FC<LoadingScreenProps> = ({ text = '로딩 중...' }) => (
  <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center">
    <div className="text-center">
      <div className="w-16 h-16 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
      <div className="text-xl text-cyan-400">{text}</div>
    </div>
  </div>
);
export const LoadingScreen_LoadingScreen = LoadingScreen;
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}
const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = 'md',
}) => {
  if (!isOpen) return null;
  const maxWidthClass = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
  }[size];
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div
        className={`bg-gray-800 rounded-2xl w-full ${maxWidthClass} max-h-[90vh] overflow-y-auto border border-gray-700`}
      >
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 className="text-xl font-semibold text-white">{title}</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-700 rounded-xl transition"
          >
            <X className="w-6 h-6 text-gray-400" />
          </button>
        </div>
        <div className="p-6 space-y-5">{children}</div>
        {footer && (
          <div className="flex gap-3 p-6 border-t border-gray-700">{footer}</div>
        )}
      </div>
    </div>
  );
};
export const Modal_Modal = Modal;
interface NetworkStatusBannerProps {
  heartbeatInterval?: number;
}
const NetworkStatusBanner: React.FC<NetworkStatusBannerProps> = ({
  heartbeatInterval = 10000,
}) => {
  const { isOnline, isServerReachable, disconnectedDurationSec } = useNetworkStatus({
    heartbeatInterval,
  });
  if (isOnline && isServerReachable) return null;
  const formatDuration = (sec: number): string => {
    if (sec < 60) return `${sec}초`;
    const min = Math.floor(sec / 60);
    const remainSec = sec % 60;
    return `${min}분 ${remainSec}초`;
  };
  if (!isOnline) {
    return (
      <div style={styles_NetworkStatusBanner.errorBanner}>
        <span style={styles_NetworkStatusBanner.icon}>!</span>
        <span>네트워크 연결이 끊겼습니다. 인터넷 연결을 확인해주세요.</span>
      </div>
    );
  }
  return (
    <div style={styles_NetworkStatusBanner.warningBanner}>
      <span style={styles_NetworkStatusBanner.icon}>!</span>
      <span>
        서버(Robot Core)에 연결할 수 없습니다.
        {disconnectedDurationSec > 0 && ` (${formatDuration(disconnectedDurationSec)} 경과)`}
        {' '}자동 재연결 시도 중...
      </span>
    </div>
  );
};
const styles_NetworkStatusBanner = {
  errorBanner: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    backgroundColor: '#dc2626',
    color: '#ffffff',
    padding: '8px 16px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
    fontWeight: 500,
    boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
  },
  warningBanner: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    backgroundColor: '#f59e0b',
    color: '#1f2937',
    padding: '8px 16px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
    fontWeight: 500,
    boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
  },
  icon: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    border: '2px solid currentColor',
    fontSize: '12px',
    fontWeight: 700,
    flexShrink: 0,
  },
};
export const NetworkStatusBanner_NetworkStatusBanner = NetworkStatusBanner;
interface PageHeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  backPath?: string;
  showMainMenu?: boolean;
  children?: React.ReactNode;
}
const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  showBack = false,
  backPath,
  showMainMenu = true,
  children,
}) => {
  const navigate = useNavigate();
  return (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-4">
        {showBack && (
          <button
            onClick={() => (backPath ? navigate(backPath) : navigate(-1))}
            className="p-2 bg-gray-700/50 hover:bg-gray-600 rounded-xl text-gray-300 hover:text-white transition touch-manipulation"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white">{title}</h1>
          {subtitle && <p className="text-gray-400 text-sm mt-1">{subtitle}</p>}
        </div>
      </div>
      <div className="flex items-center gap-3">
        {children}
        {showMainMenu && (
          <button
            onClick={() => navigate('/menu')}
            className="px-4 py-3 bg-gray-700 hover:bg-gray-600 rounded-xl text-white transition touch-manipulation min-h-[48px] flex items-center gap-2"
          >
            <Home className="w-5 h-5" />
            <span className="hidden md:inline">메인 메뉴</span>
          </button>
        )}
      </div>
    </div>
  );
};
export const PageHeader_PageHeader = PageHeader;
interface PageLayoutProps {
  children: React.ReactNode;
  className?: string;
}
const PageLayout: React.FC<PageLayoutProps> = ({ children, className = '' }) => (
  <div
    className={`flex-1 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-4 md:p-6 overflow-auto ${className}`}
  >
    {children}
  </div>
);
export const PageLayout_PageLayout = PageLayout;
const Select: React.FC<{ children?: React.ReactNode }> = ({ children }) => <div>{children}</div>;
const SelectGroup: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <div>{children}</div>
);
const SelectValue: React.FC<{ placeholder?: string }> = ({ placeholder }) => (
  <span>{placeholder}</span>
);
interface SelectTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  className?: string;
}
const SelectTrigger = React.forwardRef<HTMLButtonElement, SelectTriggerProps>(
  ({ className, children, ...props }, ref) => (
    <button ref={ref} className={className} {...props}>
      {children}
    </button>
  )
);
SelectTrigger.displayName = 'SelectTrigger';
const SelectContent: React.FC<{ className?: string; children?: React.ReactNode }> = ({
  className,
  children,
}) => <div className={className}>{children}</div>;
const SelectItem: React.FC<{
  value: string;
  className?: string;
  children?: React.ReactNode;
  onClick?: () => void;
}> = ({ className, children, onClick }) => (
  <div className={className} onClick={onClick} role="option">
    {children}
  </div>
);
const SelectSeparator: React.FC<{ className?: string }> = ({ className }) => (
  <div className={className} />
);
const SelectScrollUpButton: React.FC = () => null;
const SelectScrollDownButton: React.FC = () => null;
const SelectLabel: React.FC<{ className?: string; children?: React.ReactNode }> = ({
  className,
  children,
}) => <div className={className}>{children}</div>;
export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
};
interface SettingsToggleRowProps {
  label: string;
  description?: string;
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  icon?: React.ReactNode;
  className?: string;
}
const SettingsToggleRow: React.FC<SettingsToggleRowProps> = ({
  label,
  description,
  enabled,
  onChange,
  icon,
  className = '',
}) => (
  <div className={`bg-gray-900/60 rounded-xl p-5 border border-gray-700/50 ${className}`}>
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        {icon && <div className="text-cyan-400">{icon}</div>}
        <div>
          <div className="text-white font-medium text-lg mb-1">{label}</div>
          {description && <div className="text-gray-400 text-sm">{description}</div>}
        </div>
      </div>
      <ToggleSwitch enabled={enabled} onChange={onChange} />
    </div>
  </div>
);
export const SettingsToggleRow_SettingsToggleRow = SettingsToggleRow;
type ColorVariant = 'blue' | 'cyan' | 'green' | 'yellow' | 'red' | 'purple' | 'gray';
interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  color?: ColorVariant;
  variant?: 'default' | 'compact';
  unit?: string;
  className?: string;
  iconBgColor?: string;
}
const colorClasses: Record<ColorVariant, { bg: string; text: string }> = {
  blue: { bg: 'bg-blue-500/20', text: 'text-blue-400' },
  cyan: { bg: 'bg-cyan-500/20', text: 'text-cyan-400' },
  green: { bg: 'bg-green-500/20', text: 'text-green-400' },
  yellow: { bg: 'bg-yellow-500/20', text: 'text-yellow-400' },
  red: { bg: 'bg-red-500/20', text: 'text-red-400' },
  purple: { bg: 'bg-purple-500/20', text: 'text-purple-400' },
  gray: { bg: 'bg-gray-500/20', text: 'text-gray-400' },
};
const StatCard: React.FC<StatCardProps> = ({
  icon,
  label,
  value,
  color = 'cyan',
  variant = 'default',
  unit = '',
  className = '',
  iconBgColor,
}) => {
  const colors = colorClasses[color];
  const bgClass = iconBgColor || colors.bg;
  if (variant === 'compact') {
    return (
      <div className={`bg-gray-900/60 rounded-xl p-4 flex items-center gap-3 border border-gray-700/50 ${className}`}>
        <div className={colors.text}>
          {icon}
        </div>
        <div>
          <div className="text-gray-400 text-xs">{label}</div>
          <div className="text-white font-bold text-lg">
            {value}{unit}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className={`bg-gray-800/60 backdrop-blur-sm rounded-2xl p-4 border border-gray-700/50 ${className}`}>
      <div className="flex items-center gap-3">
        <div className={`w-12 h-12 ${bgClass} rounded-xl flex items-center justify-center`}>
          {icon}
        </div>
        <div>
          <div className="text-2xl font-bold text-white">
            {value}{unit}
          </div>
          <div className="text-gray-400 text-sm">{label}</div>
        </div>
      </div>
    </div>
  );
};
export const StatCard_StatCard = StatCard;
interface TabProps {
  label: string;
  children: ReactNode;
}
interface TabsProps {
  children: ReactElement<TabProps>[];
}
export const Tab: React.FC<TabProps> = ({ children }) => <>{children}</>;
export const Tabs: React.FC<TabsProps> = ({ children }) => {
  const [activeIndex, setActiveIndex] = useState<number>(0);
  return (
    <div className="w-full h-full max-w-md mx-auto">
      {}
      <div className="flex border-b">
        {children.map((child, index) => (
          <button
            key={index}
            onClick={() => setActiveIndex(index)}
            className={`flex-1 py-2 ${
              activeIndex === index
                ? 'border-b-2 border-blue-500 font-bold text-blue-600'
                : 'text-gray-500'
            }`}
          >
            {child.props.label}
          </button>
        ))}
      </div>
      {}
      <div className="p-4">{children[activeIndex]}</div>
    </div>
  );
};
interface TextInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  inputSize?: 'sm' | 'md' | 'lg';
  error?: string;
}
const TextInput = React.forwardRef<HTMLInputElement, TextInputProps>(
  ({ label, inputSize = 'md', error, className = '', ...props }, ref) => {
    const sizeClass = {
      sm: 'px-2 py-1 text-sm',
      md: 'px-4 py-3 text-base',
      lg: 'px-4 py-4 text-lg',
    }[inputSize];
    return (
      <div>
        {label && (
          <label className="block text-gray-400 text-sm mb-2 font-medium">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={`w-full ${sizeClass} bg-gray-900 border ${
            error ? 'border-red-500' : 'border-gray-700'
          } rounded-xl text-white focus:border-cyan-500 focus:outline-none transition ${className}`}
          {...props}
        />
        {error && <span className="text-red-400 text-sm mt-1">{error}</span>}
      </div>
    );
  }
);
TextInput.displayName = 'TextInput';
export const TextInput_TextInput = TextInput;
interface ToggleSwitchProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  className?: string;
}
const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  enabled,
  onChange,
  className = '',
}) => (
  <button
    type="button"
    onClick={() => onChange(!enabled)}
    className={`w-16 h-9 rounded-full transition ${
      enabled ? 'bg-cyan-600' : 'bg-gray-600'
    } ${className}`}
  >
    <div
      className={`w-7 h-7 bg-white rounded-full transition-transform ${
        enabled ? 'translate-x-8' : 'translate-x-1'
      }`}
    />
  </button>
);
export const ToggleSwitch_ToggleSwitch = ToggleSwitch;
interface UpdateDialogProps {
  status: UpdateStatus;
  currentVersion: string;
  onStart: () => void;
  onDismiss: () => void;
}
export function UpdateDialog({ status, currentVersion, onStart, onDismiss }: UpdateDialogProps) {
  const isVisible =
    status.kind === 'available' ||
    status.kind === 'pending' ||
    status.kind === 'downloading' ||
    status.kind === 'verifying' ||
    status.kind === 'downloaded' ||
    status.kind === 'installing' ||
    status.kind === 'error';
  if (!isVisible) return null;
  const title = (() => {
    switch (status.kind) {
      case 'available':
        return '새로운 업데이트';
      case 'pending':
        return '업데이트 대기 중';
      case 'downloading':
        return '다운로드 중';
      case 'verifying':
        return '검증 중';
      case 'downloaded':
        return '다운로드 완료';
      case 'installing':
        return '설치 시작';
      case 'error':
        return '업데이트 오류';
    }
  })();
  const canClose =
    status.kind === 'available' || status.kind === 'pending' || status.kind === 'error';
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-[420px] max-w-[90vw] p-6">
        {}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="text-3xl">📦</div>
            <div>
              <h2 className="text-lg font-semibold text-white">{title}</h2>
              {(status.kind === 'available' ||
                status.kind === 'pending' ||
                status.kind === 'downloading' ||
                status.kind === 'verifying' ||
                status.kind === 'downloaded' ||
                status.kind === 'installing') && (
                <p className="text-xs text-gray-400 font-mono">
                  v{currentVersion} → v{status.release.version}
                </p>
              )}
            </div>
          </div>
        </div>
        {}
        <div className="space-y-3 mb-5">
          {status.kind === 'available' && (
            <>
              <p className="text-sm text-gray-300">새로운 버전이 준비되었습니다.</p>
              {status.release.notes && (
                <div className="bg-gray-800/60 border border-gray-700 rounded-lg p-3 max-h-40 overflow-y-auto">
                  <pre className="text-xs text-gray-300 whitespace-pre-wrap font-sans">
                    {status.release.notes}
                  </pre>
                </div>
              )}
            </>
          )}
          {status.kind === 'pending' && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
              <p className="text-sm text-yellow-300">{status.reason}</p>
            </div>
          )}
          {status.kind === 'downloading' && (
            <div className="space-y-2">
              <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all"
                  style={{ width: `${percent(status.progress).toFixed(1)}%` }}
                />
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-400 font-mono">{displayProgress(status.progress)}</span>
                <span className="text-cyan-400 font-mono">
                  {percent(status.progress).toFixed(1)}%
                </span>
              </div>
            </div>
          )}
          {status.kind === 'verifying' && (
            <p className="text-sm text-gray-300 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              SHA-256 무결성 검증 중...
            </p>
          )}
          {status.kind === 'downloaded' && (
            <p className="text-sm text-green-400">다운로드 완료. 인스톨러를 시작합니다...</p>
          )}
          {status.kind === 'installing' && (
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
              <p className="text-sm text-blue-300">
                인스톨러가 실행되었습니다. 본체가 곧 종료되고 자동으로 설치가 진행됩니다.
              </p>
            </div>
          )}
          {status.kind === 'error' && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
              <pre className="text-sm text-red-300 whitespace-pre-wrap">{status.message}</pre>
            </div>
          )}
        </div>
        {}
        <div className="flex justify-end gap-2">
          {canClose && (
            <button
              onClick={onDismiss}
              className="px-4 py-2 rounded-lg text-sm font-medium text-gray-300 hover:bg-gray-800 transition"
            >
              {status.kind === 'error' ? '닫기' : '나중에'}
            </button>
          )}
          {status.kind === 'available' && (
            <button
              onClick={onStart}
              className="px-5 py-2 rounded-lg text-sm font-medium bg-green-600 hover:bg-green-500 text-white transition"
            >
              지금 업데이트
            </button>
          )}
          {status.kind === 'pending' && (
            <button
              onClick={onStart}
              className="px-5 py-2 rounded-lg text-sm font-medium bg-yellow-600 hover:bg-yellow-500 text-white transition"
            >
              재시도
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
export const UpdateDialog_UpdateDialog = UpdateDialog;
export { LoadingScreen_LoadingScreen as LoadingScreen };
export { Modal_Modal as Modal };
export { PageLayout_PageLayout as PageLayout };
export { PageHeader_PageHeader as PageHeader };
export { StatCard_StatCard as StatCard };
export { TextInput_TextInput as TextInput };
export { FormInput_FormInput as FormInput };
export { ToggleSwitch_ToggleSwitch as ToggleSwitch };
export { SettingsToggleRow_SettingsToggleRow as SettingsToggleRow };
