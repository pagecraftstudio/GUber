import { beforeAll, describe, expect, it } from 'vitest';
import { mapDbError } from '@/lib/db/map-error';
import { AppError } from '@/lib/errors';
import type { PlatformServiceContext, TenantServiceContext } from '@/lib/service/context';
import { bookingService } from '@/features/bookings/service';
import { busService } from '@/features/buses/service';
import { companyService } from '@/features/companies/service';
import { customerService } from '@/features/customers/service';
import { driverService } from '@/features/drivers/service';
import { routeService } from '@/features/routes/service';
import { stopService } from '@/features/stops/service';
import { subscriptionService } from '@/features/subscriptions/service';
import { tripService } from '@/features/trips/service';
import { userService } from '@/features/users/service';
import { websiteService } from '@/features/website/service';
import { IDS, U, URL_, clientFor, platformAs, rnd, tenantAs, uid } from './harness';

async function fails(p: Promise<unknown>): Promise<AppError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(AppError);
    return e as AppError;
  }
  throw new Error('expected the call to fail');
}
const day = () => 20_000 + Math.floor(Math.random() * 20_000); // random far-future day => re-runnable
const at = (d: number, h: number) => new Date(Date.UTC(1970, 0, 1 + d, h)).toISOString();

describe.skipIf(!URL_)('Phase 4 services against real Postgres + PostgREST + RLS', () => {
  let ownerA: TenantServiceContext, managerA: TenantServiceContext, opsA: TenantServiceContext;
  let bookingA: TenantServiceContext, driverA: TenantServiceContext, ownerB: TenantServiceContext;
  let admin: PlatformServiceContext;

  beforeAll(async () => {
    [ownerA, managerA, opsA, bookingA, driverA, ownerB, admin] = await Promise.all([
      tenantAs(U.ownerA), tenantAs(U.managerA), tenantAs(U.opsA), tenantAs(U.bookingA), tenantAs(U.driverA), tenantAs(U.ownerB), platformAs(U.superAdmin),
    ]);
  });

  describe('tenant isolation (Company A can never touch Company B)', () => {
    it('lists contain only own rows', async () => {
      const routes = await routeService.list(ownerA, { pageSize: 100 });
      expect(routes.items.length).toBeGreaterThanOrEqual(2);
      expect(routes.items.every((r) => r.name.startsWith('A route') || r.name.startsWith('T-'))).toBe(true);
      expect((await busService.list(ownerA, { pageSize: 100 })).items.some((b) => b.id === IDS.busB1)).toBe(false);
      expect((await bookingService.list(ownerA, { pageSize: 100 })).items.map((b) => b.id)).not.toContain(IDS.bookingB1);
      expect((await tripService.list(ownerA, { pageSize: 100 })).items.map((t) => t.id)).not.toContain(IDS.tripB1);
    });
    it('reading B ids returns not_found (indistinguishable from absent)', async () => {
      const calls: Array<() => Promise<unknown>> = [
        () => routeService.get(ownerA, IDS.routeB1),
        () => busService.get(ownerA, IDS.busB1),
        () => customerService.get(ownerA, IDS.customerB1),
        () => tripService.get(ownerA, IDS.tripB1),
        () => bookingService.get(ownerA, IDS.bookingB1),
        () => stopService.get(ownerA, IDS.stopB1),
      ];
      for (const call of calls) expect((await fails(call())).code).toBe('not_found');
    });
    it('updating B rows is not_found, B is unchanged', async () => {
      expect((await fails(busService.update(ownerA, IDS.busB1, { name: 'hacked' }))).code).toBe('not_found');
      expect((await fails(routeService.update(ownerA, IDS.routeB1, { name: 'hacked' }))).code).toBe('not_found');
      expect((await fails(tripService.update(ownerA, IDS.tripB1, { price: 1 }))).code).toBe('not_found');
      expect((await busService.get(ownerB, IDS.busB1)).name).not.toBe('hacked');
    });
    it('a smuggled companyId is rejected by validation; a forged company_id written straight to the DB is rejected by RLS', async () => {
      expect((await fails(busService.create(ownerA, { plateNumber: `X-${rnd()}`, capacity: 5, companyId: IDS.companyB }))).code).toBe('validation');
      // routes (not buses): B is far below its route limit, so this isolates the RLS answer (the F1 regression test below covers the plan-limit case)
      const { error } = await clientFor(U.ownerA).from('routes').insert({ company_id: IDS.companyB, name: 'forged', origin_name: 'a', destination_name: 'b' });
      expect(error && mapDbError(error).code).toBe('forbidden');
    });
    it('cross-tenant references are refused by composite FKs', async () => {
      const d = day();
      const e1 = await fails(tripService.createDraft(ownerA, { routeId: IDS.routeB1, departureAt: at(d, 8), arrivalAt: at(d, 9), price: 5, capacity: 10 }));
      expect(e1).toMatchObject({ code: 'validation', detail: 'invalid_reference' });
      const e2 = await fails(stopService.create(ownerA, IDS.routeB1, { name: 'sneaky stop' }));
      expect(e2.detail).toBe('invalid_reference');
    });
    it('tenants cannot read `companies` or platform-only data', async () => {
      const { data } = await clientFor(U.ownerA).from('companies').select('id');
      expect(data).toEqual([]);
      const profile = await companyService.getProfile(ownerA);
      expect(profile.id).toBe(IDS.companyA);
      expect(Object.keys(profile)).not.toContain('suspensionReason');
    });
  });

  describe('permissions are enforced twice: service and database', () => {
    it('booking staff: service says forbidden; raw write is stopped by RLS', async () => {
      expect((await fails(routeService.create(bookingA, { name: 'ab', originName: 'cd', destinationName: 'ef' }))).code).toBe('forbidden');
      const { error } = await clientFor(U.bookingA).from('routes').insert({ company_id: IDS.companyA, name: 'raw', origin_name: 'a', destination_name: 'b' });
      expect(error && mapDbError(error).code).toBe('forbidden');
      expect((await fails(websiteService.updateSettings(bookingA, { primaryColor: '#112233' }))).code).toBe('forbidden');
      const raw = await clientFor(U.bookingA).from('website_settings').upsert({ company_id: IDS.companyA, primary_color: '#112233' });
      expect(raw.error && mapDbError(raw.error).code).toBe('forbidden');
    });
    it('operations cannot see customers; manager cannot invite or read billing', async () => {
      expect((await fails(customerService.list(opsA, {}))).code).toBe('forbidden');
      expect((await fails(userService.createInvite(managerA, { email: `m-${rnd()}@x.dev`, roleKey: 'booking' }))).code).toBe('forbidden');
      expect((await fails(subscriptionService.getCurrent(managerA))).code).toBe('forbidden');
    });
    it('operations can read bookings but the customer is hidden by RLS', async () => {
      const b = await bookingService.get(opsA, IDS.bookingA1);
      expect(b.customer).toBeNull();
      expect(b.trip?.routeName).toBeTruthy();
    });
    it('driver: service denies; database shows only the assigned trip chain', async () => {
      expect((await fails(routeService.list(driverA, {}))).code).toBe('forbidden');
      const db = clientFor(U.driverA);
      const trips = await db.from('trips').select('id');
      expect(trips.data?.map((t: { id: string }) => t.id)).toEqual([IDS.tripA1]);
      expect((await db.from('customers').select('id')).data).toEqual([]);
      expect((await db.from('bookings').select('id')).data).toEqual([]);
    });
    it('suspended company: no service context at all', async () => {
      await expect(tenantAs(U.ownerC)).rejects.toMatchObject({ code: 'forbidden' });
    });
    it('platform: staff list everything, tenants are forbidden', async () => {
      const all = await companyService.platformList(admin, { pageSize: 100 });
      expect(all.items.map((c) => c.slug)).toEqual(expect.arrayContaining(['company-a', 'company-b', 'company-c']));
      const c = await companyService.platformGet(admin, uid(103));
      expect(c.suspensionReason).toBe('secret internal reason');
      expect((await fails(companyService.platformList(ownerA as never, {}))).code).toBe('forbidden');
    });
  });

  describe('CRUD + business rules enforced by the database', () => {
    it('routes: create, update, code uniqueness, search, soft-delete hidden, pagination', async () => {
      const code = `T-${rnd()}`;
      const r = await routeService.create(ownerA, { name: `T-route ${code}`, code, originName: 'Fayoum', destinationName: 'Cairo' });
      expect(r.isActive).toBe(true);
      expect((await fails(routeService.create(ownerA, { name: 'dup', code, originName: 'a1', destinationName: 'b1' }))).detail).toBe('route_code_taken');
      expect((await routeService.update(ownerA, r.id, { description: 'hi', isActive: false })).isActive).toBe(false);
      expect((await routeService.list(ownerA, { q: code })).items.map((x) => x.id)).toEqual([r.id]);
      expect((await routeService.list(ownerA, { q: "x),company_id.eq.nope,(y" })).items).toEqual([]); // injection is inert
      const p = await routeService.list(ownerA, { pageSize: 1 });
      expect(p.items.length).toBe(1);
      expect(p.hasMore).toBe(true);
      await clientFor(U.ownerA).from('routes').update({ deleted_at: new Date().toISOString() }).eq('id', r.id);
      expect((await fails(routeService.get(ownerA, r.id))).code).toBe('not_found');
      expect((await routeService.list(ownerA, { q: code })).items).toEqual([]);
    });

    it('stops: append order, update, order is not updatable', async () => {
      const a = await stopService.create(ownerA, IDS.routeA1, { name: 'Stop one', latitude: 29.3, longitude: 30.8 });
      const b = await stopService.create(ownerA, IDS.routeA1, { name: 'Stop two', stopType: 'pickup' });
      expect(b.stopOrder).toBe(a.stopOrder + 1);
      expect(Number(a.latitude)).toBeCloseTo(29.3);
      expect((await stopService.update(ownerA, b.id, { name: 'Stop 2b', latitude: null, longitude: null })).latitude).toBeNull();
      expect((await fails(stopService.update(ownerA, b.id, { stopOrder: 1 }))).code).toBe('validation');
      const list = await stopService.listByRoute(ownerA, IDS.routeA1);
      expect(list.map((s) => s.stopOrder)).toEqual([...list.map((s) => s.stopOrder)].sort((x, y) => x - y));
      const dup = await fails(stopService.create(ownerA, IDS.routeA1, { name: 'Dup order', stopOrder: a.stopOrder }));
      expect(dup.detail).toBe('stop_order_taken');
    });

    it('buses: plate normalised + unique, inactive bus cannot be assigned, capacity guard', async () => {
      const plate = `Z ${rnd()}`;
      const bus = await busService.create(ownerA, { plateNumber: plate.toLowerCase(), capacity: 20 });
      expect(bus.plateNumber).toBe(plate);
      expect((await fails(busService.create(ownerA, { plateNumber: plate, capacity: 20 }))).detail).toBe('plate_number_taken');
      const d = day();
      const base = { routeId: IDS.routeA1, departureAt: at(d, 8), arrivalAt: at(d, 10), price: 25.5, capacity: 10 };
      expect((await fails(tripService.createDraft(ownerA, { ...base, busId: IDS.busA3Inactive }))).detail).toBe('bus_inactive');
      expect((await fails(tripService.createDraft(ownerA, { ...base, busId: bus.id, capacity: 30 }))).detail).toBe('capacity_exceeds_bus');
    });

    it('plan limit (starter = 5 buses) is enforced by the database and mapped', async () => {
      let err: AppError | null = null;
      for (let i = 0; i < 8 && !err; i++) {
        try { await busService.create(ownerB, { plateNumber: `B-${rnd()}`, capacity: 10 }); } catch (e) { err = e as AppError; }
      }
      expect(err).toMatchObject({ code: 'plan_limit', detail: 'max_buses' });
    });

    // F1 (fixed by migration 0008, tenant guard): BEFORE INSERT triggers used to run before the RLS WITH CHECK and
    // let Company A read Company B's plan state from the error. Now every probe must be the plain 'forbidden'.
    it("B's plan-limit / subscription state is not observable by A (F1 regression)", async () => {
      for (let i = 0; i < 8; i++) {
        try { await busService.create(ownerB, { plateNumber: `L-${rnd()}`, capacity: 10 }); } catch { break; }
      }
      // control: B's own owner DOES see the plan limit, so the state we are hiding is real
      expect((await fails(busService.create(ownerB, { plateNumber: `L-${rnd()}`, capacity: 10 }))).code).toBe('plan_limit');
      const probe = async (table: string, row: Record<string, unknown>) => {
        const { error } = await clientFor(U.ownerA).from(table).insert(row);
        return error ? { code: mapDbError(error).code, sqlstate: error.code, message: error.message } : null;
      };
      const forB = await probe('buses', { company_id: IDS.companyB, plate_number: `X-${rnd()}`, capacity: 5 });
      const forGhost = await probe('buses', { company_id: uid(999), plate_number: `X-${rnd()}`, capacity: 5 });
      expect(forB?.code).toBe('forbidden');
      expect(forB?.sqlstate).toBe('42501');
      expect({ ...forB, message: forB?.message.replace(/table ".*"/, '') }).toEqual({ ...forGhost, message: forGhost?.message.replace(/table ".*"/, '') });
      for (const [table, row] of [
        ['drivers', { full_name: 'x', phone: '+201000000123' }],
        ['routes', { name: 'x', origin_name: 'a', destination_name: 'b' }],
        ['customers', { full_name: 'x', phone: '+201000000124' }],
      ] as const) {
        expect(await probe(table, { company_id: IDS.companyB, ...row }), table).toEqual(await probe(table, { company_id: uid(998), ...row }));
      }
    });

    it('legitimate writes still work after the guard: own company and platform admin', async () => {
      const bus = await busService.create(ownerA, { plateNumber: `G-${rnd()}`, capacity: 10 });
      expect((await busService.update(ownerA, bus.id, { name: 'guard ok' })).name).toBe('guard ok');
      const viaPlatform = await clientFor(U.superAdmin).from('customers').insert({ company_id: IDS.companyB, full_name: 'Platform made', phone: `+2012${Math.floor(Math.random() * 1e8).toString().padStart(8, '0')}` }).select('id').single();
      expect(viaPlatform.error).toBeNull();
      const support = await clientFor(U.support).from('customers').insert({ company_id: IDS.companyB, full_name: 'nope', phone: '+201555000111' });
      expect(support.error && mapDbError(support.error).code).toBe('forbidden');
    });

    it('drivers: create/update/deactivate; inactive driver cannot be assigned; user link not settable', async () => {
      const dr = await driverService.create(ownerA, { fullName: 'Test Driver', phone: `+2010${Math.floor(Math.random() * 1e8).toString().padStart(8, '0')}` });
      expect(dr.userId).toBeNull();
      expect((await driverService.update(ownerA, dr.id, { status: 'inactive' })).status).toBe('inactive');
      const d = day();
      const e = await fails(tripService.createDraft(ownerA, { routeId: IDS.routeA1, driverId: dr.id, departureAt: at(d, 8), arrivalAt: at(d, 9), price: 1, capacity: 5 }));
      expect(e.detail).toBe('driver_inactive');
      expect((await fails(driverService.update(ownerA, dr.id, { userId: uid(3) }))).code).toBe('validation');
    });

    it('trips: draft with embeds, derived seats, update, filters; protected fields cannot be set', async () => {
      const d = day();
      const t = await tripService.createDraft(ownerA, { routeId: IDS.routeA1, busId: IDS.busA1, driverId: IDS.driverA2, departureAt: at(d, 8), arrivalAt: at(d, 10), price: 40, capacity: 30 });
      expect(t.status).toBe('draft');
      expect(t).toMatchObject({ seatsBooked: 0, seatsAvailable: 30, price: 40 });
      expect(t.route?.name).toBe('A route 1');
      expect(t.bus?.plateNumber).toBe('A-1');
      expect(t.driver?.fullName).toBe('Driver A2');
      expect(new Date(t.blockedUntil).getTime()).toBeGreaterThan(new Date(t.arrivalAt).getTime()); // DB-computed buffer
      expect((await tripService.update(ownerA, t.id, { price: 55.25 })).price).toBe(55.25);
      expect((await tripService.list(ownerA, { status: 'draft', routeId: IDS.routeA1, pageSize: 100 })).items.map((x) => x.id)).toContain(t.id);
      const range = await tripService.list(ownerA, { from: at(d, 0), to: at(d + 1, 0) });
      expect(range.items.map((x) => x.id)).toEqual([t.id]);
      expect((await fails(tripService.update(ownerA, t.id, { arrivalAt: at(d, 7) }))).code).toBe('validation');
      expect((await fails(tripService.update(ownerA, t.id, { status: 'scheduled' } as never))).code).toBe('validation');
      // booking staff see the trip but not bus/driver (no buses.read / drivers.read): embeds degrade to null
      const seen = await tripService.get(bookingA, t.id);
      expect(seen.route?.name).toBe('A route 1');
      expect(seen.bus).toBeNull();
    });

    it('bus/driver double-booking is stopped by the DB and the error maps to bus_conflict / driver_conflict', async () => {
      // 0011: status is no longer client-writable. Drafts are inserted, then the state machine RPC applies the
      // exclusion constraints when they go live. (Parallel version of this test: booking.int.test.ts.)
      const d = day();
      const draft = (driverId: string, busId: string | null, from: number, to: number) =>
        tripService.createDraft(ownerA, { routeId: IDS.routeA1, busId, driverId, departureAt: at(d, from), arrivalAt: at(d, to), price: 10, capacity: 10 });
      const live = (id: string) => tripService.transition(opsA, { tripId: id, to: 'scheduled' });
      await live((await draft(IDS.driverA2, IDS.busA4, 8, 10)).id);
      await expect(live((await draft(IDS.driverA3, IDS.busA4, 9, 11)).id)).rejects.toMatchObject({ code: 'conflict', detail: 'bus_conflict' });
      await expect(live((await draft(IDS.driverA2, IDS.busA1, 9, 11)).id)).rejects.toMatchObject({ code: 'conflict', detail: 'driver_conflict' });
      await expect(live((await draft(IDS.driverA3, null, 12, 13)).id)).rejects.toMatchObject({ detail: 'bus_and_driver_required' });
    });

    it('customers: normalised phone, duplicate phone conflict, search, update', async () => {
      const phone = `+2011${Math.floor(Math.random() * 1e8).toString().padStart(8, '0')}`;
      const c = await customerService.create(ownerA, { fullName: 'Sara Hassan', phone: phone.replace('+20', '+20 ').replace(/(\d{3})$/, '-$1'), email: 'SARA@Example.com', university: 'Cairo Uni' });
      expect(c.phone).toBe(phone);
      expect(c.email).toBe('sara@example.com');
      expect((await fails(customerService.create(ownerA, { fullName: 'Other', phone }))).detail).toBe('customer_phone_taken');
      expect((await customerService.list(ownerA, { q: 'sara@example' })).items.map((x) => x.id)).toContain(c.id);
      expect((await customerService.update(ownerA, c.id, { email: '' })).email).toBeNull();
      expect((await customerService.list(ownerB, { q: 'sara' })).items).toEqual([]);
    });

    it('bookings: reads, filters and pagination work; writes only through RPCs', async () => {
      const list = await bookingService.list(bookingA, { status: 'confirmed', tripId: IDS.tripA1 });
      expect(list.items.map((b) => b.id)).toContain(IDS.bookingA1);
      const b = list.items.find((x) => x.id === IDS.bookingA1)!;
      expect(b).toMatchObject({ seatsCount: 2, totalAmount: 100, currency: 'EGP' });
      expect(b.customer?.fullName).toBe('Cust A');
      // writes exist only as RPC-backed methods (0010): no generic create/update/delete on the table
      expect((bookingService as Record<string, unknown>).update).toBeUndefined();
      expect((bookingService as Record<string, unknown>).delete).toBeUndefined();
      const raw = await clientFor(U.ownerA).from('bookings').insert({ company_id: IDS.companyA, reference: `MB-${rnd()}`, trip_id: IDS.tripA1, customer_id: IDS.customerA1, seats_count: 1, unit_price: 1, total_amount: 1, currency: 'EGP', status: 'confirmed', source: 'staff' });
      expect(raw.error && mapDbError(raw.error).code).toBe('forbidden'); // no client write path to bookings
    });
  });

  describe('settings, website, subscription, users', () => {
    it('company settings: update, locale rule enforced by DB, buffer applies', async () => {
      const s = await companyService.updateSettings(ownerA, { tripBufferMinutes: 45 });
      expect(s.tripBufferMinutes).toBe(45);
      expect((await companyService.getSettings(managerA)).tripBufferMinutes).toBe(45);
      const e = await fails(companyService.updateSettings(ownerA, { supportedLocales: ['en'] })); // default is 'ar'
      expect(e).toMatchObject({ code: 'validation', detail: 'locale_not_supported' });
      await companyService.updateSettings(ownerA, { tripBufferMinutes: 30 });
      expect((await fails(companyService.updateSettings(opsA, { tripBufferMinutes: 5 }))).code).toBe('forbidden');
    });

    it('website settings: defaults, upsert, https-only links, publish flag untouched', async () => {
      const color = `#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')}`;
      const s = await websiteService.updateSettings(ownerA, { primaryColor: color.toUpperCase(), siteTitle: { ar: 'مرحبا', en: 'Hello' }, socialLinks: { facebook: 'https://facebook.com/malaky' } });
      expect(s).toMatchObject({ primaryColor: color, isPublished: false, siteTitle: { en: 'Hello' }, socialLinks: { facebook: 'https://facebook.com/malaky' } });
      expect((await websiteService.getSettings(managerA)).primaryColor).toBe(color);
      expect((await websiteService.getSettings(ownerB)).primaryColor).not.toBe(color); // B has its own (default) settings
      expect((await fails(websiteService.updateSettings(ownerA, { socialLinks: { facebook: 'javascript:alert(1)' } }))).code).toBe('validation');
    });

    it('subscriptions: owner sees plan + entitlements; manager forbidden; platform reads any company', async () => {
      const sub = await subscriptionService.getCurrent(ownerA);
      expect(sub?.plan?.code).toBe('professional');
      expect(sub?.plan?.entitlements.max_buses).toEqual({ kind: 'limit', limit: 20 });
      expect(sub?.plan?.entitlements.feature_analytics).toEqual({ kind: 'flag', enabled: true });
      expect((await subscriptionService.getCurrentForCompany(admin, IDS.companyB))?.plan?.code).toBe('starter');
      expect((await subscriptionService.listPlans(admin)).length).toBeGreaterThanOrEqual(3);
    });

    it('users: members + roles for own company only; invites via RPC; no company id ever sent', async () => {
      const members = await userService.listMembers(managerA, { pageSize: 100 });
      expect(members.total).toBe(5);
      expect(members.items.find((m) => m.userId === uid(2))).toMatchObject({ roleKey: 'owner', email: 'u2@test.dev' });
      expect(members.items.some((m) => m.userId === uid(7))).toBe(false);
      expect((await userService.listRoles(managerA)).map((r) => r.key)).toEqual(expect.arrayContaining(['owner', 'manager', 'driver']));

      const email = `new-${rnd().toLowerCase()}@x.dev`;
      const inv = await userService.createInvite(ownerA, { email, roleKey: 'booking' });
      expect(inv.token).toHaveLength(64);
      expect((await userService.listInvites(ownerA, { status: 'pending' })).items.map((i) => i.email)).toContain(email);
      expect((await fails(userService.createInvite(ownerA, { email, roleKey: 'booking' }))).detail).toBe('invite_pending');
      expect((await fails(userService.createInvite(ownerA, { email: 'u3@test.dev', roleKey: 'booking' }))).detail).toBe('user_already_member');
      expect((await fails(userService.createInvite(ownerA, { email: `z-${rnd()}@x.dev`, roleKey: 'nonexistent' }))).detail).toBe('unknown_role');
      await userService.revokeInvite(ownerA, inv.inviteId);
      expect((await userService.listInvites(ownerA, { status: 'revoked' })).items.map((i) => i.id)).toContain(inv.inviteId);
      // owner of B cannot see or revoke A's invite
      expect((await userService.listInvites(ownerB, {})).items.map((i) => i.id)).not.toContain(inv.inviteId);
      expect((await fails(userService.revokeInvite(ownerB, inv.inviteId))).code).toBe('forbidden');
    });
  });
});
