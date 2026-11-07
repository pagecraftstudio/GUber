'use client';
import { useId } from 'react';
import { FormField, FormResult, PlanLimitNotice, SubmitButton } from '@/components/dashboard/FormParts';
import { allowanceFor, blocksSubmit, type PlanUsage, type UsageKey } from '@/features/subscriptions/usage';
import { createBusFormAction, createDriverFormAction } from './form-actions';
import { useDashLang } from './lang';
import { fieldErrorText, FORM_TEXT, LABELS } from './messages';
import type { FormState } from './form-state';
import { useActionForm } from './useActionForm';

/** Fresh numbers from a refused submit win over the numbers the page loaded with. */
export const liveUsage = (initial: PlanUsage | null, state: FormState): PlanUsage | null => (state.status === 'error' && state.usage !== undefined ? state.usage : initial);
export const fieldErr = (state: FormState, lang: 'en' | 'ar', name: string): string | null =>
  state.status === 'error' && state.fields?.[name] ? fieldErrorText(lang, state.fields[name]!) : null;

function CreateForm({ resource, usage, title, action, submitLabel, children }: {
  resource: UsageKey; usage: PlanUsage | null; title: string; action: Parameters<typeof useActionForm>[0]; submitLabel: string;
  children: (err: (name: string) => string | null) => React.ReactNode;
}) {
  const lang = useDashLang();
  const reasonId = useId();
  const noticeId = `${reasonId}-n`;
  const { state, pending, ref, onSubmit } = useActionForm(action, {
    resetOnSuccess: true,
    isBlocked: (st) => blocksSubmit(allowanceFor(liveUsage(usage, st), resource)),
  });
  const current = liveUsage(usage, state);
  const blocked = blocksSubmit(allowanceFor(current, resource));
  return (
    <form ref={ref} onSubmit={onSubmit} aria-labelledby={`${reasonId}-t`} className="h-fit space-y-3 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <h2 id={`${reasonId}-t`} className="font-bold">{title}</h2>
      <PlanLimitNotice usage={current} resource={resource} id={noticeId} />
      <p className="text-xs text-slate-600 dark:text-slate-400">{LABELS[lang].required}</p>
      {children((n) => fieldErr(state, lang, n))}
      <SubmitButton pending={pending} blocked={blocked} describedBy={noticeId}>{submitLabel}</SubmitButton>
      {blocked && <p className="text-xs font-semibold text-red-700 dark:text-red-300">{FORM_TEXT[lang].limitBlocked}</p>}
      <FormResult state={state} resource={resource} />
    </form>
  );
}

export function BusCreateForm({ usage }: { usage: PlanUsage | null }) {
  const lang = useDashLang();
  const L = LABELS[lang];
  return (
    <CreateForm resource="max_buses" usage={usage} title={L.addBus} action={createBusFormAction} submitLabel={L.addBusBtn}>
      {(err) => (<>
        <FormField dir="ltr" name="plateNumber" label={L.plate} required error={err('plateNumber')} />
        <FormField name="name" label={L.busName} error={err('name')} />
        <FormField name="capacity" label={L.seats} type="number" min={1} step="1" inputMode="numeric" required error={err('capacity')} />
        <div className="grid grid-cols-2 gap-2"><FormField name="make" label={L.make} error={err('make')} /><FormField name="model" label={L.model} error={err('model')} /></div>
      </>)}
    </CreateForm>
  );
}

export function DriverCreateForm({ usage }: { usage: PlanUsage | null }) {
  const lang = useDashLang();
  const L = LABELS[lang];
  return (
    <CreateForm resource="max_drivers" usage={usage} title={L.addDriver} action={createDriverFormAction} submitLabel={L.addDriverBtn}>
      {(err) => (<>
        <FormField name="fullName" label={L.fullName} required error={err('fullName')} />
        <FormField dir="ltr" name="phone" label={L.phone} type="tel" autoComplete="off" required error={err('phone')} />
        <FormField dir="ltr" name="licenseNumber" label={L.license} error={err('licenseNumber')} />
        <FormField name="licenseExpiry" label={L.licenseExpiry} type="date" error={err('licenseExpiry')} />
      </>)}
    </CreateForm>
  );
}
