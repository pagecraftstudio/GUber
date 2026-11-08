'use client';
import { useId } from 'react';
import { T } from '@/components/dashboard/T';
import { SaveStatus, viewOfForm } from '@/components/dashboard/SaveStatus';
import type { FormState } from './form-state';
import { saveWebsiteFormAction } from './form-actions';
import { useAutosaveForm } from './useAutosave';
import { fieldErr } from './CreateForms';
import { useDashLang } from './lang';

type Values = { titleEn: string; titleAr: string; primaryColor: string; secondaryColor: string; footerEn: string; footerAr: string; contactEmail: string; contactPhone: string; contactWhatsapp: string };

const card = 'space-y-4 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900';

function Field({ name, label, defaultValue, dir, state }: { name: string; label: string; defaultValue: string; dir?: 'ltr'; state: FormState }) {
  const lang = useDashLang();
  const err = fieldErr(state, lang, name);
  return (
    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400"><T>{label}</T>
      <input name={name} dir={dir} defaultValue={defaultValue} aria-invalid={err ? true : undefined}
        className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
      {err && <span className="mt-1 block text-xs font-semibold text-red-700 dark:text-red-300">{err}</span>}
    </label>
  );
}

/** Website settings: no save button. Every change is saved shortly after typing stops; the status shows at the top. */
export function WebsiteForm({ v }: { v: Values }) {
  const uid = useId();
  const { state, pending, formProps } = useAutosaveForm(saveWebsiteFormAction);
  return (
    <form {...formProps} aria-describedby={`${uid}-s`} className="grid gap-6 lg:grid-cols-2">
      <div id={`${uid}-s`} className="lg:col-span-2"><SaveStatus view={viewOfForm(state, pending)} className="text-xs" /></div>
      <section className={card}>
        <h2 className="font-bold"><T>Website identity</T></h2>
        <Field state={state} name="titleEn" label="Website title (English)" defaultValue={v.titleEn} />
        <Field state={state} name="titleAr" label="Website title (Arabic)" defaultValue={v.titleAr} />
        <div className="grid grid-cols-2 gap-3">
          <Field state={state} dir="ltr" name="primaryColor" label="Primary colour" defaultValue={v.primaryColor} />
          <Field state={state} dir="ltr" name="secondaryColor" label="Secondary colour" defaultValue={v.secondaryColor} />
        </div>
        <Field state={state} name="footerEn" label="Footer text (English)" defaultValue={v.footerEn} />
        <Field state={state} name="footerAr" label="Footer text (Arabic)" defaultValue={v.footerAr} />
      </section>
      <section className={card}>
        <h2 className="font-bold"><T>Customer contact</T></h2>
        <Field state={state} dir="ltr" name="contactEmail" label="Email address" defaultValue={v.contactEmail} />
        <Field state={state} dir="ltr" name="contactPhone" label="Phone number" defaultValue={v.contactPhone} />
        <Field state={state} dir="ltr" name="contactWhatsapp" label="WhatsApp number" defaultValue={v.contactWhatsapp} />
        <div className="rounded-xl bg-slate-50 p-4 text-xs leading-5 text-slate-600 dark:bg-slate-800 dark:text-slate-400"><T>Publishing, custom domains, logo uploads and multi-page content editing are separate workflows and are not enabled by this settings form.</T></div>
      </section>
    </form>
  );
}
