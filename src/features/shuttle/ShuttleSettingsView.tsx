'use client';
import Link from 'next/link';
import { useId } from 'react';
import { FormField, FormResult, SubmitButton } from '@/components/dashboard/FormParts';
import { InlineAlert } from '@/ds/feedback/InlineAlert';
import { controlClass } from '@/ds/primitives/Input';
import { buttonClass } from '@/ds/primitives/button-class';
import { useDashLang } from '@/features/dashboard/lang';
import { useActionForm } from '@/features/dashboard/useActionForm';
import { fieldErr } from '@/features/dashboard/CreateForms';
import { PageHeaderMasar } from '@/features/dashboard/masar/PageHeaderMasar';
import { saveShuttleFaresFormAction, saveShuttleServiceFormAction, setShuttleServiceActiveFormAction } from './actions';
import { ST } from './text';
import type { ShuttleFare, ShuttleService } from './types';

export type ShuttleStop = { id: string; name: string };
export type ShuttleSettingsProps = {
  routes: { id: string; name: string }[]; routeId: string | null; enabled: boolean; canWrite: boolean;
  service: ShuttleService | null; stops: ShuttleStop[]; fares: ShuttleFare[];
};

function ServiceForm({ p }: { p: ShuttleSettingsProps }) {
  const lang = useDashLang();
  const t = ST[lang];
  const id = useId();
  const s = p.service;
  const { state, pending, onSubmit } = useActionForm(saveShuttleServiceFormAction);
  const off = !p.canWrite || !p.enabled;
  return (
    <form onSubmit={onSubmit} aria-labelledby={`${id}-t`} className="space-y-3 rounded-2xl border border-line-default bg-surface-card p-5">
      <h2 id={`${id}-t`} className="font-bold">{t.serviceTitle}</h2>
      <input type="hidden" name="routeId" value={p.routeId ?? ''} />
      <fieldset disabled={off} className="space-y-3 border-0 p-0">
        <FormField name="name" label={t.name} required defaultValue={s?.name ?? ''} error={fieldErr(state, lang, 'name')} />
        <div className="space-y-1">
          <label htmlFor={`${id}-d`} className="block text-sm font-medium">{t.direction}</label>
          <select id={`${id}-d`} name="outboundDirection" defaultValue={s?.outboundDirection ?? 'forward'} className={controlClass(false)}>
            <option value="forward">{t.forward}</option>
            <option value="backward">{t.backward}</option>
          </select>
          <p className="text-[13px] text-ink-muted">{t.directionHint}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField dir="ltr" name="requestTtlMinutes" label={t.ttl} hint={t.ttlHint} type="number" min={1} max={240} step="1" inputMode="numeric" required defaultValue={String(s?.requestTtlMinutes ?? 20)} error={fieldErr(state, lang, 'requestTtlMinutes')} />
          <FormField dir="ltr" name="maxSeatsPerRequest" label={t.maxSeats} type="number" min={1} max={20} step="1" inputMode="numeric" required defaultValue={String(s?.maxSeatsPerRequest ?? 4)} error={fieldErr(state, lang, 'maxSeatsPerRequest')} />
        </div>
        <div className="space-y-1">
          <label htmlFor={`${id}-h`} className="block text-sm font-medium">{t.hub}</label>
          <select id={`${id}-h`} name="hubStopId" defaultValue={s?.hubStopId ?? ''} className={controlClass(false)}>
            <option value="">{t.hubNone}</option>
            {p.stops.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
          <p className="text-[13px] text-ink-muted">{t.hubHint}</p>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="allowReverse" value="1" defaultChecked={s?.allowReverse ?? true} />{t.allowReverse}</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="allowWalkIn" value="1" defaultChecked={s?.allowWalkIn ?? true} />{t.walkIn}</label>
      </fieldset>
      {!off && <SubmitButton pending={pending} blocked={false}>{s ? t.save : t.create}</SubmitButton>}
      <FormResult state={state} />
    </form>
  );
}

function ActiveSwitch({ service }: { service: ShuttleService }) {
  const lang = useDashLang();
  const t = ST[lang];
  const { state, pending, onSubmit } = useActionForm(setShuttleServiceActiveFormAction);
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="serviceId" value={service.id} />
      <input type="hidden" name="active" value={service.isActive ? '0' : '1'} />
      <span className="text-sm font-medium">{service.isActive ? t.active : t.inactive}</span>
      <button type="submit" aria-disabled={pending} className={buttonClass('secondary', 'md', false, pending ? 'opacity-60' : undefined)}>{service.isActive ? t.deactivate : t.activate}</button>
      <FormResult state={state} />
    </form>
  );
}

function FareMatrix({ p }: { p: ShuttleSettingsProps }) {
  const lang = useDashLang();
  const t = ST[lang];
  const { state, pending, onSubmit } = useActionForm(saveShuttleFaresFormAction);
  const price = new Map(p.fares.map((f) => [`${f.fromStopId}:${f.toStopId}`, f.price]));
  if (!p.service) return <p className="text-sm text-ink-secondary">{t.needService}</p>;
  if (p.stops.length < 2) return <p className="text-sm text-ink-secondary">{t.needTwoStops}</p>;
  const off = !p.canWrite || !p.enabled;
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <input type="hidden" name="serviceId" value={p.service.id} />
      <p className="text-sm text-ink-secondary">{t.faresHint}</p>
      <fieldset disabled={off} className="overflow-x-auto border-0 p-0">
        <table className="w-full text-sm">
          <thead><tr><th scope="col" className="p-2 text-start">{t.fareFrom} \ {t.fareTo}</th>{p.stops.map((x) => <th key={x.id} scope="col" className="p-2 text-start font-medium">{x.name}</th>)}</tr></thead>
          <tbody>
            {p.stops.map((from) => (
              <tr key={from.id}>
                <th scope="row" className="p-2 text-start font-medium">{from.name}</th>
                {p.stops.map((to) => from.id === to.id
                  ? <td key={to.id} className="p-2 text-ink-muted" aria-hidden="true">—</td>
                  : <td key={to.id} className="p-1">
                      <input dir="ltr" type="number" min={0} step="0.01" inputMode="decimal" name={`fare:${from.id}:${to.id}`} placeholder={t.fareEmpty}
                        aria-label={t.fareFor(from.name, to.name)} defaultValue={price.get(`${from.id}:${to.id}`)?.toString() ?? ''} className={controlClass(false)} />
                    </td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </fieldset>
      {!off && <SubmitButton pending={pending} blocked={false}>{t.saveFares}</SubmitButton>}
      <FormResult state={state} />
    </form>
  );
}

export function ShuttleSettingsView(p: ShuttleSettingsProps) {
  const lang = useDashLang();
  const t = ST[lang];
  return (
    <div className="space-y-6">
      <PageHeaderMasar title={t.title} description={t.intro} />
      {!p.enabled && <InlineAlert tone="warning" title={t.notInPlan}>{t.notInPlanHint}</InlineAlert>}
      {p.enabled && !p.canWrite && <InlineAlert tone="info">{t.readOnly}</InlineAlert>}
      {p.routes.length === 0 ? <p className="text-sm text-ink-secondary">{t.noRoutes}</p> : (
        <>
          <nav aria-label={t.chooseRoute} className="flex flex-wrap gap-2">
            {p.routes.map((r) => (
              <Link key={r.id} href={`/dashboard/shuttle/settings?route=${r.id}`} aria-current={r.id === p.routeId ? 'page' : undefined}
                className={buttonClass(r.id === p.routeId ? 'primary' : 'secondary', 'md', false)}>{r.name}</Link>
            ))}
          </nav>
          {p.routeId && (
            <div key={p.routeId} className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-4">
                {p.service ? <ActiveSwitch service={p.service} /> : <p className="text-sm text-ink-secondary">{t.noService}</p>}
                <ServiceForm p={p} />
              </div>
              <section aria-labelledby="fares-t" className="space-y-3 rounded-2xl border border-line-default bg-surface-card p-5">
                <h2 id="fares-t" className="font-bold">{t.faresTitle}</h2>
                <FareMatrix p={p} />
              </section>
            </div>
          )}
        </>
      )}
    </div>
  );
}
