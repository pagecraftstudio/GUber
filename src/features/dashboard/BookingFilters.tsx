'use client';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { useDashLang } from './lang';
import { inputClass } from '@/components/dashboard/FormParts';
import { bookingsHref, type BookingFilterValues } from '@/features/bookings/filter-url';

type Option = { id: string; label: string };

const TXT = {
  en: {
    title: 'Search and filter bookings', search: 'Search', placeholder: 'Reference / ticket no., name, phone, student ID, university…', sort: 'Sort by',
    sorts: { trip_asc: 'Trip time: earliest first', trip_desc: 'Trip time: latest first', newest: 'Booked: newest first', oldest: 'Booked: oldest first', name: 'Passenger name A–Z' },
    views: { upcoming: 'Upcoming trips', past: 'Past trips', all: 'All trips' },
    payment: 'Payment', boarding: 'Boarding', status: 'Booking status', any: 'Any', apply: 'Apply', clear: 'Clear all', more: 'More filters',
    route: 'Route', source: 'Booked via', from: 'Trip from', to: 'Trip to', active: 'Active filters', web: 'Website', staff: 'Staff', tripOnly: 'One trip only',
    pays: { unpaid: 'Unpaid', partial: 'Partly paid', paid: 'Paid in full', refunded: 'Refunded' },
    boards: { not_boarded: 'Not boarded', partial: 'Partly boarded', boarded: 'Boarded' },
    sts: { pending: 'Pending', confirmed: 'Confirmed', cancelled: 'Cancelled', completed: 'Completed', no_show: 'No show' },
    searchHint: 'Searching covers all trips unless you pick a view.',
  },
  ar: {
    title: 'بحث وتصفية الحجوزات', search: 'بحث', placeholder: 'رقم الحجز / التذكرة، الاسم، الهاتف، الرقم الجامعي، الجامعة…', sort: 'ترتيب حسب',
    sorts: { trip_asc: 'وقت الرحلة: الأقرب أولاً', trip_desc: 'وقت الرحلة: الأبعد أولاً', newest: 'تاريخ الحجز: الأحدث', oldest: 'تاريخ الحجز: الأقدم', name: 'اسم الراكب أ–ي' },
    views: { upcoming: 'الرحلات القادمة', past: 'الرحلات السابقة', all: 'كل الرحلات' },
    payment: 'الدفع', boarding: 'الصعود', status: 'حالة الحجز', any: 'الكل', apply: 'تطبيق', clear: 'مسح الكل', more: 'مزيد من عوامل التصفية',
    route: 'المسار', source: 'طريقة الحجز', from: 'الرحلة من', to: 'الرحلة إلى', active: 'عوامل التصفية', web: 'الموقع', staff: 'الموظفون', tripOnly: 'رحلة واحدة فقط',
    pays: { unpaid: 'غير مدفوع', partial: 'مدفوع جزئياً', paid: 'مدفوع بالكامل', refunded: 'مسترد' },
    boards: { not_boarded: 'لم يصعد', partial: 'صعد جزء منهم', boarded: 'صعد' },
    sts: { pending: 'قيد الانتظار', confirmed: 'مؤكد', cancelled: 'ملغي', completed: 'مكتمل', no_show: 'لم يحضر' },
    searchHint: 'البحث يشمل كل الرحلات ما لم تختر عرضاً محدداً.',
  },
} as const;

/** A plain GET form: every filter lives in the URL (shareable, back button works, no client state). The server validates each value again. */
export function BookingFilters({ values, routes, tripLabel, total }: { values: BookingFilterValues; routes: Option[]; tripLabel: string; total: number }) {
  const T = TXT[useDashLang()];
  const lbl = 'block text-xs font-semibold text-slate-700 dark:text-slate-300';
  const sel = (name: string, value: string, opts: readonly [string, string][]) => (
    <select name={name} defaultValue={value} className={inputClass(false)}>
      <option value="">{T.any}</option>
      {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
  const chips: { k: keyof BookingFilterValues; text: string }[] = [];
  if (values.q) chips.push({ k: 'q', text: `${T.search}: ${values.q}` });
  if (values.status) chips.push({ k: 'status', text: `${T.status}: ${T.sts[values.status as keyof typeof T.sts] ?? values.status}` });
  if (values.pay) chips.push({ k: 'pay', text: `${T.payment}: ${T.pays[values.pay as keyof typeof T.pays] ?? values.pay}` });
  if (values.boarding) chips.push({ k: 'boarding', text: `${T.boarding}: ${T.boards[values.boarding as keyof typeof T.boards] ?? values.boarding}` });
  if (values.route) chips.push({ k: 'route', text: `${T.route}: ${routes.find((r) => r.id === values.route)?.label ?? '…'}` });
  if (values.source) chips.push({ k: 'source', text: `${T.source}: ${values.source === 'web' ? T.web : T.staff}` });
  if (values.trip) chips.push({ k: 'trip', text: `${T.tripOnly}: ${tripLabel}` });
  if (values.from) chips.push({ k: 'from', text: `${T.from}: ${values.from}` });
  if (values.to) chips.push({ k: 'to', text: `${T.to}: ${values.to}` });
  const advancedActive = Boolean(values.route || values.source || values.from || values.to);
  const tab = (active: boolean) => `inline-flex min-h-9 items-center rounded-lg px-3 text-xs font-bold ${active ? 'bg-[#14243A] text-white' : 'border border-slate-300 text-slate-700 dark:border-slate-600 dark:text-slate-200'}`;

  return (
    <section aria-label={T.title} className="mb-5 space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <nav aria-label={T.title} className="flex flex-wrap gap-2">
        {(['upcoming', 'past', 'all'] as const).map((v) => (
          <Link key={v} href={bookingsHref({ ...values, view: v })} aria-current={values.view === v ? 'page' : undefined} className={tab(values.view === v)}>{T.views[v]}</Link>
        ))}
      </nav>
      <form method="get" action="/dashboard/bookings" className="space-y-3">
        <input type="hidden" name="view" value={values.view} />
        {values.trip && <input type="hidden" name="trip" value={values.trip} />}
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="relative block flex-1">
            <span className="sr-only">{T.search}</span>
            <Search aria-hidden="true" size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input type="search" name="q" defaultValue={values.q} maxLength={100} placeholder={T.placeholder} autoComplete="off" className={`${inputClass(false)} ps-9`} />
          </label>
          <button type="submit" className="inline-flex min-h-10 items-center justify-center rounded-xl bg-[#14243A] px-5 text-sm font-bold text-white">{T.search}</button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div><label className={lbl}>{T.payment}{sel('pay', values.pay, Object.entries(T.pays))}</label></div>
          <div><label className={lbl}>{T.boarding}{sel('boarding', values.boarding, Object.entries(T.boards))}</label></div>
          <div><label className={lbl}>{T.status}{sel('status', values.status, Object.entries(T.sts))}</label></div>
          <div><label className={lbl}>{T.sort}
            <select name="sort" defaultValue={values.sort} className={inputClass(false)}>{Object.entries(T.sorts).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label></div>
        </div>
        <details open={advancedActive} className="rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-700">
          <summary className="cursor-pointer text-xs font-bold text-slate-700 dark:text-slate-200">{T.more}</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div><label className={lbl}>{T.route}{sel('route', values.route, routes.map((r) => [r.id, r.label] as [string, string]))}</label></div>
            <div><label className={lbl}>{T.source}{sel('source', values.source, [['web', T.web], ['staff', T.staff]])}</label></div>
            <div><label className={lbl}>{T.from}<input type="date" name="from" defaultValue={values.from} className={inputClass(false)} /></label></div>
            <div><label className={lbl}>{T.to}<input type="date" name="to" defaultValue={values.to} min={values.from || undefined} className={inputClass(false)} /></label></div>
          </div>
        </details>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="inline-flex min-h-10 items-center rounded-xl border border-slate-300 px-4 text-sm font-bold dark:border-slate-600">{T.apply}</button>
          {chips.length > 0 && <Link href={bookingsHref({ view: values.view })} className="inline-flex min-h-10 items-center text-xs font-bold text-blue-700 underline-offset-2 hover:underline dark:text-blue-300">{T.clear}</Link>}
          <span className="text-xs text-slate-600 dark:text-slate-400" aria-live="polite">{total}</span>
          {values.q && values.view === 'all' && <span className="text-xs text-slate-600 dark:text-slate-400">{T.searchHint}</span>}
        </div>
      </form>
      {chips.length > 0 && (
        <ul aria-label={T.active} className="flex flex-wrap gap-2">
          {chips.map((c) => <li key={c.k}><Link href={bookingsHref({ ...values, [c.k]: '' })} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-800 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-100">{c.text}<span aria-hidden="true">×</span><span className="sr-only"> remove</span></Link></li>)}
        </ul>
      )}
    </section>
  );
}
