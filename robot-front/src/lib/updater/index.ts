export const UPDATER_REPO = 'coddak2-commits/robot';
interface GitHubAsset {
  name: string;
  browser_download_url: string;
  size: number;
}
interface GitHubRelease {
  tag_name: string;
  body: string;
  assets: GitHubAsset[];
}
export async function checkLatestRelease(currentVersion: string): Promise<ReleaseInfo | null> {
  const url = `https://api.github.com/repos/${UPDATER_REPO}/releases/latest`;
  const res = await fetch(url, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${res.statusText}`);
  const release = (await res.json()) as GitHubRelease;
  const tag = release.tag_name.replace(/^v/, '');
  if (!tag || !isNewerVersion(tag, currentVersion)) return null;
  const installerAsset =
    release.assets.find(a => /setup.*\.exe$|installer.*\.exe$|_setup_.*\.exe$/i.test(a.name)) ??
    release.assets.find(a => a.name.endsWith('.exe'));
  if (!installerAsset) return null;
  const shaAsset = release.assets.find(a => a.name === `${installerAsset.name}.sha256`);
  return {
    version: tag,
    downloadUrl: installerAsset.browser_download_url,
    sha256Url: shaAsset?.browser_download_url ?? null,
    notes: release.body ?? '',
  };
}
export async function fetchExpectedSha256(shaUrl: string): Promise<string> {
  const res = await fetch(shaUrl);
  if (!res.ok) throw new Error(`SHA 파일 다운로드 실패: ${res.status}`);
  const text = await res.text();
  const match = text.trim().match(/^([0-9a-f]{64})/i);
  if (!match) throw new Error('SHA-256 파일 형식 오류');
  return match[1].toLowerCase();
}
export interface ReleaseInfo {
  version: string;
  downloadUrl: string;
  sha256Url: string | null;
  notes: string;
}
export interface DownloadProgress {
  downloaded: number;
  total: number;
  speedBps: number;
}
export type UpdateStatus =
  | { kind: 'up_to_date' }
  | { kind: 'checking' }
  | { kind: 'available'; release: ReleaseInfo }
  | { kind: 'pending'; release: ReleaseInfo; reason: string }
  | { kind: 'downloading'; release: ReleaseInfo; progress: DownloadProgress }
  | { kind: 'verifying'; release: ReleaseInfo; path: string }
  | { kind: 'downloaded'; release: ReleaseInfo; path: string }
  | { kind: 'installing'; release: ReleaseInfo }
  | { kind: 'error'; message: string };
export function percent(p: DownloadProgress): number {
  return p.total === 0 ? 0 : (p.downloaded / p.total) * 100;
}
export function displayProgress(p: DownloadProgress): string {
  const mb = p.downloaded / 1_048_576;
  const speedMb = p.speedBps / 1_048_576;
  if (p.total > 0) {
    const totalMb = p.total / 1_048_576;
    return `${mb.toFixed(1)}/${totalMb.toFixed(1)} MB (${speedMb.toFixed(1)} MB/s)`;
  }
  return `${mb.toFixed(1)} MB (${speedMb.toFixed(1)} MB/s)`;
}
export function compareVersions(remote: string, current: string): number {
  const parse = (v: string): number[] =>
    v.split('.').map(s => {
      const n = parseInt(s, 10);
      return Number.isFinite(n) ? n : 0;
    });
  const r = parse(remote);
  const c = parse(current);
  const len = Math.max(r.length, c.length);
  for (let i = 0; i < len; i++) {
    const rv = r[i] ?? 0;
    const cv = c[i] ?? 0;
    if (rv > cv) return 1;
    if (rv < cv) return -1;
  }
  return 0;
}
export function isNewerVersion(remote: string, current: string): boolean {
  return compareVersions(remote, current) > 0;
}
