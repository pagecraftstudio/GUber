'use client';

import { useId, useMemo, useState } from 'react';
import { FormResult, inputClass, PlanLimitNotice, SubmitButton } from '@/components/dashboard/FormParts';
import { allowanceFor, blocksSubmit, type PlanUsage } from '@/features/subscriptions/usage';
import { liveUsage, fieldErr } from './CreateForms';
import { createTripFormAction } from './form-actions';
import { useDashLang } from './lang';
import { FORM_TEXT } from './messages';
import { useActionForm } from './useActionForm';

type BusOption = { id: string; plateNumber: string; capacity: number };
type Option = { id: string; label: string };
type RouteOption = Option & { origin: string; destination: string };
type RetRow = { dep: string; arr: string };

const TXT = {
  en: { title: 'Create a trip draft', intro: 'Drafts are not visible in public search until moved through the approved trip status workflow.', route: 'Route', bus: 'Bus (optional)', driver: 'Driver (optional)', unassigned: 'Unassigned', price: 'Ticket price (EGP)', capacity: 'Trip capacity', dep: 'Departure', arr: 'Arrival', create: 'Create draft', seatsFor: (n: number) => `Up to ${n} seats for this bus. You can set a lower trip capacity.`, seatsNoBus: 'Maximum 100 seats until a bus is assigned.', capErr: (n: number) => `Enter a capacity between 1 and ${n}.`, arrErr: 'Arrival must be later than departure.', pick: 'Select…', rt: 'Go and return', rtHint: 'Students can add a return trip when they book. Each return time below becomes its own trip with its own seats.', priceGo: 'Go only price (EGP)', priceRet: 'Return only price (EGP)', priceBoth: 'Go and return price (EGP)', retRoute: 'Return route', retTimes: 'Return times', retDep: 'Return departure', retArr: 'Return arrival', addRet: 'Add a return time', removeRet: 'Remove', retInherit: 'Return trips use the same bus, driver and seats as the outbound trip.', retErr: 'A return trip must depart after the outbound trip arrives.', retNone: 'Add at least one return time.' },
  ar: { title: 'إنشاء مسودة رحلة', intro: 'لا تظهر المسودات في البحث العام حتى تنتقل عبر مسار حالات الرحلة المعتمد.', route: 'المسار', bus: 'الحافلة (اختياري)', driver: 'السائق (اختياري)', unassigned: 'غير مخصص', price: 'سعر التذكرة (جنيه)', capacity: 'سعة الرحلة', dep: 'الانطلاق', arr: 'الوصول', create: 'إنشاء مسودة', seatsFor: (n: number) => `حتى ${n} مقعداً لهذه الحافلة. يمكنك تحديد سعة أقل.`, seatsNoBus: 'الحد الأقصى 100 مقعد حتى تُخصص حافلة.', capErr: (n: number) => `أدخل سعة بين 1 و${n}.`, arrErr: 'يجب أن يكون الوصول بعد الانطلاق.', pick: 'اختر…', rt: 'ذهاب وعودة', rtHint: 'يمكن للطالب إضافة رحلة عودة عند الحجز. كل وقت عودة أدناه يصبح رحلة مستقلة بمقاعدها.', priceGo: 'سعر الذهاب فقط (جنيه)', priceRet: 'سعر العودة فقط (جنيه)', priceBoth: 'سعر الذهاب والعودة (جنيه)', retRoute: 'مسار العودة', retTimes: 'أوقات العودة', retDep: 'انطلاق العودة', retArr: 'وصول العودة', addRet: 'إضافة وقت عودة', removeRet: 'حذف', retInherit: 'رحلات العودة تستخدم نفس الحافلة والسائق والمقاعد.', retErr: 'يجب أن تنطلق رحلة العودة بعد وصول رحلة الذهاب.', retNone: 'أضف وقت عودة واحداً على الأقل.' },
} as const;

export function TripDraftForm({ routes, buses, drivers, usage }: { routes: RouteOption[]; buses: BusOption[]; drivers: Option[]; usage: PlanUsage | null }) {
  const lang = useDashLang();
  const T = TXT[lang];
  const uid = useId();
  const [busId, setBusId] = useState('');
  const [capacity, setCapacity] = useState('');
  const [capacityTouched, setCapacityTouched] = useState(false);
  const [departureAt, setDepartureAt] = useState('');
  const [arrivalAt, setArrivalAt] = useState('');
  const [routeId, setRouteId] = useState('');
  const [roundTrip, setRoundTrip] = useState(false);
  const [retRoute, setRetRoute] = useState('');
  const [retRows, setRetRows] = useState<RetRow[]>([{ dep: '', arr: '' }]);

  const month = /^\d{4}-\d{2}/.test(departureAt) ? departureAt.slice(0, 7) : undefined;
  const { state, pending, ref, onSubmit } = useActionForm(createTripFormAction, { resetOnSuccess: true, isBlocked: (st) => blocksSubmit(allowanceFor(liveUsage(usage, st), 'max_trips_per_month', month)) });
  const current = liveUsage(usage, state);
  const blocked = blocksSubmit(allowanceFor(current, 'max_trips_per_month', month));

  const selectedBus = useMemo(() => buses.find((b) => b.id === busId), [buses, busId]);
  const capacityLimit = selectedBus?.capacity ?? 100;
  const capacityInvalid = capacity !== '' && (Number(capacity) < 1 || Number(capacity) > capacityLimit);
  const reverseOf = (id: string) => { const r = routes.find((x) => x.id === id); return r ? routes.find((x) => x.origin.toLowerCase() === r.destination.toLowerCase() && x.destination.toLowerCase() === r.origin.toLowerCase())?.id ?? '' : ''; };
  const durationMs = departureAt && arrivalAt ? new Date(arrivalAt).getTime() - new Date(departureAt).getTime() : 0;
  const toLocalInput = (ms: number) => { const d = new Date(ms); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
  const setRow = (i: number, patch: Partial<RetRow>) => setRetRows((rows) => rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const onRetDep = (i: number, dep: string) => setRow(i, { dep, ...(!retRows[i]?.arr && durationMs > 0 && dep ? { arr: toLocalInput(new Date(dep).getTime() + durationMs) } : {}) });
  const retInvalid = roundTrip && arrivalAt && retRows.some((r) => r.dep && new Date(r.dep).getTime() < new Date(arrivalAt).getTime());
  const retMissing = roundTrip && !retRows.some((r) => r.dep && r.arr);
  const arrivalInvalid = Boolean(departureAt && arrivalAt && new Date(arrivalAt).getTime() <= new Date(departureAt).getTime());

  function handleBusChange(next: string) {
    setBusId(next);
    const bus = buses.find((b) => b.id === next);
    if (!capacityTouched) setCapacity(bus ? String(bus.capacity) : '');
  }
  const reset = () => { setRouteId(''); setRoundTrip(false); setRetRoute(''); setRetRows([{ dep: '', arr: '' }]); setBusId(''); setCapacity(''); setCapacityTouched(false); setDepartureAt(''); setArrivalAt(''); };
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    if (arrivalInvalid || capacityInvalid || retInvalid || retMissing) return e.preventDefault();
    onSubmit(e);
    if (!blocked) setTimeout(() => ref.current && state.status === 'success' && reset(), 0);
  };
  const noticeId = `${uid}-limit`;
  const lbl = 'block text-xs font-semibold text-slate-700 dark:text-slate-300';
  const errText = 'mt-1 block text-xs font-semibold text-red-700 dark:text-red-300';

  return (
    <form ref={ref} onSubmit={submit} aria-labelledby={`${uid}-t`} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 sm:grid-cols-2 xl:grid-cols-4">
      <div className="space-y-2 sm:col-span-2 xl:col-span-4">
        <h2 id={`${uid}-t`} className="font-bold">{T.title}</h2>
        <p className="text-xs text-slate-600 dark:text-slate-400">{T.intro}</p>
        <PlanLimitNotice usage={current} resource="max_trips_per_month" month={month} id={noticeId} />
      </div>

      <div>
        <label htmlFor={`${uid}-route`} className={lbl}>{T.route}<span aria-hidden="true" className="text-red-600"> *</span></label>
        <select id={`${uid}-route`} required name="routeId" value={routeId} onChange={(e) => { setRouteId(e.target.value); setRetRoute(reverseOf(e.target.value)); }} className={inputClass(false)}>
          <option value="" disabled>{T.pick}</option>
          {routes.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor={`${uid}-bus`} className={lbl}>{T.bus}</label>
        <select id={`${uid}-bus`} name="busId" value={busId} onChange={(e) => handleBusChange(e.target.value)} className={inputClass(!!fieldErr(state, lang, 'busId'))}>
          <option value="">{T.unassigned}</option>
          {buses.map((b) => <option key={b.id} value={b.id}>{b.plateNumber} · {b.capacity}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor={`${uid}-driver`} className={lbl}>{T.driver}</label>
        <select id={`${uid}-driver`} name="driverId" defaultValue="" className={inputClass(!!fieldErr(state, lang, 'driverId'))}>
          <option value="">{T.unassigned}</option>
          {drivers.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor={`${uid}-price`} className={lbl}>{roundTrip ? T.priceGo : T.price}<span aria-hidden="true" className="text-red-600"> *</span></label>
        <input id={`${uid}-price`} required name="price" type="number" min={0} step="any" inputMode="decimal" className={inputClass(false)} />
      </div>
      <div>
        <label htmlFor={`${uid}-cap`} className={lbl}>{T.capacity}<span aria-hidden="true" className="text-red-600"> *</span></label>
        <input id={`${uid}-cap`} required name="capacity" type="number" min={1} max={capacityLimit} step={1} inputMode="numeric" value={capacity}
          onChange={(e) => { setCapacityTouched(true); setCapacity(e.target.value); }}
          aria-invalid={capacityInvalid || undefined} aria-describedby={`${uid}-cap-h${capacityInvalid ? ` ${uid}-cap-e` : ''}`} className={inputClass(capacityInvalid)} />
        <span id={`${uid}-cap-h`} className="mt-1 block text-xs text-slate-600 dark:text-slate-400">{selectedBus ? T.seatsFor(selectedBus.capacity) : T.seatsNoBus}</span>
        {capacityInvalid && <span id={`${uid}-cap-e`} role="alert" className={errText}>{T.capErr(capacityLimit)}</span>}
      </div>
      <div>
        <label htmlFor={`${uid}-dep`} className={lbl}>{T.dep}<span aria-hidden="true" className="text-red-600"> *</span></label>
        <input id={`${uid}-dep`} required name="departureAt" type="datetime-local" value={departureAt} onChange={(e) => setDepartureAt(e.target.value)} className={inputClass(false)} />
      </div>
      <div>
        <label htmlFor={`${uid}-arr`} className={lbl}>{T.arr}<span aria-hidden="true" className="text-red-600"> *</span></label>
        <input id={`${uid}-arr`} required name="arrivalAt" type="datetime-local" min={departureAt || undefined} value={arrivalAt} onChange={(e) => setArrivalAt(e.target.value)}
          aria-invalid={arrivalInvalid || undefined} aria-describedby={arrivalInvalid ? `${uid}-arr-e` : undefined} className={inputClass(arrivalInvalid)} />
        {arrivalInvalid && <span id={`${uid}-arr-e`} role="alert" className={errText}>{T.arrErr}</span>}
      </div>
      <div className="space-y-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700 sm:col-span-2 xl:col-span-4">
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-bold"><input type="checkbox" name="roundTrip" checked={roundTrip} onChange={(e) => setRoundTrip(e.target.checked)} className="accent-blue-700" />{T.rt}</label>
        {roundTrip && (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <p className="text-xs text-slate-600 dark:text-slate-400 sm:col-span-2 xl:col-span-4">{T.rtHint} {T.retInherit}</p>
            <div><label htmlFor={`${uid}-rr`} className={lbl}>{T.retRoute}<span aria-hidden="true" className="text-red-600"> *</span></label>
              <select id={`${uid}-rr`} required name="returnRouteId" value={retRoute} onChange={(e) => setRetRoute(e.target.value)} className={inputClass(false)}><option value="" disabled>{T.pick}</option>{routes.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select></div>
            <div><label htmlFor={`${uid}-rp`} className={lbl}>{T.priceRet}<span aria-hidden="true" className="text-red-600"> *</span></label><input id={`${uid}-rp`} required name="returnPrice" type="number" min={0} step="any" inputMode="decimal" className={inputClass(false)} /></div>
            <div><label htmlFor={`${uid}-bp`} className={lbl}>{T.priceBoth}<span aria-hidden="true" className="text-red-600"> *</span></label><input id={`${uid}-bp`} required name="roundTripPrice" type="number" min={0} step="any" inputMode="decimal" className={inputClass(false)} /></div>
            <fieldset className="space-y-2 sm:col-span-2 xl:col-span-4">
              <legend className={lbl}>{T.retTimes}</legend>
              {retRows.map((row, i) => (
                <div key={i} className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_auto]">
                  <div><label className={lbl}>{T.retDep}<input name="retDep" type="datetime-local" required={i === 0} value={row.dep} min={arrivalAt || undefined} onChange={(e) => onRetDep(i, e.target.value)} className={inputClass(false)} /></label></div>
                  <div><label className={lbl}>{T.retArr}<input name="retArr" type="datetime-local" required={i === 0} value={row.arr} min={row.dep || undefined} onChange={(e) => setRow(i, { arr: e.target.value })} className={inputClass(false)} /></label></div>
                  {retRows.length > 1 && <button type="button" onClick={() => setRetRows((r) => r.filter((_, k) => k !== i))} className="inline-flex min-h-10 items-center rounded-lg border border-slate-400 px-3 text-xs font-bold">{T.removeRet}</button>}
                </div>
              ))}
              {retRows.length < 10 && <button type="button" onClick={() => setRetRows((r) => [...r, { dep: '', arr: '' }])} className="inline-flex min-h-9 items-center rounded-lg border border-blue-700 px-3 text-xs font-bold text-blue-700 dark:text-blue-300">+ {T.addRet}</button>}
              {retInvalid && <span role="alert" className={errText}>{T.retErr}</span>}
              {retMissing && <span role="alert" className={errText}>{T.retNone}</span>}
            </fieldset>
          </div>
        )}
      </div>
      <div className="flex flex-col justify-end gap-2">
        <SubmitButton pending={pending} blocked={blocked} describedBy={noticeId}>{T.create}</SubmitButton>
        {blocked && <p className="text-xs font-semibold text-red-700 dark:text-red-300">{FORM_TEXT[lang].limitBlocked}</p>}
      </div>
      <div className="sm:col-span-2 xl:col-span-4"><FormResult state={state} resource="max_trips_per_month" /></div>
    </form>
  );
}
