import { describe, expect, it, vi } from 'vitest';
import { AppError } from '@/lib/errors';
import { mapDbError } from '@/lib/db/map-error';
import { fakeDb, opsOf, tenantCtx } from '@/test/helpers';
import { makeShuttleService } from './service';
import { shuttleRepository, type ShuttleRepository } from './repository';
import { faresSaveSchema, serviceSaveSchema } from './schema';
import { toFare, toService } from './types';

const ID = '00000000-0000-4000-8000-000000000201';
const S1 = '00000000-0000-4000-8000-000000006901';
const S2 = '00000000-0000-4000-8000-000000006902';
const svc = { routeId: ID, name: 'Campus shuttle', outboundDirection: 'forward', allowReverse: true, requestTtlMinutes: 20, allowWalkIn: true, maxSeatsPerRequest: 4, hubStopId: null };

const repo = (): ShuttleRepository => ({
  isEnabled: vi.fn(async () => true), liveServiceForRoute: vi.fn(async () => null), listFares: vi.fn(async () => []),
  saveService: vi.fn(async () => ID), setServiceActive: vi.fn(async () => undefined), saveFares: vi.fn(async () => 0),
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
