import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { readTenantConfig } from '@/lib/tenant/config';
import { tenantHref, tenantUrl } from '@/lib/tenant/url';
import { resolveTenantBySlug, type ResolvedTenant } from '@/lib/tenant/resolve';
import { getEnv } from '@/lib/env';
import { AnalyticsRoot } from '@/components/analytics/AnalyticsRoot';
import { platformUrl } from '@/lib/tenant/url';
import { getPublicSite } from './data';
import { needsTrips } from './Sections';
import { findPage, SiteView, type SiteLinks } from './SiteView';
import { DEFAULT_SITE_LOCALE, parseLocale, pick, type SiteLocale } from './text';
import { getSiteTrips, type SiteTrip } from './trips-data';
import { getSitePlans } from './plans-data';
import { needsPlans, type SitePlan } from './plans';
import { getSiteRating } from './rating-data';
import type { SiteRating } from './SiteRatingBadge';

type SearchParams = Record<string, string | string[] | undefined>;
const localeFrom = (sp: SearchParams): SiteLocale => parseLocale(Array.isArray(sp.lang) ? sp.lang[0] : sp.lang) ?? DEFAULT_SITE_LOCALE;
const pagePath = (pageSlug: string | null) => (pageSlug ? `/${pageSlug}` : '/');

export async function siteMetadata(slug: string, pageSlug: string | null, sp: SearchParams): Promise<Metadata> {
  const data = await getPublicSite(slug);
  if (!data) return { robots: { index: false, follow: false } };
  const locale = localeFrom(sp);
  const cfg = readTenantConfig(process.env);
  const page = findPage(data.site.pages, pageSlug);
  const st = data.site.settings;
  const siteTitle = pick(st.site_title, locale) || data.company.name;
  const pageTitle = pick(page?.seo_title, locale) || pick(page?.title, locale);
  const title = pageTitle && pageSlug !== null ? `${pageTitle} · ${siteTitle}` : siteTitle;
  const description = pick(page?.seo_description, locale) || pick(st.meta_description, locale) || undefined;
  // Path mode: the platform host is not the tenant's brand, nothing under /s/ is indexed (also sent as X-Robots-Tag, headers.ts).
  const indexable = cfg.mode === 'subdomain';
  return {
    title: { absolute: title },
    ...(description ? { description } : {}),
    robots: indexable ? { index: true, follow: true } : { index: false, follow: false },
    alternates: { canonical: tenantUrl(cfg, data.company.slug, pagePath(pageSlug)) },
  };
}

export async function renderSitePage(slug: string, pageSlug: string | null, sp: SearchParams) {
  const data = await getPublicSite(slug);
  if (!data) notFound();                                 // unknown / suspended / unpublished: one indistinguishable answer
  const page = findPage(data.site.pages, pageSlug);
  if (!page) notFound();

  const locale = localeFrom(sp);
  const cfg = readTenantConfig(process.env);
  const env = getEnv();
  // The tenant is resolved at most once per render, however many parts need its id (trips, plans, rating).
  let tenantOnce: Promise<ResolvedTenant | null> | undefined;
  const tenantOf = () => (tenantOnce ??= resolveTenantBySlug(slug));
  let trips: SiteTrip[] = [];
  if (needsTrips(data.site)) {
    const tenant = await tenantOf();
    if (!tenant) notFound();
    trips = await getSiteTrips(tenant.companyId);
  }
  let plans: SitePlan[] = [];
  if (needsPlans(data.site.pages.map((p) => p.sections))) {
    const tenant = await tenantOf();
    if (!tenant) notFound();
    plans = await getSitePlans(tenant.companyId);
  }
  // The rating never blocks the page: any failure (including resolving the tenant) just means no badge.
  let rating: SiteRating | null = null;
  try {
    const tenant = await tenantOf();
    rating = tenant ? await getSiteRating(tenant.companyId) : null;
  } catch { rating = null; }
  const cs = data.company.slug;
  const links: SiteLinks = {
    home: () => tenantHref(cfg, cs, '/'),
    page: (p) => tenantHref(cfg, cs, `/${p}`),
    lang: (p, l) => `${tenantHref(cfg, cs, pagePath(p))}?lang=${l}`,
  };
  return (
    <>
      <SiteView data={data} page={page} pageSlug={pageSlug} locale={locale} supabaseUrl={env.NEXT_PUBLIC_SUPABASE_URL} trips={trips} plans={plans} links={links} rating={rating} track />
      {/* Consent banner + page views for THIS site (P10). Consent is per host, so a visitor is asked here too. The privacy notice lives on the platform host in both tenant modes. */}
      <AnalyticsRoot site locale={locale} privacyHref={platformUrl(cfg, '/privacy')} />
    </>
  );
}
