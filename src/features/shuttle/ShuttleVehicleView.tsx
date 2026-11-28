'use client';
import Link from 'next/link';
import { useRef } from 'react';
import { FormField, FormResult } from '@/components/dashboard/FormParts';
import { InlineAlert } from '@/ds/feedback/InlineAlert';
import { buttonClass } from '@/ds/primitives/button-class';
import { fieldErr } from '@/features/dashboard/CreateForms';
import { useDashLang } from '@/features/dashboard/lang';
import { PageHeaderMasar } from '@/features/dashboard/masar/PageHeaderMasar';
import { useActionForm } from '@/features/dashboard/useActionForm';
import { shuttleSessionActionFormAction } from './actions';
import type { SessionActionName } from './schema';
import { SD } from './textDay';
import { SV } from './textVehicle';
import type { SessionState, VehicleDetail } from './types';

const when = (iso: string | null, lang: string) => (iso ? <time dateTime={iso} suppressHydrationWarning dir="ltr">{new Date(iso).toLocaleTimeString(lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', { hour: '2-digit', minute: '2-digit' })}</time> : null);

/** One button = one small form. The key is stable while a press is in flight (a double click replays) and changes after each answer. */
function ActionForm({ d, action, label, tone = 'primary', extra }: { d: VehicleDetail; action: SessionActionName; label: string; tone?: 'primary' | 'secondary'; extra?: (err: (f: string) => string | null | undefined) => React.ReactNode }) {
  const lang = useDashLang();
  const base = useRef(typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now()));
  const { state, pending, onSubmit } = useActionForm(shuttleSessionActionFormAction);
  const key = `${base.current}-${state.status === 'idle' ? 0 : state.nonce}`;
  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <input type="hidden" name="action" value={action} />
      <input type="hidden" name="sessionId" value={d.session.id} />
      <input type="hidden" name="expectedState" value={d.session.state} />
      <input type="hidden" name="key" value={key} />
      {extra?.((f) => fieldErr(state, lang, f))}
      <button type="submit" aria-disabled={pending} className={buttonClass(tone, 'md', false, pending ? 'opacity-60' : undefined)}>{label}</button>
      <FormResult state={state} />
    </form>
  );
}

function Actions({ d }: { d: VehicleDetail }) {
  const lang = useDashLang();
  const t = SV[lang];
  const st: SessionState = d.session.state;
  const lastPos = d.stations.length - 1;
  const atEnd = st === 'arrived' && d.session.stationPos >= lastPos;
  const closed = d.visit?.loadingClosedAt != null;
  const oos = (
    <ActionForm d={d} action="out_of_service" label={t.outOfService} tone="secondary"
      extra={(err) => <FormField name="reason" label={t.reason} required error={err('reason')} />} />
  );
  const end = <ActionForm d={d} action="end_session" label={t.endSession} tone="secondary" extra={() => <p className="text-[13px] text-ink-muted">{t.confirmEnd}</p>} />;
  if (st === 'completed') return <p className="text-sm text-ink-secondary">{t.ended}</p>;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {st === 'ready' && <ActionForm d={d} action="open_loading" label={t.openLoading} />}
      {st === 'loading' && !closed && <ActionForm d={d} action="close_loading" label={t.closeLoading} tone="secondary" />}
      {st === 'loading' && <ActionForm d={d} action="depart" label={t.depart} />}
      {st === 'in_transit' && (
        <ActionForm d={d} action="arrive" label={t.arrive}
          extra={(err) => (
            <details className="rounded-xl border border-line-default p-3">
              <summary className="cursor-pointer text-sm font-medium">{t.arrivedLater}</summary>
              <div className="mt-2 space-y-2">
                <FormField dir="ltr" name="minutesAgo" label={t.minutesAgo} hint={t.minutesHint} type="number" min={0} max={1440} step="1" inputMode="numeric" defaultValue="0" error={err('occurredAt')} />
                <FormField name="reason" label={t.reason} hint={t.reasonHint} error={err('reason')} />
              </div>
            </details>
          )} />
      )}
      {st === 'arrived' && <ActionForm d={d} action="open_loading" label={atEnd ? t.reverseAtEnd : t.startLoading} />}
      {st === 'out_of_service' && (
        <div className="space-y-2">
          <ActionForm d={d} action="return_to_service" label={t.returnToService} />
          <p className="text-[13px] text-ink-muted">{t.resumes(d.session.outOfServiceFrom === 'ready' ? SD[lang].state.ready : SD[lang].state.arrived)}</p>
        </div>
      )}
      {(st === 'ready' || st === 'loading' || st === 'arrived') && oos}
      {(st === 'ready' || st === 'loading' || st === 'arrived') && end}
    </div>
  );
}

export function ShuttleVehicleView({ d, canOperate }: { d: VehicleDetail; canOperate: boolean }) {
  const lang = useDashLang();
  const t = SV[lang];
  const sd = SD[lang];
  const open = d.session.dayStatus === 'open';
  return (
    <div className="space-y-6">
      <PageHeaderMasar title={`${d.session.plate} · ${sd.state[d.session.state]}`} description={`${t.driver}: ${d.session.driverName} · ${t.capacity}: ${d.session.capacity} · ${t.run} ${d.run.runNo} · ${d.run.direction === 'forward' ? sd.forward : sd.backward}`} />
      <Link href="/dashboard/shuttle" className={buttonClass('secondary', 'md', false)}>{t.back}</Link>
      {!open && <InlineAlert tone="warning">{t.dayClosed}</InlineAlert>}
      {d.leg?.overdue && <InlineAlert tone="warning">{t.overdue}</InlineAlert>}

      <section aria-labelledby="route-t" className="space-y-3 rounded-2xl border border-line-default bg-surface-card p-5">
        <h2 id="route-t" className="font-bold">{t.route}</h2>
        <ol className="flex flex-wrap gap-2 text-sm">
          {d.stations.map((n, i) => (
            <li key={`${i}-${n}`} aria-current={i === d.session.stationPos ? 'step' : undefined}
              className={`rounded-full border px-3 py-1 ${i === d.session.stationPos ? 'border-brand-600 font-bold' : 'border-line-default text-ink-secondary'}`}>{n}</li>
          ))}
        </ol>
        <p className="text-sm"><span className="font-medium">{t.station}:</span> {d.session.stationName}{d.leg ? ` → ${d.stations[d.leg.toPos] ?? ''}` : ''}</p>
        {d.visit && (
          <dl className="grid grid-cols-3 gap-3 text-sm">
            <div><dt className="text-ink-muted">{t.arrivedAt}</dt><dd>{when(d.visit.arrivedAt, lang)}{d.visit.lateRecorded ? ` (${t.lateFlag})` : ''}</dd></div>
            <div><dt className="text-ink-muted">{t.loadingStarted}</dt><dd>{when(d.visit.loadingStartedAt, lang) ?? t.notYet}</dd></div>
            <div><dt className="text-ink-muted">{t.loadingClosed}</dt><dd>{when(d.visit.loadingClosedAt, lang) ?? t.notYet}</dd></div>
          </dl>
        )}
        {d.leg && <p className="text-sm"><span className="font-medium">{t.legTitle}:</span> {t.departedAt} {when(d.leg.departedAt, lang)}</p>}
      </section>

      {canOperate && open && <section className="rounded-2xl border border-line-default bg-surface-card p-5"><Actions d={d} /></section>}

      <section aria-labelledby="legs-t" className="space-y-3 rounded-2xl border border-line-default bg-surface-card p-5">
        <h2 id="legs-t" className="font-bold">{t.legs}</h2>
        {d.legs.length === 0 ? <p className="text-sm text-ink-secondary">{t.noLeg}</p> : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead><tr>{['#', t.run, t.from, t.to, t.departedAt, t.arrivedAtLeg, t.status].map((h) => <th key={h} scope="col" className="p-2 text-start font-medium">{h}</th>)}</tr></thead>
            <tbody>{d.legs.map((l) => (
              <tr key={l.seq} className="border-t border-line-default">
                <td className="p-2" dir="ltr">{l.seq}</td><td className="p-2" dir="ltr">{l.runNo}</td><td className="p-2">{l.fromName}</td><td className="p-2">{l.toName}</td>
                <td className="p-2">{when(l.departedAt, lang)}</td><td className="p-2">{when(l.arrivedAt, lang) ?? t.notYet}</td><td className="p-2">{t.legStatus[l.status]}</td>
              </tr>))}</tbody>
          </table></div>
        )}
      </section>

      <section aria-labelledby="ev-t" className="space-y-3 rounded-2xl border border-line-default bg-surface-card p-5">
        <h2 id="ev-t" className="font-bold">{t.events}</h2>
        {d.events.length === 0 ? <p className="text-sm text-ink-secondary">{t.none}</p> : (
          <ul className="space-y-1 text-sm">{d.events.map((e, i) => (
            <li key={`${e.at}-${i}`}>{when(e.at, lang)} · {t.kind[e.kind] ?? e.kind} · {t.role[e.actorRole] ?? e.actorRole}{e.reason ? ` · ${e.reason}` : ''}</li>
          ))}</ul>
        )}
      </section>
    </div>
  );
}
