import { beforeAll, describe, expect, it } from 'vitest';
import { AppError } from '@/lib/errors';
import type { TenantServiceContext } from '@/lib/service/context';
import { bookingService } from '@/features/bookings/service';
import { busService } from '@/features/buses/service';
import { driverService } from '@/features/drivers/service';
import { tripService } from '@/features/trips/service';
import { IDS, U, URL_, clientFor, rnd, tenantAs, uid } from './harness';

/**
 * REAL concurrency: every call below is its own HTTP request -> its own PostgREST connection -> its own database
 * transaction. Promise.all really overlaps them. (Local Postgres 16 + PostgREST 12. Not live Supabase.)
 */
const RUN = 300 + Math.floor(Math.random() * 4000); // days from today; unique per run => re-runnable
let dayCounter = 0;
const slot = (startHour = 8, hours = 2) => {
  const base = new Date(); base.setUTCHours(0, 0, 0, 0);
  const d = new Date(base.getTime() + (RUN + dayCounter++) * 86_400_000);
  return { departureAt: new Date(d.getTime() + startHour * 3_600_000).toISOString(), arrivalAt: new Date(d.getTime() + (startHour + hours) * 3_600_000).toISOString() };
};
const phone = () => `+2010${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
type Outcome = { ok: true; value: Awaited<ReturnType<typeof bookingService.create>> } | { ok: false; error: AppError };
const settle = async <T>(p: Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: AppError }> => {
  try { return { ok: true, value: await p }; } catch (e) { expect(e).toBeInstanceOf(AppError); return { ok: false, error: e as AppError }; }
};

describe.skipIf(!URL_)('Phase 5: bookings and trips under real concurrency', () => {
  let ownerA: TenantServiceContext, opsA: TenantServiceContext, bookingA: TenantServiceContext, ownerB: TenantServiceContext;
  let busId = '', bus2Id = '', driverId = '', driver2Id = '';

  async function liveTrip(capacity: number, over: { bus?: string; driver?: string } = {}) {
    const t = await tripService.createDraft(ownerA, { routeId: IDS.routeA1, busId: over.bus ?? busId, driverId: over.driver ?? driverId, ...slot(), price: 50, capacity });
    await tripService.transition(opsA, { tripId: t.id, to: 'scheduled' });
    return t.id;
  }
  const seatsOf = async (tripId: string) => (await tripService.get(ownerA, tripId)).seatsBooked;
  const bookingsOf = async (tripId: string) => (await bookingService.list(ownerA, { tripId, pageSize: 100 })).items;
  const book = (tripId: string, seats = 1, extra: Record<string, unknown> = {}) =>
    bookingService.create(bookingA, { tripId, customerName: `P-${rnd()}`, customerPhone: phone(), seats, ...extra });

  beforeAll(async () => {
    [ownerA, opsA, bookingA, ownerB] = await Promise.all([tenantAs(U.ownerA), tenantAs(U.opsA), tenantAs(U.bookingA), tenantAs(U.ownerB)]);
    const [b1, b2] = await Promise.all([1, 2].map((n) => busService.create(ownerA, { plateNumber: `P5-${rnd()}-${n}`, capacity: 60 })));
    const [d1, d2] = await Promise.all([1, 2].map((n) => driverService.create(ownerA, { fullName: `P5 driver ${n}`, phone: phone() })));
    [busId, bus2Id, driverId, driver2Id] = [b1!.id, b2!.id, d1!.id, d2!.id];
  });

  describe('capacity is enforced atomically', () => {
    it('12 parallel 1-seat bookings on a 5-seat trip: exactly 5 win, 7 get trip_full, counter = 5', async () => {
      const tripId = await liveTrip(5);
      const results = await Promise.all(Array.from({ length: 12 }, () => settle(book(tripId))));
      const wins = results.filter((r) => r.ok);
      const losses = results.filter((r): r is { ok: false; error: AppError } => !r.ok);
      expect(wins).toHaveLength(5);
      expect(losses).toHaveLength(7);
      for (const l of losses) expect(l.error).toMatchObject({ code: 'business_rule', detail: 'trip_full' });
      expect(await seatsOf(tripId)).toBe(5);
      expect(await bookingsOf(tripId)).toHaveLength(5);
    });

    it('8 parallel 2-seat bookings on a 10-seat trip: exactly 5 win, counter = 10, never 11', async () => {
      const tripId = await liveTrip(10);
      const results = await Promise.all(Array.from({ length: 8 }, () => settle(book(tripId, 2))));
      expect(results.filter((r) => r.ok)).toHaveLength(5);
      expect(await seatsOf(tripId)).toBe(10);
    });

    it('parallel mixed sizes never exceed capacity and the counter equals the real sum', async () => {
      const tripId = await liveTrip(9);
      const sizes = [4, 3, 1, 2, 4, 1, 3, 2, 1, 4, 2, 3];
      await Promise.all(sizes.map((n) => settle(book(tripId, n))));
      const items = await bookingsOf(tripId);
      const sum = items.filter((b) => b.status !== 'cancelled').reduce((a, b) => a + b.seatsCount, 0);
      const seats = await seatsOf(tripId);
      expect(seats).toBe(sum);
      expect(seats).toBeLessThanOrEqual(9);
    });
  });

  describe('retries do not double-book (idempotency)', () => {
    it('6 parallel identical requests with one key => one booking, one set of seats, all callers get the same answer', async () => {
      const tripId = await liveTrip(10);
      const input = { tripId, customerName: 'Retry Rita', customerPhone: phone(), seats: 3, idempotencyKey: `key-${rnd()}-${rnd()}` };
      const results = await Promise.all(Array.from({ length: 6 }, () => settle(bookingService.create(bookingA, input))));
      const okays = results.filter((r): r is { ok: true; value: Awaited<ReturnType<typeof bookingService.create>> } => r.ok);
      expect(okays).toHaveLength(6);
      expect(new Set(okays.map((r) => r.value.id)).size).toBe(1);
      expect(okays.filter((r) => !r.value.idempotentReplay)).toHaveLength(1);
      expect(await seatsOf(tripId)).toBe(3);
      expect(await bookingsOf(tripId)).toHaveLength(1);
    });
    it('same key + different seats is a conflict and books nothing more', async () => {
      const tripId = await liveTrip(10);
      const key = `key-${rnd()}-${rnd()}`; const p = phone();
      await bookingService.create(bookingA, { tripId, customerName: 'A', customerPhone: p, seats: 2, idempotencyKey: key });
      const r = await settle(bookingService.create(bookingA, { tripId, customerName: 'A', customerPhone: p, seats: 4, idempotencyKey: key }));
      expect(r).toMatchObject({ ok: false, error: { code: 'conflict', detail: 'idempotency_conflict' } });
      expect(await seatsOf(tripId)).toBe(2);
    });
  });

  describe('cancellation releases capacity exactly once', () => {
    it('8 parallel cancels of one 2-seat booking: one releases 2 seats, seven are no-ops, counter drops by exactly 2', async () => {
      const tripId = await liveTrip(10);
      await book(tripId, 3);
      const target = await book(tripId, 2);
      expect(await seatsOf(tripId)).toBe(5);
      const results = await Promise.all(Array.from({ length: 8 }, () => settle(bookingService.cancel(bookingA, { bookingId: target.id, reason: 'race' }))));
      const okays = results.filter((r): r is { ok: true; value: Awaited<ReturnType<typeof bookingService.cancel>> } => r.ok);
      expect(okays).toHaveLength(8);
      expect(okays.filter((r) => !r.value.alreadyCancelled)).toHaveLength(1);
      expect(okays.reduce((a, r) => a + r.value.seatsReleased, 0)).toBe(2);
      expect(await seatsOf(tripId)).toBe(3);
    });
    it('cancelling repeatedly in sequence is harmless', async () => {
      const tripId = await liveTrip(4);
      const b = await book(tripId, 4);
      for (let i = 0; i < 3; i++) await bookingService.cancel(bookingA, { bookingId: b.id });
      expect(await seatsOf(tripId)).toBe(0);
    });
    it('freed seats can be sold again', async () => {
      const tripId = await liveTrip(2);
      const b = await book(tripId, 2);
      expect(await settle(book(tripId, 1))).toMatchObject({ ok: false, error: { detail: 'trip_full' } });
      await bookingService.cancel(bookingA, { bookingId: b.id });
      expect((await settle(book(tripId, 2))).ok).toBe(true);
    });
    it('random storm of creates + cancels: counter always equals the sum of live bookings and never exceeds capacity', async () => {
      const tripId = await liveTrip(12);
      const seeded = await Promise.all(Array.from({ length: 6 }, () => book(tripId, 1)));
      const ops: Array<Promise<unknown>> = [];
      for (let i = 0; i < 14; i++) ops.push(settle(book(tripId, 1 + (i % 3))));
      for (const b of seeded) { ops.push(settle(bookingService.cancel(bookingA, { bookingId: b.id }))); ops.push(settle(bookingService.cancel(bookingA, { bookingId: b.id }))); }
      await Promise.all(ops);
      const items = await bookingsOf(tripId);
      const live = items.filter((b) => b.status !== 'cancelled').reduce((a, b) => a + b.seatsCount, 0);
      const seats = await seatsOf(tripId);
      expect(seats).toBe(live);
      expect(seats).toBeLessThanOrEqual(12);
    });
  });

  describe('customers and phones', () => {
    it('local and international spellings of one number are one customer; the first name is kept', async () => {
      const tripId = await liveTrip(10);
      const digits = String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
      const a = await bookingService.create(bookingA, { tripId, customerName: 'First Name', customerPhone: `010${digits}`, seats: 1 });
      const b = await bookingService.create(bookingA, { tripId, customerName: 'Second Name', customerPhone: `+20 10 ${digits}`, seats: 1 });
      expect(b.customerId).toBe(a.customerId);
      const row = await clientFor(U.bookingA).from('customers').select('full_name,phone').eq('id', a.customerId).single();
      expect(row.data).toEqual({ full_name: 'First Name', phone: `+2010${digits}` });
    });
    it('a non-Egyptian international number is accepted', async () => {
      const tripId = await liveTrip(10);
      const r = await bookingService.create(bookingA, { tripId, customerName: 'Visitor', customerPhone: '+44 20 7946 0958', seats: 1 });
      const row = await clientFor(U.bookingA).from('customers').select('phone').eq('id', r.customerId).single();
      expect(row.data).toEqual({ phone: '+442079460958' });
    });
    it('the service rejects a nonsense number before any RPC; a raw RPC with a local number is refused by the database', async () => {
      const tripId = await liveTrip(10);
      await expect(book(tripId, 1, { customerPhone: '12345' })).rejects.toMatchObject({ code: 'validation', fields: { customerPhone: 'invalid_phone' } });
      const raw = await clientFor(U.bookingA).rpc('create_booking', { p_trip_id: tripId, p_customer_name: 'X', p_customer_phone: '01012345678', p_seats: 1 });
      expect(raw.error?.code).toBe('22023');
      expect(await seatsOf(tripId)).toBe(0);
    });
  });

  describe('authorization and invalid states', () => {
    it('raw RPC: staff without bookings.write and other tenants get the same not-found as a ghost trip', async () => {
      const tripId = await liveTrip(5);
      const call = (n: number | null, id: string) => clientFor(n).rpc('create_booking', { p_trip_id: id, p_customer_name: 'X', p_customer_phone: phone(), p_seats: 1 });
      const ops = await call(U.opsA, tripId), other = await call(U.ownerB, tripId), driver = await call(U.driverA, tripId), ghost = await call(U.ownerB, uid(999_999));
      for (const r of [ops, other, driver, ghost]) expect({ code: r.error?.code, message: r.error?.message }).toEqual({ code: 'P0002', message: 'trip not found' });
      expect((await call(null, tripId)).error?.code).toBe('42501');
      expect(await seatsOf(tripId)).toBe(0);
    });
    it('service layer: bookings.read alone cannot write, other tenant cannot cancel', async () => {
      const tripId = await liveTrip(5);
      const b = await book(tripId, 1);
      await expect(bookingService.create(opsA, { tripId, customerName: 'X', customerPhone: phone(), seats: 1 })).rejects.toMatchObject({ code: 'forbidden' });
      const raw = await clientFor(U.ownerB).rpc('cancel_booking', { p_booking_id: b.id });
      expect(raw.error?.code).toBe('P0002');
      expect(await seatsOf(tripId)).toBe(1);
    });
    it('draft and cancelled trips cannot be booked', async () => {
      const draft = await tripService.createDraft(ownerA, { routeId: IDS.routeA1, ...slot(), price: 10, capacity: 5 });
      await expect(book(draft.id)).rejects.toMatchObject({ code: 'business_rule', detail: 'trip_not_bookable' });
      const tripId = await liveTrip(5);
      await tripService.transition(opsA, { tripId, to: 'cancelled' });
      await expect(book(tripId)).rejects.toMatchObject({ code: 'business_rule', detail: 'trip_not_bookable' });
    });
    it('more seats than max_seats_per_booking (4) is refused', async () => {
      const tripId = await liveTrip(20);
      await expect(book(tripId, 5)).rejects.toMatchObject({ code: 'business_rule', detail: 'seats_per_booking_exceeded' });
    });
    it('nobody, platform admin included, can write seats_booked or bookings straight through the API', async () => {
      const tripId = await liveTrip(5);
      for (const n of [U.ownerA, U.superAdmin]) {
        const upd = await clientFor(n).from('trips').update({ seats_booked: 0 }).eq('id', tripId);
        expect(upd.error?.code).toBe('42501');
        const ins = await clientFor(n).from('bookings').insert({ company_id: IDS.companyA, reference: 'MB-HACK', trip_id: tripId, customer_id: IDS.customerA1, seats_count: 1, unit_price: 0, total_amount: 0, currency: 'EGP', status: 'confirmed', source: 'staff' });
        expect(ins.error?.code).toBe('42501');
      }
    });
  });

  describe('trip transitions', () => {
    it('cancelling a trip cancels its bookings and releases every seat', async () => {
      const tripId = await liveTrip(8);
      await Promise.all([book(tripId, 2), book(tripId, 3), book(tripId, 1)]);
      const r = await tripService.transition(opsA, { tripId, to: 'cancelled', reason: 'bus broke down' });
      expect(r).toMatchObject({ status: 'cancelled', changed: true, bookingsCancelled: 3 });
      expect(await seatsOf(tripId)).toBe(0);
      expect((await bookingsOf(tripId)).every((b) => b.status === 'cancelled')).toBe(true);
      expect((await tripService.transition(opsA, { tripId, to: 'cancelled' })).changed).toBe(false);
    });
    it('a booking cancel racing a trip cancel never double-releases', async () => {
      const tripId = await liveTrip(6);
      const bs = await Promise.all([1, 2, 3].map(() => book(tripId, 2)));
      await Promise.all([settle(tripService.transition(opsA, { tripId, to: 'cancelled' })), ...bs.map((b) => settle(bookingService.cancel(bookingA, { bookingId: b.id })))]);
      expect(await seatsOf(tripId)).toBe(0);
    });
    it('illegal transitions are refused with a stable error', async () => {
      const tripId = await liveTrip(5);
      await tripService.transition(opsA, { tripId, to: 'cancelled' });
      await expect(tripService.transition(opsA, { tripId, to: 'scheduled' })).rejects.toMatchObject({ code: 'business_rule', detail: 'trip_transition_invalid' });
    });
    it('only trips.write may transition; the service refuses booking staff before the database', async () => {
      const tripId = await liveTrip(5);
      await expect(tripService.transition(bookingA, { tripId, to: 'cancelled' })).rejects.toMatchObject({ code: 'forbidden' });
      const raw = await clientFor(U.bookingA).rpc('transition_trip', { p_trip_id: tripId, p_to: 'cancelled' });
      expect(raw.error?.code).toBe('P0002');
    });
    it('clients cannot set status or delete a trip straight through the API', async () => {
      const tripId = await liveTrip(5);
      expect((await clientFor(U.ownerA).from('trips').update({ status: 'cancelled' }).eq('id', tripId)).error?.code).toBe('42501');
      expect((await clientFor(U.ownerA).from('trips').delete().eq('id', tripId)).error?.code).toBe('42501');
    });
    it('draft deletion: only a draft with no booking history', async () => {
      const draft = await tripService.createDraft(ownerA, { routeId: IDS.routeA1, ...slot(), price: 10, capacity: 5 });
      await tripService.deleteDraft(opsA, draft.id);
      await expect(tripService.get(ownerA, draft.id)).rejects.toMatchObject({ code: 'not_found' });
      const live = await liveTrip(5);
      await expect(tripService.deleteDraft(opsA, live)).rejects.toMatchObject({ code: 'business_rule', detail: 'trip_not_draft' });
      const b = await book(live, 1);
      await bookingService.cancel(bookingA, { bookingId: b.id });
      await tripService.transition(opsA, { tripId: live, to: 'draft' });
      await expect(tripService.deleteDraft(opsA, live)).rejects.toMatchObject({ code: 'business_rule', detail: 'trip_has_bookings' });
    });
  });

  describe('bus/driver conflicts are decided transactionally', () => {
    it('5 drafts on the SAME bus and overlapping times, scheduled in parallel: exactly one wins', async () => {
      const when = slot(8, 3);
      const drafts = await Promise.all(Array.from({ length: 5 }, (_, i) => tripService.createDraft(ownerA, { routeId: IDS.routeA1, busId, driverId: i % 2 ? driver2Id : driverId, ...when, price: 5, capacity: 10 })));
      // free the pair for a clean race: only the bus is shared between all five, drivers alternate (they also clash pairwise)
      const results = await Promise.all(drafts.map((d) => settle(tripService.transition(opsA, { tripId: d.id, to: 'scheduled' }))));
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      for (const r of results) if (!r.ok) expect(r.error).toMatchObject({ code: 'conflict' });
      const statuses = await Promise.all(drafts.map(async (d) => (await tripService.get(ownerA, d.id)).status));
      expect(statuses.filter((s) => s === 'scheduled')).toHaveLength(1);
      expect(statuses.filter((s) => s === 'draft')).toHaveLength(4);
    });
    it('same DRIVER on two buses at overlapping times: exactly one wins, with driver_conflict', async () => {
      const when = slot(8, 3);
      const [x, y] = await Promise.all([busId, bus2Id].map((b) => tripService.createDraft(ownerA, { routeId: IDS.routeA1, busId: b, driverId, ...when, price: 5, capacity: 10 })));
      const results = await Promise.all([x!, y!].map((d) => settle(tripService.transition(opsA, { tripId: d.id, to: 'scheduled' }))));
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(results.find((r) => !r.ok)).toMatchObject({ error: { code: 'conflict', detail: 'driver_conflict' } });
    });
    it('the 30 min buffer is part of the conflict window; just outside it is free', async () => {
      const first = slot(8, 2); // 08:00-10:00, buffer to 10:30
      const t1 = await tripService.createDraft(ownerA, { routeId: IDS.routeA1, busId, driverId, ...first, price: 5, capacity: 10 });
      await tripService.transition(opsA, { tripId: t1.id, to: 'scheduled' });
      const day = new Date(first.departureAt); day.setUTCHours(0, 0, 0, 0);
      const mk = (h: number, m: number) => new Date(day.getTime() + h * 3_600_000 + m * 60_000).toISOString();
      const inside = await tripService.createDraft(ownerA, { routeId: IDS.routeA1, busId, driverId, departureAt: mk(10, 10), arrivalAt: mk(12, 0), price: 5, capacity: 10 });
      await expect(tripService.transition(opsA, { tripId: inside.id, to: 'scheduled' })).rejects.toMatchObject({ code: 'conflict' });
      const outside = await tripService.createDraft(ownerA, { routeId: IDS.routeA1, busId, driverId, departureAt: mk(10, 31), arrivalAt: mk(12, 0), price: 5, capacity: 10 });
      await expect(tripService.transition(opsA, { tripId: outside.id, to: 'scheduled' })).resolves.toMatchObject({ status: 'scheduled' });
    });
    it('cancelling the holder frees the bus for the loser', async () => {
      const when = slot(8, 2);
      const [a, b] = await Promise.all([1, 2].map(() => tripService.createDraft(ownerA, { routeId: IDS.routeA1, busId, driverId, ...when, price: 5, capacity: 10 })));
      await tripService.transition(opsA, { tripId: a!.id, to: 'scheduled' });
      await expect(tripService.transition(opsA, { tripId: b!.id, to: 'scheduled' })).rejects.toMatchObject({ code: 'conflict' });
      await tripService.transition(opsA, { tripId: a!.id, to: 'cancelled' });
      await expect(tripService.transition(opsA, { tripId: b!.id, to: 'scheduled' })).resolves.toMatchObject({ status: 'scheduled' });
    });
  });

  it('no seat counter in the company has drifted after everything above', async () => {
    const page = await tripService.list(ownerA, { pageSize: 100, from: new Date().toISOString() });
    for (const t of page.items) {
      const live = (await bookingsOf(t.id)).filter((b) => b.status !== 'cancelled').reduce((a, b) => a + b.seatsCount, 0);
      expect(t.seatsBooked, t.id).toBe(live);
    }
  });
});
