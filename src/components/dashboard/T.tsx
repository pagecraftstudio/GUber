'use client';
import { useDashLang } from '@/features/dashboard/lang';
import { PAGE_AR } from '@/features/dashboard/messages';

/** Page chrome written in English inside a server page; shows the Arabic from PAGE_AR when the dashboard is Arabic. */
export function T({ children }: { children: string }) {
  const lang = useDashLang();
  return <>{lang === 'ar' ? (PAGE_AR[children] ?? children) : children}</>;
}

/** Both languages given at the call site (for new pages, no dictionary lookup). */
export function Bi({ en, ar }: { en: string; ar: string }) {
  return <>{useDashLang() === 'ar' ? ar : en}</>;
}

/** Date/time in the dashboard language (Latin digits, so they match phone numbers and references). Server and browser may differ in time zone, hence suppressHydrationWarning. */
export function Dt({ value, time = false }: { value: string; time?: boolean }) {
  const lang = useDashLang();
  const d = new Date(value);
  const locale = lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB';
  const text = time ? d.toLocaleString(locale) : d.toLocaleDateString(locale);
  return <time dateTime={value} dir="ltr" suppressHydrationWarning>{text}</time>;
}
