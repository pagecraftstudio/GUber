'use client';
import { useId } from 'react';
import { FormField, FormResult, inputClass, SubmitButton } from '@/components/dashboard/FormParts';
import type { CompanySettings } from '@/features/companies/types';
import { fieldErr } from './CreateForms';
import { updateSettingsFormAction } from './form-actions';
import { useDashLang } from './lang';
import { SETTINGS_UI } from './messages';
import { useActionForm } from './useActionForm';

const check = 'size-5 rounded border-slate-400 accent-blue-700';

/** Company settings. Values are the ones the server just read; the server action re-validates everything. */
export function SettingsForm({ settings }: { settings: CompanySettings }) {
  const lang = useDashLang();
  const T = SETTINGS_UI[lang];
  const uid = useId();
  const { state, pending, ref, onSubmit } = useActionForm(updateSettingsFormAction);
  const num = (name: string, label: string, value: number, min: number, max: number, hint?: string) => (
    <FormField name={name} label={label} type="number" inputMode="numeric" min={min} max={max} step="1" required defaultValue={String(value)} hint={hint} error={fieldErr(state, lang, name)} />
  );
  return (
    <form ref={ref} onSubmit={onSubmit} aria-labelledby={`${uid}-t`} className="max-w-3xl space-y-5 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <h2 id={`${uid}-t`} className="font-bold">{T.booking}</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField name="timezone" label={T.timezone} hint={T.timezoneHint} required defaultValue={settings.timezone} autoComplete="off" error={fieldErr(state, lang, 'timezone')} />
        <FormField name="currency" label={T.currency} hint={T.currencyHint} required defaultValue={settings.currency} autoComplete="off" error={fieldErr(state, lang, 'currency')} />
        <div>
          <label htmlFor={`${uid}-dl`} className="block text-xs font-semibold text-slate-700 dark:text-slate-300">{T.defaultLocale}</label>
          <select id={`${uid}-dl`} name="defaultLocale" defaultValue={settings.defaultLocale} className={inputClass(!!fieldErr(state, lang, 'defaultLocale'))}>
            <option value="ar">{T.ar}</option><option value="en">{T.en}</option>
          </select>
          {fieldErr(state, lang, 'defaultLocale') && <p className="mt-1 text-xs font-semibold text-red-700 dark:text-red-300">{fieldErr(state, lang, 'defaultLocale')}</p>}
        </div>
        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold text-slate-700 dark:text-slate-300">{T.supportedLocales}</legend>
          {(['ar', 'en'] as const).map((l) => (
            <label key={l} className="flex min-h-8 items-center gap-2 text-sm"><input type="checkbox" name="supportedLocales" value={l} defaultChecked={settings.supportedLocales.includes(l)} className={check} />{T[l]}</label>
          ))}
        </fieldset>
        {num('bookingCutoffMinutes', T.cutoff, settings.bookingCutoffMinutes, 0, 525600)}
        {num('cancellationWindowHours', T.cancelWindow, settings.cancellationWindowHours, 0, 8760)}
        {num('maxSeatsPerBooking', T.maxSeats, settings.maxSeatsPerBooking, 1, 50)}
        {num('tripBufferMinutes', T.buffer, settings.tripBufferMinutes, 0, 600, T.bufferHint)}
      </div>
      <div className="space-y-2">
        <label className="flex min-h-8 items-center gap-2 text-sm font-semibold"><input type="checkbox" name="bookingEnabled" defaultChecked={settings.bookingEnabled} className={check} />{T.bookingEnabled}</label>
        <label className="flex min-h-8 items-center gap-2 text-sm font-semibold"><input type="checkbox" name="allowGuestBooking" defaultChecked={settings.allowGuestBooking} className={check} />{T.allowGuestBooking}</label>
      </div>
      <SubmitButton pending={pending} blocked={false}>{T.save}</SubmitButton>
      <FormResult state={state} />
    </form>
  );
}
