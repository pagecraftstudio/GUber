import { tenantAccent } from '@/ds/contrast';
import { Sections, SiteFooter, type SectionsCtx } from './Sections';
import type { EditorBlock } from './editor-markup';
import type { PublicSite, SitePage } from './schema';
import { mediaUrl, pick, type SiteLocale } from './text';
import type { SiteTrip } from './trips-data';

/** Where the links inside the rendered site point: the public site, or (for the dashboard preview) back into the preview. */
export type SiteLinks = { home: () => string; page: (pageSlug: string) => string; lang: (pageSlug: string | null, locale: SiteLocale) => string };

/** home (pageSlug null) or a published non-home page. Anything else -> undefined (caller: notFound). */
export function findPage(pages: SitePage[], pageSlug: string | null): SitePage | undefined {
  return pageSlug === null ? pages.find((p) => p.is_home) : pages.find((p) => !p.is_home && p.slug === pageSlug);
}

/**
 * Pure presentation of one site page. No data fetching, no notFound(): the caller loads the data (published snapshot for the public
 * site, draft for the dashboard preview) and decides what a missing page means. Everything the page may show comes from `data`.
 */
export function SiteView({ data, page, pageSlug, locale, supabaseUrl, trips, links, editor }: {
  data: PublicSite; page: SitePage; pageSlug: string | null; locale: SiteLocale; supabaseUrl: string; trips: SiteTrip[]; links: SiteLinks;
  /** Dashboard canvas only: makes each section clickable (see editor-markup.tsx). Never set for the public site. */
  editor?: EditorBlock[];
}) {
  const st = data.site.settings;
  // Invalid / low-contrast company colour -> no override: the platform action colours (tokens) apply through the var() fallbacks.
  const accent = tenantAccent(st.primary_color);
  const logo = mediaUrl(supabaseUrl, st.logo_media_id ? data.site.media[st.logo_media_id] : undefined);
  const name = pick(st.site_title, locale) || data.company.name;
  const ctx: SectionsCtx = { site: data.site, locale, supabaseUrl, trips };
  const other: SiteLocale = locale === 'ar' ? 'en' : 'ar';
  const navPages = data.site.pages.filter((p) => !p.is_home);
  return (
    <div lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'} className={`${editor ? 'min-h-full' : 'min-h-screen'} bg-surface-page text-ink-primary`} style={accent ? { ['--site-accent' as string]: accent.accent, ['--site-on-accent' as string]: accent.onAccent } : undefined}>
      <header className="border-b border-line-default">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <a href={links.home()} className="flex items-center gap-2 font-semibold">
            {logo ? <img src={logo} alt="" className="h-8 w-auto" /> : null}<span>{name}</span>
          </a>
          <nav aria-label={locale === 'ar' ? 'التنقل' : 'Main'} className="flex items-center gap-4 text-sm">
            {navPages.map((p) => <a key={p.slug} href={links.page(p.slug)}>{pick(p.title, locale) || p.slug}</a>)}
            <a href={links.lang(pageSlug, other)} hrefLang={other} lang={other}>{other === 'ar' ? 'العربية' : 'English'}</a>
          </nav>
        </div>
      </header>
      <main><Sections sections={page.sections} ctx={ctx} {...(editor ? { editor } : {})} /></main>
      <SiteFooter ctx={ctx} name={name} />
    </div>
  );
}
