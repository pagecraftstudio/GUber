import Link from 'next/link';
import { notFound } from 'next/navigation';
import { can } from '@/lib/auth/permissions';
import { PERMISSIONS } from '@/lib/auth/permission-keys';
import type { TenantContext } from '@/lib/auth/guards';
import type { TenantServiceContext } from '@/lib/service/context';
import { getEnv } from '@/lib/env';
import { Bi } from '@/components/dashboard/T';
import { pagesService } from '@/features/website/pages-service';
import { websiteService } from '@/features/website/service';
import { mediaService } from '@/features/media/media-service';
import { buildCanvasSite } from '@/features/website/canvas-site';
import { getSiteTrips, type SiteTrip } from '@/features/site/trips-data';
import { DEFAULT_SITE_LOCALE, mediaUrl, parseLocale } from '@/features/site/text';
import { SITE_FONT_CLASSES } from '@/ds/fonts/site-fonts';
import { LiveCanvas, LiveProvider } from '../website-canvas/LiveCanvas';
import { LookPanel } from '../website-canvas/LookPanel';
import { AddPage } from './AddPage';
import { SiteDetailsPanel } from './SiteDetailsPanel';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * Visual editor: the draft of ONE page, drawn by the public site's own renderer, with click-to-edit blocks. Nothing here can make
 * content public (publishing is the last step and needs website.publish). Page id and language come from the URL
 * only to choose WHICH of the signed-in company's own pages to draw: the read is company-filtered and RLS-bound, so a foreign id is a 404.
 */
export async function CanvasStep({ ctx, auth, sp }: { ctx: TenantServiceContext; auth: TenantContext; sp: Record<string, string | string[] | undefined> }) {
  const canWrite = can(auth, PERMISSIONS.websiteWrite);
  const pages = await pagesService.listPages(ctx);          // the starter site (home page) was ensured by the page itself, once
  const askedId = first(sp.page);
  const selected = askedId ? (UUID.test(askedId) ? pages.find((p) => p.id === askedId) : undefined) : pages.find((p) => p.isHome);
  if (!selected) { if (askedId || pages.length > 0) notFound(); return <p className="text-sm"><Bi en="The website has not been set up yet. Ask someone with edit access to open this page." ar="لم يُعدّ الموقع بعد. اطلب من شخص لديه صلاحية التعديل فتح هذه الصفحة." /></p>; }
  const locale = parseLocale(first(sp.lang)) ?? DEFAULT_SITE_LOCALE;

  const [{ sections }, settings] = await Promise.all([pagesService.getPageWithSections(ctx, selected.id), websiteService.getSettings(ctx)]);
  // Banner images of THIS page's hero sections and the logo: company-filtered reads of the signed-in company's own media, in parallel
  // with the trips. Without media.read (or on any failure) blocks are drawn without pictures, never an error: editing text must not
  // depend on image lookups.
  const heroImageIds = sections.flatMap((s) => (typeof s.content.image_media_id === 'string' ? [s.content.image_media_id] : []));
  const canReadMedia = can(auth, PERMISSIONS.mediaRead);
  const wantsTrips = sections.some((s) => s.type === 'trips' || s.type === 'routes');
  const [logoPath, images, trips] = await Promise.all([
    settings.logoMediaId && canReadMedia ? mediaService.imagePath(ctx, settings.logoMediaId).catch(() => null) : Promise.resolve(null),
    mediaService.imageEntries(ctx, heroImageIds).catch(() => ({})),
    wantsTrips ? getSiteTrips(ctx.companyId).catch((): SiteTrip[] => []) : Promise.resolve([] as SiteTrip[]),   // a trips outage must not break editing
  ]);
  const supabaseUrl = getEnv().NEXT_PUBLIC_SUPABASE_URL;
  const imageUrls = Object.fromEntries(sections.flatMap((s) => {
    const id = s.content.image_media_id, entry = typeof id === 'string' ? (images as Record<string, { path: string; mime: string }>)[id] : undefined;
    const url = mediaUrl(supabaseUrl, entry);
    return url ? [[s.id, url]] : [];
  }));
  const view = buildCanvasSite({ companyName: auth.membership.companyName, companySlug: auth.membership.companySlug, settings, pages, selected, sections, logoPath, images });

  const q = (pageId: string | null, l: string) => `/dashboard/website?${new URLSearchParams({ step: 'design', ...(pageId ? { page: pageId } : {}), lang: l })}`;
  const tab = 'rounded-ds-md px-3 py-1.5 text-sm';
  return (
    <LiveProvider><div className={SITE_FONT_CLASSES}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Pages" className="flex flex-wrap gap-1 rounded-ds-md bg-surface-sunken p-1">
          {pages.map((p) => (
            <Link key={p.id} href={q(p.isHome ? null : p.id, locale)} aria-current={p.id === selected.id ? 'page' : undefined} className={`${tab} ${p.id === selected.id ? 'bg-surface-card font-medium shadow-sm' : 'text-ink-secondary hover:text-ink-primary'}`}>
              {(locale === 'ar' ? p.title.ar || p.title.en : p.title.en || p.title.ar) || p.slug || 'Home'}
            </Link>
          ))}
          {canWrite ? <AddPage /> : null}
          {canWrite ? <Link href="/dashboard/website/pages" className={`${tab} text-ink-secondary hover:text-ink-primary`}><Bi en="Manage pages" ar="إدارة الصفحات" /></Link> : null}
        </nav>
        <div role="group" aria-label="Site language" className="inline-flex overflow-hidden rounded-ds-md border border-line-default text-sm">
          {(['en', 'ar'] as const).map((l) => <Link key={l} href={q(selected.isHome ? null : selected.id, l)} aria-current={l === locale ? 'true' : undefined} className={`px-3 py-1.5 ${l === locale ? 'bg-action text-on-action' : 'bg-surface-card hover:bg-surface-sunken'}`}>{l === 'ar' ? 'العربية' : 'English'}</Link>)}
        </div>
      </div>
      <SiteDetailsPanel canWrite={canWrite} logoUrl={mediaUrl(supabaseUrl, logoPath ? { path: logoPath, mime: 'image/png' } : undefined)} settings={{ titleEn: settings.siteTitle?.en ?? '', titleAr: settings.siteTitle?.ar ?? '', email: settings.contactEmail ?? '', phone: settings.contactPhone ?? '', whatsapp: settings.contactWhatsapp ?? '', addressEn: settings.contactAddress?.en ?? '', addressAr: settings.contactAddress?.ar ?? '', footerEn: settings.footerText?.en ?? '', footerAr: settings.footerText?.ar ?? '' }} />
      <LookPanel canWrite={canWrite} look={{ fontHeading: settings.fontHeading, fontBody: settings.fontBody, buttonStyle: settings.buttonStyle, primaryColor: settings.primaryColor, secondaryColor: settings.secondaryColor }} />
      <LiveCanvas key={selected.id} shell={{ pageId: selected.id, sections, canWrite, canUpload: can(auth, PERMISSIONS.mediaWrite), imageUrls }}
        site={{ data: view.data, page: view.page, pageSlug: selected.isHome ? null : selected.slug, locale, supabaseUrl, trips, editor: view.blocks }} />
    </div></LiveProvider>
  );
}
