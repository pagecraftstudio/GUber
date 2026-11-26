import { createHmac } from 'node:crypto';

/** Must equal app_private.analytics_config.notice_version (migration 0068). Bump both together to re-ask consent. */
export const ANALYTICS_NOTICE_VERSION = '1';

export const AID_COOKIE = 'msr_aid'; // anonymous id: consent subject + event session. Set ONLY after consent is granted.
export const CONSENT_COOKIE = 'msr_cn'; // "<version>:granted|denied", so the banner is not shown again.

export type DeviceClass = 'mobile' | 'tablet' | 'desktop' | 'bot';

/** Daily-rotating HMAC of the client IP. The raw IP is never stored or sent to the database. */
export function dailyIpHash(ip: string | null, secret: string | undefined, now = new Date()): string | null {
  if (!ip || !secret || secret.length < 32) return null;
  return createHmac('sha256', secret).update(`${now.toISOString().slice(0, 10)}|${ip}`).digest('hex');
}

export function deviceClass(ua: string | null): DeviceClass {
  const u = ua ?? '';
  if (/bot|crawl|spider|slurp|headless|lighthouse/i.test(u)) return 'bot';
  if (/ipad|tablet/i.test(u)) return 'tablet';
  if (/mobi|android|iphone/i.test(u)) return 'mobile';
  return 'desktop';
}

export function clientIp(h: Headers): string | null {
  const xff = h.get('x-forwarded-for')?.split(',')[0]?.trim();
  return xff || h.get('x-real-ip') || null;
}

/** Edge country header (Vercel). VERIFY on the real deployment. Country only, never city or coordinates. */
export function edgeCountry(h: Headers): string | null {
  const c = h.get('x-vercel-ip-country');
  return c && /^[A-Z]{2}$/.test(c) ? c : null;
}

export function referrerHost(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    return new URL(raw).hostname.toLowerCase().slice(0, 100);
  } catch {
    return null;
  }
}
