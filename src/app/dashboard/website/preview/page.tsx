import type { Metadata } from 'next';
import Link from 'next/link';
import { requireTenant } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { createTenantServiceContext } from '@/lib/service/context';
import { getEnv } from '@/lib/env';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Bi } from '@/components/dashboard/T';
import { previewService, type PreviewIssue } from '@/features/website/preview-service';
import { findPage, SiteView, type SiteLinks } from '@/features/site/SiteView';
import { needsTrips } from '@/features/site/Sections';
import { getSiteTrips, type SiteTrip } from '@/features/site/trips-data';
import { DEFAULT_SITE_LOCALE, parseLocale } from '@/features/site/text';

/** Draft preview is private to signed-in staff and must never be indexed (also under /dashboard, belt and braces). */
export const metadata: Metadata = { robots: { index: false, follow: false } };
const PAGE_SLUG_RE = /^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$/;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const ISSUE_TEXT: Record<PreviewIssue, { en: string; ar: string }> = {
  settings_missing: { en: 'Save the website settings first.', ar: 'احفظ إعدادات الموقع أولًا.' },
  title_required: { en: 'Add a website title in Website settings.', ar: 'أضف عنوان الموقع في إعدادات الموقع.' },
  home_page_required: { en: 'The home page must be included when publishing.', ar: 'يجب تضمين الصفحة الرئيسية عند النشر.' },
  home_section_required: { en: 'The home page needs at least one visible section.', ar: 'تحتاج الصفحة الرئيسية إلى قسم واحد ظاهر على الأقل.' },
  too_large: { en: 'The site is too large. Remove some content.', ar: 'الموقع كبير جدًا. احذف بعض المحتوى.' },
  invalid_content: { en: 'Some content is not allowed (HTML or an unsafe link). Check your sections.', ar: 'بعض المحتوى غير مسموح (HTML أو رابط غير آمن). راجع أقسامك.' },
};

export default async function WebsitePreviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [auth, sp] = await Promise.all([requireTenant('website.read'), searchParams]);
  const ctx = createTenantServiceContext(await createClient(), auth);
  const result = await previewService.getDraft(ctx);
  const header = <PageHeader eyebrow="Brand presence" title="Draft preview" description="This is how your website will look if you publish now. It is private to your team." action={<Link href="/dashboard/website/pages" className="text-sm font-semibold underline"><Bi en="Back to editing" ar="العودة للتحرير" /></Link>} />;

  if (!result.ok) {
    return (<>{header}<p role="alert" className="rounded-2xl border border-line-default bg-surface-card p-5 text-sm"><Bi en={ISSUE_TEXT[result.issue].en} ar={ISSUE_TEXT[result.issue].ar} /></p></>);
  }
  const data = result.data;
  const rawPage = first(sp.page);
  const pageSlug = rawPage && PAGE_SLUG_RE.test(rawPage) ? rawPage : null;
  const page = findPage(data.site.pages, pageSlug);
  const locale = parseLocale(first(sp.lang)) ?? DEFAULT_SITE_LOCALE;
  // company_id is the signed-in user's own membership, never a URL value.
  const trips: SiteTrip[] = needsTrips(data.site) ? await getSiteTrips(ctx.companyId) : [];
  const q = (p: string | null, l: string) => `/dashboard/website/preview?${new URLSearchParams({ ...(p ? { page: p } : {}), lang: l })}`;
  const links: SiteLinks = { home: () => q(null, locale), page: (p) => q(p, locale), lang: (p, l) => q(p, l) };
  return (
    <>
      {header}
      <p role="status" className="mb-4 rounded-xl border border-line-default bg-surface-card px-4 py-2 text-xs font-semibold"><Bi en="Draft preview. Not public. Live routes and trips are real." ar="معاينة المسودة. غير منشورة. الخطوط والرحلات المعروضة حقيقية." /></p>
      <div className="overflow-hidden rounded-2xl border border-line-default">
        {page
          ? <SiteView data={data} page={page} pageSlug={pageSlug} locale={locale} supabaseUrl={getEnv().NEXT_PUBLIC_SUPABASE_URL} trips={trips} links={links} />
          : <p className="p-6 text-sm"><Bi en="This page is not included in the draft (check that it is published and has a visible section)." ar="هذه الصفحة غير مضمّنة في المسودة (تأكد أنها مضمّنة عند النشر ولها قسم ظاهر)." /></p>}
      </div>
    </>
  );
}
