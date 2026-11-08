import Link from 'next/link';
import { T, Dt, Bi } from '@/components/dashboard/T';
import { Ltr } from '@/components/dashboard/Ltr';
import { createClient } from '@/lib/supabase/server';
import { requireTenant } from '@/lib/auth/guards';
import { createTenantServiceContext } from '@/lib/service/context';
import { companyTimeZone } from '@/features/trips/company-timezone';
import { bookingService } from '@/features/bookings/service';
import { routeService } from '@/features/routes/service';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { StatusPill } from '@/components/dashboard/DataTable';
import { idSchema } from '@/lib/validation/common';
import { addDays, dayStartInstant, isValidDateOnly } from '@/features/trips/day-groups';
import { bookingsHref, type BookingFilterValues } from '@/features/bookings/filter-url';
import { BOOKING_SORTS } from '@/features/bookings/schema';
import type { Booking } from '@/features/bookings/types';
import { BookingFilters } from '@/features/dashboard/BookingFilters';
import { BoardingBadge, CancelCell, PaymentCell } from '@/features/dashboard/BookingParts';

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

  const pageHref = (p: number) => bookingsHref({ ...f, page: p });
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
  const th = 'whitespace-nowrap px-4 py-3 text-start';

  return (
    <>
      <PageHeader eyebrow="Passenger operations" title="Bookings" description="Search reservations, track what each passenger has paid and who has boarded." />
      <BookingFilters values={f} routes={routes.items.map((r) => ({ id: r.id, label: r.name }))} tripLabel={tripLabel} total={result.total} />
      {result.items.length === 0 ? (
        <div className="grid min-h-48 place-items-center rounded-2xl border border-dashed border-slate-300 bg-white px-5 text-center dark:border-slate-700 dark:bg-slate-900">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200"><Bi en="No bookings match these filters." ar="لا توجد حجوزات تطابق هذه العوامل." /></p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <section key={g.key} aria-label={g.first.trip?.routeName ?? undefined} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/30 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
              {byTrip && (
                <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-800/70">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">{g.first.trip?.routeName ?? <T>Restricted</T>}</h2>
                    {g.first.trip && <span className="text-xs font-semibold text-slate-700 dark:text-slate-300"><Dt value={g.first.trip.departureAt} time timeZone={tz} /></span>}
                    {g.first.trip?.status && <StatusPill value={g.first.trip.status} />}
                  </div>
                  {!f.trip && <Link href={bookingsHref({ ...f, trip: g.first.tripId, view: 'all' })} className="text-xs font-bold text-blue-700 underline-offset-2 hover:underline dark:text-blue-300"><Bi en="Show this trip only" ar="عرض هذه الرحلة فقط" /></Link>}
                </header>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-start text-sm">
                  <thead className="bg-slate-50/60 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:bg-slate-800/40 dark:text-slate-400">
                    <tr>
                      <th scope="col" className={th}><T>Reference</T></th><th scope="col" className={th}><T>Passenger</T></th>
                      {!byTrip && <th scope="col" className={th}><T>Trip</T></th>}
                      <th scope="col" className={th}><T>Seats</T></th><th scope="col" className={th}><T>Payment</T></th>
                      <th scope="col" className={th}><Bi en="Boarding" ar="الصعود" /></th><th scope="col" className={th}><Bi en="Action" ar="الإجراء" /></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {g.rows.map((b) => (
                      <tr key={b.id} className="align-top transition hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                        <td className="whitespace-nowrap px-4 py-3"><span className="font-mono text-xs font-bold text-blue-700 dark:text-blue-300"><Ltr>{b.reference}</Ltr></span></td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-800 dark:text-white">{b.customer?.fullName ?? <T>Restricted</T>}</div>
                          <p className="text-xs text-slate-600 dark:text-slate-400">{b.customer?.phone ? <Ltr>{b.customer.phone}</Ltr> : '—'}</p>
                          {(b.customer?.studentId || b.customer?.university) && <p className="text-xs text-slate-600 dark:text-slate-400">{b.customer.studentId && <Ltr>{b.customer.studentId}</Ltr>}{b.customer.studentId && b.customer.university ? ' · ' : ''}{b.customer.university}</p>}
                        </td>
                        {!byTrip && <td className="whitespace-nowrap px-4 py-3 text-slate-700 dark:text-slate-300">{b.trip?.routeName ?? '—'}<p className="text-xs text-slate-600 dark:text-slate-400">{b.trip ? <Dt value={b.trip.departureAt} time timeZone={tz} /> : '—'}</p></td>}
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{b.seatsCount}</td>
                        <td className="px-4 py-3"><PaymentCell b={b} canWrite={canWrite} /></td>
                        <td className="whitespace-nowrap px-4 py-3"><BoardingBadge b={b} /></td>
                        <td className="px-4 py-3"><CancelCell b={b} canWrite={canWrite} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
      {(page > 1 || result.hasMore) && (
        <nav aria-label="Pagination" className="mt-5 flex items-center justify-between text-sm">
          {page > 1 ? <Link href={pageHref(page - 1)} className="font-bold text-blue-700 dark:text-blue-300"><Bi en="← Previous" ar="السابق →" /></Link> : <span />}
          <span className="text-xs text-slate-600 dark:text-slate-400"><Bi en="Page" ar="صفحة" /> {page}</span>
          {result.hasMore ? <Link href={pageHref(page + 1)} className="font-bold text-blue-700 dark:text-blue-300"><Bi en="Next →" ar="← التالي" /></Link> : <span />}
        </nav>
      )}
    </>
  );
}
