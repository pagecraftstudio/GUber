// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeTripBookingService } from './service';
import type { TripBookingRepository } from './repository';
import { toQuote, type BookedTrip, type Quote, type QuoteRow, type TripDetail } from './types';

vi.mock('next/link', () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
vi.mock('@/features/captcha/actions', () => ({ captchaEnforcedAction: async () => false, obtainCaptchaPassAction: async () => ({ ok: true }) }));
vi.mock('./actions', () => ({ quoteBookingAction: vi.fn(), bookTripAction: vi.fn(), bookingPaymentAction: vi.fn() }));
import { BookTripView } from './ui/BookTripView';

const TRIP = '00000000-0000-4000-8000-0000000000a1';
const C = { db: {} as never, userId: 'u1' };
const INPUT = { tripId: TRIP, seats: 1, fullName: 'Mona', phone: '+201001234567', idempotencyKey: 'attempt-0001' };
const booked: BookedTrip = { id: 'b1', reference: 'R1', status: 'confirmed', seats: 1, total: 0, currency: 'EGP', paymentDueAt: null };
const quote = (sub: Quote['subscription']): Quote => ({ unitPrice: sub?.free ? 0 : 40, total: sub?.free ? 0 : 40, currency: 'EGP', seats: 1, requiresPayment: false, deadlineHours: null, subscription: sub });
const fake = (q: Quote) => {
  const repo = { quote: vi.fn(async () => q), book: vi.fn(async () => booked), bookFree: vi.fn(async () => booked), coverage: vi.fn(async () => ({})) } as unknown as TripBookingRepository & Record<'quote' | 'book' | 'bookFree' | 'coverage', ReturnType<typeof vi.fn>>;
  return { repo, svc: makeTripBookingService(repo) };
};

describe('toQuote', () => {
  it('maps the subscription block and tolerates its absence', () => {
    const row = { unit_price: '0', total: '0', currency: 'EGP', seats: 1, seats_available: 3, max_seats: 4, requires_payment: false, deadline_hours: null } as QuoteRow;
    expect(toQuote(row).subscription).toBeNull();
    expect(toQuote({ ...row, subscription: { id: 's', plan_name: 'Monthly', leg: 'go', free: true, day_limit_reached: false } }).subscription).toEqual({ planName: 'Monthly', leg: 'go', free: true, dayLimitReached: false });
  });
});

describe('tripBookingService.book', () => {
  it('books through the subscriber function only when the database quote says the seat is free', async () => {
    const { svc, repo } = fake(quote({ planName: 'Monthly', leg: 'go', free: true, dayLimitReached: false }));
    await svc.book(C, INPUT);
    expect(repo.bookFree).toHaveBeenCalledTimes(1);
    expect(repo.book).not.toHaveBeenCalled();
  });
  it('books normally when the daily free seat is used or there is no subscription', async () => {
    for (const sub of [null, { planName: 'Monthly', leg: 'go' as const, free: false, dayLimitReached: true }]) {
      const { svc, repo } = fake(quote(sub));
      await svc.book(C, INPUT);
      expect(repo.book).toHaveBeenCalledTimes(1);
      expect(repo.bookFree).not.toHaveBeenCalled();
    }
  });
  it('ignores any free/price hint in the input (strict schema)', async () => {
    const { svc, repo } = fake(quote(null));
    await expect(svc.book(C, { ...INPUT, free: true })).rejects.toBeTruthy();
    await expect(svc.book(C, { ...INPUT, price: 0 })).rejects.toBeTruthy();
    expect(repo.quote).not.toHaveBeenCalled();
  });
  it('rejects more than 200 ids for the coverage lookup', async () => {
    const { svc } = fake(quote(null));
    await expect(svc.coverage(C, Array.from({ length: 201 }, () => TRIP))).rejects.toBeTruthy();
    await expect(svc.coverage(C, ['nope'])).rejects.toBeTruthy();
  });
});

const detail: TripDetail = { tripId: TRIP, companyName: 'Nile Bus', companySlug: 'nile', originName: 'Cairo', destinationName: 'Galala', departureAt: '2027-02-01T07:00:00Z', arrivalAt: '2027-02-01T09:00:00Z', price: 150, currency: 'EGP', seatsAvailable: 5, maxSeats: 4, timeZone: 'Africa/Cairo' };
afterEach(cleanup);

describe('BookTripView with a subscription', () => {
  it('says the seat is free, shows the plan and locks seats to one', () => {
    render(<BookTripView lang="en" trip={detail} stops={[]} subscription={{ planName: 'Monthly', leg: 'go', free: true, dayLimitReached: false }} defaults={{ fullName: '', phone: '' }} />);
    expect(screen.getByText(/Free with your plan \(Monthly\)/)).toBeTruthy();
    const seats = screen.getByRole('combobox') as HTMLSelectElement;
    expect(seats.disabled).toBe(true);
    expect(seats.options).toHaveLength(1);
    expect(screen.queryByText(/150/)).toBeNull();
  });
  it('explains a used daily limit and keeps the normal price and seat choice', () => {
    render(<BookTripView lang="en" trip={detail} stops={[]} subscription={{ planName: 'Monthly', leg: 'return', free: false, dayLimitReached: true }} defaults={{ fullName: '', phone: '' }} />);
    expect(screen.getByText(/already used your free return trip today/)).toBeTruthy();
    expect((screen.getByRole('combobox') as HTMLSelectElement).options).toHaveLength(4);
  });
  it('shows nothing about plans without a subscription', () => {
    render(<BookTripView lang="en" trip={detail} stops={[]} subscription={null} defaults={{ fullName: '', phone: '' }} />);
    expect(screen.queryByText(/your plan/)).toBeNull();
  });
});
