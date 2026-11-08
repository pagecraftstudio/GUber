'use client';
import Link from 'next/link';
import { useDashLang } from './lang';
import { inputClass } from '@/components/dashboard/FormParts';

type Option = { id: string; label: string };
export type TripFilterValues = { view: string; status: string; route: string; bus: string; driver: string; source: string; from: string; to: string };
export type QuickRange = { key: string; from: string; to: string };

const STATUS = ['draft', 'scheduled', 'boarding', 'in_progress', 'completed', 'cancelled'] as const;
const TXT = {
  en: { title: 'Filter trips', status: 'Status', route: 'Route', bus: 'Bus', driver: 'Driver', source: 'Type', from: 'From date', to: 'To date', any: 'Any', apply: 'Apply filters', clear: 'Clear all', regular: 'Regular trips', manual: 'One-off trips', quick: { today: 'Today', tomorrow: 'Tomorrow', week: 'This week', nextweek: 'Next week' }, st: { draft: 'Draft', scheduled: 'Scheduled', boarding: 'Boarding', in_progress: 'On the road', completed: 'Completed', cancelled: 'Cancelled' }, active: 'Active filters', unassignedBus: 'No bus', unassignedDriver: 'No driver' },
  ar: { title: 'تصفية الرحلات', status: 'الحالة', route: 'المسار', bus: 'الحافلة', driver: 'السائق', source: 'النوع', from: 'من تاريخ', to: 'إلى تاريخ', any: 'الكل', apply: 'تطبيق', clear: 'مسح الكل', regular: 'رحلات منتظمة', manual: 'رحلات منفردة', quick: { today: 'اليوم', tomorrow: 'غداً', week: 'هذا الأسبوع', nextweek: 'الأسبوع القادم' }, st: { draft: 'مسودة', scheduled: 'مجدولة', boarding: 'صعود', in_progress: 'على الطريق', completed: 'مكتملة', cancelled: 'ملغاة' }, active: 'عوامل التصفية', unassignedBus: 'بدون حافلة', unassignedDriver: 'بدون سائق' },
} as const;

export const hrefWith = (v: Partial<TripFilterValues>): string => {
  const q = new URLSearchParams();
  for (const [k, val] of Object.entries(v)) if (val) q.set(k, val);
  const s = q.toString();
  return s ? `/dashboard/trips?${s}` : '/dashboard/trips';
};

/** A plain GET form: every filter lives in the URL (shareable, back button works, no client state). The server validates each value again. */
export function TripFilters({ values, routes, buses, drivers, quick }: { values: TripFilterValues; routes: Option[]; buses: Option[]; drivers: Option[]; quick: QuickRange[] }) {
  const lang = useDashLang();
  const T = TXT[lang];
  const lbl = 'block text-xs font-semibold text-slate-700 dark:text-slate-300';
  const sel = (name: string, value: string, opts: Option[]) => (
    <select name={name} defaultValue={value} className={inputClass(false)}>
      <option value="">{T.any}</option>
      {opts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
    </select>
  );
  const labelOf = (opts: Option[], id: string) => opts.find((o) => o.id === id)?.label ?? id;
  const chips: { k: keyof TripFilterValues; text: string }[] = [];
  if (values.status) chips.push({ k: 'status', text: `${T.status}: ${T.st[values.status as keyof typeof T.st] ?? values.status}` });
  if (values.route) chips.push({ k: 'route', text: `${T.route}: ${labelOf(routes, values.route)}` });
  if (values.bus) chips.push({ k: 'bus', text: `${T.bus}: ${labelOf(buses, values.bus)}` });
  if (values.driver) chips.push({ k: 'driver', text: `${T.driver}: ${labelOf(drivers, values.driver)}` });
  if (values.source) chips.push({ k: 'source', text: `${T.source}: ${values.source === 'regular' ? T.regular : T.manual}` });
  if (values.from) chips.push({ k: 'from', text: `${T.from}: ${values.from}` });
  if (values.to) chips.push({ k: 'to', text: `${T.to}: ${values.to}` });
  return (
    <section aria-label={T.title} className="mb-5 space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center gap-2">
        {quick.map((r) => (
          <Link key={r.key} href={hrefWith({ ...values, view: 'all', from: r.from, to: r.to })} className="inline-flex min-h-8 items-center rounded-lg border border-slate-300 px-3 text-xs font-bold hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800">{T.quick[r.key as keyof typeof T.quick]}</Link>
        ))}
      </div>
      <form method="get" action="/dashboard/trips" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <input type="hidden" name="view" value={values.view} />
        <div><label className={lbl}>{T.status}<select name="status" defaultValue={values.status} className={inputClass(false)}><option value="">{T.any}</option>{STATUS.map((s) => <option key={s} value={s}>{T.st[s]}</option>)}</select></label></div>
        <div><label className={lbl}>{T.route}{sel('route', values.route, routes)}</label></div>
        <div><label className={lbl}>{T.bus}{sel('bus', values.bus, buses)}</label></div>
        <div><label className={lbl}>{T.driver}{sel('driver', values.driver, drivers)}</label></div>
        <div><label className={lbl}>{T.source}<select name="source" defaultValue={values.source} className={inputClass(false)}><option value="">{T.any}</option><option value="regular">{T.regular}</option><option value="manual">{T.manual}</option></select></label></div>
        <div><label className={lbl}>{T.from}<input type="date" name="from" defaultValue={values.from} className={inputClass(false)} /></label></div>
        <div><label className={lbl}>{T.to}<input type="date" name="to" defaultValue={values.to} min={values.from || undefined} className={inputClass(false)} /></label></div>
        <div className="flex items-end gap-2"><button type="submit" className="inline-flex min-h-10 items-center rounded-xl bg-[#14243A] px-4 text-sm font-bold text-white">{T.apply}</button>
          {chips.length > 0 && <Link href={hrefWith({ view: values.view })} className="inline-flex min-h-10 items-center text-xs font-bold text-blue-700 underline-offset-2 hover:underline dark:text-blue-300">{T.clear}</Link>}</div>
      </form>
      {chips.length > 0 && (
        <ul aria-label={T.active} className="flex flex-wrap gap-2">
          {chips.map((c) => <li key={c.k}><Link href={hrefWith({ ...values, [c.k]: '' })} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-800 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-100">{c.text}<span aria-hidden="true">×</span><span className="sr-only"> remove</span></Link></li>)}
        </ul>
      )}
    </section>
  );
}
