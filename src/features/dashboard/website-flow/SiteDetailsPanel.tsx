'use client';
import { useEffect, useRef, type FormEvent } from 'react';
import { SaveStatus, viewOfForm } from '@/components/dashboard/SaveStatus';
import { useActionForm } from '../useActionForm';
import { useDashLang } from '../lang';
import { saveSiteDetailsFormAction } from '../wizard-actions';
import { AUTOSAVE_MS } from '../website-canvas/PopupFields';
import { useLiveDraft } from '../website-canvas/LiveCanvas';
import type { DetailsDraft } from '../website-canvas/live-overlay';
import { LogoCard } from '../website-wizard/LogoCard';
import { AreaField, TextField } from '../website-wizard/parts';

export type SiteDetails = { titleEn: string; titleAr: string; email: string; phone: string; whatsapp: string; addressEn: string; addressAr: string; footerEn: string; footerAr: string };

/** Name, logo and contact details in one place, kept out of the way until wanted. The name is the only required part. */
export function SiteDetailsPanel({ settings: s, logoUrl, canWrite }: { settings: SiteDetails; logoUrl: string | null; canWrite: boolean }) {
  const lang = useDashLang();
  const t = (en: string, ar: string) => (lang === 'ar' ? ar : en);
  const live = useLiveDraft();
  const { state, pending, ref, submit } = useActionForm(saveSiteDetailsFormAction);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const read = (form: HTMLFormElement): { fd: FormData; draft: DetailsDraft } => {
    const fd = new FormData(form), g = (k: string) => String(fd.get(k) ?? '');
    return { fd, draft: { titleEn: g('titleEn'), titleAr: g('titleAr'), email: g('email'), phone: g('phone'), whatsapp: g('whatsapp'), addressEn: g('addressEn'), addressAr: g('addressAr'), footerEn: g('footerEn'), footerAr: g('footerAr') } };
  };
  // The name is required to save, so a half-erased name shows in the preview but is not sent until it is filled again.
  const save = (form: HTMLFormElement) => { const { fd, draft } = read(form); if (draft.titleEn.trim() || draft.titleAr.trim()) submit(fd); };
  const onInput = (e: FormEvent<HTMLFormElement>) => {
    const form = e.currentTarget;
    live.setDetails(read(form).draft);
    clearTimeout(timer.current); timer.current = setTimeout(() => save(form), AUTOSAVE_MS);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <details className="mb-3 rounded-ds-lg border border-line-default bg-surface-card">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium">{t('Website name, logo and contact details', 'اسم الموقع والشعار وبيانات التواصل')}</summary>
      <div className="space-y-5 border-t border-line-default p-4">
        <LogoCard logoUrl={logoUrl} canWrite={canWrite} />
        <form ref={ref} onInput={onInput} onSubmit={(e) => { e.preventDefault(); clearTimeout(timer.current); save(e.currentTarget); }} className="space-y-5">
          <fieldset disabled={!canWrite} className="min-w-0 space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <TextField name="titleEn" label={{ en: 'Website name (English)', ar: 'اسم الموقع (الإنجليزية)' }} defaultValue={s.titleEn} lang="en" maxLength={120} />
              <TextField name="titleAr" label={{ en: 'Website name (Arabic)', ar: 'اسم الموقع (العربية)' }} defaultValue={s.titleAr} dir="rtl" lang="ar" maxLength={120} />
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <TextField name="email" type="email" dir="ltr" autoComplete="off" inputMode="email" label={{ en: 'Email', ar: 'البريد الإلكتروني' }} defaultValue={s.email} maxLength={254} />
              <TextField name="phone" type="tel" dir="ltr" autoComplete="off" inputMode="tel" label={{ en: 'Phone', ar: 'الهاتف' }} defaultValue={s.phone} maxLength={40} />
              <TextField name="whatsapp" type="tel" dir="ltr" autoComplete="off" inputMode="tel" label={{ en: 'WhatsApp', ar: 'واتساب' }} defaultValue={s.whatsapp} maxLength={40} />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <AreaField name="addressEn" label={{ en: 'Address (English)', ar: 'العنوان (الإنجليزية)' }} defaultValue={s.addressEn} lang="en" maxLength={300} />
              <AreaField name="addressAr" label={{ en: 'Address (Arabic)', ar: 'العنوان (العربية)' }} defaultValue={s.addressAr} dir="rtl" lang="ar" maxLength={300} />
              <TextField name="footerEn" label={{ en: 'Footer text (English)', ar: 'نص التذييل (الإنجليزية)' }} defaultValue={s.footerEn} lang="en" maxLength={500} />
              <TextField name="footerAr" label={{ en: 'Footer text (Arabic)', ar: 'نص التذييل (العربية)' }} defaultValue={s.footerAr} dir="rtl" lang="ar" maxLength={500} />
            </div>
          </fieldset>
          {canWrite && <div className="flex items-center justify-end gap-3"><p className="text-xs text-ink-muted">{t('Saves automatically', 'يُحفظ تلقائيًا')}</p><SaveStatus view={viewOfForm(state, pending)} /></div>}
        </form>
      </div>
    </details>
  );
}
