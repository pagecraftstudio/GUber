'use client';
import Link from 'next/link';
import { DataTable, type Column } from '@/ds/data/DataTable';
import { Pagination } from '@/ds/data/Pagination';
import { StatusBadge } from '@/ds/data/StatusBadge';
import { Identifier } from '@/ds/format/Identifier';
import { formatDateTime, formatNumber } from '@/ds/format';
import { useDsLang } from '@/ds/lang';
import { bookingsHref, type BookingFilterValues } from '@/features/bookings/filter-url';
import type { Booking } from '@/features/bookings/types';
import { PageHeaderMasar } from './PageHeaderMasar';
import { UrlFilterBar, type FilterField } from './UrlFilterBar';
import { BoardingCellMasar, CancelCellMasar, PaymentCellMasar } from './BookingCellsMasar';
import { J2 } from './text';

export interface BookingsMasarViewProps {
  tz: string; f: BookingFilterValues; hasDates: boolean; canWrite: boolean;
  routes: { id: string; label: string }[]; groups: { key: string; first: Booking; rows: Booking[] }[];
  byTrip: boolean; page: number; pageSize: number; total: number; tripLabel: string;
}

/** The bookings screen in the MASAR look. Same data, URL filters, grouping by trip, autosaving amount, and the same server actions. */
export function BookingsMasarView(p: BookingsMasarViewProps) {
  const lang = useDsLang();
  const t = J2[lang];
  const { f } = p;
  const pays = ['unpaid', 'partial', 'paid', 'refunded'] as const;
  const boards = ['not_boarded', 'partial', 'boarded'] as const;
  const payLabel: Record<string, string> = { unpaid: 'Unpaid', partial: 'Partly paid', paid: 'Paid in full', refunded: 'Refunded' };
  const boardLabel: Record<string, string> = { not_boarded: t.notBoarded, partial: t.partBoarded, boarded: t.boarded };

  const fields: FilterField[] = [
    { kind: 'search', name: 'q', label: t.search, value: f.q, placeholder: t.searchPh },
    { kind: 'select', name: 'pay', label: t.payment, value: f.pay, allLabel: t.anyPay, options: pays.map((v) => [v, payLabel[v] ?? v] as const) },
    { kind: 'select', name: 'boarding', label: t.boarding, value: f.boarding, allLabel: t.anyBoarding, options: boards.map((v) => [v, boardLabel[v] ?? v] as const) },
    { kind: 'select', name: 'route', label: t.route, value: f.route, allLabel: t.anyRoute, options: p.routes.map((r) => [r.id, r.label] as const) },
    { kind: 'select', name: 'source', label: 'Booked via', value: f.source, allLabel: t.anySource, options: [['web', t.sourceWeb], ['staff', t.sourceStaff]] },
    { kind: 'date', name: 'from', label: `${t.trip}: ${t.from}`, value: f.from },
    { kind: 'date', name: 'to', label: `${t.trip}: ${t.to}`, value: f.to },
    { kind: 'select', name: 'sort', label: t.sortBy, value: f.sort, options: [['trip_asc', t.sortTripAsc], ['trip_desc', t.sortTripDesc], ['created_desc', t.sortNew], ['created_asc', t.sortOld]] },
  ];
  const chipText: Record<string, string> = {
    q: f.q && `${t.search}: ${f.q}`, pay: f.pay && `${t.payment}: ${payLabel[f.pay] ?? f.pay}`, boarding: f.boarding && `${t.boarding}: ${boardLabel[f.boarding] ?? f.boarding}`,
    route: f.route && `${t.route}: ${p.routes.find((r) => r.id === f.route)?.label ?? ''}`, source: f.source && `Booked via: ${f.source === 'web' ? t.sourceWeb : t.sourceStaff}`,
    trip: f.trip && `${t.trip}: ${p.tripLabel}`, from: f.from && `${t.from}: ${f.from}`, to: f.to && `${t.to}: ${f.to}`,
  };
  const keys = ['q', 'pay', 'boarding', 'route', 'source', 'trip', 'from', 'to'] as const;
  const chips = keys.filter((k) => f[k]).map((k) => ({ key: k, label: chipText[k] ?? k, href: bookingsHref({ ...f, [k]: '' }) }));

  const cols = (withTrip: boolean): Column<Booking>[] => [
    { key: 'ref', primary: true, header: t.reference, cell: (b) => <Identifier value={b.reference} copy /> },
    { key: 'pax', header: t.passenger, cell: (b) => (
      <div className="flex flex-col"><span className="font-medium">{b.customer?.fullName ?? t.restricted}</span>
        <span className="text-[13px] text-ink-secondary">{b.customer?.phone ? <Identifier value={b.customer.phone} /> : '—'}</span>
        {b.customer?.studentId ? <span className="text-[13px] text-ink-muted"><Identifier value={b.customer.studentId} />{b.customer.university ? ` · ${b.customer.university}` : ''}</span> : null}</div>) },
    ...(withTrip ? [{ key: 'trip', header: t.trip, cell: (b: Booking) => <div className="flex flex-col"><span>{b.trip?.routeName ?? '—'}</span>{b.trip ? <span className="text-[13px] text-ink-secondary">{formatDateTime(b.trip.departureAt, lang, { timeZone: p.tz })}</span> : null}</div> } as Column<Booking>] : []),
    { key: 'seats', header: t.seats, numeric: true, cell: (b) => formatNumber(b.seatsCount, lang) },
    { key: 'pay', header: t.payment, cell: (b) => <PaymentCellMasar b={b} canWrite={p.canWrite} /> },
    { key: 'board', header: t.boarding, cell: (b) => <BoardingCellMasar b={b} /> },
    { key: 'act', header: t.action, hideOnCard: false, cell: (b) => <CancelCellMasar b={b} canWrite={p.canWrite} /> },
  ];

  const pageCount = Math.max(1, Math.ceil(p.total / p.pageSize));
  const tabs = [['upcoming', t.upcoming], ['past', t.past], ['all', t.all]] as const;
  return (
    <>
      <PageHeaderMasar title={t.bookings} />
      <nav aria-label={t.period} className="mb-3 flex gap-2">
        {tabs.map(([v, l]) => { const on = f.view === v && !p.hasDates; return <Link key={v} href={bookingsHref({ ...f, view: v, from: '', to: '' })} aria-current={on ? 'page' : undefined} className={`inline-flex h-9 items-center rounded-ds-md px-3 text-sm ${on ? 'bg-action text-on-action' : 'border border-line-strong text-ink-primary hover:bg-surface-sunken'}`}>{l}</Link>; })}
      </nav>
      <UrlFilterBar fields={fields} keep={{ view: f.view, trip: f.trip }} chips={chips} clearHref={bookingsHref({ view: f.view })} />
      {p.groups.length === 0 ? <DataTable<Booking> caption={t.bookings} columns={cols(true)} rows={[]} rowId={(b) => b.id} empty={{ title: t.noBookings, description: t.noBookingsText }} /> : (
        <div className="mb-6 flex flex-col gap-6">
          {p.groups.map((g) => (
            <section key={g.key} aria-label={g.first.trip?.routeName ?? t.bookings}>
              {p.byTrip ? (
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-base font-medium text-ink-primary">{g.first.trip?.routeName ?? t.restricted}</h2>
                    {g.first.trip ? <span className="text-[13px] text-ink-secondary">{formatDateTime(g.first.trip.departureAt, lang, { timeZone: p.tz })}</span> : null}
                    {g.first.trip?.status ? <StatusBadge domain="trip" value={g.first.trip.status} /> : null}
                  </div>
                  {!f.trip ? <Link href={bookingsHref({ ...f, trip: g.first.tripId, view: 'all' })} className="text-[13px] text-ink-link underline-offset-2 hover:underline">{t.allTrips}</Link> : null}
                </div>
              ) : null}
              <DataTable<Booking> caption={g.first.trip?.routeName ?? t.bookings} columns={cols(!p.byTrip)} rows={g.rows} rowId={(b) => b.id} />
            </section>
          ))}
        </div>
      )}
      <Pagination page={p.page} pageCount={pageCount} hrefFor={(n) => bookingsHref({ ...f, page: n })} />
    </>
  );
}
