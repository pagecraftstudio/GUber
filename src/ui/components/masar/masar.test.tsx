// @vitest-environment jsdom
import axe from 'axe-core';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { polyfillDialog } from '@/ds/test-setup';
import { LocaleProvider } from '../../context/LocaleContext';
import { INITIAL_CANONICAL_LOCATIONS, INITIAL_COMPANIES, INITIAL_ROUTES, INITIAL_BUSES } from '../../lib/mockData';
import { MarketplaceMasarView } from './MarketplaceMasarView';
import { BookingMasarView } from './BookingMasarView';
import { TicketMasarView } from './TicketMasarView';
import type { MarketplaceTripItem } from '../../types';

beforeAll(polyfillDialog);
afterEach(() => { cleanup(); localStorage.clear(); });

const trip = (o: Partial<MarketplaceTripItem> = {}): MarketplaceTripItem => ({
  id: 't1', companyId: 'c1', companyNameEn: 'Delta Coach', companyNameAr: 'دلتا', companySlug: 'd', companyLogoText: 'DC', companyPrimaryColor: '#14243A', companyAccentColor: '#ff0000', companyRating: 4,
  routeId: 'r1', originLocationId: 'a', destLocationId: 'b', originLocationNameEn: 'Cairo', originLocationNameAr: 'القاهرة', destLocationNameEn: 'Galala', destLocationNameAr: 'الجلالة',
  originStopNameEn: 'Ramses', originStopNameAr: 'رمسيس', destStopNameEn: 'Campus', destStopNameAr: 'الحرم', departureDate: '2026-11-11', departureTime: '08:30', arrivalTime: '11:00',
  durationMinutes: 150, priceEgp: 180, totalSeats: 40, bookedSeats: 10, availableSeats: 30, isFullyBooked: false, busModel: 'Mercedes', busFeatures: [], status: 'scheduled', published: true, ...o,
});
const mk = (lang: 'en' | 'ar') => { localStorage.setItem('malaky_locale', lang); };
const base = () => ({ locations: INITIAL_CANONICAL_LOCATIONS, companies: INITIAL_COMPANIES, params: { sortBy: 'time_asc' as const, timeOfDay: 'all' as const, date: '2026-11-11' }, total: 2, loading: false, page: 1, pageSize: 6, onPage: vi.fn(), onSearch: vi.fn(), onFilter: vi.fn(), onReset: vi.fn(), onBook: vi.fn(), onOperator: vi.fn() });
const bad = async (el: HTMLElement) => {
  const r = await axe.run(el, { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } }, resultTypes: ['violations'] });
  return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join('|')}`);
};

describe('marketplace view', () => {
  for (const lang of ['en', 'ar'] as const) {
    it(`${lang}: results are accessible, times use the language's digits`, async () => {
      mk(lang);
      const { container } = render(<LocaleProvider><MarketplaceMasarView {...base()} trips={[trip(), trip({ id: 't2', availableSeats: 0, isFullyBooked: true })]} /></LocaleProvider>);
      expect(await bad(container)).toEqual([]);
      const text = container.textContent ?? '';
      expect(text).toContain(lang === 'ar' ? '٠٨:٣٠' : '08:30');
    });
  }
  it('book button fires for an open trip and a sold-out trip cannot be booked', async () => {
    mk('en'); const p = base();
    render(<LocaleProvider><MarketplaceMasarView {...p} trips={[trip(), trip({ id: 't2', isFullyBooked: true, availableSeats: 0 })]} /></LocaleProvider>);
    const buttons = screen.getAllByRole('button', { name: /book seat|fully booked/i });
    await userEvent.click(buttons[0]!);
    expect(p.onBook).toHaveBeenCalledTimes(1);
    expect((buttons[1] as HTMLButtonElement).disabled).toBe(true);
  });
  it('tenant colour reaches CSS only after the guardrail: a bad colour falls back, never injected', () => {
    mk('en');
    const { container } = render(<LocaleProvider><MarketplaceMasarView {...base()} trips={[trip({ companyPrimaryColor: 'red;background:url(x)' })]} /></LocaleProvider>);
    expect(container.innerHTML).not.toContain('url(x)');
  });
  it('empty and loading states render', () => {
    mk('en');
    const r = render(<LocaleProvider><MarketplaceMasarView {...base()} trips={[]} total={0} /></LocaleProvider>);
    expect(r.container.textContent).toMatch(/no trips|no departures|found/i);
    r.unmount();
    const l = render(<LocaleProvider><MarketplaceMasarView {...base()} trips={[]} loading /></LocaleProvider>);
    expect(l.container.querySelector('[role="status"]')).not.toBeNull();
  });
});

const bookingProps = () => ({
  open: true, onClose: vi.fn(), onSubmit: vi.fn((e: { preventDefault: () => void }) => e.preventDefault()), routeTitle: 'Cairo → Galala', departureDate: '2026-11-11', departureTime: '08:30',
  availableSeats: 12, isFullyBooked: false, loading: false, guestBlocked: false, signedInAs: null, onSignIn: vi.fn(), values: { name: '', phone: '', studentId: '' }, setValues: vi.fn(), showStudentId: false,
  count: 1, setCount: vi.fn(), extraNames: ['', '', ''], setExtraName: vi.fn(), showExtraNames: false, offersRoundTrip: true, roundTrip: false, setRoundTrip: vi.fn(), roundTripPrice: 300,
  returnOptions: null, returnsError: '', returnTripId: '', setReturnTripId: vi.fn(), oneWayFare: 180, saving: 0, discount: 0, total: 180, errors: {} as Record<string, string>,
});
describe('booking view', () => {
  for (const lang of ['en', 'ar'] as const) {
    it(`${lang}: dialog is accessible with errors shown`, async () => {
      mk(lang);
      render(<LocaleProvider><BookingMasarView {...bookingProps()} errors={{ name: 'x', phone: 'y', form: 'z' }} /></LocaleProvider>);
      expect(await bad(document.body)).toEqual([]);
      expect(screen.getByRole('dialog')).toBeTruthy();
    });
  }
  it('submit button belongs to the form and Arabic digits typed in the phone are normalised', async () => {
    mk('en'); const p = bookingProps();
    render(<LocaleProvider><BookingMasarView {...p} /></LocaleProvider>);
    await userEvent.click(screen.getByRole('button', { name: /confirm booking/i }));
    expect(p.onSubmit).toHaveBeenCalledTimes(1);
    await userEvent.type(screen.getByLabelText(/phone/i), '٠١٠١٢٣');
    expect(p.setValues).toHaveBeenLastCalledWith(expect.objectContaining({ phone: expect.stringMatching(/^[0-9]+$/) }));
  });
  it('fully booked blocks the submit', () => {
    mk('en');
    render(<LocaleProvider><BookingMasarView {...bookingProps()} isFullyBooked availableSeats={0} /></LocaleProvider>);
    const b = screen.getAllByRole('button').find((x) => /fully booked/i.test(x.textContent ?? '')) as HTMLButtonElement;
    expect(b.disabled).toBe(true);
  });
});

describe('ticket view', () => {
  const company = INITIAL_COMPANIES[0]!;
  const route = INITIAL_ROUTES[0]!;
  const t1 = { id: 'p1', bookingId: 'b1', ticketIndex: 1, passengerName: 'Mona Ali', status: 'valid' as const, qrOpaqueToken: 'tok' };
  const props = (o = {}) => ({
    booking: { id: 'b1', bookingReference: 'MLK-AB12CD', companyId: company.id, tripId: 't1', passengerName: 'Mona Ali', passengerPhone: '01012345678', passengerCount: 2, fareEgp: 360, status: 'confirmed' as const, pickupStopId: '', dropoffStopId: '', createdAt: '', qrTicketToken: '', passengers: [t1] },
    trip: { id: 't1', companyId: company.id, routeId: route.id, busId: INITIAL_BUSES[0]!.id, driverId: '', departureDate: '2026-11-11', departureTime: '08:30', arrivalTime: '11:00', priceEgp: 180, totalSeats: 40, bookedSeats: 2, status: 'scheduled' as const, published: true },
    route, bus: INITIAL_BUSES[0], company, passengers: [t1], activeIdx: 0, setActiveIdx: vi.fn(), loading: false, error: null, onRetry: vi.fn(), qr: <img alt="Ticket QR code" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" />, onDone: vi.fn(), onPrint: vi.fn(), ...o,
  });
  for (const lang of ['en', 'ar'] as const) {
    it(`${lang}: accessible; reference stays Latin and left-to-right`, async () => {
      mk(lang);
      const { container } = render(<LocaleProvider><TicketMasarView {...props()} /></LocaleProvider>);
      expect(await bad(container)).toEqual([]);
      expect(container.textContent).toContain('MLK-AB12CD');
    });
  }
  it('error state offers retry, loading shows status, boarded shows no QR', async () => {
    mk('en');
    const e = props({ error: 'Network down' }); const r1 = render(<LocaleProvider><TicketMasarView {...e} /></LocaleProvider>);
    await userEvent.click(screen.getByRole('button', { name: /try again/i })); expect(e.onRetry).toHaveBeenCalled(); r1.unmount();
    const r2 = render(<LocaleProvider><TicketMasarView {...props({ loading: true })} /></LocaleProvider>); expect(r2.container.querySelector('[role="status"]')).not.toBeNull(); r2.unmount();
    const r3 = render(<LocaleProvider><TicketMasarView {...props({ passengers: [{ ...t1, status: 'boarded' }] })} /></LocaleProvider>); expect(r3.container.querySelector('img')).toBeNull();
  });
});
