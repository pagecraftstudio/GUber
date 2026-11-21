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
    <aside aria-label={t('Live preview', 'معاينة مباشرة')} className="min-w-0 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{t('Live preview', 'معاينة مباشرة')}</h3>
        <div className="flex items-center gap-1">
          {live!.open && (
            <div role="group" aria-label={t('Preview language', 'لغة المعاينة')} className="inline-flex gap-0.5 rounded-ds-md bg-surface-sunken p-0.5">
              {(['en', 'ar'] as const).map((l) => (
                <button key={l} type="button" aria-pressed={locale === l} onClick={() => setLocale(l)} className={buttonClass(locale === l ? 'secondary' : 'ghost', 'md', false, 'h-7 px-2 text-xs')}>{l === 'en' ? 'EN' : 'عربي'}</button>
              ))}
            </div>
          )}
          <button type="button" aria-expanded={live!.open} onClick={() => live!.setOpen(!live!.open)} className={buttonClass('ghost', 'md', false, 'h-7 px-2 text-xs')}>{live!.open ? t('Hide', 'إخفاء') : t('Show preview', 'إظهار المعاينة')}</button>
        </div>
      </div>
      {live!.open && (
        <>
          {/* Anchors in the rendered site must not navigate: capture and cancel every click inside the frame. */}
          <div onClickCapture={(e) => { if ((e.target as HTMLElement).closest('a')) e.preventDefault(); }} className="max-h-[78vh] overflow-auto rounded-ds-lg">
            <DeviceFrame defaultPhone compact>
              <SiteView data={site} page={page} pageSlug={null} locale={locale} supabaseUrl={supabaseUrl} trips={trips} links={links} />
            </DeviceFrame>
          </div>
          <p className="text-xs text-ink-muted">{t('Updates as you type. Saved when you press Save and continue.', 'يتحدث أثناء الكتابة، ويُحفظ عند الضغط على حفظ ومتابعة.')}</p>
        </>
      )}
    </aside>
  );
}
