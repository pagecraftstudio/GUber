import { describe, expect, it } from 'vitest';
import { createCustomerBackend, BackendError } from '@/ui/lib/real/customerBackend';
import { RealTransportService } from '@/ui/lib/real/transportService.real';
import { toE164Egypt } from '@/ui/lib/real/adapters';
import { clientFor, uid, URL_ } from './harness';

/** Real Postgres + PostgREST + signed user JWTs. Needs seed-customer-web.sql. Skips without PGRST_URL. */
const d = URL_ ? describe : describe.skip;
const TRIP = uid(801);
const svc = (n: number | null) => new RealTransportService(createCustomerBackend(clientFor(n)), toE164Egypt);
const book = (n: number | null, seats: number, phone: string, key: string) =>
  svc(n).createBooking({ tripId: TRIP, passengerName: `User ${n ?? 'anon'}`, passengerPhone: phone, passengerCount: seats, idempotencyKey: key });

d('customer web flow over HTTP (real DB, RLS, RPCs)', () => {
  it('anon sees the open trip through the UI service, with no private fields', async () => {
    const items = await svc(null).searchMarketplaceTrips({});
    const t = items.find((i) => i.id === TRIP);
    expect(t).toBeTruthy();
    expect(t!.availableSeats).toBe(3);
    expect(JSON.stringify(items)).not.toMatch(/plate|driver_id|bus_id|license/i);
    expect(items.every((i) => i.companyId === uid(101))).toBe(true); // company B (unpublished) never leaks
  });

  it('anon cannot book', async () => {
    await expect(book(null, 1, '01000000999', 'anon-k')).rejects.toMatchObject({ code: 'auth_required', pgCode: '42501' });
  });

  it('booking is persisted, owned by the caller and invisible to others', async () => {
    const b = await book(81, 2, '01000008181', 'k-81');
    expect(b.bookingReference).toMatch(/^MB-/); expect(b.fareEgp).toBe(80);
    expect((await svc(81).getCustomerBookings('x')).map((x) => x.id)).toContain(b.id);
    expect(await svc(83).getCustomerBookings('x')).toEqual([]);
    await expect(svc(83).requestBookingCancellation(b.id, 'nope')).rejects.toMatchObject({ code: 'booking_not_found' });
  });

  it('replaying the same idempotency key returns the same booking', async () => {
    const again = await book(81, 2, '01000008181', 'k-81');
    expect((await svc(81).getCustomerBookings('x')).filter((x) => x.id === again.id)).toHaveLength(1);
  });

  it('concurrent bookings cannot oversell the last seats', async () => {
    const res = await Promise.allSettled([book(82, 1, '01000008282', 'k-82'), book(83, 1, '01000008383', 'k-83'), book(83, 1, '01000008383', 'k-83b')]);
    const ok = res.filter((r) => r.status === 'fulfilled').length;
    expect(ok).toBe(1); // 1 seat left after user 81 took 2 of 3
    const failed = res.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(failed.reason).toMatchObject({ code: 'seats_unavailable' });
    const [t] = (await svc(null).searchMarketplaceTrips({})).filter((i) => i.id === TRIP);
    expect(t!.availableSeats).toBe(0); expect(t!.isFullyBooked).toBe(true);
  });

  it('phone of an existing customer cannot be taken over', async () => {
    await expect(svc(82).createBooking({ tripId: TRIP, passengerName: 'x', passengerPhone: '01000008181', passengerCount: 1, idempotencyKey: 'z' })).rejects.toBeInstanceOf(BackendError);
  });

  it('owner cancels, seats are released, repeat is harmless', async () => {
    const mine = (await svc(81).getCustomerBookings('x'))[0]!;
    const c = await svc(81).requestBookingCancellation(mine.id, 'plans changed');
    expect(c.status).toBe('cancelled');
    await svc(81).requestBookingCancellation(mine.id, 'again');
    const [t] = (await svc(null).searchMarketplaceTrips({})).filter((i) => i.id === TRIP);
    expect(t!.availableSeats).toBe(2);
  });

  it('client-supplied company/customer/fare are ignored', async () => {
    const b = await svc(82).createBooking({ tripId: TRIP, passengerName: 'User 82', passengerPhone: '01000008282', passengerCount: 1, idempotencyKey: 'k-evil', companyId: uid(102), customerId: uid(252), fareEgp: 1 });
    expect(b.fareEgp).toBe(40);
  });
});
