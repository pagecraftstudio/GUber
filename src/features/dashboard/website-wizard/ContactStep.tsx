'use client';
import { StepForm } from './StepForm';
import { AreaField, TextField } from './parts';
import { saveContactStepAction } from '../wizard-actions';
import type { WebsiteSettings } from '@/features/website/types';

export function ContactStep({ settings: s, canWrite, backHref, forwardHref }: { settings: WebsiteSettings; canWrite: boolean; backHref: string | null; forwardHref: string | null }) {
  return (
    <StepForm action={saveContactStepAction} step="contact" backHref={backHref} forwardHref={forwardHref} canWrite={canWrite}>
      <div className="grid gap-4 md:grid-cols-3">
        <TextField name="email" type="email" dir="ltr" autoComplete="off" inputMode="email" label={{ en: 'Email', ar: 'البريد الإلكتروني' }} defaultValue={s.contactEmail ?? ''} maxLength={254} />
        <TextField name="phone" type="tel" dir="ltr" autoComplete="off" inputMode="tel" label={{ en: 'Phone', ar: 'الهاتف' }} defaultValue={s.contactPhone ?? ''} maxLength={40} />
        <TextField name="whatsapp" type="tel" dir="ltr" autoComplete="off" inputMode="tel" label={{ en: 'WhatsApp', ar: 'واتساب' }} defaultValue={s.contactWhatsapp ?? ''} maxLength={40} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <AreaField name="addressEn" label={{ en: 'Address (English)', ar: 'العنوان (الإنجليزية)' }} defaultValue={s.contactAddress?.en ?? ''} lang="en" maxLength={300} />
        <AreaField name="addressAr" label={{ en: 'Address (Arabic)', ar: 'العنوان (العربية)' }} defaultValue={s.contactAddress?.ar ?? ''} dir="rtl" lang="ar" maxLength={300} />
        <TextField name="footerEn" label={{ en: 'Footer text (English)', ar: 'نص التذييل (الإنجليزية)' }} defaultValue={s.footerText?.en ?? ''} lang="en" maxLength={500} />
        <TextField name="footerAr" label={{ en: 'Footer text (Arabic)', ar: 'نص التذييل (العربية)' }} defaultValue={s.footerText?.ar ?? ''} dir="rtl" lang="ar" maxLength={500} />
      </div>
    </StepForm>
  );
}
