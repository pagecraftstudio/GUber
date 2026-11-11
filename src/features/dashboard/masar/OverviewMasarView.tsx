'use client';
import Link from 'next/link';
import { BusFront, CalendarDays, Globe2, Route, Ticket, Users, type LucideIcon } from 'lucide-react';
import { buttonClass } from '@/ds/primitives/button-class';
import { MetricCard } from '@/ds/data/Layout';
import { StatusBadge } from '@/ds/data/StatusBadge';
import { EmptyState } from '@/ds/feedback/States';
import { formatDate, formatDay, formatNumber, formatTime } from '@/ds/format';
import { useDsLang } from '@/ds/lang';
import { PageHeaderMasar } from './PageHeaderMasar';
import { J2 } from './text';

export interface NextDeparture { id: string; departureAt: string; routeName: string; originName: string; destinationName: string; seatsBooked: number; capacity: number; status: string }
export interface OverviewMasarViewProps {
  companyName: string; today: string; tz: string; canWriteTrips: boolean;
  /** null = this role cannot read that data, so the card is not shown (never a made-up zero). */
  tripsToday: number | null; seatsBookedToday: number | null; seatsCapacityToday: number | null; unpaid: number | null;
  next: NextDeparture[] | null;
  modules: { href: string; key: string; label: { en: string; ar: string }; icon: 'routes' | 'buses' | 'drivers' | 'trips' | 'bookings' | 'website' }[];
}
const ICON: Record<string, LucideIcon> = { routes: Route, buses: BusFront, drivers: Users, trips: CalendarDays, bookings: Ticket, website: Globe2 };

/** Overview: 3 numbers that are real, the next departures, and the modules this role can open. No chart: no trend query exists yet (see report). */
export function OverviewMasarView(p: OverviewMasarViewProps) {
  const lang = useDsLang();
  const t = J2[lang];
  return (
    <>
      <PageHeaderMasar title={t.overview} description={`${p.companyName} · ${formatDay(p.today, lang)}`}
        actions={p.canWriteTrips ? <Link href="/dashboard/trips/new" className={buttonClass('primary', 'md', false)}>{t.addTrip}</Link> : undefined} />
      <section aria-label={t.today} className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {p.tripsToday !== null ? <MetricCard label={t.tripsToday} value={formatNumber(p.tripsToday, lang)} /> : null}
        {p.seatsBookedToday !== null && p.seatsCapacityToday !== null ? <MetricCard label={t.seatsBookedToday} value={formatNumber(p.seatsBookedToday, lang)} comparison={t.seatsOf(formatNumber(p.seatsBookedToday, lang), formatNumber(p.seatsCapacityToday, lang))} /> : null}
        {p.unpaid !== null ? <MetricCard label={t.unpaid} value={formatNumber(p.unpaid, lang)} comparison={t.unpaidHint} /> : null}
      </section>
      {p.next !== null ? (
        <section aria-labelledby="next-dep" className="mb-8">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 id="next-dep" className="text-lg font-medium text-ink-primary">{t.nextDepartures}</h2>
            <Link href="/dashboard/trips" className="text-sm text-ink-link underline-offset-2 hover:underline">{t.viewAll}</Link>
          </div>
          {p.next.length === 0 ? (
            <div className="rounded-ds-md border border-line-default bg-surface-card"><EmptyState title={t.noDepartures} description={t.noDeparturesText} /></div>
          ) : (
            <ol className="divide-y divide-line-default rounded-ds-md border border-line-default bg-surface-card">
              {p.next.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="font-medium text-ink-primary">{d.routeName}</p>
                    <p className="text-[13px] text-ink-secondary">{d.originName} <span aria-hidden="true" className="inline-block rtl:rotate-180">→</span> {d.destinationName}</p>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <time dateTime={d.departureAt} className="tabular-nums text-ink-primary">{formatDate(d.departureAt, lang, { timeZone: p.tz, style: 'numeric' })} {formatTime(d.departureAt, lang, { timeZone: p.tz })}</time>
                    <span className="tabular-nums text-ink-secondary">{formatNumber(d.seatsBooked, lang)}/{formatNumber(d.capacity, lang)}</span>
                    <StatusBadge domain="trip" value={d.status} />
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      ) : null}
      {p.modules.length > 0 ? (
        <section aria-labelledby="mods">
          <h2 id="mods" className="mb-3 text-lg font-medium text-ink-primary">{t.quickLinks}</h2>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {p.modules.map((m) => { const Icon = ICON[m.icon] ?? Route; return (
              <li key={m.key}><Link href={m.href} className="flex h-12 items-center gap-3 rounded-ds-md border border-line-default bg-surface-card px-4 text-sm text-ink-primary hover:bg-surface-sunken"><Icon size={18} strokeWidth={1.5} aria-hidden="true" />{m.label[lang]}</Link></li>
            ); })}
          </ul>
        </section>
      ) : null}
    </>
  );
}
