import { beforeAll, describe, expect, it } from 'vitest';
import type { TenantServiceContext } from '@/lib/service/context';
import { bookingService } from '@/features/bookings/service';
import { busService } from '@/features/buses/service';
import { driverService } from '@/features/drivers/service';
import { tripService } from '@/features/trips/service';
import { IDS, U, URL_, rnd, tenantAs } from './harness';

/** Dashboard bookings screen against real PostgREST + Postgres: view, search, filters, sort, paid amount, tenant isolation. */
const RUN = 5000 + Math.floor(Math.random() * 3000);
const slot = (hour: number) => {
  const base = new Date(); base.setUTCHours(0, 0, 0, 0);
  const d = new Date(base.getTime() + RUN * 86_400_000 + hour * 3_600_000); // same day for every trip: order comes from the hour only
  return { departureAt: d.toISOString(), arrivalAt: new Date(d.getTime() + 2 * 3_600_000).toISOString() };
};
const phone = () => `+2010${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;

describe.skipIf(!URL_)('bookings list: search, filters, sort, paid amount', () => {
  let ownerA: TenantServiceContext, opsA: TenantServiceContext, bookingA: TenantServiceContext, ownerB: TenantServiceContext;
  let tripLate = '', tripEarly = '';
  const tag = rnd();
  const sara = { name: `Sara ${tag}`, phone: phone(), student: `S-${tag}` };
  let saraRef = '', saraId = '', otherId = '';

  beforeAll(async () => {
    [ownerA, opsA, bookingA, ownerB] = await Promise.all([tenantAs(U.ownerA), tenantAs(U.opsA), tenantAs(U.bookingA), tenantAs(U.ownerB)]);
    const bus = await busService.create(ownerA, { plateNumber: `BL-${tag}`, capacity: 40 });
    const driver = await driverService.create(ownerA, { fullName: `BL driver ${tag}`, phone: phone() });
    const live = async (hour: number) => {
      const t = await tripService.createDraft(ownerA, { routeId: IDS.routeA1, busId: bus.id, driverId: driver.id, ...slot(hour), price: 40, capacity: 20 });
      await tripService.transition(opsA, { tripId: t.id, to: 'scheduled' });
      return t.id;
    };
    // created in the "wrong" order on purpose: the late trip first
    tripLate = await live(18);
    tripEarly = await live(6);
    const a = await bookingService.create(bookingA, { tripId: tripLate, customerName: sara.name, customerPhone: sara.phone, seats: 2, studentId: sara.student, university: `Uni ${tag}` });
    const b = await bookingService.create(bookingA, { tripId: tripEarly, customerName: `Omar ${tag}`, customerPhone: phone(), seats: 1 });
    [saraRef, saraId, otherId] = [a.reference, a.id, b.id];
  });

  const list = (q: Record<string, unknown>, ctx = ownerA) => bookingService.list(ctx, { pageSize: 100, ...q });

  it('rows carry customer, trip, route, money and boarding', async () => {
    const r = (await list({ tripId: tripLate })).items[0]!;
    expect(r).toMatchObject({ reference: saraRef, seatsCount: 2, totalAmount: 80, amountPaid: 0, paymentStatus: 'unpaid', boardingStatus: 'not_boarded', ticketsTotal: 2, ticketsBoarded: 0 });
    expect(r.customer).toMatchObject({ fullName: sara.name, phone: sara.phone, studentId: sara.student });
    expect(r.trip?.routeName).toBeTruthy();
  });

  describe('search', () => {
    it.each([
      ['reference', () => saraRef], ['reference without dash', () => saraRef.replace('-', '')], ['reference lower case', () => saraRef.toLowerCase()],
      ['name', () => sara.name], ['partial name', () => sara.name.slice(0, 7)], ['phone', () => sara.phone],
      ['phone with spaces', () => sara.phone.replace(/^(\+20)(\d{3})(\d{3})(\d+)$/, '$1 $2 $3 $4')], ['local phone (leading zero)', () => `0${sara.phone.slice(3)}`],
      ['student id', () => sara.student], ['university', () => `Uni ${tag}`],
    ])('finds the booking by %s', async (_n, term) => {
      const ids = (await list({ q: term() })).items.map((b) => b.id);
      expect(ids).toContain(saraId);
      expect(ids).not.toContain(otherId);
    });
    it('unknown text finds nothing', async () => expect((await list({ q: `zzzz-${tag}-nothing` })).items).toHaveLength(0));
    it('filter syntax in the search box is neutralised', async () => {
      const r = await list({ q: 'x),company_id.neq.0,(y' });
      expect(r.items).toHaveLength(0);
    });
    it("company B can never find company A's booking by any search", async () => {
      for (const term of [saraRef, sara.name, sara.phone, sara.student]) expect((await list({ q: term }, ownerB)).items).toHaveLength(0);
    });
  });

  describe('sort by trip and time', () => {
    it('trip_asc: earliest departure first, one trip together, then booking time', async () => {
      const r = (await list({ sort: 'trip_asc', tripFrom: new Date(Date.now() - 86_400_000).toISOString(), q: tag })).items;
      const trips = r.map((b) => b.tripId);
      expect(trips.indexOf(tripEarly)).toBeLessThan(trips.indexOf(tripLate));
      const times = r.map((b) => Date.parse(b.trip!.departureAt));
      expect(times).toEqual([...times].sort((x, y) => x - y));
    });
    it('trip_desc reverses the trips', async () => {
      const r = (await list({ sort: 'trip_desc', q: tag })).items.map((b) => b.tripId);
      expect(r.indexOf(tripLate)).toBeLessThan(r.indexOf(tripEarly));
    });
    it('name sorts passengers alphabetically', async () => {
      const names = (await list({ sort: 'name', q: tag })).items.map((b) => b.customer!.fullName);
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    });
    it('trip window filters by departure time', async () => {
      const early = (await tripService.get(ownerA, tripEarly)).departureAt;
      const r = (await list({ q: tag, tripTo: early })).items.map((b) => b.id);
      expect(r).not.toContain(saraId); expect(r).not.toContain(otherId);
      const r2 = (await list({ q: tag, tripFrom: early, tripTo: new Date(Date.parse(early) + 3_600_000).toISOString() })).items.map((b) => b.id);
      expect(r2).toEqual([otherId]);
    });
  });

  describe('paid amount', () => {
    it('partial -> filter finds it -> paid in full -> refund', async () => {
      expect(await bookingService.setAmountPaid(bookingA, { bookingId: saraId, amount: 30 })).toMatchObject({ amountPaid: 30, paymentStatus: 'partial', totalAmount: 80 });
      expect((await list({ q: tag, paymentStatus: 'partial' })).items.map((b) => b.id)).toEqual([saraId]);
      expect((await list({ q: tag, paymentStatus: 'unpaid' })).items.map((b) => b.id)).toEqual([otherId]);
      expect(await bookingService.setAmountPaid(bookingA, { bookingId: saraId, amount: 80 })).toMatchObject({ paymentStatus: 'paid' });
      expect((await bookingService.get(ownerA, saraId))).toMatchObject({ amountPaid: 80, paymentStatus: 'paid' });
      await bookingService.setPaymentStatus(bookingA, { bookingId: saraId, paymentStatus: 'refunded' });
      expect((await bookingService.get(ownerA, saraId))).toMatchObject({ amountPaid: 0, paymentStatus: 'refunded' });
    });
    it('more than the total is refused with a business rule', async () => {
      await expect(bookingService.setAmountPaid(bookingA, { bookingId: saraId, amount: 80.01 })).rejects.toMatchObject({ code: 'business_rule', detail: 'amount_exceeds_total' });
    });
    it('read-only staff cannot set it; another company cannot see or set it', async () => {
      await expect(bookingService.setAmountPaid(opsA, { bookingId: saraId, amount: 1 })).rejects.toMatchObject({ code: 'forbidden' });
      await expect(bookingService.setAmountPaid(ownerB, { bookingId: saraId, amount: 1 })).rejects.toMatchObject({ code: 'not_found' });
      await expect(bookingService.get(ownerB, saraId)).rejects.toMatchObject({ code: 'not_found' });
    });
    it('boarding filter is wired (nobody boarded yet)', async () => {
      expect((await list({ q: tag, boarding: 'boarded' })).items).toHaveLength(0);
      expect((await list({ q: tag, boarding: 'not_boarded' })).items.length).toBe(2);
    });
  });

  it('operations staff see bookings but no passenger data', async () => {
    const r = (await list({ tripId: tripLate }, opsA)).items[0]!;
    expect(r.id).toBe(saraId);
    expect(r.customer).toBeNull();
  });
});
