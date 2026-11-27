'use client';
import Link from 'next/link';
import { useId, useRef, useState } from 'react';
import { FormField, FormResult, SubmitButton } from '@/components/dashboard/FormParts';
import { InlineAlert } from '@/ds/feedback/InlineAlert';
import { controlClass } from '@/ds/primitives/Input';
import { buttonClass } from '@/ds/primitives/button-class';
import { fieldErr } from '@/features/dashboard/CreateForms';
import { useDashLang } from '@/features/dashboard/lang';
import { PageHeaderMasar } from '@/features/dashboard/masar/PageHeaderMasar';
import { useActionForm } from '@/features/dashboard/useActionForm';
import { startShuttleDayFormAction } from './actions';
import { SD } from './textDay';

export type StartViewProps = {
  serviceId: string; serviceName: string; today: string; stops: { idx: number; name: string }[];
  buses: { id: string; plate: string; capacity: number }[]; drivers: { id: string; name: string }[];
};
type Row = { uid: number; busId: string; driverId: string; startStationIdx: number; direction: 'forward' | 'backward' };

export function ShuttleStartView(p: StartViewProps) {
  const lang = useDashLang();
  const t = SD[lang];
  const id = useId();
  const nextUid = useRef(2);
  const key = useRef(typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now())); // one key per form: a double press replays
  const [rows, setRows] = useState<Row[]>([{ uid: 1, busId: '', driverId: '', startStationIdx: 0, direction: 'forward' }]);
  const { state, pending, onSubmit } = useActionForm(startShuttleDayFormAction);
  const patch = (uid: number, v: Partial<Row>) => setRows((r) => r.map((x) => (x.uid === uid ? { ...x, ...v } : x)));
  const payload = JSON.stringify(rows.map(({ busId, driverId, startStationIdx, direction }) => ({ busId, driverId, startStationIdx, direction })));
  const ready = rows.every((r) => r.busId && r.driverId);
  return (
    <div className="space-y-6">
      <PageHeaderMasar title={`${t.startTitle}: ${p.serviceName}`} description={t.startIntro} />
      {p.buses.length === 0 && <InlineAlert tone="warning">{t.noBuses}</InlineAlert>}
      {p.drivers.length === 0 && <InlineAlert tone="warning">{t.noDrivers}</InlineAlert>}
      <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-line-default bg-surface-card p-5">
        <input type="hidden" name="serviceId" value={p.serviceId} />
        <input type="hidden" name="key" value={key.current} />
        <input type="hidden" name="vehicles" value={payload} />
        <FormField dir="ltr" name="serviceDate" label={t.date} hint={t.dateHint} type="date" required defaultValue={p.today} error={fieldErr(state, lang, 'serviceDate')} />
        {rows.map((r, i) => (
          <fieldset key={r.uid} className="grid gap-3 rounded-xl border border-line-default p-3 sm:grid-cols-2">
            <legend className="px-1 text-sm font-medium">{t.vehicle} {i + 1}</legend>
            <label className="space-y-1 text-sm"><span className="block font-medium">{t.bus}</span>
              <select value={r.busId} onChange={(e) => patch(r.uid, { busId: e.target.value })} className={controlClass(false)} required>
                <option value="">{t.pickBus}</option>
                {p.buses.map((b) => <option key={b.id} value={b.id}>{b.plate} ({b.capacity})</option>)}
              </select></label>
            <label className="space-y-1 text-sm"><span className="block font-medium">{t.driver}</span>
              <select value={r.driverId} onChange={(e) => patch(r.uid, { driverId: e.target.value })} className={controlClass(false)} required>
                <option value="">{t.pickDriver}</option>
                {p.drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select></label>
            <label className="space-y-1 text-sm"><span className="block font-medium">{t.startStation}</span>
              <select value={r.startStationIdx} onChange={(e) => patch(r.uid, { startStationIdx: Number(e.target.value) })} className={controlClass(false)}>
                {p.stops.map((s) => <option key={s.idx} value={s.idx}>{s.name}</option>)}
              </select></label>
            <label className="space-y-1 text-sm"><span className="block font-medium">{t.direction}</span>
              <select value={r.direction} onChange={(e) => patch(r.uid, { direction: e.target.value as Row['direction'] })} className={controlClass(false)}>
                <option value="forward">{t.forward}</option>
                <option value="backward">{t.backward}</option>
              </select></label>
            {rows.length > 1 && <button type="button" onClick={() => setRows((x) => x.filter((y) => y.uid !== r.uid))} className={buttonClass('secondary', 'md', false)}>{t.removeVehicle}</button>}
          </fieldset>
        ))}
        {rows.length < 50 && (
          <button type="button" id={`${id}-add`} onClick={() => setRows((x) => [...x, { uid: nextUid.current++, busId: '', driverId: '', startStationIdx: 0, direction: 'forward' }])}
            className={buttonClass('secondary', 'md', false)}>{t.addVehicle}</button>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton pending={pending} blocked={!ready}>{t.submit}</SubmitButton>
          <Link href="/dashboard/shuttle" className={buttonClass('secondary', 'md', false)}>{t.openOverview}</Link>
        </div>
        <FormResult state={state} />
      </form>
    </div>
  );
}
