import Link from 'next/link';
import { getEnv } from '@/lib/env';
import type { TenantServiceContext } from '@/lib/service/context';
import { Bi } from '@/components/dashboard/T';
import { previewService, type PreviewIssue } from '@/features/website/preview-service';
import { findPage, SiteView, type SiteLinks } from '@/features/site/SiteView';
import { needsTrips } from '@/features/site/Sections';
import { getSiteTrips, type SiteTrip } from '@/features/site/trips-data';
import { getSitePlans } from '@/features/site/plans-data';
import { needsPlans, type SitePlan } from '@/features/site/plans';
import { DEFAULT_SITE_LOCALE, parseLocale } from '@/features/site/text';
import { buttonClass } from '@/ds/primitives/button-class';
import { DeviceFrame } from './DeviceFrame';

/** Which step fixes which problem, so the message is a link and not a dead end. */
export const ISSUE_FIX: Record<PreviewIssue, { en: string; ar: string }> = {
  settings_missing: { en: 'Name your website first.', ar: 'سمِّ موقعك أولًا.' },
  title_required: { en: 'Add a website name.', ar: 'أضف اسم الموقع.' },
  home_page_required: { en: 'The home page is missing.', ar: 'الصفحة الرئيسية غير موجودة.' },
  home_section_required: { en: 'The home page has nothing to show yet. Add a headline.', ar: 'لا يوجد ما يُعرض في الرئيسية بعد. أضف عنوانًا.' },
  too_large: { en: 'The site is too large. Shorten some text.', ar: 'الموقع كبير جدًا. اختصر بعض النصوص.' },
  invalid_content: { en: 'Some text is not allowed (HTML or an unsafe link).', ar: 'بعض النصوص غير مسموحة (HTML أو رابط غير آمن).' },
};
export async function PreviewStep({ ctx, lang, pageSlug }: { ctx: TenantServiceContext; lang: string | undefined; pageSlug: string | undefined }) {
  const result = await previewService.getDraft(ctx);
  if (!result.ok) {
    const fix = ISSUE_FIX[result.issue];
    return (
      <div role="alert" className="space-y-3 rounded-ds-lg border border-line-default bg-surface-card p-5 text-sm">
        <p><Bi en={fix.en} ar={fix.ar} /></p>
        <Link href="/dashboard/website?step=design" className={buttonClass('secondary', 'md')}><Bi en="Back to customize" ar="العودة إلى التخصيص" /></Link>
      </div>
    );
  }
  const data = result.data;
  const locale = parseLocale(lang) ?? DEFAULT_SITE_LOCALE;
  const slug = pageSlug && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(pageSlug) ? pageSlug : null;   // only chooses which of this company's own published pages to draw
  const page = findPage(data.site.pages, slug) ?? findPage(data.site.pages, null);
  const trips: SiteTrip[] = needsTrips(data.site) ? await getSiteTrips(ctx.companyId) : [];
  const plans: SitePlan[] = needsPlans(data.site.pages.map((p) => p.sections)) ? await getSitePlans(ctx.companyId).catch(() => []) : [];
  const q = (p: string | null, l: string) => `/dashboard/website?${new URLSearchParams({ step: 'preview', ...(p ? { page: p } : {}), lang: l })}`;
  const links: SiteLinks = { home: () => q(null, locale), page: (p) => q(p, locale), lang: (p, l) => q(p, l) };
  return (
    <DeviceFrame>
      {page
        ? <SiteView data={data} page={page} pageSlug={page.is_home ? null : page.slug} locale={locale} supabaseUrl={getEnv().NEXT_PUBLIC_SUPABASE_URL} trips={trips} plans={plans} links={links} />
        : <p className="p-6 text-sm"><Bi en="The home page has nothing to show yet." ar="لا يوجد ما يُعرض في الرئيسية بعد." /></p>}
    </DeviceFrame>
  );
}
