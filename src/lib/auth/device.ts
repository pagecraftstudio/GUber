import { createHmac } from 'node:crypto';

export type DeviceInput = { ip: string | null; userAgent: string | null };
export type DeviceFingerprint = { hash: string; label: string };

/** Network part only: IPv4 /24, IPv6 first three groups. The raw address is never hashed whole and never leaves this module. */
export function coarseNetwork(ip: string | null): string {
  const v = (ip ?? '').split(',')[0]?.trim() ?? '';
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(v)) return v.split('.').slice(0, 3).join('.');
  if (v.includes(':')) return v.toLowerCase().split(':').slice(0, 3).join(':');
  return 'unknown';
}

const BROWSERS: ReadonlyArray<readonly [RegExp, string]> = [
  [/edg(e|a|ios)?\//i, 'Edge'], [/opr\/|opera/i, 'Opera'], [/firefox|fxios/i, 'Firefox'], [/chrome|crios|chromium/i, 'Chrome'], [/safari/i, 'Safari'],
];
const SYSTEMS: ReadonlyArray<readonly [RegExp, string]> = [
  [/iphone|ipad|ios/i, 'iOS'], [/android/i, 'Android'], [/windows/i, 'Windows'], [/mac os x|macintosh/i, 'macOS'], [/cros/i, 'ChromeOS'], [/linux/i, 'Linux'],
];
const pick = (list: ReadonlyArray<readonly [RegExp, string]>, ua: string, fallback: string): string => list.find(([re]) => re.test(ua))?.[1] ?? fallback;

/** Browser family + operating system, e.g. "Chrome on Windows". No version, so a browser update does not look like a new device. */
export function deviceLabel(userAgent: string | null): string {
  const ua = (userAgent ?? '').slice(0, 300);
  return `${pick(BROWSERS, ua, 'Unknown browser')} on ${pick(SYSTEMS, ua, 'Unknown system')}`;
}

/** Keyed hash (HMAC-SHA256, 64 hex chars). Same network + browser family + system + same secret = same hash. A short secret is refused. */
export function deviceFingerprint(input: DeviceInput, secret: string): DeviceFingerprint {
  if (secret.length < 32) throw new Error('PLATFORM_DEVICE_SECRET must be at least 32 characters');
  const label = deviceLabel(input.userAgent);
  const hash = createHmac('sha256', secret).update(`${coarseNetwork(input.ip)}|${label}`).digest('hex');
  return { hash, label };
}
