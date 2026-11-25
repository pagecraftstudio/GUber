'use client';
import { formatNumber, type Lang } from '@/ds/format';
import { useDsLang } from '@/ds/lang';
import type { DriverRating } from '../types';
import { StarsDisplay } from './StarInput';

const T: Record<Lang, { title: string; hint: string; driver: string; average: string; count: string; none: string; dist: string }> = {
  en: { title: 'Driver ratings', hint: 'Average of the driver stars riders gave after boarding. Riders are never identified.', driver: 'Driver', average: 'Average', count: 'Ratings', none: 'No ratings yet', dist: 'Stars 5 to 1' },
  ar: { title: 'تقييمات السائقين', hint: 'متوسط نجوم السائق التي منحها الركاب بعد الصعود. لا تُعرض هوية الراكب أبداً.', driver: 'السائق', average: 'المتوسط', count: 'التقييمات', none: 'لا توجد تقييمات بعد', dist: 'النجوم من 5 إلى 1' },
};

/** Managers (drivers.read): each driver's average, count and star distribution. Nothing about who rated. */
export function DriverRatingsPanel({ rows }: { rows: DriverRating[] }) {
  const lang = useDsLang();
  const t = T[lang];
  if (rows.length === 0) return null;
  return (
    <section aria-labelledby="driver-ratings" className="mb-6 space-y-2">
      <h2 id="driver-ratings" className="text-lg font-medium text-ink-primary">{t.title}</h2>
      <p className="text-sm text-ink-secondary">{t.hint}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-start text-sm">
          <thead><tr className="border-b border-line-default text-ink-secondary"><th scope="col" className="py-2 text-start font-normal">{t.driver}</th><th scope="col" className="py-2 text-start font-normal">{t.average}</th><th scope="col" className="py-2 text-start font-normal">{t.count}</th><th scope="col" className="py-2 text-start font-normal">{t.dist}</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.driverId} className="border-b border-line-default">
                <th scope="row" className="py-2 text-start font-medium text-ink-primary"><bdi dir="auto">{r.fullName}</bdi></th>
                <td className="py-2 tabular-nums">{r.average !== null ? <><StarsDisplay average={r.average} label={`${formatNumber(r.average, lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} / ${formatNumber(5, lang)}`} /> <span className="ms-1">{formatNumber(r.average, lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span></> : <span className="text-ink-secondary">{t.none}</span>}</td>
                <td className="py-2 tabular-nums">{formatNumber(r.ratings, lang)}</td>
                <td className="py-2 tabular-nums text-ink-secondary">{[...r.distribution].reverse().map((n) => formatNumber(n, lang)).join(' · ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
