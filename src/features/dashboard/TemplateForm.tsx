'use client';

import { useId } from 'react';
import { FormResult, inputClass, SubmitButton } from '@/components/dashboard/FormParts';
import { createTripTemplateFormAction } from './form-actions';
import { GenerateSummary } from './TemplateActions';
import { useDashLang } from './lang';
import { useActionForm } from './useActionForm';
import { DAY_LABELS } from './template-text';

type Option = { id: string; label: string };
type BusOption = { id: string; plateNumber: string; capacity: number };

const TXT = {
  en: { title: 'Add a regular trip', intro: 'A regular trip repeats on the days you choose. Trips for the next 4 weeks are created now; use "Generate" later to add more.', name: 'Name', route: 'Route', bus: 'Bus (optional)', driver: 'Driver (optional)', unassigned: 'Unassigned', time: 'Departure time', dur: 'Duration (minutes)', days: 'Days of the week', start: 'Starts on', end: 'Ends on (optional)', price: 'Ticket price (EGP)', cap: 'Seats', create: 'Create regular trip', pick: 'Select…', needsBus: 'Without a bus and a driver the trips are created as drafts and cannot be booked until assigned.' },
  ar: { title: 'إضافة رحلة منتظمة', intro: 'الرحلة المنتظمة تتكرر في الأيام التي تختارها. تُنشأ رحلات الأسابيع الأربعة القادمة الآن، ويمكنك استخدام «توليد» لاحقاً لإضافة المزيد.', name: 'الاسم', route: 'المسار', bus: 'الحافلة (اختياري)', driver: 'السائق (اختياري)', unassigned: 'غير مخصص', time: 'وقت الانطلاق', dur: 'المدة (دقائق)', days: 'أيام الأسبوع', start: 'تبدأ في', end: 'تنتهي في (اختياري)', price: 'سعر التذكرة (جنيه)', cap: 'عدد المقاعد', create: 'إنشاء رحلة منتظمة', pick: 'اختر…', needsBus: 'بدون حافلة وسائق تُنشأ الرحلات كمسودات ولا يمكن حجزها حتى يتم التخصيص.' },
} as const;

export function TemplateForm({ routes, buses, drivers }: { routes: Option[]; buses: BusOption[]; drivers: Option[] }) {
  const lang = useDashLang();
  const T = TXT[lang];
  const uid = useId();
  const { state, pending, ref, onSubmit } = useActionForm(createTripTemplateFormAction, { resetOnSuccess: true });
  const lbl = 'block text-xs font-semibold text-slate-700 dark:text-slate-300';
  const req = <span aria-hidden="true" className="text-red-600"> *</span>;
  return (
    <form ref={ref} onSubmit={onSubmit} aria-labelledby={`${uid}-t`} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 sm:grid-cols-2 xl:grid-cols-4">
      <div className="space-y-1 sm:col-span-2 xl:col-span-4">
        <h2 id={`${uid}-t`} className="font-bold">{T.title}</h2>
        <p className="text-xs text-slate-600 dark:text-slate-400">{T.intro}</p>
      </div>
      <div><label htmlFor={`${uid}-n`} className={lbl}>{T.name}{req}</label><input id={`${uid}-n`} required name="name" maxLength={120} className={inputClass(false)} /></div>
      <div>
        <label htmlFor={`${uid}-r`} className={lbl}>{T.route}{req}</label>
        <select id={`${uid}-r`} required name="routeId" defaultValue="" className={inputClass(false)}>
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
      <div><label htmlFor={`${uid}-p`} className={lbl}>{T.price}{req}</label><input id={`${uid}-p`} required name="price" type="number" min={0} step="any" inputMode="decimal" className={inputClass(false)} /></div>
      <div><label htmlFor={`${uid}-c`} className={lbl}>{T.cap}{req}</label><input id={`${uid}-c`} required name="capacity" type="number" min={1} max={100} step={1} inputMode="numeric" className={inputClass(false)} /></div>
      <div><label htmlFor={`${uid}-s`} className={lbl}>{T.start}{req}</label><input id={`${uid}-s`} required name="startDate" type="date" className={inputClass(false)} /></div>
      <div><label htmlFor={`${uid}-e`} className={lbl}>{T.end}</label><input id={`${uid}-e`} name="endDate" type="date" className={inputClass(false)} /></div>
      <fieldset className="sm:col-span-2">
        <legend className={lbl}>{T.days}{req}</legend>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {DAY_LABELS[lang].map((label, i) => (
            <label key={i} className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-xs font-semibold has-[:checked]:border-blue-700 has-[:checked]:bg-blue-50 has-[:checked]:text-blue-900 dark:border-slate-600 dark:has-[:checked]:bg-blue-500/10 dark:has-[:checked]:text-blue-100">
              <input type="checkbox" name="days" value={i + 1} className="accent-blue-700" />{label}
            </label>
          ))}
        </div>
      </fieldset>
      <p className="text-xs text-slate-600 dark:text-slate-400 sm:col-span-2">{T.needsBus}</p>
      <div className="flex flex-col justify-end sm:col-span-2 xl:col-span-4"><div className="max-w-xs"><SubmitButton pending={pending} blocked={false}>{T.create}</SubmitButton></div></div>
      <div className="space-y-2 sm:col-span-2 xl:col-span-4"><GenerateSummary state={state} /><FormResult state={state} resource="max_trips_per_month" /></div>
    </form>
  );
}
