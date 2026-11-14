'use client';

import { useId, useState } from 'react';
import { FormResult, inputClass, SubmitButton } from '@/components/dashboard/FormParts';
import { createTripTemplateFormAction } from './form-actions';
import { GenerateSummary } from './TemplateActions';
import { useDashLang } from './lang';
import { useActionForm } from './useActionForm';
import { DAY_LABELS } from './template-text';

type Option = { id: string; label: string };
type BusOption = { id: string; plateNumber: string; capacity: number };

const TXT = {
  en: { title: 'Add a regular trip', intro: 'A regular trip repeats on the days you choose. Trips for the next 4 weeks are created now; use "Generate" later to add more.', name: 'Name', route: 'Route', bus: 'Bus (optional)', driver: 'Driver (optional)', unassigned: 'Unassigned', time: 'Departure time', dur: 'Duration (minutes)', days: 'Days of the week', start: 'Starts on', end: 'Ends on (optional)', price: 'Ticket price (EGP)', cap: 'Seats', create: 'Create regular trip', pick: 'Select…', rt: 'Go and return', rtHint: 'Every trip also gets return options at the times below (same bus, driver and seats). Students can book go only, return only, or both.', priceGo: 'Go only price (EGP)', priceRet: 'Return only price (EGP)', priceBoth: 'Go and return price (EGP)', retRoute: 'Return route', retTimes: 'Return times', addTime: 'Add a return time', removeTime: 'Remove', retDay: 'Return day', sameDay: 'Same day', nextDay: (n: number) => `${n} day${n === 1 ? '' : 's'} later`, needsBus: 'Without a bus and a driver the trips are created as drafts and cannot be booked until assigned.' },
  ar: { title: 'إضافة رحلة منتظمة', intro: 'الرحلة المنتظمة تتكرر في الأيام التي تختارها. تُنشأ رحلات الأسابيع الأربعة القادمة الآن، ويمكنك استخدام «توليد» لاحقاً لإضافة المزيد.', name: 'الاسم', route: 'المسار', bus: 'الحافلة (اختياري)', driver: 'السائق (اختياري)', unassigned: 'غير مخصص', time: 'وقت الانطلاق', dur: 'المدة (دقائق)', days: 'أيام الأسبوع', start: 'تبدأ في', end: 'تنتهي في (اختياري)', price: 'سعر التذكرة (جنيه)', cap: 'عدد المقاعد', create: 'إنشاء رحلة منتظمة', pick: 'اختر…', rt: 'ذهاب وعودة', rtHint: 'كل رحلة تحصل أيضاً على خيارات عودة في الأوقات أدناه (نفس الحافلة والسائق والمقاعد). يمكن للطالب حجز الذهاب فقط أو العودة فقط أو الاثنين.', priceGo: 'سعر الذهاب فقط (جنيه)', priceRet: 'سعر العودة فقط (جنيه)', priceBoth: 'سعر الذهاب والعودة (جنيه)', retRoute: 'مسار العودة', retTimes: 'أوقات العودة', addTime: 'إضافة وقت عودة', removeTime: 'حذف', retDay: 'يوم العودة', sameDay: 'نفس اليوم', nextDay: (n: number) => `بعد ${n} يوم`, needsBus: 'بدون حافلة وسائق تُنشأ الرحلات كمسودات ولا يمكن حجزها حتى يتم التخصيص.' },
} as const;

export function TemplateForm({ routes, buses, drivers }: { routes: (Option & { origin: string; destination: string })[]; buses: BusOption[]; drivers: Option[] }) {
  const lang = useDashLang();
  const T = TXT[lang];
  const uid = useId();
  const [roundTrip, setRoundTrip] = useState(false);
  const [times, setTimes] = useState<string[]>(['']);
  const [routeId, setRouteId] = useState('');
  const [retRoute, setRetRoute] = useState('');
  const reverseOf = (id: string) => { const r = routes.find((x) => x.id === id); return r ? routes.find((x) => x.origin.toLowerCase() === r.destination.toLowerCase() && x.destination.toLowerCase() === r.origin.toLowerCase())?.id ?? '' : ''; };
  const { state, pending, ref, onSubmit } = useActionForm(createTripTemplateFormAction, { resetOnSuccess: true });
  const lbl = 'block text-xs font-semibold text-ink-secondary';
  const req = <span aria-hidden="true" className="text-status-error-fg"> *</span>;
  return (
    <form ref={ref} onSubmit={onSubmit} aria-labelledby={`${uid}-t`} className="grid gap-3 rounded-2xl border border-line-default bg-surface-card p-5 sm:grid-cols-2 xl:grid-cols-4">
      <div className="space-y-1 sm:col-span-2 xl:col-span-4">
        <h2 id={`${uid}-t`} className="font-bold">{T.title}</h2>
        <p className="text-xs text-ink-secondary">{T.intro}</p>
      </div>
      <div><label htmlFor={`${uid}-n`} className={lbl}>{T.name}{req}</label><input id={`${uid}-n`} required name="name" maxLength={120} className={inputClass(false)} /></div>
      <div>
        <label htmlFor={`${uid}-r`} className={lbl}>{T.route}{req}</label>
        <select id={`${uid}-r`} required name="routeId" value={routeId} onChange={(e) => { setRouteId(e.target.value); setRetRoute(reverseOf(e.target.value)); }} className={inputClass(false)}>
          <option value="" disabled>{T.pick}</option>
          {routes.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor={`${uid}-b`} className={lbl}>{T.bus}</label>
        <select id={`${uid}-b`} name="busId" defaultValue="" className={inputClass(false)}>
          <option value="">{T.unassigned}</option>
          {buses.map((b) => <option key={b.id} value={b.id}>{b.plateNumber} · {b.capacity}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor={`${uid}-d`} className={lbl}>{T.driver}</label>
        <select id={`${uid}-d`} name="driverId" defaultValue="" className={inputClass(false)}>
          <option value="">{T.unassigned}</option>
          {drivers.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
        </select>
      </div>
      <div><label htmlFor={`${uid}-tm`} className={lbl}>{T.time}{req}</label><input id={`${uid}-tm`} required name="departureTime" type="time" className={inputClass(false)} /></div>
      <div><label htmlFor={`${uid}-du`} className={lbl}>{T.dur}{req}</label><input id={`${uid}-du`} required name="durationMinutes" type="number" min={1} max={1440} step={1} inputMode="numeric" className={inputClass(false)} /></div>
      <div><label htmlFor={`${uid}-p`} className={lbl}>{roundTrip ? T.priceGo : T.price}{req}</label><input id={`${uid}-p`} required name="price" type="number" min={0} step="any" inputMode="decimal" className={inputClass(false)} /></div>
      <div><label htmlFor={`${uid}-c`} className={lbl}>{T.cap}{req}</label><input id={`${uid}-c`} required name="capacity" type="number" min={1} max={100} step={1} inputMode="numeric" className={inputClass(false)} /></div>
      <div><label htmlFor={`${uid}-s`} className={lbl}>{T.start}{req}</label><input id={`${uid}-s`} required name="startDate" type="date" className={inputClass(false)} /></div>
      <div><label htmlFor={`${uid}-e`} className={lbl}>{T.end}</label><input id={`${uid}-e`} name="endDate" type="date" className={inputClass(false)} /></div>
      <fieldset className="sm:col-span-2">
        <legend className={lbl}>{T.days}{req}</legend>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {DAY_LABELS[lang].map((label, i) => (
            <label key={i} className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-line-strong px-3 text-xs font-semibold has-[:checked]:border-line-strong has-[:checked]:bg-status-info-bg has-[:checked]:text-ink-link">
              <input type="checkbox" name="days" value={i + 1} className="accent-ink-link" />{label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="space-y-3 rounded-xl border border-line-default p-3 sm:col-span-2 xl:col-span-4">
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-bold"><input type="checkbox" name="roundTrip" checked={roundTrip} onChange={(e) => setRoundTrip(e.target.checked)} className="accent-ink-link" />{T.rt}</label>
        {roundTrip && (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <p className="text-xs text-ink-secondary sm:col-span-2 xl:col-span-4">{T.rtHint}</p>
            <div><label htmlFor={`${uid}-rr`} className={lbl}>{T.retRoute}{req}</label><select id={`${uid}-rr`} required name="returnRouteId" value={retRoute} onChange={(e) => setRetRoute(e.target.value)} className={inputClass(false)}><option value="" disabled>{T.pick}</option>{routes.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select></div>
            <div><label htmlFor={`${uid}-rp`} className={lbl}>{T.priceRet}{req}</label><input id={`${uid}-rp`} required name="returnPrice" type="number" min={0} step="any" inputMode="decimal" className={inputClass(false)} /></div>
            <div><label htmlFor={`${uid}-bp`} className={lbl}>{T.priceBoth}{req}</label><input id={`${uid}-bp`} required name="roundTripPrice" type="number" min={0} step="any" inputMode="decimal" className={inputClass(false)} /></div>
            <div><label htmlFor={`${uid}-ro`} className={lbl}>{T.retDay}</label><select id={`${uid}-ro`} name="returnDayOffset" defaultValue="0" className={inputClass(false)}><option value="0">{T.sameDay}</option>{[1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{T.nextDay(n)}</option>)}</select></div>
            <fieldset className="space-y-2 sm:col-span-2 xl:col-span-4"><legend className={lbl}>{T.retTimes}{req}</legend>
              {times.map((tm, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input name="returnTimes" type="time" required={i === 0} value={tm} onChange={(e) => setTimes((a) => a.map((x, k) => (k === i ? e.target.value : x)))} aria-label={`${T.retTimes} ${i + 1}`} className={`${inputClass(false)} max-w-40`} />
                  {times.length > 1 && <button type="button" onClick={() => setTimes((a) => a.filter((_, k) => k !== i))} className="inline-flex min-h-10 items-center rounded-lg border border-line-strong px-3 text-xs font-bold">{T.removeTime}</button>}
                </div>
              ))}
              {times.length < 10 && <button type="button" onClick={() => setTimes((a) => [...a, ''])} className="inline-flex min-h-9 items-center rounded-lg border border-line-strong px-3 text-xs font-bold text-ink-link">+ {T.addTime}</button>}
            </fieldset>
          </div>
        )}
      </div>
      <p className="text-xs text-ink-secondary sm:col-span-2">{T.needsBus}</p>
      <div className="flex flex-col justify-end sm:col-span-2 xl:col-span-4"><div className="max-w-xs"><SubmitButton pending={pending} blocked={false}>{T.create}</SubmitButton></div></div>
      <div className="space-y-2 sm:col-span-2 xl:col-span-4"><GenerateSummary state={state} /><FormResult state={state} resource="max_trips_per_month" /></div>
    </form>
  );
}
