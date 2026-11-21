'use client';
import { StepForm } from './StepForm';
import { ColorField, TextField } from './parts';
import { saveIdentityStepAction } from '../wizard-actions';
import type { WebsiteSettings } from '@/features/website/types';

export function IdentityStep({ settings, canWrite, backHref, forwardHref }: { settings: WebsiteSettings; canWrite: boolean; backHref: string | null; forwardHref: string | null }) {
  return (
    <StepForm action={saveIdentityStepAction} step="identity" backHref={backHref} forwardHref={forwardHref} canWrite={canWrite}>
      <div className="grid gap-4 md:grid-cols-2">
        <TextField name="titleEn" label={{ en: 'Website name (English)', ar: 'اسم الموقع (الإنجليزية)' }} defaultValue={settings.siteTitle?.en ?? ''} lang="en" maxLength={120} />
        <TextField name="titleAr" label={{ en: 'Website name (Arabic)', ar: 'اسم الموقع (العربية)' }} defaultValue={settings.siteTitle?.ar ?? ''} dir="rtl" lang="ar" maxLength={120} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <ColorField name="primaryColor" label={{ en: 'Main colour', ar: 'اللون الرئيسي' }} defaultValue={settings.primaryColor} />
        <ColorField name="secondaryColor" label={{ en: 'Second colour', ar: 'اللون الثانوي' }} defaultValue={settings.secondaryColor} />
      </div>
    </StepForm>
  );
}
