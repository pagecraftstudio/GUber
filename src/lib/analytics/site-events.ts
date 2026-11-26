'use client';
import { useEffect } from 'react';
import { EVENT_KEYS } from './events';
import { trackEvents } from './client';
import type { AnalyticsLocale } from './copy';

/** The only events a company page may emit through markup. Anything else in an attribute is ignored. */
const SITE_EVENTS = ['cta_click', 'book_click', 'contact_click', 'subscription_request_click'] as const;
type SiteEvent = (typeof SITE_EVENTS)[number];
type Props = Record<string, string | number | boolean>;

/**
 * Reads one tracked element: data-track="<event>" and data-track-props='{"key":"value"}'.
 * The markup is rendered by the server, but the check is repeated here and again in the database (catalog): only catalogued events,
 * only their allowed keys, only short scalars. Anything else returns null and nothing is sent.
 */
export function readTracked(el: Element | null): { event: SiteEvent; properties: Props } | null {
  const host = el?.closest('[data-track]');
  const event = host?.getAttribute('data-track');
  if (!host || !event || !(SITE_EVENTS as readonly string[]).includes(event)) return null;
  const allowed = EVENT_KEYS[event as SiteEvent] as readonly string[];
  let raw: unknown = {};
  try { raw = JSON.parse(host.getAttribute('data-track-props') ?? '{}'); } catch { return null; }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const properties: Props = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!allowed.includes(k)) return null;
    if (typeof v === 'string' && v.length <= 200) properties[k] = v;
    else if (typeof v === 'number' || typeof v === 'boolean') properties[k] = v;
    else return null;
  }
  return { event: event as SiteEvent, properties };
}

/**
 * Company public site only, and only after the visitor agreed: one delegated click listener (so the server-rendered sections stay server components)
 * and one section_view per section per page load, when at least half of it has been on screen.
 */
export function useSiteEvents(enabled: boolean, locale: AnalyticsLocale): void {
  useEffect(() => {
    if (!enabled) return;
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || !(e.target instanceof Element)) return;
      const t = readTracked(e.target);
      if (t) void trackEvents(locale, [{ event: t.event, properties: t.properties }]);
    };
    document.addEventListener('click', onClick);

    const seen = new Set<string>();
    let io: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver((entries) => {
        for (const en of entries) {
          const section = en.isIntersecting ? en.target.getAttribute('data-track-section') : null;
          if (!section || !/^[a-z_]{1,32}$/.test(section) || seen.has(section)) continue;
          seen.add(section);
          io?.unobserve(en.target);
          void trackEvents(locale, [{ event: 'section_view', properties: { section } }]);
        }
      }, { threshold: 0.5 });
      document.querySelectorAll('[data-track-section]').forEach((n) => io!.observe(n));
    }
    return () => { document.removeEventListener('click', onClick); io?.disconnect(); };
  }, [enabled, locale]);
}
