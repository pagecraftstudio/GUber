'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { cx, FOCUS } from '@/ds/primitives/cx';
import { sendConsent, trackEvents } from '@/lib/analytics/client';
import { ANALYTICS_COPY, type AnalyticsLocale } from '@/lib/analytics/copy';
import { useAnalyticsLocale } from '@/lib/analytics/use-locale';
import { useSiteEvents } from '@/lib/analytics/site-events';
import { screenFromPath } from '@/lib/analytics/screen';
import { track } from '@/lib/analytics/events';

export type ConsentState = 'unset' | 'granted' | 'denied';

// Accept and reject share one style on purpose: equal prominence, no dark pattern.
const BTN = cx('min-h-11 rounded-ds-md border border-line-default bg-surface-card px-4 text-base font-medium text-ink-primary', FOCUS);

/** Consent banner + page-view tracking. Mount once in the marketplace root layout via <AnalyticsRoot>. */
/** Staff areas. dashboard: records which screen was opened (feature_use, no ids). driver: banner only; the driver app sends its own scan events. */
export type AnalyticsArea = 'dashboard' | 'driver';

export function AnalyticsClient({ locale: localeProp, initial, site = false, privacyHref, area }: { locale?: AnalyticsLocale; initial: ConsentState; site?: boolean; privacyHref?: string; area?: AnalyticsArea }) {
  const detected = useAnalyticsLocale();
  const locale = localeProp ?? detected;
  const t = ANALYTICS_COPY[locale];
  const [state, setState] = useState<ConsentState>(initial);
  const [busy, setBusy] = useState(false);
  const path = usePathname();
  const last = useRef<string | null>(null);

  useEffect(() => {
    if (state !== 'granted' || last.current === path || area === 'driver') return;
    last.current = path;
    if (area === 'dashboard') track(locale, 'feature_use', { screen: screenFromPath(path), action: 'open' });
    else void trackEvents(locale, [{ event: site ? 'site_page_view' : 'page_view' }]);
  }, [state, path, locale, site, area]);
  useSiteEvents(site && state === 'granted', locale);

  async function choose(granted: boolean) {
    setBusy(true);
    const ok = await sendConsent(granted);
    setBusy(false);
    if (ok) setState(granted ? 'granted' : 'denied');
  }

  if (state !== 'unset') return null;
  return (
    <section
      role="region"
      aria-labelledby="consent-title"
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
      className="fixed inset-x-0 bottom-0 z-50 border-t border-line-default bg-surface-card p-4 shadow-lg"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-3">
        <h2 id="consent-title" className="text-base font-semibold text-ink-primary">{t.bannerTitle}</h2>
        <p className="text-sm text-ink-secondary">{t.bannerBody}</p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={BTN} disabled={busy} onClick={() => choose(true)}>{t.accept}</button>
          <button type="button" className={BTN} disabled={busy} onClick={() => choose(false)}>{t.reject}</button>
          <Link href={privacyHref ?? t.privacyHref} className={cx('text-sm text-ink-secondary underline', FOCUS)}>{t.learnMore}</Link>
        </div>
      </div>
    </section>
  );
}
