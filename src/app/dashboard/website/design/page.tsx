import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireTenant } from '@/lib/auth/guards';
import { can } from '@/lib/auth/permissions';
import { PERMISSIONS } from '@/lib/auth/permission-keys';
import { createClient } from '@/lib/supabase/server';
import { createTenantServiceContext } from '@/lib/service/context';
import { getEnv } from '@/lib/env';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Bi } from '@/components/dashboard/T';
import { pagesService } from '@/features/website/pages-service';
import { websiteService } from '@/features/website/service';
import { wizardService } from '@/features/website/wizard-service';
import { mediaService } from '@/features/media/media-service';
import { buildCanvasSite } from '@/features/website/canvas-site';
import { SiteView, type SiteLinks } from '@/features/site/SiteView';
import { needsTrips } from '@/features/site/Sections';
import { getSiteTrips, type SiteTrip } from '@/features/site/trips-data';
import { DEFAULT_SITE_LOCALE, mediaUrl, parseLocale } from '@/features/site/text';
import { CanvasShell } from '@/features/dashboard/website-canvas/CanvasShell';

export const metadata: Metadata = { robots: { index: false, follow: false } };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const inert: SiteLinks = { home: () => '#', page: () => '#', lang: () => '#' };

/**
 * Visual editor: the draft of ONE page, drawn by the public site's own renderer, with click-to-edit blocks. Nothing here can make
 * content public (publishing stays on /dashboard/website/publish and needs website.publish). Page id and language come from the URL
 * only to choose WHICH of the signed-in company's own pages to draw: the read is company-filtered and RLS-bound, so a foreign id is a 404.
 */
export default async function WebsiteDesignPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [auth, sp] = await Promise.all([requireTenant('website.read'), searchParams]);
  const canWrite = can(auth, PERMISSIONS.websiteWrite);
  const ctx = createTenantServiceContext(await createClient(), auth);
  const pages = canWrite ? await pagesService.ensureHomePage(ctx) : await pagesService.listPages(ctx);
  const askedId = first(sp.page);
  const selected = askedId ? (UUID.test(askedId) ? pages.find((p) => p.id === askedId) : undefined) : pages.find((p) => p.isHome);
  if (!selected) { if (askedId || pages.length > 0) notFound(); return <p className="text-sm"><Bi en="The website has not been set up yet. Ask someone with edit access to open this page." ar="لم يُعدّ الموقع بعد. اطلب من شخص لديه صلاحية التعديل فتح هذه الصفحة." /></p>; }
  const locale = parseLocale(first(sp.lang)) ?? DEFAULT_SITE_LOCALE;

  const [{ sections }, settings] = await Promise.all([pagesService.getPageWithSections(ctx, selected.id), websiteService.getSettings(ctx)]);
  const logoPath = settings.logoMediaId ? (await wizardService.read(ctx).catch(() => null))?.logoPath ?? null : null;
  // Banner images of THIS page's hero sections: a company-filtered read of the signed-in company's own media. Without media.read (or on
  // any failure) the blocks are drawn without their pictures, never an error: editing text must not depend on image lookups.
  const heroImageIds = sections.flatMap((s) => (typeof s.content.image_media_id === 'string' ? [s.content.image_media_id] : []));
  const images = await mediaService.imageEntries(ctx, heroImageIds).catch(() => ({}));
  const supabaseUrl = getEnv().NEXT_PUBLIC_SUPABASE_URL;
  const imageUrls = Object.fromEntries(sections.flatMap((s) => {
    const id = s.content.image_media_id, entry = typeof id === 'string' ? (images as Record<string, { path: string; mime: string }>)[id] : undefined;
    const url = mediaUrl(supabaseUrl, entry);
    return url ? [[s.id, url]] : [];
  }));
  const view = buildCanvasSite({ companyName: auth.membership.companyName, companySlug: auth.membership.companySlug, settings, pages, selected, sections, logoPath, images });
  let trips: SiteTrip[] = [];
  if (needsTrips(view.data.site)) { try { trips = await getSiteTrips(ctx.companyId); } catch { trips = []; } }   // a trips outage must not break editing

  const q = (pageId: string | null, l: string) => `/dashboard/website/design?${new URLSearchParams({ ...(pageId ? { page: pageId } : {}), lang: l })}`;
  const tab = 'rounded-ds-md px-3 py-1.5 text-sm';
  return (
    <>
      <PageHeader eyebrow="Brand presence" title={<Bi en="Customize your website" ar="خصّص موقعك" />}
        description={canWrite
          ? <Bi en="Click any section to edit it. Use the + between sections to add one. Changes are drafts until you publish." ar="اضغط على أي قسم لتعديله. استخدم + بين الأقسام لإضافة قسم. التغييرات مسودة حتى تنشر." />
          : <Bi en="This is your draft. You can look but not edit." ar="هذه مسودتك. يمكنك المشاهدة دون تعديل." />}
        action={<span className="flex gap-4 text-sm font-semibold"><Link href="/dashboard/website/preview" className="underline"><Bi en="Preview" ar="معاينة" /></Link><Link href="/dashboard/website/publish" className="underline"><Bi en="Publish" ar="النشر" /></Link></span>} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Pages" className="flex flex-wrap gap-1 rounded-ds-md bg-surface-sunken p-1">
          {pages.map((p) => (
            <Link key={p.id} href={q(p.isHome ? null : p.id, locale)} aria-current={p.id === selected.id ? 'page' : undefined} className={`${tab} ${p.id === selected.id ? 'bg-surface-card font-medium shadow-sm' : 'text-ink-secondary hover:text-ink-primary'}`}>
              {(locale === 'ar' ? p.title.ar || p.title.en : p.title.en || p.title.ar) || p.slug || 'Home'}
            </Link>
          ))}
          {canWrite ? <Link href="/dashboard/website/pages" className={`${tab} text-ink-secondary hover:text-ink-primary`}><Bi en="Manage pages" ar="إدارة الصفحات" /></Link> : null}
        </nav>
        <div role="group" aria-label="Site language" className="inline-flex overflow-hidden rounded-ds-md border border-line-default text-sm">
          {(['en', 'ar'] as const).map((l) => <Link key={l} href={q(selected.isHome ? null : selected.id, l)} aria-current={l === locale ? 'true' : undefined} className={`px-3 py-1.5 ${l === locale ? 'bg-action text-on-action' : 'bg-surface-card hover:bg-surface-sunken'}`}>{l === 'ar' ? 'العربية' : 'English'}</Link>)}
        </div>
      </div>
      <CanvasShell pageId={selected.id} sections={sections} canWrite={canWrite} canUpload={can(auth, PERMISSIONS.mediaWrite)} imageUrls={imageUrls}>
        <SiteView data={view.data} page={view.page} pageSlug={selected.isHome ? null : selected.slug} locale={locale} supabaseUrl={supabaseUrl} trips={trips} links={inert} editor={view.blocks} />
      </CanvasShell>
    </>
  );
}
