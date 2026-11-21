import Link from 'next/link';
import { getEnv } from '@/lib/env';
import type { TenantServiceContext } from '@/lib/service/context';
import { Bi } from '@/components/dashboard/T';
import { previewService, type PreviewIssue } from '@/features/website/preview-service';
import { findPage, SiteView, type SiteLinks } from '@/features/site/SiteView';
import { needsTrips } from '@/features/site/Sections';
import { getSiteTrips, type SiteTrip } from '@/features/site/trips-data';
import { DEFAULT_SITE_LOCALE, parseLocale } from '@/features/site/text';
import type { WizardStep } from '@/features/website/wizard-state';
import { buttonClass } from '@/ds/primitives/button-class';
import { DeviceFrame } from './DeviceFrame';

/** Which step fixes which problem, so the message is a link and not a dead end. */
export const ISSUE_FIX: Record<PreviewIssue, { step: WizardStep; en: string; ar: string }> = {
  settings_missing: { step: 'identity', en: 'Name your website first.', ar: 'سمِّ موقعك أولًا.' },
  title_required: { step: 'identity', en: 'Add a website name.', ar: 'أضف اسم الموقع.' },
  home_page_required: { step: 'content', en: 'The home page is missing.', ar: 'الصفحة الرئيسية غير موجودة.' },
  home_section_required: { step: 'content', en: 'The home page has nothing to show yet. Add a headline.', ar: 'لا يوجد ما يُعرض في الرئيسية بعد. أضف عنوانًا.' },
  too_large: { step: 'content', en: 'The site is too large. Shorten some text.', ar: 'الموقع كبير جدًا. اختصر بعض النصوص.' },
  invalid_content: { step: 'content', en: 'Some text is not allowed (HTML or an unsafe link).', ar: 'بعض النصوص غير مسموحة (HTML أو رابط غير آمن).' },
};
const STEP_LABEL: Record<WizardStep, { en: string; ar: string }> = {
  identity: { en: 'Go to brand', ar: 'الذهاب إلى العلامة' }, content: { en: 'Go to home page', ar: 'الذهاب إلى الرئيسية' },
  contact: { en: 'Go to contact', ar: 'الذهاب إلى التواصل' }, preview: { en: 'Go to preview', ar: 'الذهاب إلى المعاينة' }, publish: { en: 'Go to publish', ar: 'الذهاب إلى النشر' },
};

export async function PreviewStep({ ctx, lang }: { ctx: TenantServiceContext; lang: string | undefined }) {
  const result = await previewService.getDraft(ctx);
  if (!result.ok) {
    const fix = ISSUE_FIX[result.issue];
    return (
      <div role="alert" className="space-y-3 rounded-ds-lg border border-line-default bg-surface-card p-5 text-sm">
        <p><Bi en={fix.en} ar={fix.ar} /></p>
        <Link href={`/dashboard/website?step=${fix.step}`} className={buttonClass('secondary', 'md')}><Bi en={STEP_LABEL[fix.step].en} ar={STEP_LABEL[fix.step].ar} /></Link>
      </div>
    );
  }
  const data = result.data;
  const locale = parseLocale(lang) ?? DEFAULT_SITE_LOCALE;
  const page = findPage(data.site.pages, null);
  const trips: SiteTrip[] = needsTrips(data.site) ? await getSiteTrips(ctx.companyId) : [];
  const q = (l: string) => `/dashboard/website?${new URLSearchParams({ step: 'preview', lang: l })}`;
  const links: SiteLinks = { home: () => q(locale), page: () => q(locale), lang: (_p, l) => q(l) };
  return (
    <DeviceFrame>
      {page
        ? <SiteView data={data} page={page} pageSlug={null} locale={locale} supabaseUrl={getEnv().NEXT_PUBLIC_SUPABASE_URL} trips={trips} links={links} />
        : <p className="p-6 text-sm"><Bi en="The home page has nothing to show yet." ar="لا يوجد ما يُعرض في الرئيسية بعد." /></p>}
    </DeviceFrame>
  );
}
