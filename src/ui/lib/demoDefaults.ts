import { isMockMode } from './runtime';

/**
 * Development-mock-only demo values (fixed campus, fixed 2026-10-14 date, demo company id).
 * Real mode returns '' / real dates. `process.env.NODE_ENV` is a build-time constant, so production bundles
 * contain none of these literals.
 */
const demo = (value: string): string => (process.env.NODE_ENV !== 'production' && isMockMode() ? value : '');
export const demoDate = (): string => demo('2026-10-14');
export const demoDestLocationId = (): string => demo('loc_galala_univ');
export const demoDestStopId = (): string => demo('stop_gc_galala_main');
export const demoCompanyId = (): string => demo('comp_galala_connect');

const iso = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export interface QuickDate { iso: string; label: { en: string; ar: string } }
/** Real mode: today and tomorrow from the user's clock. Mock mode: the original fixed demo dates. */
export function quickDates(now: Date = new Date()): QuickDate[] {
  if (process.env.NODE_ENV !== 'production' && isMockMode()) {
    return [
      { iso: '2026-10-14', label: { en: 'Today (Oct 14)', ar: 'اليوم (١٤ أكتوبر)' } },
      { iso: '2026-10-15', label: { en: 'Tomorrow (Oct 15)', ar: 'غداً (١٥ أكتوبر)' } },
    ];
  }
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const fmt = (d: Date, l: string) => new Intl.DateTimeFormat(l, { day: 'numeric', month: 'short' }).format(d);
  return [
    { iso: iso(now), label: { en: `Today (${fmt(now, 'en')})`, ar: `اليوم (${fmt(now, 'ar-EG')})` } },
    { iso: iso(tomorrow), label: { en: `Tomorrow (${fmt(tomorrow, 'en')})`, ar: `غداً (${fmt(tomorrow, 'ar-EG')})` } },
  ];
}
