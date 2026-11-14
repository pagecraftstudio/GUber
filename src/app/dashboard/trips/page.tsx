
import { createClient } from '@/lib/supabase/server';import { requireTenant } from '@/lib/auth/guards';import { createTenantServiceContext } from '@/lib/service/context';import { tripService } from '@/features/trips/service';import { routeService } from '@/features/routes/service';import { busService } from '@/features/buses/service';import { driverService } from '@/features/drivers/service';

import { companyTimeZone } from '@/features/trips/company-timezone';
import { idSchema } from '@/lib/validation/common';
import { addDays, dayKey, dayStartInstant, groupTripsByDay, isValidDateOnly, weekRange } from '@/features/trips/day-groups';

import { type TripFilterValues } from '@/features/trips/filter-url';

import { TripsMasarView } from '@/features/dashboard/masar/TripsMasarView';

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

  return <TripsMasarView tz={tz} today={today} f={f} hasDates={hasDates} groups={groups.map((g) => ({ day: g.day, trips: g.trips }))} canWrite={canWrite}
    routes={routes.items.map((r) => ({ id: r.id, label: r.name }))} buses={buses.items.map((b) => ({ id: b.id, label: b.plateNumber }))} drivers={drivers.items.map((d) => ({ id: d.id, label: d.fullName }))}
    quick={quick as { key: 'today' | 'tomorrow' | 'week' | 'nextweek'; from: string; to: string }[]} page={page} pageSize={PAGE_SIZE} total={trips.total} />;
}
