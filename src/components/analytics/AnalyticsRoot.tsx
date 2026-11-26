import { cookies } from 'next/headers';
import { ANALYTICS_NOTICE_VERSION, CONSENT_COOKIE } from '@/lib/analytics/ctx';
import type { AnalyticsLocale } from '@/lib/analytics/copy';
import { AnalyticsClient, type ConsentState } from './AnalyticsClient';

/** Server wrapper: reads the consent cookie (httpOnly, so the browser cannot) and hands the state down. A cookie from an older notice version counts as unset, so the banner re-asks. */
export async function readConsentState(): Promise<ConsentState> {
  const v = (await cookies()).get(CONSENT_COOKIE)?.value;
  if (v === `${ANALYTICS_NOTICE_VERSION}:granted`) return 'granted';
  if (v === `${ANALYTICS_NOTICE_VERSION}:denied`) return 'denied';
  return 'unset';
}

/** `site` = a company's public website: counts site_page_view, tracks clicks and section views, and links the privacy notice at `privacyHref`. */
export async function AnalyticsRoot({ locale, site, privacyHref }: { locale?: AnalyticsLocale; site?: boolean; privacyHref?: string } = {}) {
  return <AnalyticsClient locale={locale} initial={await readConsentState()} site={site} privacyHref={privacyHref} />;
}
