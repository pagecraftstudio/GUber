'use client';
import { useDashLang } from './lang';

const TXT = { en: { today: 'Today', tomorrow: 'Tomorrow', yesterday: 'Yesterday', trips: (n: number) => `${n} ${n === 1 ? 'trip' : 'trips'}`, seats: 'booked' }, ar: { today: 'اليوم', tomorrow: 'غداً', yesterday: 'أمس', trips: (n: number) => `${n} ${n === 1 ? 'رحلة' : 'رحلات'}`, seats: 'محجوز' } } as const;

/** Heading of one day group. `day` is YYYY-MM-DD in the company zone; `today` is the same zone's today, so the word "Today" is right even if the browser is elsewhere. */
export function DayHeading({ day, today, count, booked, capacity }: { day: string; today: string; count: number; booked: number; capacity: number }) {
  const lang = useDashLang();
  const T = TXT[lang];
  const diff = Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  const rel = diff === 0 ? T.today : diff === 1 ? T.tomorrow : diff === -1 ? T.yesterday : null;
  const text = new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${day}T00:00:00Z`));
  return (
    <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
      <h2 className="text-sm font-extrabold text-slate-900 dark:text-white"><time dateTime={day}>{text}</time></h2>
      {rel && <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-[11px] font-bold text-blue-900 dark:bg-blue-500/20 dark:text-blue-100">{rel}</span>}
      <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">{T.trips(count)} · <span dir="ltr">{booked}/{capacity}</span> {T.seats}</span>
    </div>
  );
}
