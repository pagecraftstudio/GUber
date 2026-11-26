'use client';

import { useEffect, useState } from 'react';
import type { AnalyticsLocale } from './copy';

const read = (): AnalyticsLocale => (document.documentElement.lang === 'ar' ? 'ar' : 'en');

/**
 * The marketplace keeps its language in a client context (LocaleContext) that sets <html lang>. The banner is mounted by a server layout
 * and cannot read that context, so it follows <html lang> instead. English until the page has hydrated.
 */
export function useAnalyticsLocale(): AnalyticsLocale {
  const [locale, setLocale] = useState<AnalyticsLocale>('en');
  useEffect(() => {
    setLocale(read());
    const mo = new MutationObserver(() => setLocale(read()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    return () => mo.disconnect();
  }, []);
  return locale;
}
