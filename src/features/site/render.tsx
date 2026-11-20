import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { tenantAccent } from '@/ds/contrast';
import { readTenantConfig } from '@/lib/tenant/config';
import { tenantHref, tenantUrl } from '@/lib/tenant/url';
import { resolveTenantBySlug } from '@/lib/tenant/resolve';
import { getEnv } from '@/lib/env';
import { getPublicSite } from './data';
import { needsTrips, Sections, SiteFooter, type SectionsCtx } from './Sections';
import type { SitePage } from './schema';
import { DEFAULT_SITE_LOCALE, mediaUrl, parseLocale, pick, type SiteLocale } from './text';
import { getSiteTrips } from './trips-data';

type SearchParams = Record<string, string | string[] | undefined>;
const localeFrom = (sp: SearchParams): SiteLocale => parseLocale(Array.isArray(sp.lang) ? sp.lang[0] : sp.lang) ?? DEFAULT_SITE_LOCALE;
const pagePath = (pageSlug: string | null) => (pageSlug ? `/${pageSlug}` : '/');

/** home (pageSlug null) or a published non-home page. Anything else -> undefined (caller: notFound). */
function findPage(pages: SitePage[], pageSlug: string | null): SitePage | undefined {
  return pageSlug === null ? pages.find((p) => p.is_home) : pages.find((p) => !p.is_home && p.slug === pageSlug);
}

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
  const st = data.site.settings;
  // Invalid / low-contrast company colour -> no override: the platform action colours (tokens) apply through the var() fallbacks.
  const accent = tenantAccent(st.primary_color);
  const logo = mediaUrl(env.NEXT_PUBLIC_SUPABASE_URL, st.logo_media_id ? data.site.media[st.logo_media_id] : undefined);
  const name = pick(st.site_title, locale) || data.company.name;

  let trips: SectionsCtx['trips'] = [];
  if (needsTrips(data.site)) {
    const tenant = await resolveTenantBySlug(slug);
    if (!tenant) notFound();
    trips = await getSiteTrips(tenant.companyId);
  }
  const ctx: SectionsCtx = { site: data.site, locale, supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL, trips };
  const other: SiteLocale = locale === 'ar' ? 'en' : 'ar';
  const navPages = data.site.pages.filter((p) => !p.is_home);

  return (
    <div lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'} className="min-h-screen bg-surface-page text-ink-primary" style={accent ? { ['--site-accent' as string]: accent.accent, ['--site-on-accent' as string]: accent.onAccent } : undefined}>
      <header className="border-b border-line-default">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <a href={tenantHref(cfg, data.company.slug, '/')} className="flex items-center gap-2 font-semibold">
            {logo ? <img src={logo} alt="" className="h-8 w-auto" /> : null}<span>{name}</span>
          </a>
          <nav aria-label={locale === 'ar' ? 'التنقل' : 'Main'} className="flex items-center gap-4 text-sm">
            {navPages.map((p) => <a key={p.slug} href={tenantHref(cfg, data.company.slug, `/${p.slug}`)}>{pick(p.title, locale) || p.slug}</a>)}
            <a href={`${tenantHref(cfg, data.company.slug, pagePath(pageSlug))}?lang=${other}`} hrefLang={other} lang={other}>{other === 'ar' ? 'العربية' : 'English'}</a>
          </nav>
        </div>
      </header>
      <main><Sections sections={page.sections} ctx={ctx} /></main>
      <SiteFooter ctx={ctx} name={name} />
    </div>
  );
}
