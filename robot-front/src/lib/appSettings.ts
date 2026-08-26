const SOUND_KEY = 'soundEnabled';
const AUTO_LOGOUT_KEY = 'autoLogoutMinutes';
const NOTIFICATIONS_KEY = 'notificationsEnabled';
const DEFAULT_AUTO_LOGOUT_MINUTES = 60;
export function isNotificationsEnabled(): boolean {
  return localStorage.getItem(NOTIFICATIONS_KEY) !== 'false';
}
export function setNotificationsEnabled(enabled: boolean): void {
  localStorage.setItem(NOTIFICATIONS_KEY, String(enabled));
}
export function isSoundEnabled(): boolean {
  return localStorage.getItem(SOUND_KEY) !== 'false';
}
export function setSoundEnabled(enabled: boolean): void {
  localStorage.setItem(SOUND_KEY, String(enabled));
}
export function getAutoLogoutMinutes(): number {
  const raw = localStorage.getItem(AUTO_LOGOUT_KEY);
  const parsed = raw !== null ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_AUTO_LOGOUT_MINUTES;
}
export function setAutoLogoutMinutes(minutes: number): void {
  localStorage.setItem(AUTO_LOGOUT_KEY, String(minutes));
}
