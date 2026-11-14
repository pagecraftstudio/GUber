
import { createClient } from '@/lib/supabase/server';
import { requireTenant } from '@/lib/auth/guards';
import { createTenantServiceContext } from '@/lib/service/context';
import { companyTimeZone } from '@/features/trips/company-timezone';
import { bookingService } from '@/features/bookings/service';
import { routeService } from '@/features/routes/service';

import { idSchema } from '@/lib/validation/common';
import { addDays, dayStartInstant, isValidDateOnly } from '@/features/trips/day-groups';
import { type BookingFilterValues } from '@/features/bookings/filter-url';
import { BOOKING_SORTS } from '@/features/bookings/schema';
import type { Booking } from '@/features/bookings/types';


import { BookingsMasarView } from '@/features/dashboard/masar/BookingsMasarView';

const PAGE_SIZE = 50;
const PAST_CUTOFF_MS = 6 * 3600_000; // "upcoming" lasts until 6 h after departure, so a trip on the road is not buried
type Raw = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

export default async function BookingsPage({ searchParams }: { searchParams: Promise<Raw> }) {
  const sp = await searchParams;
  const auth = await requireTenant('bookings.read'), ctx = createTenantServiceContext(await createClient(), auth);
  const has = (p: string) => auth.membership.permissions.includes(p);
  const canWrite = has('bookings.write');

  // Every filter comes from the URL, so each one is validated here; an invalid value is dropped, never passed on.
  const pick = (k: string, allowed: readonly string[]) => (allowed.includes(one(sp[k])) ? one(sp[k]) : '');
  const id = (k: string) => (idSchema.safeParse(one(sp[k])).success ? one(sp[k]) : '');
  const date = (k: string) => (isValidDateOnly(one(sp[k])) ? one(sp[k]) : '');
  const q = one(sp.q).trim().slice(0, 100);
  const hasDates = Boolean(date('from') || date('to'));
  // A search must be able to find an old ticket: with a search term and no explicit view, look at every trip.
  const view = pick('view', ['upcoming', 'past', 'all']) || (q || hasDates ? 'all' : 'upcoming');
  const f: BookingFilterValues = {
    q, view,
    sort: pick('sort', BOOKING_SORTS) || (view === 'past' ? 'trip_desc' : 'trip_asc'),
    pay: pick('pay', ['unpaid', 'partial', 'paid', 'refunded']),
    boarding: pick('boarding', ['not_boarded', 'partial', 'boarded']),
    source: pick('source', ['web', 'staff']),
    route: id('route'), trip: id('trip'), from: date('from'), to: date('to'),
  };
  const page = Math.min(Math.max(parseInt(one(sp.page), 10) || 1, 1), 1000);

  const tz = await companyTimeZone(ctx);
  const cutoff = new Date(Date.now() - PAST_CUTOFF_MS).toISOString();
  const tripWindow = hasDates
    ? { ...(f.from ? { tripFrom: dayStartInstant(f.from, tz) } : {}), ...(f.to ? { tripTo: dayStartInstant(addDays(f.to, 1), tz) } : {}) }
    : f.view === 'upcoming' ? { tripFrom: cutoff } : f.view === 'past' ? { tripTo: cutoff } : {};

  const [result, routes] = await Promise.all([
    bookingService.list(ctx, {
      page, pageSize: PAGE_SIZE, sort: f.sort, ...tripWindow,
      ...(f.q ? { q: f.q } : {}), ...(f.pay ? { paymentStatus: f.pay } : {}),
      ...(f.boarding ? { boarding: f.boarding } : {}), ...(f.source ? { source: f.source } : {}),
      ...(f.route ? { routeId: f.route } : {}), ...(f.trip ? { tripId: f.trip } : {}),
    }),
    has('routes.read') ? routeService.list(ctx, { page: 1, pageSize: 100 }) : Promise.resolve({ items: [] }),
  ]);

  const byTrip = f.sort === 'trip_asc' || f.sort === 'trip_desc';
  // Rows arrive sorted by departure then trip, so consecutive rows of one trip form one group.
  const groups: { key: string; first: Booking; rows: Booking[] }[] = [];
  for (const b of result.items) {
    const key = byTrip ? b.tripId : b.id;
    const last = groups[groups.length - 1];
    if (byTrip && last && last.key === key) last.rows.push(b);
    else groups.push({ key, first: b, rows: [b] });
  }
  const tripLabel = result.items.find((b) => b.tripId === f.trip)?.trip?.routeName ?? '…';

  return <BookingsMasarView tz={tz} f={f} hasDates={hasDates} canWrite={canWrite} routes={routes.items.map((r) => ({ id: r.id, label: r.name }))}
    groups={groups} byTrip={byTrip} page={page} pageSize={PAGE_SIZE} total={result.total} tripLabel={tripLabel} />;
}
