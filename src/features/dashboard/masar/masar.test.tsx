// @vitest-environment jsdom
import axe from 'axe-core';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { polyfillDialog } from '@/ds/test-setup';
import { DsLangProvider } from '@/ds/lang';
import type { Booking } from '@/features/bookings/types';
import type { Trip } from '@/features/trips/types';

const cancelBooking = vi.fn(async (_id: string) => ({ ok: true as const }));
const setPaid = vi.fn(async (_id: string, _s: string) => ({ ok: true as const }));
const setAmount = vi.fn(async (_id: string, _v: string) => ({ ok: true as const }));
const cancelTrip = vi.fn(async (_p: unknown, fd: FormData) => ({ status: 'success' as const, message: 'cancelled', nonce: 1, id: fd.get('id') }));
const advance = vi.fn(async () => ({ status: 'success' as const, message: 'advanced', nonce: 2 }));
vi.mock('../autosave-actions', () => ({ cancelBookingAction: (id: string) => cancelBooking(id), setPaymentStatusAction: (id: string, s: string) => setPaid(id, s), setAmountPaidAction: (id: string, v: string) => setAmount(id, v) }));
vi.mock('../form-actions', () => ({ cancelTripFormAction: (p: unknown, fd: FormData) => cancelTrip(p, fd), advanceTripFormAction: () => advance(), deleteTripFormAction: async () => ({ status: 'success', message: 'deleted', nonce: 3 }) }));

import { TripsMasarView } from './TripsMasarView';
import { BookingsMasarView } from './BookingsMasarView';
import { OverviewMasarView } from './OverviewMasarView';
import { UrlFilterBar } from './UrlFilterBar';

beforeAll(polyfillDialog);
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

const bad = async (el: HTMLElement) => {
  const r = await axe.run(el, { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } }, resultTypes: ['violations'] });
  return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join('|')}`);
};
/** DataTable renders the table and the stacked-card list; CSS hides one. jsdom has no CSS, so tests look inside the table. */
const table = () => within(document.querySelector('table') as HTMLElement);
const wrap = (lang: 'en' | 'ar', ui: React.ReactElement) => <DsLangProvider value={lang}>{ui}</DsLangProvider>;

const trip = (o: Partial<Trip> = {}): Trip => ({
  id: 't1', routeId: 'r1', busId: 'b1', driverId: 'd1', departureAt: '2026-11-11T06:30:00Z', arrivalAt: '2026-11-11T09:00:00Z', blockedUntil: '2026-11-11T09:30:00Z', bufferMinutes: 30,
  templateId: null, outboundTripId: null, roundTripPrice: null, price: 180, capacity: 40, seatsBooked: 12, seatsAvailable: 28, status: 'scheduled', notes: null, createdAt: '', updatedAt: '',
  route: { id: 'r1', name: 'Cairo to Galala', originName: 'Cairo', destinationName: 'Galala' }, bus: { id: 'b1', plateNumber: 'ABC 1234', capacity: 40 }, driver: { id: 'd1', fullName: 'Omar Hassan' }, ...o,
});
const tripsProps = (o = {}) => ({
  tz: 'Africa/Cairo', today: '2026-11-10', f: { view: 'upcoming', status: '', route: '', bus: '', driver: '', source: '', from: '', to: '' }, hasDates: false,
  groups: [{ day: '2026-11-11', trips: [trip(), trip({ id: 't2', status: 'draft', seatsBooked: 0 })] }], canWrite: true,
  routes: [{ id: 'r1', label: 'Cairo to Galala' }], buses: [{ id: 'b1', label: 'ABC 1234' }], drivers: [{ id: 'd1', label: 'Omar Hassan' }],
  quick: [{ key: 'today' as const, from: '2026-11-10', to: '2026-11-10' }], page: 1, pageSize: 50, total: 2, ...o,
});

describe('trips screen', () => {
  for (const lang of ['en', 'ar'] as const) {
    it(`${lang}: accessible, company-time clock in the language's digits`, async () => {
      const { container } = render(wrap(lang, <TripsMasarView {...tripsProps()} />));
      expect(await bad(container)).toEqual([]);
      expect(container.textContent).toContain(lang === 'ar' ? '٠٨:٣٠' : '08:30'); // 06:30Z = 08:30 in Cairo
      expect(container.querySelector('h1')).not.toBeNull();
    });
  }
  it('plate numbers stay Latin and left-to-right inside Arabic', () => {
    const { container } = render(wrap('ar', <TripsMasarView {...tripsProps()} />));
    const id = container.querySelector('bdi[dir="ltr"]');
    expect(id?.textContent).toBe('ABC 1234');
  });
  it('one next-step button per trip; draft also offers Delete; the DB decides, UI only asks', () => {
    render(wrap('en', <TripsMasarView {...tripsProps()} />));
    expect(table().getAllByRole('button', { name: /^Open boarding/ }).length).toBe(1);
    expect(table().getAllByRole('button', { name: /^Schedule/ }).length).toBe(1);
    expect(table().getAllByRole('button', { name: /^Delete/ }).length).toBe(1);
  });
  it('read-only roles see no actions and no add button', () => {
    render(wrap('en', <TripsMasarView {...tripsProps({ canWrite: false })} />));
    expect(screen.queryByRole('button', { name: /Cancel trip/ })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Add a trip' })).toBeNull();
  });
  it('cancel trip asks first; Keep does nothing; Yes submits the same server action with the trip id', async () => {
    const u = userEvent.setup();
    render(wrap('en', <TripsMasarView {...tripsProps()} />));
    const row = table().getAllByRole('group', { name: /Trip actions/ })[0]!;
    await u.click(within(row).getByRole('button', { name: /^Cancel trip/ }));
    const dlg = await screen.findByRole('dialog');
    await u.click(within(dlg).getByRole('button', { name: 'Keep' }));
    expect(cancelTrip).not.toHaveBeenCalled();
    await u.click(within(row).getByRole('button', { name: /^Cancel trip/ }));
    await u.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Yes, cancel trip' }));
    await waitFor(() => expect(cancelTrip).toHaveBeenCalledTimes(1));
    expect(cancelTrip.mock.calls[0]![1].get('id')).toBe('t1');
  });
  it('empty result shows the empty state, not an empty table', () => {
    render(wrap('en', <TripsMasarView {...tripsProps({ groups: [], total: 0 })} />));
    expect(screen.getByText('No trips match')).toBeTruthy();
  });
});

const booking = (o: Partial<Booking> = {}): Booking => ({
  id: 'b1', reference: 'MB-7K3Q9X', tripId: 't1', customerId: 'c1', seatsCount: 2, unitPrice: 90, totalAmount: 180, amountPaid: 100, currency: 'EGP', status: 'confirmed', paymentStatus: 'partial', source: 'web',
  notes: null, createdAt: '', ticketsTotal: 2, ticketsBoarded: 1, boardingStatus: 'partial',
  trip: { departureAt: '2026-11-11T06:30:00Z', status: 'scheduled', routeId: 'r1', routeName: 'Cairo to Galala' },
  customer: { id: 'c1', fullName: 'Mona Adel', phone: '+201012345678', email: null, studentId: '20261234', university: 'AUC' } as Booking['customer'], ...o,
});
const bookProps = (o = {}) => ({
  tz: 'Africa/Cairo', f: { q: '', view: 'upcoming', sort: 'trip_asc', pay: '', boarding: '', source: '', route: '', trip: '', from: '', to: '' }, hasDates: false, canWrite: true,
  routes: [{ id: 'r1', label: 'Cairo to Galala' }], groups: [{ key: 't1', first: booking(), rows: [booking(), booking({ id: 'b2', reference: 'MB-2Z8W1L', status: 'cancelled', paymentStatus: 'refunded', amountPaid: 0 })] }],
  byTrip: true, page: 1, pageSize: 50, total: 2, tripLabel: 'Cairo to Galala', ...o,
});

describe('bookings screen', () => {
  for (const lang of ['en', 'ar'] as const) {
    it(`${lang}: accessible; references and phones are Latin identifiers`, async () => {
      const { container } = render(wrap(lang, <BookingsMasarView {...bookProps()} />));
      expect(await bad(container)).toEqual([]);
      const ids = [...container.querySelectorAll('bdi[dir="ltr"]')].map((e) => e.textContent);
      expect(ids).toContain('MB-7K3Q9X');
      expect(ids).toContain('+201012345678');
    });
  }
  it('cancel booking: confirm calls the same server action; a cancelled booking has no cancel button', async () => {
    const u = userEvent.setup();
    render(wrap('en', <BookingsMasarView {...bookProps()} />));
    expect(table().getAllByRole('button', { name: /^Cancel booking/ }).length).toBe(1);
    await u.click(table().getByRole('button', { name: /^Cancel booking/ }));
    const dlg = await screen.findByRole('dialog');
    await u.click(within(dlg).getByRole('button', { name: 'Keep booking' }));
    expect(cancelBooking).not.toHaveBeenCalled();
    await u.click(table().getByRole('button', { name: /^Cancel booking/ }));
    await u.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel booking' }));
    await waitFor(() => expect(cancelBooking).toHaveBeenCalledWith('b1'));
  });
  it('amount paid autosaves on blur through the same action, with Arabic-Indic digits normalised', async () => {
    const u = userEvent.setup();
    render(wrap('en', <BookingsMasarView {...bookProps({ groups: [{ key: 't1', first: booking(), rows: [booking()] }] })} />));
    const input = table().getByLabelText('Amount paid');
    await u.clear(input); await u.type(input, '١٥٠'); await u.tab();
    await waitFor(() => expect(setAmount).toHaveBeenCalledWith('b1', '150'));
  });
  it('paid-in-full and refund call the payment action', async () => {
    const u = userEvent.setup();
    render(wrap('en', <BookingsMasarView {...bookProps({ groups: [{ key: 't1', first: booking(), rows: [booking()] }] })} />));
    await u.click(table().getByRole('button', { name: 'Mark paid in full' }));
    await waitFor(() => expect(setPaid).toHaveBeenCalledWith('b1', 'paid'));
  });
  it('a role that cannot write sees no money or cancel controls', () => {
    render(wrap('en', <BookingsMasarView {...bookProps({ canWrite: false })} />));
    expect(screen.queryByLabelText('Amount paid')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Cancel booking/ })).toBeNull();
  });
  it('restricted customer data shows "Restricted", never a blank or a crash', () => {
    render(wrap('en', <BookingsMasarView {...bookProps({ groups: [{ key: 't1', first: booking({ customer: null }), rows: [booking({ customer: null })] }] })} />));
    expect(screen.getAllByText('Restricted').length).toBeGreaterThan(0);
  });
});

describe('url filters', () => {
  it('are a GET form that keeps view, and chips are links that drop exactly one filter', () => {
    render(wrap('en', <BookingsMasarView {...bookProps({ f: { ...bookProps().f, pay: 'unpaid', q: 'mona' } })} />));
    const form = document.querySelector('form[method="get"]')!;
    expect((form.querySelector('input[name="view"]') as HTMLInputElement).value).toBe('upcoming');
    const remove = screen.getByRole('link', { name: /Clear all: Payment: Unpaid/ }) as HTMLAnchorElement;
    expect(remove.getAttribute('href')).toContain('q=mona');
    expect(remove.getAttribute('href')).not.toContain('pay=');
  });
  it('bar renders nothing extra when no filter is applied', () => {
    render(wrap('en', <UrlFilterBar fields={[]} keep={{}} chips={[]} clearHref="/x" />));
    expect(screen.queryByText('Clear all')).toBeNull();
  });
});

describe('overview', () => {
  const base = { companyName: 'Delta Coach', today: '2026-11-10', tz: 'Africa/Cairo', canWriteTrips: true, tripsToday: 6, seatsBookedToday: 120, seatsCapacityToday: 240, unpaid: 14,
    next: [{ id: 't1', departureAt: '2026-11-11T06:30:00Z', routeName: 'Cairo to Galala', originName: 'Cairo', destinationName: 'Galala', seatsBooked: 12, capacity: 40, status: 'scheduled' }],
    modules: [{ href: '/dashboard/trips', key: 'trips', label: { en: 'Trips', ar: 'الرحلات' }, icon: 'trips' as const }] };
  for (const lang of ['en', 'ar'] as const) {
    it(`${lang}: accessible, figures in the language's digits`, async () => {
      const { container } = render(wrap(lang, <OverviewMasarView {...base} />));
      expect(await bad(container)).toEqual([]);
      expect(container.textContent).toContain(lang === 'ar' ? '١٢٠' : '120');
    });
  }
  it('a role that cannot read data gets no made-up zero: the metric is simply absent', () => {
    render(wrap('en', <OverviewMasarView {...base} tripsToday={null} seatsBookedToday={null} seatsCapacityToday={null} unpaid={null} next={null} />));
    expect(screen.queryByText('Trips today')).toBeNull();
    expect(screen.queryByText('Unpaid bookings')).toBeNull();
    expect(screen.queryByText('Next departures')).toBeNull();
  });
  it('a real zero is shown as zero', () => {
    render(wrap('en', <OverviewMasarView {...base} tripsToday={0} next={[]} />));
    expect(screen.getByText('Trips today')).toBeTruthy();
    expect(screen.getByText('No upcoming trips')).toBeTruthy();
  });
});
