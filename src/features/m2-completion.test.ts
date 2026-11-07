import { describe, expect, it } from 'vitest';
import { AppError } from '@/lib/errors';
import { mapDbError } from '@/lib/db/map-error';
import { COMPANY_A, COMPANY_B, fakeDb, opsOf, tenantCtx } from '@/test/helpers';
import { validateStopList, type StopDraft } from '@/features/stops/validate';
import { moveRow, serializeStops, blankRow, toDraft } from '@/features/stops/draft';
import { stopListSaveSchema } from '@/features/stops/schema';
import { makeStopService } from '@/features/stops/service';
import { stopRepository } from '@/features/stops/repository';
import { makeRouteService } from '@/features/routes/service';
import { routeRepository } from '@/features/routes/repository';
import { makeUserService } from '@/features/users/service';
import { userRepository } from '@/features/users/repository';
import { allowanceFor, blocksSubmit, parsePlanUsage } from '@/features/subscriptions/usage';
import { makePlanUsageService } from '@/features/subscriptions/usage-service';
import { allowanceNotice, backendLimitNotice, stopIssueText } from '@/features/dashboard/messages';

const ID = '00000000-0000-4000-8000-0000000000aa';
const stop = (name: string, offsetMinutes: number, extra: Partial<StopDraft> = {}): StopDraft => ({ name: name.length < 2 ? name.repeat(2) : name, offsetMinutes, ...extra }); // stop names need 2+ characters
const codes = (l: StopDraft[]) => validateStopList(l).map((i) => i.code);

describe('validateStopList (same rules as save_route_stops)', () => {
  it('accepts a valid ordered list', () => expect(codes([stop('A', 0), stop('B', 10), stop('C', 10)])).toEqual([]));
  it('needs at least two stops', () => expect(codes([stop('A', 0)])).toContain('stops_min_two'));
  it('rejects duplicate names case-insensitively', () => expect(codes([stop('Main', 0), stop('main', 5)])).toContain('stop_name_duplicate'));
  it('rejects decreasing minutes', () => expect(codes([stop('A', 10), stop('B', 5)])).toContain('stop_offset_order'));
  it('rejects non-integer / NaN minutes', () => {
    expect(codes([stop('A', 0), stop('B', 1.5)])).toContain('stop_offset_invalid');
    expect(codes([stop('A', 0), stop('B', Number.NaN)])).toContain('stop_offset_invalid');
  });
  it('wants both coordinates or neither, and in range', () => {
    expect(codes([stop('A', 0, { latitude: 30 }), stop('B', 5)])).toContain('stop_coords_invalid');
    expect(codes([stop('A', 0, { latitude: 91, longitude: 10 }), stop('B', 5)])).toContain('stop_coords_invalid');
    expect(codes([stop('A', 0, { latitude: Number.NaN, longitude: 10 }), stop('B', 5)])).toContain('stop_coords_invalid');
    expect(codes([stop('A', 0, { latitude: 30, longitude: 31 }), stop('B', 5)])).toEqual([]);
  });
  it('needs two ACTIVE stops and a pick-up plus a drop-off', () => {
    expect(codes([stop('A', 0), stop('B', 5, { isActive: false })])).toContain('stops_min_two_active');
    expect(codes([stop('A', 0, { stopType: 'pickup' }), stop('B', 5, { stopType: 'pickup' })])).toContain('stops_need_pickup_and_dropoff');
    expect(codes([stop('A', 0, { stopType: 'pickup' }), stop('B', 5, { stopType: 'dropoff' })])).toEqual([]);
  });
  it('every issue code has wording in both languages', () => {
    for (const c of ['stops_min_two', 'stop_name_duplicate', 'stop_offset_order', 'stop_coords_invalid', 'stops_need_pickup_and_dropoff', 'stop_has_bookings'])
      for (const l of ['en', 'ar'] as const) expect(stopIssueText(l, c)).not.toMatch(/not valid|غير صالحة\.$/);
  });
});

describe('stop editor helpers', () => {
  it('moveRow moves, and is a no-op out of range', () => {
    expect(moveRow(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
    expect(moveRow(['a', 'b'], 0, 5)).toEqual(['a', 'b']);
  });
  it('serializeStops keeps ids and order and never sends NaN', () => {
    const r = { ...blankRow(5), id: ID, name: 'X', latitude: 'abc' };
    const out = JSON.parse(serializeStops([r, { ...blankRow(9), name: 'Y' }])) as Array<Record<string, unknown>>;
    expect(out[0]).toMatchObject({ id: ID, name: 'X', offsetMinutes: 5, latitude: null });
    expect(out[1]).toMatchObject({ id: null, name: 'Y' });
    expect(Number.isNaN(toDraft(r).latitude)).toBe(true); // validation still sees the bad value
  });
  it('the schema carries the same rules and takes no company id', () => {
    expect(stopListSaveSchema.safeParse([stop('A', 0), stop('B', 5)]).success).toBe(true);
    expect(stopListSaveSchema.safeParse([stop('A', 5), stop('B', 0)]).success).toBe(false);
    expect(stopListSaveSchema.safeParse([{ ...stop('A', 0), company_id: COMPANY_B }, stop('B', 5)]).success).toBe(false);
  });
});

describe('plan usage reading', () => {
  const ok = { status: 'ok', limits: { max_users: { limit: 3, used: 3 }, max_buses: { limit: 5, used: 2 }, max_drivers: { limit: null, used: 9 }, max_routes: { limit: 3, used: 0 }, max_trips_per_month: { limit: 10, used: 4 } }, trip_months: { '2026-12': 10 } };
  it('parses and computes allowances', () => {
    const u = parsePlanUsage(ok)!;
    expect(allowanceFor(u, 'max_buses')).toMatchObject({ remaining: 3, reached: false });
    expect(allowanceFor(u, 'max_users')).toMatchObject({ remaining: 0, reached: true });
    expect(allowanceFor(u, 'max_drivers')).toMatchObject({ limit: null, reached: false });
    expect(allowanceFor(u, 'max_trips_per_month', '2026-12')).toMatchObject({ used: 10, reached: true });
    expect(allowanceFor(u, 'max_trips_per_month', '2027-03')).toMatchObject({ used: null, reached: false }); // unknown month never blocks
  });
  it('malformed or missing data is "unavailable", never invented numbers', () => {
    expect(parsePlanUsage({ status: 'ok', limits: { max_users: { limit: 'x', used: 1 } } })).toBeNull();
    expect(parsePlanUsage(null)).toBeNull();
    expect(allowanceFor(null, 'max_buses')).toEqual({ state: 'unavailable' });
    expect(allowanceNotice('en', 'max_buses', { state: 'unavailable' })).toBeNull();
  });
  it('no subscription blocks submit and shows no plan numbers; limit reached blocks', () => {
    const none = allowanceFor(parsePlanUsage({ status: 'no_subscription' }), 'max_buses');
    expect(blocksSubmit(none)).toBe(true);
    expect(JSON.stringify(allowanceNotice('en', 'max_buses', none))).not.toMatch(/\d+ of \d+/);
    expect(blocksSubmit(allowanceFor(parsePlanUsage(ok), 'max_users'))).toBe(true);
    expect(blocksSubmit(allowanceFor(parsePlanUsage(ok), 'max_buses'))).toBe(false);
  });
  it('messages exist in English and Arabic and name the resource', () => {
    const a = allowanceFor(parsePlanUsage(ok), 'max_users');
    expect(allowanceNotice('en', 'max_users', a)!.title).toMatch(/3 of 3 team members/);
    expect(allowanceNotice('ar', 'max_users', a)!.title).toMatch(/3 من 3/);
    expect(backendLimitNotice('en', 'max_buses').title).toMatch(/buses/);
    expect(backendLimitNotice('ar', 'max_buses').title).toMatch(/الحافلات/);
  });
  it('the service asks the database with the SESSION company and turns failure into null', async () => {
    const f = fakeDb({ data: ok });
    await makePlanUsageService().get(tenantCtx([], { db: f.db }));
    expect(f.calls[0]!.target).toBe('rpc:my_plan_usage');
    expect(opsOf(f.calls[0]!, 'args')[0]![0]).toEqual({ p_company: COMPANY_A });
    const bad = fakeDb({ error: { code: '42501', message: 'boom' } });
    expect(await makePlanUsageService().getOrNull(tenantCtx([], { db: bad.db }))).toBeNull();
  });
});

describe('stop and route services', () => {
  const list = [stop('A', 0), stop('B', 5)];
  it('saveAll needs routes.write and sends no company id', async () => {
    const f = fakeDb({ data: { count: 2, added: 2, updated: 0, removed: 0 } });
    const svc = makeStopService(stopRepository);
    await expect(svc.saveAll(tenantCtx(['routes.read'], { db: f.db }), ID, list)).rejects.toMatchObject({ code: 'forbidden' });
    expect(f.calls).toHaveLength(0);
    await svc.saveAll(tenantCtx(['routes.write'], { db: f.db }), ID, list);
    expect(f.calls[0]!.target).toBe('rpc:save_route_stops');
    expect(Object.keys(opsOf(f.calls[0]!, 'args')[0]![0] as object).sort()).toEqual(['p_route_id', 'p_stops']);
  });
  it('invalid lists never reach the database', async () => {
    const f = fakeDb({ data: {} });
    await expect(makeStopService(stopRepository).saveAll(tenantCtx(['routes.write'], { db: f.db }), ID, [stop('A', 0)])).rejects.toMatchObject({ code: 'validation' });
    expect(f.calls).toHaveLength(0);
  });
  it('createWithStops is ONE rpc (atomic), company comes from the database, not from input', async () => {
    const f = fakeDb({ data: { route_id: ID, stops: 2 } });
    const svc = makeRouteService(routeRepository, stopRepository);
    await expect(svc.createWithStops(tenantCtx(['routes.read'], { db: f.db }), { name: 'Route One', originName: 'Cairo', destinationName: 'Giza' }, list)).rejects.toMatchObject({ code: 'forbidden' });
    expect(f.calls).toHaveLength(0);
    await svc.createWithStops(tenantCtx(['routes.write', 'routes.read'], { db: f.db }), { name: 'Route One', originName: 'Cairo', destinationName: 'Giza', company_id: COMPANY_B } as never, list).catch(() => undefined);
    expect(f.calls).toHaveLength(0); // smuggled company_id is rejected by the strict schema before any call
    await svc.createWithStops(tenantCtx(['routes.write', 'routes.read'], { db: f.db }), { name: 'Route One', originName: 'Cairo', destinationName: 'Giza' }, list).catch(() => undefined);
    expect(f.calls[0]!.target).toBe('rpc:create_route_with_stops');
    expect(Object.keys(opsOf(f.calls[0]!, 'args')[0]![0] as object)).not.toContain('p_company');
    expect(f.calls.filter((c) => c.target === 'routes' && c.ops.some(([n]) => n === 'insert'))).toHaveLength(0);
  });
});

describe('member management service', () => {
  const svc = makeUserService(userRepository);
  it('manager (users.read only) cannot change role or status; nothing is sent', async () => {
    const f = fakeDb({ data: { changed: true } });
    const ctx = tenantCtx(['users.read'], { db: f.db });
    await expect(svc.setMemberRole(ctx, ID, { roleKey: 'booking' })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(svc.setMemberStatus(ctx, ID, 'suspended')).rejects.toMatchObject({ code: 'forbidden' });
    expect(f.calls).toHaveLength(0);
  });
  it('owner path calls the RPCs with the target member only', async () => {
    const f = fakeDb({ data: { changed: true } });
    const ctx = tenantCtx(['users.write'], { db: f.db });
    expect(await svc.setMemberRole(ctx, ID, { roleKey: 'booking' })).toEqual({ changed: true });
    expect(await svc.setMemberStatus(ctx, ID, 'suspended')).toEqual({ changed: true });
    expect(f.calls.map((c) => c.target)).toEqual(['rpc:set_member_role', 'rpc:set_member_status']);
    expect(opsOf(f.calls[0]!, 'args')[0]![0]).toEqual({ p_member_id: ID, p_role_key: 'booking' });
  });
  it('rejects bad input before the database', async () => {
    const f = fakeDb({ data: {} });
    const ctx = tenantCtx(['users.write'], { db: f.db });
    await expect(svc.setMemberStatus(ctx, ID, 'deleted')).rejects.toBeInstanceOf(AppError);
    await expect(svc.setMemberRole(ctx, 'not-a-uuid', { roleKey: 'booking' })).rejects.toBeInstanceOf(AppError);
    await expect(svc.setMemberRole(ctx, ID, { roleKey: 'Owner!' })).rejects.toBeInstanceOf(AppError);
    expect(f.calls).toHaveLength(0);
  });
});

describe('database error mapping for the new RPCs', () => {
  it('maps the stop codes, self change, and plan limit', () => {
    expect(mapDbError({ code: '22023', message: 'route stops invalid: stop_name_duplicate' })).toMatchObject({ code: 'validation', detail: 'stop_name_duplicate' });
    expect(mapDbError({ code: '23514', message: 'route stop has bookings' })).toMatchObject({ code: 'business_rule', detail: 'stop_has_bookings' });
    expect(mapDbError({ code: '23514', message: 'cannot change your own role' })).toMatchObject({ detail: 'cannot_change_self' });
    expect(mapDbError({ code: 'P0002', message: 'member not found' })).toMatchObject({ code: 'not_found' });
    expect(mapDbError({ code: '53400', message: 'plan limit reached: max_users (3)' }).code).toBe('plan_limit');
  });
});
