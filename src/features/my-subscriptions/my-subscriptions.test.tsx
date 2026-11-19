// @vitest-environment jsdom
import axe from 'axe-core';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorText } from './ui/text';
import { bookSchema, daySchema, phoneUpdateSchema, requestSchema } from './schema';
import { toTripOption } from './types';
import type { DayState, MySubscription, SubscriberBooking, TripOption } from './types';

const ID = '00000000-0000-4000-8000-000000000201';
const ID2 = '00000000-0000-4000-8000-000000000202';

const loadDay = vi.fn();
const loadRet = vi.fn();
const bookA = vi.fn();
const markRead = vi.fn(async () => ({ ok: true as const }));
const requestPlan = vi.fn(async (_id: string) => ({ ok: true as const }));
const cancelBk = vi.fn(async (_id: string) => ({ ok: true as const }));
vi.mock('./actions', () => ({
  savePhoneAction: async () => ({ ok: true }), requestPlanAction: (id: string) => requestPlan(id), markNoticesReadAction: () => markRead(), cancelSubscriptionAction: async () => ({ ok: true }),
  cancelSubscriberBookingAction: (id: string) => cancelBk(id),
  loadDayAction: (...a: unknown[]) => loadDay(...a), loadReturnOptionsAction: (...a: unknown[]) => loadRet(...a), bookSubscriberAction: (...a: unknown[]) => bookA(...a),
}));
vi.mock('next/link', () => ({ default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => <a href={href} {...r}>{children}</a> }));

import { BookView } from './ui/BookView';
import { MySubscriptionsView } from './ui/MySubscriptionsView';

const sub: MySubscription = { id: ID, companyId: ID2, companyName: 'Nile Bus', planId: ID2, planName: 'Monthly', routeId: ID2, originName: 'Cairo', destinationName: 'Campus', status: 'active', price: 900, currency: 'EGP', validFrom: '2026-12-01', validTo: '2027-01-01', requestedAt: '2026-11-01T10:00:00Z', timeZone: 'Africa/Cairo', masarId: 'MSR-AAAA-BBBB', renewable: false } as MySubscription;
const trip = (id: string, h: number): TripOption => ({ tripId: id, departureAt: `2026-12-02T0${h}:00:00Z`, arrivalAt: `2026-12-02T0${h + 1}:00:00Z`, seatsAvailable: 5, originName: 'Cairo', destinationName: 'Campus' });
const ok = <T,>(data: T) => ({ ok: true as const, data });

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('schemas', () => {
  it('refuse a company or user id', () => {
    expect(requestSchema.safeParse({ planId: ID, companyId: ID }).success).toBe(false);
    expect(bookSchema.safeParse({ subscriptionId: ID, outboundTripId: ID2, userId: ID }).success).toBe(false);
    expect(bookSchema.safeParse({ subscriptionId: ID, outboundTripId: ID2 }).success).toBe(true);
    expect(bookSchema.safeParse({ subscriptionId: ID, outboundTripId: ID2, returnTripId: ID }).success).toBe(true);
    expect(daySchema.safeParse({ subscriptionId: ID, day: '2026-12-02T00:00' }).success).toBe(false);
    expect(phoneUpdateSchema.safeParse({ phone: 'abc' }).success).toBe(false);
  });
  it('maps a trip row', () => {
    expect(toTripOption({ trip_id: ID, route_id: ID2, departure_at: 'a', arrival_at: 'b', seats_available: 3, origin_name: 'X', destination_name: 'Y' }).seatsAvailable).toBe(3);
  });
});

describe('errorText', () => {
  it('maps DB detail first, then code, in both languages', () => {
    expect(errorText('en', 'conflict', 'already_booked_day')).toMatch(/already have a seat/);
    expect(errorText('ar', 'conflict', 'already_booked_day')).toMatch(/مقعد/);
    expect(errorText('en', 'x')).toMatch(/Something went wrong/);
  });
});

describe('MySubscriptionsView statuses (Phase E)', () => {
  it('offers Renew on an expired subscription and explains a revoked one', async () => {
    render(<MySubscriptionsView lang="en" profile={{ masarId: 'MSR-AAAA-BBBB', phone: '+20100', fullName: 'A' }} subs={[{ ...sub, status: 'expired' }, { ...sub, id: ID2, status: 'revoked' }]} bookings={{}} />);
    expect(screen.getByRole('button', { name: 'Renew' })).toBeTruthy();
    expect(screen.getByText(/ended by the company/)).toBeTruthy();
    expect(screen.queryByText('Book a trip')).toBeNull();
  });
});

describe('MySubscriptionsView', () => {
  const booking: SubscriberBooking = { bookingId: ID, reference: 'BK-1', tripId: ID2, tripLeg: 'outbound', direction: 'go', departureAt: '2026-12-02T06:00:00Z', arrivalAt: '2026-12-02T07:00:00Z', originName: 'Cairo', destinationName: 'Campus', status: 'confirmed', scanned: false } as SubscriberBooking;
  for (const lang of ['en', 'ar'] as const) {
    it(`renders MASAR ID, subscription and trip with no a11y violations (${lang})`, async () => {
      const { container } = render(<MySubscriptionsView lang={lang} profile={{ masarId: 'MSR-AAAA-BBBB', phone: '+201001234567', fullName: 'A' }} subs={[sub]} bookings={{ [ID]: [booking] }} />);
      expect(screen.getByText('MSR-AAAA-BBBB')).toBeTruthy();
      expect(screen.getByText('BK-1')).toBeTruthy();
      const r = await axe.run(container);
      expect(r.violations.map((v) => v.id)).toEqual([]);
    });
  }
  it('asks for a phone when the profile has none, and cancels a trip', async () => {
    render(<MySubscriptionsView lang="en" profile={{ masarId: 'MSR-AAAA-BBBB', phone: null, fullName: 'A' }} subs={[sub]} bookings={{ [ID]: [booking] }} />);
    expect(screen.getByText('Add your phone number')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /Cancel trip BK-1/ }));
    await waitFor(() => expect(cancelBk).toHaveBeenCalledWith(ID));
  });
  it('shows the empty state', () => {
    render(<MySubscriptionsView lang="en" profile={{ masarId: 'MSR-AAAA-BBBB', phone: '+20100', fullName: 'A' }} subs={[]} bookings={{}} />);
    expect(screen.getByText('No subscriptions yet')).toBeTruthy();
  });
});

describe('BookView', () => {
  const day = (state: DayState, trips: TripOption[]) => loadDay.mockResolvedValue(ok({ trips, state }));
  const find = async () => { await userEvent.click(screen.getByRole('button', { name: 'Show trips' })); };

  it('book go only', async () => {
    day({ goBooked: false, returnBooked: false }, [trip(ID, 6)]);
    bookA.mockResolvedValue({ ok: true });
    render(<BookView lang="en" sub={sub} today="2026-12-02" />);
    await find();
    await userEvent.selectOptions(await screen.findByLabelText('Go trip'), ID);
    await userEvent.click(screen.getByRole('button', { name: 'No, only the go trip' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm booking' }));
    await waitFor(() => expect(bookA).toHaveBeenCalledWith(ID, ID, null));
    expect(await screen.findByText('Booked')).toBeTruthy();
  });
  it('returning requires a return trip', async () => {
    day({ goBooked: false, returnBooked: false }, [trip(ID, 6)]);
    loadRet.mockResolvedValue(ok([trip(ID2, 7)]));
    bookA.mockResolvedValue({ ok: true });
    render(<BookView lang="en" sub={sub} today="2026-12-02" />);
    await find();
    await userEvent.selectOptions(await screen.findByLabelText('Go trip'), ID);
    await userEvent.click(screen.getByRole('button', { name: 'Yes, book my return too' }));
    const confirm = screen.getByRole('button', { name: 'Confirm booking' }) as HTMLButtonElement;
    await screen.findByLabelText('Return trip');
    expect(confirm.disabled).toBe(true);
    await userEvent.selectOptions(screen.getByLabelText('Return trip'), ID2);
    expect(confirm.disabled).toBe(false);
    await userEvent.click(confirm);
    await waitFor(() => expect(bookA).toHaveBeenCalledWith(ID, ID, ID2));
  });
  it('explains when no return trip fits', async () => {
    day({ goBooked: false, returnBooked: false }, [trip(ID, 6)]);
    loadRet.mockResolvedValue(ok([]));
    render(<BookView lang="en" sub={sub} today="2026-12-02" />);
    await find();
    await userEvent.selectOptions(await screen.findByLabelText('Go trip'), ID);
    await userEvent.click(screen.getByRole('button', { name: 'Yes, book my return too' }));
    expect(await screen.findByText(/No return trips fit/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Confirm booking' }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('blocks when the day is already booked', async () => {
    day({ goBooked: true, returnBooked: true }, [trip(ID, 6)]);
    render(<BookView lang="en" sub={sub} today="2026-12-02" />);
    await find();
    expect(await screen.findByText('You already have both seats for this day')).toBeTruthy();
    expect(screen.queryByLabelText('Go trip')).toBeNull();
  });
  it('shows a mapped error from the server', async () => {
    day({ goBooked: false, returnBooked: false }, [trip(ID, 6)]);
    bookA.mockResolvedValue({ ok: false, code: 'conflict', detail: 'already_booked_day' });
    render(<BookView lang="en" sub={sub} today="2026-12-02" />);
    await find();
    await userEvent.selectOptions(await screen.findByLabelText('Go trip'), ID);
    await userEvent.click(screen.getByRole('button', { name: 'No, only the go trip' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm booking' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'You already have a seat on this route for that day');
  });
  it('has no a11y violations in Arabic', async () => {
    day({ goBooked: false, returnBooked: false }, [trip(ID, 6)]);
    const { container } = render(<BookView lang="ar" sub={sub} today="2026-12-02" />);
    await userEvent.click(screen.getByRole('button', { name: 'عرض الرحلات' }));
    await screen.findByLabelText('رحلة الذهاب');
    expect((await axe.run(container)).violations.map((v) => v.id)).toEqual([]);
  });
});

import { makeMemberSubscriptionService } from './service';
describe('service', () => {
  const mk = () => { const r = { book: vi.fn(), cancel: vi.fn(), request: vi.fn() }; return { r, s: makeMemberSubscriptionService(r as never) }; };
  const c = { db: {} as never, userId: ID };
  it('validates before the repository', async () => {
    const { r, s } = mk();
    expect(() => s.book(c, { subscriptionId: 'x', outboundTripId: ID })).toThrow();
    expect(() => s.request(c, { planId: ID, companyId: ID })).toThrow();
    expect(r.book).not.toHaveBeenCalled(); expect(r.request).not.toHaveBeenCalled();
  });
  it('passes validated ids through', async () => {
    const { r, s } = mk();
    await s.book(c, { subscriptionId: ID, outboundTripId: ID2 });
    expect(r.book).toHaveBeenCalledWith(c, { subscriptionId: ID, outboundTripId: ID2 });
  });
});

describe('renewal and notices (Phase E3)', () => {
  const profile = { masarId: 'MSR-AAAA-BBBB', phone: '+20100', fullName: 'A' };
  const notice = (id: string, isRead: boolean) => ({ id, subject: 'Your subscription ends soon', body: 'Ends on 2026-11-25', createdAt: '2026-11-19T06:00:00Z', isRead });
  it('offers Renew now only when the database says renewable, and requests the same plan', async () => {
    const { rerender } = render(<MySubscriptionsView lang="en" profile={profile} subs={[sub]} bookings={{}} />);
    expect(screen.queryByRole('button', { name: 'Renew now' })).toBeNull();
    rerender(<MySubscriptionsView lang="en" profile={profile} subs={[{ ...sub, renewable: true }]} bookings={{}} />);
    expect(screen.getByText(/new period starts after the current one ends/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Renew now' }));
    await waitFor(() => expect(requestPlan).toHaveBeenCalledWith(sub.planId));
  });
  it('says the renewal is waiting once a pending request exists for the plan', () => {
    render(<MySubscriptionsView lang="en" profile={profile} subs={[sub, { ...sub, id: ID2, status: 'pending' }]} bookings={{}} />);
    expect(screen.getByText(/Renewal requested/)).toBeTruthy();
  });
  it('shows notices, marks them read, and hides the button when all are read', async () => {
    const { rerender } = render(<MySubscriptionsView lang="en" profile={profile} subs={[sub]} bookings={{}} notices={[notice(ID, false)]} />);
    expect(screen.getByText('Your subscription ends soon')).toBeTruthy();
    expect(screen.getByText('New')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Mark all as read' }));
    await waitFor(() => expect(markRead).toHaveBeenCalledOnce());
    rerender(<MySubscriptionsView lang="en" profile={profile} subs={[sub]} bookings={{}} notices={[notice(ID, true)]} />);
    expect(screen.queryByRole('button', { name: 'Mark all as read' })).toBeNull();
  });
  it('has no a11y violations with a notice, in en and ar', async () => {
    for (const lang of ['en', 'ar'] as const) {
      const { container, unmount } = render(<MySubscriptionsView lang={lang} profile={profile} subs={[{ ...sub, renewable: true }]} bookings={{}} notices={[notice(ID, false)]} />);
      expect((await axe.run(container)).violations.map((v) => v.id)).toEqual([]);
      unmount();
    }
  });
  it('explains the new refusals in both languages', () => {
    expect(errorText('en', 'business_rule', 'renewal_too_early')).toMatch(/last 7 days/);
    expect(errorText('ar', 'conflict', 'subscription_active')).toMatch(/اشتراك فعّال/);
  });
});
