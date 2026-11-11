'use client';
import Link from 'next/link';
import { buttonClass } from '@/ds/primitives/button-class';
import { DataTable, type Column } from '@/ds/data/DataTable';
import { Pagination } from '@/ds/data/Pagination';
import { StatusBadge } from '@/ds/data/StatusBadge';
import { Identifier } from '@/ds/format/Identifier';
import { formatDay, formatNumber, formatTime } from '@/ds/format';
import { useDsLang } from '@/ds/lang';
import { hrefWith, type TripFilterValues } from '@/features/trips/filter-url';
import type { Trip } from '@/features/trips/types';
import { PageHeaderMasar } from './PageHeaderMasar';
import { TripActionsMasar } from './TripActionsMasar';
import { UrlFilterBar, type FilterField } from './UrlFilterBar';
import { J2 } from './text';

type Opt = { id: string; label: string };
export interface TripsMasarViewProps {
  tz: string; today: string; f: TripFilterValues; hasDates: boolean;
  groups: { day: string; trips: Trip[] }[];
  canWrite: boolean; routes: Opt[]; buses: Opt[]; drivers: Opt[];
  quick: { key: 'today' | 'tomorrow' | 'week' | 'nextweek'; from: string; to: string }[];
  page: number; pageSize: number; total: number;
}

const STATUSES = ['draft', 'scheduled', 'boarding', 'in_progress', 'completed', 'cancelled'] as const;
const dayDiff = (day: string, today: string) => Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);

/** The trips screen in the MASAR look. Data, filters (URL), lifecycle actions and their server actions are the same as the old page. */
export function TripsMasarView(p: TripsMasarViewProps) {
  const lang = useDsLang();
  const t = J2[lang];
  const { f } = p;
  const rel = (day: string) => { const d = dayDiff(day, p.today); return d === 0 ? t.today : d === 1 ? t.tomorrow : d === -1 ? t.yesterday : null; };
  const label = (opts: Opt[], id: string) => opts.find((o) => o.id === id)?.label ?? id;
  const statusLabel = (s: string) => ({ draft: 'Draft', scheduled: 'Scheduled', boarding: 'Boarding', in_progress: 'On the road', completed: 'Completed', cancelled: 'Cancelled' } as Record<string, string>)[s] ?? s;

  const fields: FilterField[] = [
    { kind: 'select', name: 'route', label: t.route, value: f.route, allLabel: t.anyRoute, options: p.routes.map((r) => [r.id, r.label] as const) },
    { kind: 'select', name: 'bus', label: 'Bus', value: f.bus, allLabel: t.anyBus, options: p.buses.map((r) => [r.id, r.label] as const) },
    { kind: 'select', name: 'driver', label: 'Driver', value: f.driver, allLabel: t.anyDriver, options: p.drivers.map((r) => [r.id, r.label] as const) },
    { kind: 'select', name: 'status', label: t.status, value: f.status, allLabel: t.anyStatus, options: STATUSES.map((s) => [s, statusLabel(s)] as const) },
    { kind: 'select', name: 'source', label: 'Source', value: f.source, allLabel: t.anySource, options: [['regular', t.sourceRegular], ['manual', t.sourceManual]] },
    { kind: 'date', name: 'from', label: t.from, value: f.from },
    { kind: 'date', name: 'to', label: t.to, value: f.to },
  ];
  const keys = ['route', 'bus', 'driver', 'status', 'source', 'from', 'to'] as const;
  const chipText: Record<string, string> = {
    route: f.route && `${t.route}: ${label(p.routes, f.route)}`, bus: f.bus && `Bus: ${label(p.buses, f.bus)}`, driver: f.driver && `Driver: ${label(p.drivers, f.driver)}`,
    status: f.status && `${t.status}: ${statusLabel(f.status)}`, source: f.source && `Source: ${f.source === 'regular' ? t.sourceRegular : t.sourceManual}`,
    from: f.from && `${t.from}: ${formatDay(f.from, lang, 'numeric')}`, to: f.to && `${t.to}: ${formatDay(f.to, lang, 'numeric')}`,
  };
  const chips = keys.filter((k) => f[k]).map((k) => ({ key: k, label: chipText[k] ?? k, href: hrefWith({ ...f, [k]: '' }) }));
  const quickLabel = { today: t.quickToday, tomorrow: t.quickTomorrow, week: t.quickWeek, nextweek: t.quickNextWeek } as const;
  const quick = p.quick.map((q) => ({ key: q.key, label: quickLabel[q.key], href: hrefWith({ ...f, from: q.from, to: q.to }), active: f.from === q.from && f.to === q.to }));

  const cols = (tz: string): Column<Trip>[] => [
    { key: 'route', primary: true, header: t.route, cell: (r) => (
      <div className="flex flex-col gap-0.5">
        <span className="font-medium">{r.route?.name ?? t.route}</span>
        <span className="text-[13px] font-normal text-ink-secondary">{r.route?.originName} <span aria-hidden="true" className="inline-block rtl:rotate-180">→</span> {r.route?.destinationName}</span>
        {r.roundTripPrice !== null ? <span className="text-[13px] text-ink-muted">{t.goReturn} · <span className="tabular-nums">{formatNumber(r.price, lang)} / {formatNumber(r.roundTripPrice, lang)}</span></span> : null}
        {r.outboundTripId ? <span className="text-[13px] text-ink-muted">{t.returnTrip} · <span className="tabular-nums">{formatNumber(r.price, lang)}</span></span> : null}
      </div>) },
    { key: 'time', header: t.time, cell: (r) => <time dateTime={r.departureAt} className="tabular-nums">{formatTime(r.departureAt, lang, { timeZone: tz })}</time> },
    { key: 'resources', header: t.assignment, cell: (r) => (
      <div className="flex flex-col"><span>{r.bus?.plateNumber ? <Identifier value={r.bus.plateNumber} /> : t.noBus}</span><span className="text-[13px] text-ink-secondary">{r.driver?.fullName ?? t.noDriver}</span></div>) },
    { key: 'seats', header: t.seats, numeric: true, cell: (r) => <span className="tabular-nums">{formatNumber(r.seatsBooked, lang)}/{formatNumber(r.capacity, lang)}</span> },
    { key: 'status', header: t.status, cell: (r) => <StatusBadge domain="trip" value={r.status} /> },
  ];

  const pageCount = Math.max(1, Math.ceil(p.total / p.pageSize));
  const base = hrefWith({ ...f });
  const pageHref = (n: number) => `${base}${base.includes('?') ? '&' : '?'}page=${n}`;
  const tabs = [['upcoming', t.upcoming], ['past', t.past], ['all', t.all]] as const;

  return (
    <>
      <PageHeaderMasar title={t.trips}
        actions={p.canWrite ? <>
          <Link href="/dashboard/trips/regular" className={buttonClass('secondary', 'md', false)}>{t.regular}</Link>
          <Link href="/dashboard/trips/new" className={buttonClass('primary', 'md', false)}>{t.addTrip}</Link>
        </> : undefined} />
      <nav aria-label={t.period} className="mb-3 flex gap-2">
        {tabs.map(([v, l]) => { const on = f.view === v && !p.hasDates; return <Link key={v} href={hrefWith({ ...f, view: v, from: '', to: '' })} aria-current={on ? 'page' : undefined} className={`inline-flex h-9 items-center rounded-ds-md px-3 text-sm ${on ? 'bg-action text-on-action' : 'border border-line-strong text-ink-primary hover:bg-surface-sunken'}`}>{l}</Link>; })}
      </nav>
      <UrlFilterBar fields={fields} keep={{ view: f.view }} quick={quick} chips={chips} clearHref={hrefWith({ view: f.view })} />
      {p.groups.length === 0 ? <DataTable<Trip> caption={t.trips} columns={cols(p.tz)} rows={[]} rowId={(r) => r.id} empty={{ title: t.noTrips, description: t.noTripsText }} /> : (
        <div className="mb-6 flex flex-col gap-8">
          {p.groups.map((g) => {
            const booked = g.trips.reduce((n, x) => n + x.seatsBooked, 0), cap = g.trips.reduce((n, x) => n + x.capacity, 0), r = rel(g.day);
            return (
              <section key={g.day} aria-label={formatDay(g.day, lang)}>
                <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <h2 className="text-base font-medium text-ink-primary"><time dateTime={g.day}>{formatDay(g.day, lang)}</time></h2>
                  {r ? <span className="rounded-ds-sm bg-status-info-bg px-2 py-0.5 text-[13px] text-status-info-fg">{r}</span> : null}
                  <span className="text-[13px] text-ink-muted">{t.tripsCount(g.trips.length)} · <span className="tabular-nums">{formatNumber(booked, lang)}/{formatNumber(cap, lang)}</span> {t.seatsWord}</span>
                </div>
                <DataTable<Trip> caption={formatDay(g.day, lang)} columns={cols(p.tz)} rows={g.trips} rowId={(x) => x.id}
                  actionsHeader={t.actions}
                  rowActions={p.canWrite ? (x) => <TripActionsMasar tripId={x.id} status={x.status} label={`${x.route?.name ?? ''} ${formatTime(x.departureAt, lang, { timeZone: p.tz })}`.trim()} /> : undefined} />
              </section>
            );
          })}
        </div>
      )}
      <Pagination page={p.page} pageCount={pageCount} hrefFor={pageHref} />
    </>
  );
}
