import { FileCategory, DeviceCategory } from '../types';

export function formatBytes(bytes: number, decimals = 1): string {
  if (!bytes || isNaN(bytes) || bytes <= 0) return '0 B';
  const k = 1024;
  const dm = Math.max(0, decimals);
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(sizes.length - 1, Math.max(0, Math.floor(Math.log(bytes) / Math.log(k))));
  const value = bytes / Math.pow(k, i);
  return `${parseFloat(value.toFixed(dm))} ${sizes[i]}`;
}

export function formatSpeed(bytesPerSec: number): { mbps: string; mbs: string; rawSpeedMB: number } {
  if (!bytesPerSec || isNaN(bytesPerSec) || bytesPerSec <= 0) {
    return { mbps: '0 Mbps', mbs: '0.0 MB/s', rawSpeedMB: 0 };
  }
  const mbs = bytesPerSec / (1024 * 1024);
  const mbps = (bytesPerSec * 8) / (1000 * 1000);
  return {
    mbs: `${mbs.toFixed(1)} MB/s`,
    mbps: `${Math.round(mbps)} Mbps`,
    rawSpeedMB: mbs,
  };
}

export function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds) || !isFinite(seconds) || seconds <= 0) return '0 dtk';
  if (seconds < 60) return `${Math.ceil(seconds)} dtk`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.ceil(seconds % 60);
  return `${mins}m ${secs}d`;
}

export function detectFileCategory(fileName: string, mimeType?: string): FileCategory {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const mime = mimeType?.toLowerCase() || '';

  if (mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'heic'].includes(ext)) {
    return 'image';
  }
  if (mime.startsWith('video/') || ['mp4', 'mkv', 'mov', 'avi', 'webm', 'flv', 'wmv'].includes(ext)) {
    return 'video';
  }
  if (mime.startsWith('audio/') || ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'opus'].includes(ext)) {
    return 'audio';
  }
  if (['apk', 'exe', 'dmg', 'app', 'ipa'].includes(ext)) {
    return 'app';
  }
  if (
    mime.startsWith('text/') ||
    ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'zip', 'rar', '7z', 'tar', 'gz', 'json', 'md'].includes(ext)
  ) {
    return 'document';
  }
  return 'other';
}

export function detectDeviceType(): DeviceCategory {
  if (typeof window === 'undefined') return 'unknown';
  const ua = navigator.userAgent.toLowerCase();
  if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
    return 'tablet';
  }
  if (/Mobile|iP(hone|od)|Android|BlackBerry|IEMobile|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(ua)) {
    return 'mobile';
  }
  return 'desktop';
}

export const ANIME_DEVICE_PROFILES = [
  { name: 'Ichika', avatar: 'anime:ichika' },
  { name: 'Nino', avatar: 'anime:nino' },
  { name: 'Miku', avatar: 'anime:miku' },
  { name: 'Yotsuba', avatar: 'anime:yotsuba' },
  { name: 'Itsuki', avatar: 'anime:itsuki' },
] as const;

const OLD_DEVICE_NAMES = [
  'Samsung Galaxy S24',
  'iPhone 15 Pro',
  'Xiaomi 14 Ultra',
  'MacBook Pro M3',
  'ROG Phone 8',
  'Google Pixel 8 Pro',
  'ThinkPad X1 Carbon',
  'iPad Pro M4',
  'Redmi Note 13',
  'Vivo X100 Pro',
  'OPPO Find X7',
  'Dell XPS 15',
];

export function getRandomDeviceProfile(): { name: string; avatar: string } {
  const profile = ANIME_DEVICE_PROFILES[Math.floor(Math.random() * ANIME_DEVICE_PROFILES.length)];
  return { name: profile.name, avatar: profile.avatar };
}

export function getAnimeNameByAvatar(avatar?: string): string | undefined {
  return ANIME_DEVICE_PROFILES.find((profile) => profile.avatar === avatar)?.name;
}

export function shouldReplaceStoredDeviceName(name?: string | null): boolean {
  if (!name) return true;
  return OLD_DEVICE_NAMES.includes(name) || /^Perangkat\s/i.test(name) || /Nakano|Galaxy|iPhone|Xiaomi|MacBook|Pixel|ThinkPad|iPad|Redmi|Vivo|OPPO|Dell|ROG/i.test(name);
}

export function normalizeAnimeDeviceName(name?: string | null): string {
  const raw = String(name || '').trim();
  const lower = raw.toLowerCase();
  if (lower.includes('ichika')) return 'Ichika';
  if (lower.includes('nino')) return 'Nino';
  if (lower.includes('miku')) return 'Miku';
  if (lower.includes('yotsuba')) return 'Yotsuba';
  if (lower.includes('itsuki')) return 'Itsuki';
  return raw;
}

export function generatePin(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

// Persistent, per-device identifier. Unlike generateId() (which changes every reload),
// this survives page refreshes so the server/client can tell "the same physical device
// reloaded with a fresh session" apart from a genuinely different device. This prevents
// a device's own previous session from lingering in the radar after a refresh.
export function getDeviceId(): string {
  if (typeof window === 'undefined') return 'device';
  let id = localStorage.getItem('shareit_device_id');
  if (!id) {
    id = generateId() + generateId();
    localStorage.setItem('shareit_device_id', id);
  }
  return id;
}

// Persistent PeerJS peer id, kept in localStorage so a device keeps the SAME contactable
// id across page refreshes. This is what makes a shared link/QR (`?peer=...`) still resolve
// after a reload, and stops the receiver's “contactable” id from changing on every refresh.
// It is only regenerated when the user clears browser storage (the key disappears), so we
// deliberately do NOT re-randomize on each session. Prefixed with `shareit-` by design.
export function getStablePeerId(): string {
  if (typeof window === 'undefined') return 'shareit-device';
  let id = localStorage.getItem('shareit_peerid');
  if (!id || !id.startsWith('shareit-')) {
    id = `shareit-${Math.random().toString(36).substring(2, 9)}${Math.random().toString(36).substring(2, 6)}`;
    localStorage.setItem('shareit_peerid', id);
  }
  return id;
}

// Clear every identity-related key so the next page load assigns a brand-new id, profile,
// and room code. Used by the "Reset ID" button — the only place identity is ever reset.
// After clearing, the caller reloads the page (the app re-initialises and generates fresh
// values). Note: the in-app shareit_* prefix must stay unchanged.
export function resetDeviceIdentity(): void {
  try {
    const keys = [
      'shareit_peerid',
      'shareit_name',
      'shareit_avatar',
      'shareit_profile_locked',
      'shareit_roomcode',
      'shareit_device_id',
    ];
    for (const key of keys) localStorage.removeItem(key);
  } catch (e) {
    // ignore (e.g. storage disabled)
  }
}
