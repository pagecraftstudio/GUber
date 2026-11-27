import { describe, expect, it, vi } from 'vitest';
import { AppError } from '@/lib/errors';
import { mapDbError } from '@/lib/db/map-error';
import { fakeDb, opsOf, tenantCtx } from '@/test/helpers';
import { makeShuttleService } from './service';
import { shuttleRepository, type ShuttleRepository } from './repository';
import { cancelDaySchema, faresSaveSchema, serviceSaveSchema, startDaySchema } from './schema';
import { toFare, toOverview, toService, toStartResult } from './types';

const ID = '00000000-0000-4000-8000-000000000201';
const S1 = '00000000-0000-4000-8000-000000006901';
const S2 = '00000000-0000-4000-8000-000000006902';
const svc = { routeId: ID, name: 'Campus shuttle', outboundDirection: 'forward', allowReverse: true, requestTtlMinutes: 20, allowWalkIn: true, maxSeatsPerRequest: 4, hubStopId: null };

const repo = (): ShuttleRepository => ({
  isEnabled: vi.fn(async () => true), liveServiceForRoute: vi.fn(async () => null), listFares: vi.fn(async () => []),
  saveService: vi.fn(async () => ID), setServiceActive: vi.fn(async () => undefined), saveFares: vi.fn(async () => 0),
  listLiveServices: vi.fn(async () => []), overview: vi.fn(async () => ({ serviceDate: '2026-12-01', day: null, sessions: [] })),
  startDay: vi.fn(async () => ({ dayId: ID, replayed: false, sessionCount: 1 })), cancelDay: vi.fn(async () => undefined),
});

describe('serviceSaveSchema (mirrors shuttle_services checks, migration 0074)', () => {
  it('accepts a normal service and a hub stop', () => {
    expect(serviceSaveSchema.safeParse(svc).success).toBe(true);
    expect(serviceSaveSchema.safeParse({ ...svc, hubStopId: S1 }).success).toBe(true);
  });
  it('bounds ttl, seats, direction and name', () => {
    expect(serviceSaveSchema.safeParse({ ...svc, requestTtlMinutes: 0 }).success).toBe(false);
    expect(serviceSaveSchema.safeParse({ ...svc, requestTtlMinutes: 241 }).success).toBe(false);
    expect(serviceSaveSchema.safeParse({ ...svc, maxSeatsPerRequest: 0 }).success).toBe(false);
    expect(serviceSaveSchema.safeParse({ ...svc, maxSeatsPerRequest: 21 }).success).toBe(false);
    expect(serviceSaveSchema.safeParse({ ...svc, outboundDirection: 'sideways' }).success).toBe(false);
    expect(serviceSaveSchema.safeParse({ ...svc, name: '   ' }).success).toBe(false);
  });
  it('refuses a company id and unknown keys', () => {
    expect(serviceSaveSchema.safeParse({ ...svc, companyId: ID }).success).toBe(false);
    expect(serviceSaveSchema.safeParse({ ...svc, isActive: false }).success).toBe(false);
  });
});

describe('faresSaveSchema', () => {
  const f = (from: string, to: string, price: number) => ({ fromStopId: from, toStopId: to, price });
  it('accepts a matrix with both directions priced separately', () => {
    expect(faresSaveSchema.safeParse({ serviceId: ID, fares: [f(S1, S2, 10), f(S2, S1, 12)] }).success).toBe(true);
    expect(faresSaveSchema.safeParse({ serviceId: ID, fares: [] }).success).toBe(true);
  });
  it('refuses same stop, duplicate pair, negative and 3-decimal prices, and more than 2000 rows', () => {
    expect(faresSaveSchema.safeParse({ serviceId: ID, fares: [f(S1, S1, 5)] }).success).toBe(false);
    expect(faresSaveSchema.safeParse({ serviceId: ID, fares: [f(S1, S2, 5), f(S1, S2, 6)] }).success).toBe(false);
    expect(faresSaveSchema.safeParse({ serviceId: ID, fares: [f(S1, S2, -1)] }).success).toBe(false);
    expect(faresSaveSchema.safeParse({ serviceId: ID, fares: [f(S1, S2, 1.555)] }).success).toBe(false);
    expect(faresSaveSchema.safeParse({ serviceId: ID, fares: Array.from({ length: 2001 }, () => f(S1, S2, 1)) }).success).toBe(false);
  });
});

describe('shuttle service: authorize -> validate -> repository', () => {
  it('reads need shuttle.read, writes need shuttle.config (a reader cannot write)', async () => {
    const r = repo();
    const s = makeShuttleService(r);
    const reader = tenantCtx(['shuttle.read']);
    await expect(s.isEnabled(reader)).resolves.toBe(true);
    await expect(s.saveService(reader, svc)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(s.setServiceActive(reader, { serviceId: ID, active: false })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(s.saveFares(reader, { serviceId: ID, fares: [] })).rejects.toMatchObject({ code: 'forbidden' });
    expect(r.saveService).not.toHaveBeenCalled();
    await expect(s.isEnabled(tenantCtx(['routes.read']))).rejects.toBeInstanceOf(AppError);
    await expect(s.liveServiceForRoute(tenantCtx(['shuttle.drive']), ID)).rejects.toMatchObject({ code: 'forbidden' });
  });
  it('a configurer writes; bad input never reaches the repository', async () => {
    const r = repo();
    const s = makeShuttleService(r);
    const cfg = tenantCtx(['shuttle.read', 'shuttle.config']);
    await expect(s.saveService(cfg, svc)).resolves.toBe(ID);
    await expect(s.saveService(cfg, { ...svc, requestTtlMinutes: 0 })).rejects.toMatchObject({ code: 'validation' });
    await expect(s.saveFares(cfg, { serviceId: 'nope', fares: [] })).rejects.toMatchObject({ code: 'validation' });
    expect(r.saveService).toHaveBeenCalledTimes(1);
    expect(r.saveFares).not.toHaveBeenCalled();
  });
});

describe('shuttle repository: what it asks the database', () => {
  it('scopes reads by the session company, never by input', async () => {
    const { db, calls } = fakeDb({ data: null });
    const ctx = tenantCtx(['shuttle.read'], { db });
    await shuttleRepository.liveServiceForRoute(ctx, ID);
    const eqs = opsOf(calls[0]!, 'eq');
    expect(eqs).toContainEqual(['company_id', ctx.companyId]);
    expect(eqs).toContainEqual(['route_id', ID]);
    expect(eqs).toContainEqual(['is_active', true]);
  });
  it('sends snake_case rpc args and the session company only to is_enabled', async () => {
    const { db, calls } = fakeDb({ data: true });
    const ctx = tenantCtx(['shuttle.read', 'shuttle.config'], { db });
    await expect(shuttleRepository.isEnabled(ctx)).resolves.toBe(true);
    expect(calls[0]!.target).toBe('rpc:shuttle_is_enabled');
    expect(opsOf(calls[0]!, 'args')[0]![0]).toEqual({ p_company: ctx.companyId });
    const f = fakeDb({ data: 1 });
    await shuttleRepository.saveFares(tenantCtx(['shuttle.config'], { db: f.db }), { serviceId: ID, fares: [{ fromStopId: S1, toStopId: S2, price: 10 }] });
    expect(opsOf(f.calls[0]!, 'args')[0]![0]).toEqual({ p_service_id: ID, p_fares: [{ from_stop_id: S1, to_stop_id: S2, price: 10 }] });
  });
  it('maps rows (numeric price may arrive as a string)', () => {
    expect(toFare({ id: ID, service_id: ID, from_stop_id: S1, to_stop_id: S2, price: '12.50' }).price).toBe(12.5);
    expect(toService({ id: ID, route_id: ID, name: 'x', outbound_direction: 'backward', allow_reverse: false, request_ttl_minutes: 5, allow_walk_in: false, max_seats_per_request: 2, hub_stop_id: S1, is_active: true, created_at: '', updated_at: '' }).outboundDirection).toBe('backward');
  });
});

describe('mapDbError: shuttle messages (migration 0074)', () => {
  it('plan gate is forbidden with a stable detail', () => {
    const e = mapDbError({ code: '42501', message: 'shuttle operations are not included in the plan' });
    expect([e.code, e.detail]).toEqual(['forbidden', 'shuttle_not_in_plan']);
  });
  it('second live service, duplicate pair and stops off the route', () => {
    expect(mapDbError({ code: '23505', message: 'the route already has a live shuttle service' })).toMatchObject({ code: 'conflict', detail: 'shuttle_service_exists' });
    expect(mapDbError({ code: '22023', message: 'duplicate station pair in fares' })).toMatchObject({ code: 'validation', detail: 'duplicate_fare_pair' });
    expect(mapDbError({ code: '23514', message: 'fare stops must belong to the service route' })).toMatchObject({ code: 'business_rule', detail: 'shuttle_stop_not_on_route' });
    expect(mapDbError({ code: '23514', message: 'hub stop does not belong to the route' })).toMatchObject({ code: 'business_rule', detail: 'shuttle_stop_not_on_route' });
  });
});

const B1 = '00000000-0000-4000-8000-000000007021';
const B2 = '00000000-0000-4000-8000-000000007022';
const D1 = '00000000-0000-4000-8000-000000007031';
const D2 = '00000000-0000-4000-8000-000000007032';
const veh = (busId: string, driverId: string, startStationIdx = 0, direction: 'forward' | 'backward' = 'forward') => ({ busId, driverId, startStationIdx, direction });
const day = { serviceId: ID, serviceDate: '2026-12-01', key: 'k-1', vehicles: [veh(B1, D1), veh(B2, D2, 2, 'backward')] };

describe('startDaySchema (mirrors shuttle_start_day input checks, migration 0075)', () => {
  it('accepts one or many vehicles in either direction', () => {
    expect(startDaySchema.safeParse(day).success).toBe(true);
    expect(startDaySchema.safeParse({ ...day, vehicles: [veh(B1, D1)] }).success).toBe(true);
  });
  it('refuses an empty list, more than 50, a repeated bus or driver, a bad direction, a bad date, a blank key', () => {
    expect(startDaySchema.safeParse({ ...day, vehicles: [] }).success).toBe(false);
    expect(startDaySchema.safeParse({ ...day, vehicles: Array.from({ length: 51 }, (_, i) => veh(`00000000-0000-4000-8000-${String(i).padStart(12, '1')}`, `00000000-0000-4000-8000-${String(i).padStart(12, '2')}`)) }).success).toBe(false);
    expect(startDaySchema.safeParse({ ...day, vehicles: [veh(B1, D1), veh(B1, D2)] }).success).toBe(false);
    expect(startDaySchema.safeParse({ ...day, vehicles: [veh(B1, D1), veh(B2, D1)] }).success).toBe(false);
    expect(startDaySchema.safeParse({ ...day, vehicles: [{ ...veh(B1, D1), direction: 'sideways' }] }).success).toBe(false);
    expect(startDaySchema.safeParse({ ...day, vehicles: [veh(B1, D1, -1)] }).success).toBe(false);
    expect(startDaySchema.safeParse({ ...day, serviceDate: '01/12/2026' }).success).toBe(false);
    expect(startDaySchema.safeParse({ ...day, key: '  ' }).success).toBe(false);
  });
  it('refuses a company id and extra keys', () => {
    expect(startDaySchema.safeParse({ ...day, companyId: ID }).success).toBe(false);
    expect(startDaySchema.safeParse({ ...day, vehicles: [{ ...veh(B1, D1), extra: 1 }] }).success).toBe(false);
  });
  it('cancel needs a 3 to 300 character reason', () => {
    expect(cancelDaySchema.safeParse({ dayId: ID, reason: 'mistake' }).success).toBe(true);
    expect(cancelDaySchema.safeParse({ dayId: ID, reason: 'x' }).success).toBe(false);
    expect(cancelDaySchema.safeParse({ dayId: ID, reason: 'x'.repeat(301) }).success).toBe(false);
  });
});

describe('shuttle service: day operations', () => {
  it('start and cancel need shuttle.operate; overview and listing need shuttle.read', async () => {
    const r = repo();
    const s = makeShuttleService(r);
    const reader = tenantCtx(['shuttle.read']);
    await expect(s.overview(reader, { serviceId: ID })).resolves.toBeTruthy();
    await expect(s.listLiveServices(reader)).resolves.toEqual([]);
    await expect(s.startDay(reader, day)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(s.cancelDay(reader, { dayId: ID, reason: 'mistake' })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(s.overview(tenantCtx(['shuttle.drive']), { serviceId: ID })).rejects.toMatchObject({ code: 'forbidden' });
    expect(r.startDay).not.toHaveBeenCalled();
    const op = tenantCtx(['shuttle.read', 'shuttle.operate']);
    await expect(s.startDay(op, day)).resolves.toMatchObject({ dayId: ID });
    await expect(s.cancelDay(op, { dayId: ID, reason: 'mistake' })).resolves.toBeUndefined();
  });
  it('the configurer role alone cannot run the day, and bad input never reaches the repository', async () => {
    const r = repo();
    const s = makeShuttleService(r);
    await expect(s.startDay(tenantCtx(['shuttle.config']), day)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(s.startDay(tenantCtx(['shuttle.operate']), { ...day, vehicles: [] })).rejects.toMatchObject({ code: 'validation' });
    await expect(s.overview(tenantCtx(['shuttle.read']), { serviceId: 'nope' })).rejects.toMatchObject({ code: 'validation' });
    expect(r.startDay).not.toHaveBeenCalled();
    expect(r.overview).not.toHaveBeenCalled();
  });
});

describe('shuttle repository: day rpc arguments and mapping', () => {
  it('sends snake_case rpc args and no company id', async () => {
    const { db, calls } = fakeDb({ data: { day_id: ID, replayed: true, sessions: [{}, {}] } });
    const ctx = tenantCtx(['shuttle.operate'], { db });
    const out = await shuttleRepository.startDay(ctx, startDaySchema.parse(day));
    expect(out).toEqual({ dayId: ID, replayed: true, sessionCount: 2 });
    expect(calls[0]!.target).toBe('rpc:shuttle_start_day');
    const args = opsOf(calls[0]!, 'args')[0]![0] as Record<string, unknown>;
    expect(Object.keys(args).sort()).toEqual(['p_key', 'p_service_date', 'p_service_id', 'p_vehicles']);
    expect((args.p_vehicles as unknown[])[1]).toEqual({ bus_id: B2, driver_id: D2, start_station_idx: 2, direction: 'backward' });
    const c = fakeDb({ data: null });
    await shuttleRepository.cancelDay(tenantCtx(['shuttle.operate'], { db: c.db }), { dayId: ID, reason: 'mistake' });
    expect(opsOf(c.calls[0]!, 'args')[0]![0]).toEqual({ p_day_id: ID, p_reason: 'mistake' });
  });
  it('maps the overview jsonb, including a day that was not started', () => {
    expect(toOverview({ service_date: '2026-12-01', day: null, sessions: [] })).toEqual({ serviceDate: '2026-12-01', day: null, sessions: [] });
    const o = toOverview({ service_date: '2026-12-01', day: { id: ID, status: 'open', opened_at: 'x', stations: [{ idx: 0, stop_id: S1, name: 'Campus', offset_minutes: 0 }] },
      sessions: [{ id: ID, state: 'ready', run_id: ID, run_no: 1, direction: 'forward', capacity: 10, bus_id: B1, plate: 'P-1', driver_id: D1, driver_name: 'Ali', station_pos: 0, station_name: 'Campus' }] });
    expect(o.day?.stations[0]).toEqual({ idx: 0, stopId: S1, name: 'Campus' });
    expect(o.sessions[0]).toMatchObject({ plate: 'P-1', driverName: 'Ali', stationName: 'Campus', runNo: 1 });
    expect(toStartResult({ day_id: ID, sessions: [] })).toEqual({ dayId: ID, replayed: false, sessionCount: 0 });
  });
});

describe('mapDbError: shuttle day messages (migration 0075)', () => {
  it.each([
    ['23505', 'a shuttle day already exists for this date', 'conflict', 'shuttle_day_exists'],
    ['23505', 'bus is already in a live shuttle session', 'conflict', 'shuttle_bus_busy'],
    ['23505', 'driver is already in a live shuttle session', 'conflict', 'shuttle_driver_busy'],
    ['23514', 'bus has a scheduled trip in that window', 'business_rule', 'shuttle_bus_trip_conflict'],
    ['23514', 'driver has a scheduled trip in that window', 'business_rule', 'shuttle_driver_trip_conflict'],
    ['23514', 'route needs at least two active stops', 'business_rule', 'shuttle_route_stops'],
    ['23514', 'day has started and cannot be cancelled', 'business_rule', 'shuttle_day_started'],
    ['22023', 'invalid service date', 'validation', 'shuttle_invalid_date'],
    ['22023', 'invalid start station', 'validation', 'shuttle_invalid_start'],
    ['22023', 'invalid vehicle list', 'validation', 'shuttle_invalid_vehicles'],
  ])('%s %s', (code, message, appCode, detail) => {
    expect(mapDbError({ code, message })).toMatchObject({ code: appCode, detail });
  });
  it('the vehicle limit is a plan_limit naming the key', () => {
    expect(mapDbError({ code: '53400', message: 'plan limit reached: max_shuttle_vehicles (3)' })).toMatchObject({ code: 'plan_limit', detail: 'max_shuttle_vehicles' });
  });
});
