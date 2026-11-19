'use client';
import Link from 'next/link';
import { DataTable, type Column } from '@/ds/data/DataTable';
import { formatDateTime, formatDay, formatMoney, formatNumber } from '@/ds/format';
import { useDsLang } from '@/ds/lang';
import { buttonClass } from '@/ds/primitives/button-class';
import type { DailyReport, PlanReport, TripDemand } from '@/features/subscription-reports/types';
import { PageHeaderMasar } from './PageHeaderMasar';
import { RP } from './textReport';

type Props = { from: string; to: string; timeZone: string; plans: PlanReport[]; days: DailyReport[]; demand: TripDemand[]; invalid?: boolean };

export function ReportMasarView(p: Props) {
  const lang = useDsLang();
  const t = RP[lang];
  const n = (v: number) => formatNumber(v, lang);
  const planCols: Column<PlanReport>[] = [
    { key: 'plan', primary: true, header: t.plan, cell: (r) => (<div><span className="font-medium">{r.planName}</span>{r.isActive ? null : <p className="text-[13px] text-ink-muted">{t.archived}</p>}</div>) },
    { key: 'route', header: t.route, cell: (r) => r.routeName },
    { key: 'active', numeric: true, header: t.activeNow, cell: (r) => n(r.activeNow) },
    { key: 'pending', numeric: true, header: t.pendingNow, cell: (r) => n(r.pendingNow) },
    { key: 'new', numeric: true, header: t.newInRange, cell: (r) => n(r.newInRange) },
    { key: 'revenue', numeric: true, header: t.revenue, cell: (r) => formatMoney(r.revenue, r.currency, lang) },
  ];
  const dayCols: Column<DailyReport>[] = [
    { key: 'day', primary: true, header: t.day, cell: (r) => formatDay(r.day, lang, 'numeric') },
    { key: 'gs', numeric: true, header: t.goScans, cell: (r) => n(r.goScans) },
    { key: 'rs', numeric: true, header: t.returnScans, cell: (r) => n(r.returnScans) },
    { key: 'gb', numeric: true, header: t.goBooked, cell: (r) => n(r.goBooked) },
    { key: 'rb', numeric: true, header: t.returnBooked, cell: (r) => n(r.returnBooked) },
    { key: 'ns', numeric: true, header: t.noShows, cell: (r) => n(r.noShows) },
  ];
  const demandCols: Column<TripDemand>[] = [
    { key: 'trip', primary: true, header: t.trip, cell: (r) => r.routeName },
    { key: 'dep', header: t.departs, cell: (r) => formatDateTime(r.departureAt, lang, { timeZone: p.timeZone }) },
    { key: 'left', numeric: true, header: t.seatsLeft, cell: (r) => `${n(r.seatsAvailable)} / ${n(r.capacity)}` },
    { key: 'sub', numeric: true, header: t.subSeats, cell: (r) => n(r.subscriberSeats) },
    { key: 'ret', numeric: true, header: t.returning, cell: (r) => n(r.returnIntent) },
  ];
  return (
    <>
      <PageHeaderMasar title={t.title} description={t.text} />
      <form method="get" className="mb-6 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">{t.from}<input type="date" name="from" defaultValue={p.from} required className="h-10 rounded-lg border border-line bg-surface px-3" /></label>
        <label className="flex flex-col gap-1 text-sm">{t.to}<input type="date" name="to" defaultValue={p.to} required className="h-10 rounded-lg border border-line bg-surface px-3" /></label>
        <button type="submit" className={buttonClass('primary', 'md')}>{t.apply}</button>
        <Link href="/dashboard/subscriptions" className={buttonClass('secondary', 'md')}>{t.back}</Link>
      </form>
      {p.invalid ? <p role="alert" className="mb-4 text-sm text-danger">{t.invalidRange}</p> : null}
      <h2 className="mb-2 text-base font-medium">{t.byPlan}</h2>
      <DataTable caption={t.byPlan} columns={planCols} rows={p.plans} rowId={(r) => r.planId} empty={{ title: t.noPlans, description: '' }} />
      <h2 className="mb-2 mt-8 text-base font-medium">{t.daily}</h2>
      <DataTable caption={t.daily} columns={dayCols} rows={p.days} rowId={(r) => r.day} empty={{ title: t.noDays, description: '' }} />
      <h2 className="mb-1 mt-8 text-base font-medium">{t.demand}</h2>
      <p className="mb-2 text-sm text-ink-secondary">{t.demandText}</p>
      <DataTable caption={t.demand} columns={demandCols} rows={p.demand} rowId={(r) => r.tripId} empty={{ title: t.noDemand, description: '' }} />
      <h2 className="mb-2 mt-8 text-base font-medium">{t.definitions}</h2>
      <ul className="list-disc space-y-1 ps-5 text-sm text-ink-secondary">{t.defs.map((d) => <li key={d}>{d}</li>)}</ul>
    </>
  );
}
