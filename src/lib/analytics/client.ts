import type { AnalyticsLocale } from './copy';

/** Mirrors ANALYTICS_NOTICE_VERSION in ctx.ts without importing node:crypto into the browser bundle. */
type Scalar = string | number | boolean;

async function post(payload: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch('/api/track', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
      credentials: 'same-origin',
    });
    return res.ok;
  } catch {
    return false; // analytics must never break the page
  }
}

export const sendConsent = (granted: boolean) => post({ kind: 'consent', granted });

export const trackEvents = (locale: AnalyticsLocale, events: { event: string; properties?: Record<string, Scalar> }[]) =>
  post({ kind: 'events', path: window.location.pathname, locale, referrer: document.referrer || undefined, events });

export const trackSearch = (
  locale: AnalyticsLocale,
  s: { origin?: string; destination?: string; travelDate?: string; filters?: Record<string, Scalar>; resultsCount: number },
) => post({ kind: 'search', path: window.location.pathname, locale, ...s });
