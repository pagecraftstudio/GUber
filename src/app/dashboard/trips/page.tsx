import { T, Dt, Bi } from '@/components/dashboard/T';
import { Ltr } from '@/components/dashboard/Ltr';
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server';import { requireTenant } from '@/lib/auth/guards';import { createTenantServiceContext } from '@/lib/service/context';import { tripService } from '@/features/trips/service';import { routeService } from '@/features/routes/service';import { busService } from '@/features/buses/service';import { driverService } from '@/features/drivers/service';import { PageHeader } from '@/components/dashboard/PageHeader';import { DataTable,StatusPill } from '@/components/dashboard/DataTable';import { TripActions } from '@/features/dashboard/TripActions';
import type { Trip } from '@/features/trips/types';
import { planUsageService } from '@/features/subscriptions/usage-service';
import { companyTimeZone } from '@/features/trips/company-timezone';
import { idSchema } from '@/lib/validation/common';
import { addDays, dayKey, dayStartInstant, groupTripsByDay, isValidDateOnly, timeLabel, weekRange } from '@/features/trips/day-groups';
import { DayHeading } from '@/features/dashboard/DayHeading';
import { TripFilters } from '@/features/dashboard/TripFilters';
import { hrefWith, type TripFilterValues } from '@/features/trips/filter-url';

const PAST_CUTOFF_MS = 6 * 3600_000; // "upcoming" lasts until 6 h after departure, so a trip on the road is not buried
const PAGE_SIZE = 50;
const STATUSES = ['draft', 'scheduled', 'boarding', 'in_progress', 'completed', 'cancelled'] as const;
type Raw = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

export default async function TripsPage({ searchParams }: { searchParams: Promise<Raw> }) {
  const sp = await searchParams;
  const auth = await requireTenant('trips.read'), ctx = createTenantServiceContext(await createClient(), auth);
  const has = (p: string) => auth.membership.permissions.includes(p);
  const canWrite = has('trips.write');

  // Every filter comes from the URL, so each one is validated here; an invalid value is dropped, never passed on.
  const id = (k: string) => (idSchema.safeParse(one(sp[k])).success ? one(sp[k]) : '');
  const date = (k: string) => (isValidDateOnly(one(sp[k])) ? one(sp[k]) : '');
  const f: TripFilterValues = {
    view: ['upcoming', 'past', 'all'].includes(one(sp.view)) ? one(sp.view) : 'upcoming',
    status: (STATUSES as readonly string[]).includes(one(sp.status)) ? one(sp.status) : '',
    route: id('route'), bus: id('bus'), driver: id('driver'),
    source: ['regular', 'manual'].includes(one(sp.source)) ? one(sp.source) : '',
    from: date('from'), to: date('to'),
  };
  const page = Math.min(Math.max(parseInt(one(sp.page), 10) || 1, 1), 1000);

  const tz = await companyTimeZone(ctx);
  const today = dayKey(Date.now(), tz);
  const cutoff = new Date(Date.now() - PAST_CUTOFF_MS).toISOString();
  const hasDates = Boolean(f.from || f.to);
  const range: { from?: string; to?: string } = hasDates
    ? { ...(f.from ? { from: dayStartInstant(f.from, tz) } : {}), ...(f.to ? { to: dayStartInstant(addDays(f.to, 1), tz) } : {}) }
    : f.view === 'upcoming' ? { from: cutoff } : f.view === 'past' ? { to: cutoff } : {};
  const dir = f.view === 'past' && !hasDates ? 'desc' : 'asc';

  const [trips, routes, buses, drivers] = await Promise.all([
    tripService.list(ctx, { page, pageSize: PAGE_SIZE, dir, ...range, ...(f.status ? { status: f.status } : {}), ...(f.route ? { routeId: f.route } : {}), ...(f.bus ? { busId: f.bus } : {}), ...(f.driver ? { driverId: f.driver } : {}), ...(f.source ? { source: f.source } : {}) }),
    has('routes.read') ? routeService.list(ctx, { page: 1, pageSize: 100 }) : Promise.resolve({ items: [] }),
    has('buses.read') ? busService.list(ctx, { page: 1, pageSize: 100 }) : Promise.resolve({ items: [] }),
    has('drivers.read') ? driverService.list(ctx, { page: 1, pageSize: 100 }) : Promise.resolve({ items: [] }),
  ]);

  // Newest-first pages list the latest day first, but inside a day the times always read morning to night.
  const groups = groupTripsByDay(trips.items, tz).map((g) => (dir === 'desc' ? { ...g, trips: [...g.trips].reverse() } : g));
  const week = weekRange(today), next = weekRange(addDays(today, 7));
  const quick = [{ key: 'today', from: today, to: today }, { key: 'tomorrow', from: addDays(today, 1), to: addDays(today, 1) }, { key: 'week', ...week }, { key: 'nextweek', ...next }];
  const tab = (active: boolean) => `inline-flex min-h-9 items-center rounded-lg px-3 text-xs font-bold ${active ? 'bg-[#14243A] text-white' : 'border border-slate-300 text-slate-700 dark:border-slate-600 dark:text-slate-200'}`;
  const pageHref = (p: number) => `${hrefWith({ ...f })}${hrefWith({ ...f }).includes('?') ? '&' : '?'}page=${p}`;

  const columns = [
    { key: 'time', label: 'Time', render: (r: Trip) => <time dateTime={r.departureAt} dir="ltr" className="font-bold">{timeLabel(r.departureAt, tz)}</time> },
    { key: 'route', label: 'Route', render: (r: Trip) => <div className="font-bold text-slate-800 dark:text-white">{r.route?.name || <T>Route</T>}<p className="text-xs font-normal text-slate-600 dark:text-slate-400">{r.route?.originName} <span aria-hidden="true" className="inline-block rtl:rotate-180">→</span> {r.route?.destinationName}</p>{r.roundTripPrice !== null && <p className="mt-0.5 text-[11px] font-bold text-blue-800 dark:text-blue-300"><Bi en="Go and return" ar="ذهاب وعودة" /> · <Ltr>{r.price}</Ltr> / <Ltr>{r.roundTripPrice}</Ltr></p>}{r.outboundTripId && <p className="mt-0.5 text-[11px] font-bold text-violet-800 dark:text-violet-300"><Bi en="Return trip" ar="رحلة عودة" /> · <Ltr>{r.price}</Ltr></p>}</div> },
    { key: 'resources', label: 'Assignment', render: (r: Trip) => <div>{r.bus?.plateNumber ? <Ltr>{r.bus.plateNumber}</Ltr> : <T>No bus</T>}<p className="text-xs text-slate-600 dark:text-slate-400">{r.driver?.fullName || <T>No driver</T>}</p></div> },
    { key: 'seats', label: 'Seats', render: (r: Trip) => <Ltr>{r.seatsBooked}/{r.capacity}</Ltr> },
    { key: 'status', label: 'Status', render: (r: Trip) => <StatusPill value={r.status} /> },
    { key: 'action', label: 'Actions', render: (r: Trip) => canWrite ? <TripActions tripId={r.id} status={r.status} label={`${r.route?.name ?? ''} ${dayKey(r.departureAt, tz)} ${timeLabel(r.departureAt, tz)}`.trim()} /> : null },
  ];

  return <>
    <PageHeader eyebrow="Scheduling & dispatch" title="Trips" description="Review scheduled trips, assignments and the trip lifecycle." action={canWrite ? <div className="flex flex-wrap gap-2"><Link href="/dashboard/trips/regular" className="inline-flex min-h-10 items-center rounded-xl border border-slate-300 px-4 text-sm font-bold dark:border-slate-600"><T>Regular trips</T></Link><Link href="/dashboard/trips/new" className="inline-flex min-h-10 items-center rounded-xl bg-[#14243A] px-4 text-sm font-bold text-white"><T>Add a trip</T></Link></div> : undefined} />
    <nav aria-label="Trip period" className="mb-3 flex gap-2">
      {(['upcoming', 'past', 'all'] as const).map((v) => <Link key={v} href={hrefWith({ ...f, view: v, from: '', to: '' })} aria-current={f.view === v && !hasDates ? 'page' : undefined} className={tab(f.view === v && !hasDates)}>{v === 'upcoming' ? <T>Upcoming</T> : v === 'past' ? <T>Past</T> : <T>All</T>}</Link>)}
    </nav>
    <TripFilters values={f} quick={quick} routes={routes.items.map((r) => ({ id: r.id, label: r.name }))} buses={buses.items.map((b) => ({ id: b.id, label: b.plateNumber }))} drivers={drivers.items.map((d) => ({ id: d.id, label: d.fullName }))} />
    {groups.length === 0 ? <DataTable rows={[] as Trip[]} columns={columns} emptyTitle="No trips match" emptyText="Try another period or clear the filters." /> : (
      <div className="mb-5 space-y-6">
        {groups.map((g) => (
          <section key={g.day} aria-label={g.day}>
            <DayHeading day={g.day} today={today} count={g.trips.length} booked={g.trips.reduce((n, t) => n + t.seatsBooked, 0)} capacity={g.trips.reduce((n, t) => n + t.capacity, 0)} />
            <DataTable rows={g.trips} columns={columns} />
          </section>
        ))}
      </div>
    )}
    {(trips.hasMore || page > 1) && (
      <nav aria-label="Pages" className="mb-8 flex items-center justify-between text-xs font-bold">
        {page > 1 ? <Link href={pageHref(page - 1)} className="text-blue-700 hover:underline dark:text-blue-300">← <T>Previous</T></Link> : <span />}
        <span className="text-slate-600 dark:text-slate-400" dir="ltr">{page} / {Math.max(1, Math.ceil(trips.total / PAGE_SIZE))} · {trips.total}</span>
        {trips.hasMore ? <Link href={pageHref(page + 1)} className="text-blue-700 hover:underline dark:text-blue-300"><T>Next</T> →</Link> : <span />}
      </nav>
    )}
  </>;
}
