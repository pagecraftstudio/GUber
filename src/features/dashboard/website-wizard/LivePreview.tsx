'use client';
import { useMemo, useState } from 'react';
import { SiteView, type SiteLinks } from '@/features/site/SiteView';
import type { SiteTrip } from '@/features/site/trips-data';
import { buildPreviewSite } from '@/features/website/preview-site';
import { buttonClass } from '@/ds/primitives/button-class';
import { useDashLang } from '../lang';
import { DeviceFrame } from './DeviceFrame';
import { useLiveDraft } from './LiveDraft';

const links: SiteLinks = { home: () => '#', page: () => '#', lang: () => '#' };

/**
 * The website as it looks with what is typed right now. It updates on every keystroke and links inside it do nothing, so the
 * owner can never click away from an unsaved form. Real routes and trips are shown; they are read on the server, never typed here.
 */
export function LivePreview({ companyName, companySlug, logoPath, supabaseUrl, trips }: { companyName: string; companySlug: string; logoPath: string | null; supabaseUrl: string; trips: SiteTrip[] }) {
  const dash = useDashLang();
  const live = useLiveDraft();
  const [locale, setLocale] = useState<'en' | 'ar'>(dash);
  const site = useMemo(() => (live ? buildPreviewSite({ companyName, companySlug, draft: live.draft, logoPath }) : null), [live, companyName, companySlug, logoPath]);
  const page = site?.site.pages[0];
  if (!site || !page) return null;
  const t = (en: string, ar: string) => (dash === 'ar' ? ar : en);
  return (
    <aside aria-label={t('Live preview', 'معاينة مباشرة')} className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{t('Live preview', 'معاينة مباشرة')}</h3>
        <div role="group" aria-label={t('Preview language', 'لغة المعاينة')} className="inline-flex gap-1 rounded-ds-md bg-surface-sunken p-1">
          {(['en', 'ar'] as const).map((l) => (
            <button key={l} type="button" aria-pressed={locale === l} onClick={() => setLocale(l)} className={buttonClass(locale === l ? 'secondary' : 'ghost', 'md', false, 'h-8')}>{l === 'en' ? 'English' : 'العربية'}</button>
          ))}
        </div>
      </div>
      {/* Anchors in the rendered site must not navigate: capture and cancel every click inside the frame. */}
      <div onClickCapture={(e) => { if ((e.target as HTMLElement).closest('a')) e.preventDefault(); }} className="max-h-[75vh] overflow-auto rounded-ds-lg">
        <DeviceFrame>
          <SiteView data={site} page={page} pageSlug={null} locale={locale} supabaseUrl={supabaseUrl} trips={trips} links={links} />
        </DeviceFrame>
      </div>
      <p className="text-xs text-ink-muted">{t('Changes show here as you type. They are saved when you press Save and continue.', 'تظهر التغييرات هنا أثناء الكتابة، وتُحفظ عند الضغط على حفظ ومتابعة.')}</p>
    </aside>
  );
}
