/**
 * The ONLY place that calls Intl / toLocale*. Components and pages call these (plan 5.7 rule 1; guard.test.ts enforces it).
 * Policy (D6): displayed numbers follow the interface language. Arabic UI = Arabic-Indic digits, English UI = Latin digits.
 * Identifiers (booking reference, phone, email, slug, QR payload, student ID) are NOT formatted here, see <Identifier>.
 * Stored values never change; this is display only.
 */
export type Lang = 'ar' | 'en';

/** Locale tags are explicit so no browser default numbering system can leak in. */
const LOCALE: Record<Lang, string> = {
  ar: 'ar-EG-u-ca-gregory-nu-arab',
  en: 'en-GB-u-ca-gregory-nu-latn',
};

const CURRENCY_SYMBOL: Record<string, { ar: string; en: string }> = {
  EGP: { ar: 'ج.م', en: 'EGP' },
};

export const localeFor = (lang: Lang): string => LOCALE[lang];

export function formatNumber(value: number, lang: Lang, opts: { maximumFractionDigits?: number; minimumFractionDigits?: number } = {}): string {
  if (!Number.isFinite(value)) return '';
  return new Intl.NumberFormat(LOCALE[lang], { maximumFractionDigits: opts.maximumFractionDigits ?? 0, ...(opts.minimumFractionDigits !== undefined ? { minimumFractionDigits: opts.minimumFractionDigits } : {}) }).format(value);
}

export function formatPercent(fraction: number, lang: Lang, maximumFractionDigits = 0): string {
  if (!Number.isFinite(fraction)) return '';
  return new Intl.NumberFormat(LOCALE[lang], { style: 'percent', maximumFractionDigits }).format(fraction);
}

/**
 * Money. Arabic: "٥٠ ج.م". English: "EGP 50". Other currencies show their ISO code.
 * Whole amounts show no decimals and fractional ones show two, so a column of mixed values stays readable;
 * pass `fixed: true` for table columns that must always show two decimals.
 */
export function formatMoney(amount: number, currency: string, lang: Lang, opts: { fixed?: boolean } = {}): string {
  if (!Number.isFinite(amount)) return '';
  const whole = Math.abs(amount * 100 - Math.round(amount * 100)) < 1e-6 && Math.round(amount * 100) % 100 === 0;
  const digits = opts.fixed ? 2 : whole ? 0 : 2;
  const n = formatNumber(amount, lang, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const symbol = CURRENCY_SYMBOL[currency.toUpperCase()]?.[lang] ?? currency.toUpperCase();
  return lang === 'ar' ? `${n} ${symbol}` : `${symbol} ${n}`;
}

type Instant = string | number | Date;
const toDate = (v: Instant): Date => (v instanceof Date ? v : new Date(v));
const valid = (d: Date) => !Number.isNaN(d.getTime());

/** Date in the company time zone (pass it), so every viewer sees the same wall-clock day. */
export function formatDate(value: Instant, lang: Lang, opts: { timeZone?: string; style?: 'numeric' | 'long' } = {}): string {
  const d = toDate(value);
  if (!valid(d)) return '';
  const dateStyle = opts.style === 'long' ? { day: 'numeric', month: 'long', year: 'numeric' } as const : { day: '2-digit', month: '2-digit', year: 'numeric' } as const;
  return new Intl.DateTimeFormat(LOCALE[lang], { ...dateStyle, ...(opts.timeZone ? { timeZone: opts.timeZone } : {}) }).format(d);
}

/** Four-digit year with no thousands separator, in the language's digits (footer copyright). */
export function formatYear(value: Instant, lang: Lang): string {
  const d = toDate(value);
  return valid(d) ? new Intl.DateTimeFormat(LOCALE[lang], { year: 'numeric' }).format(d) : '';
}

/** 24-hour clock in both languages (O2 b: matches today, no am/pm ambiguity on tickets). */
export function formatTime(value: Instant, lang: Lang, opts: { timeZone?: string } = {}): string {
  const d = toDate(value);
  if (!valid(d)) return '';
  return new Intl.DateTimeFormat(LOCALE[lang], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', ...(opts.timeZone ? { timeZone: opts.timeZone } : {}) }).format(d);
}

export function formatDateTime(value: Instant, lang: Lang, opts: { timeZone?: string } = {}): string {
  const date = formatDate(value, lang, opts);
  const time = formatTime(value, lang, opts);
  return date && time ? `${date} ${time}` : '';
}

/** "3 h 30 min" / "٣ س ٣٠ د". Hours and minutes only; zero parts are dropped. */
export function formatDuration(totalMinutes: number, lang: Lang): string {
  if (!Number.isFinite(totalMinutes) || totalMinutes < 0) return '';
  const m = Math.round(totalMinutes);
  const h = Math.floor(m / 60);
  const min = m % 60;
  const unit = lang === 'ar' ? { h: 'س', m: 'د' } : { h: 'h', m: 'min' };
  const parts: string[] = [];
  if (h > 0) parts.push(`${formatNumber(h, lang)} ${unit.h}`);
  if (min > 0 || h === 0) parts.push(`${formatNumber(min, lang)} ${unit.m}`);
  return parts.join(' ');
}

export { normalizeDigits, parseAmountInput, parseIntegerInput, integerFromInput, normalizeDigitsUnknown } from './normalize-digits';
