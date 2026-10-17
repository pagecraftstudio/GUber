import { describe, expect, it, vi } from 'vitest';
import { AppError } from '@/lib/errors';
import { COMPANY_A, COMPANY_B, fakeDb, opsOf, platformCtx, tenantCtx } from '@/test/helpers';
import { makeBusService } from './buses/service';
import { busRepository, type BusRepository } from './buses/repository';
import { routeRepository } from './routes/repository';
import { customerRepository } from './customers/repository';
import { tripRepository } from './trips/repository';
import { tripCreateSchema, tripUpdateSchema } from './trips/schema';
import { routeCreateSchema } from './routes/schema';
import { driverCreateSchema } from './drivers/schema';
import { websiteSettingsUpdateSchema } from './website/schema';
import { companySettingsUpdateSchema } from './companies/schema';
import { stopCreateSchema, stopUpdateSchema } from './stops/schema';
import { busCreateSchema } from './buses/schema';
import { customerCreateSchema } from './customers/schema';
import { inviteCreateSchema } from './users/schema';
import { makeCompanyService } from './companies/service';
import { makeSubscriptionService } from './subscriptions/service';
import { userRepository } from './users/repository';
import { toInvite } from './users/types';
import { isFeatureEnabled, isWithinLimit, limitFor } from './subscriptions/entitlements';
import { toEntitlements } from './subscriptions/types';

const ID = '00000000-0000-4000-8000-000000000201';
const T1 = '2030-01-01T08:00:00Z';
const T2 = '2030-01-01T10:00:00Z';

function spyRepo(): BusRepository {
  return { list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn() } as unknown as BusRepository;
}

describe('service order: authorize -> validate -> repository', () => {
  it('forbidden caller never reaches validation or the repository', async () => {
    const repo = spyRepo();
    const svc = makeBusService(repo);
    const ctx = tenantCtx(['buses.read']);
    await expect(svc.create(ctx, { garbage: true })).rejects.toMatchObject({ code: 'forbidden' });
    expect(repo.create).not.toHaveBeenCalled();
  });
  it('invalid input never reaches the repository', async () => {
    const repo = spyRepo();
    const svc = makeBusService(repo);
    await expect(svc.create(tenantCtx(['buses.write']), { plateNumber: 'A', capacity: 0 })).rejects.toMatchObject({ code: 'validation' });
    expect(repo.create).not.toHaveBeenCalled();
  });
  it('missing row is not_found (same answer for "other tenant" and "absent")', async () => {
    const repo = spyRepo();
    (repo.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(makeBusService(repo).get(tenantCtx(['buses.read']), ID)).rejects.toMatchObject({ code: 'not_found' });
  });
  it('malformed id is validation, not a database error', async () => {
    await expect(makeBusService(spyRepo()).get(tenantCtx(['buses.read']), "1; drop table buses")).rejects.toBeInstanceOf(AppError);
  });
  it('platform services need a platform role', async () => {
    const svc = makeCompanyService({ platformList: vi.fn(), platformGet: vi.fn() } as never);
    await expect(svc.platformList(platformCtx(null), {})).rejects.toMatchObject({ code: 'forbidden' });
    const subs = makeSubscriptionService({ currentForCompany: vi.fn().mockResolvedValue(null) } as never);
    await expect(subs.getCurrentForCompany(platformCtx('support'), ID)).resolves.toBeNull();
    await expect(subs.getCurrentForCompany(platformCtx(null), ID)).rejects.toMatchObject({ code: 'forbidden' });
  });
});

describe('schemas reject tenant and server-owned fields (strict)', () => {
  const bad = { company_id: COMPANY_B, companyId: COMPANY_B, seatsBooked: 5, status: 'scheduled' };
  it('routes', () => expect(routeCreateSchema.safeParse({ name: 'ab', originName: 'cd', destinationName: 'ef', companyId: COMPANY_B }).success).toBe(false));
  it('buses', () => expect(busCreateSchema.safeParse({ plateNumber: 'AB 1', capacity: 10, ...bad }).success).toBe(false));
  it('customers', () => expect(customerCreateSchema.safeParse({ fullName: 'Ali', phone: '0100000001', company_id: COMPANY_B }).success).toBe(false));
  it('drivers cannot be linked to a login account', () => {
    expect(driverCreateSchema.safeParse({ fullName: 'Ali', phone: '0100000001', userId: ID }).success).toBe(false);
  });
  it('trips: no status / seats / blockedUntil / templateId', () => {
    const ok = { routeId: ID, departureAt: T1, arrivalAt: T2, price: 10, capacity: 10 };
    expect(tripCreateSchema.safeParse(ok).success).toBe(true);
    for (const extra of [{ status: 'scheduled' }, { seatsBooked: 1 }, { blockedUntil: T2 }, { bufferMinutes: 0 }, { templateId: ID }, { companyId: COMPANY_B }]) {
      expect(tripCreateSchema.safeParse({ ...ok, ...extra }).success).toBe(false);
      expect(tripUpdateSchema.safeParse(extra).success).toBe(false);
    }
  });
  it('trip times must be ordered; money max 2 decimals', () => {
    expect(tripCreateSchema.safeParse({ routeId: ID, departureAt: T2, arrivalAt: T1, price: 10, capacity: 10 }).success).toBe(false);
    expect(tripCreateSchema.safeParse({ routeId: ID, departureAt: T1, arrivalAt: T2, price: 10.123, capacity: 10 }).success).toBe(false);
    expect(tripCreateSchema.safeParse({ routeId: ID, departureAt: '2030-01-01T08:00:00', arrivalAt: T2, price: 1, capacity: 1 }).success).toBe(false); // no offset
  });
  it('stops: coords both-or-neither, stopOrder not updatable', () => {
    expect(stopCreateSchema.safeParse({ name: 'ab', latitude: 30 }).success).toBe(false);
    expect(stopCreateSchema.safeParse({ name: 'ab', latitude: 30, longitude: 31 }).success).toBe(true);
    expect(stopUpdateSchema.safeParse({ stopOrder: 2 }).success).toBe(false);
    expect(stopUpdateSchema.safeParse({ latitude: 30 }).success).toBe(false);
    expect(stopUpdateSchema.safeParse({ latitude: null, longitude: null }).success).toBe(true);
  });
  it('empty patches are rejected', () => expect(tripUpdateSchema.safeParse({}).success).toBe(false));
  it('phone is normalised so uniqueness cannot be dodged', () => {
    const r = customerCreateSchema.parse({ fullName: 'Ali', phone: '+20 (100) 000-0001' });
    expect(r.phone).toBe('+201000000001');
    expect(customerCreateSchema.safeParse({ fullName: 'Ali', phone: 'call me' }).success).toBe(false);
  });
  it('bus plate normalised', () => expect(busCreateSchema.parse({ plateNumber: ' ab   123 ', capacity: 5 }).plateNumber).toBe('AB 123'));
  it('website: https only, hex colours, known networks, no publish flag, no media ids', () => {
    expect(websiteSettingsUpdateSchema.safeParse({ socialLinks: { facebook: 'https://facebook.com/x' } }).success).toBe(true);
    expect(websiteSettingsUpdateSchema.safeParse({ socialLinks: { facebook: 'javascript:alert(1)' } }).success).toBe(false);
    expect(websiteSettingsUpdateSchema.safeParse({ socialLinks: { facebook: 'http://facebook.com/x' } }).success).toBe(false);
    expect(websiteSettingsUpdateSchema.safeParse({ socialLinks: { evil: 'https://x.com' } }).success).toBe(false);
    expect(websiteSettingsUpdateSchema.safeParse({ primaryColor: 'red; background:url(x)' }).success).toBe(false);
    expect(websiteSettingsUpdateSchema.parse({ primaryColor: '#AABBCC' }).primaryColor).toBe('#aabbcc');
    expect(websiteSettingsUpdateSchema.safeParse({ isPublished: true }).success).toBe(false);
    expect(websiteSettingsUpdateSchema.safeParse({ logoMediaId: ID }).success).toBe(false);
  });
  it('company settings: tz, currency, locale consistency', () => {
    expect(companySettingsUpdateSchema.safeParse({ timezone: 'Africa/Cairo' }).success).toBe(true);
    expect(companySettingsUpdateSchema.safeParse({ timezone: 'Mars/Base' }).success).toBe(false);
    expect(companySettingsUpdateSchema.safeParse({ currency: 'egp' }).success).toBe(false);
    expect(companySettingsUpdateSchema.safeParse({ defaultLocale: 'ar', supportedLocales: ['en'] }).success).toBe(false);
    expect(companySettingsUpdateSchema.safeParse({ maxSeatsPerBooking: 51 }).success).toBe(false);
  });
  it('invite: no company id', () => {
    expect(inviteCreateSchema.safeParse({ email: 'A@B.com', roleKey: 'manager' }).success).toBe(true);
    expect(inviteCreateSchema.safeParse({ email: 'a@b.com', roleKey: 'manager', companyId: COMPANY_B }).success).toBe(false);
    expect(inviteCreateSchema.parse({ email: ' A@B.com ', roleKey: 'manager' }).email).toBe('a@b.com');
  });
});

describe('repositories scope every query to the session company', () => {
  const eqs = (rec: ReturnType<typeof fakeDb>['calls'][number]) => opsOf(rec, 'eq');

  it('reads filter by ctx.companyId (not by any input) and hide soft-deleted rows', async () => {
    const f = fakeDb({ data: [], count: 0 });
    const ctx = tenantCtx(['routes.read'], { db: f.db });
    await routeRepository.list(ctx, { page: 1, pageSize: 10, sort: 'name', dir: 'asc' });
    expect(eqs(f.calls[0]!)).toContainEqual(['company_id', COMPANY_A]);
    expect(opsOf(f.calls[0]!, 'is')).toContainEqual(['deleted_at', null]);
    const f2 = fakeDb({ data: null });
    await customerRepository.get(tenantCtx([], { db: f2.db }), ID);
    expect(eqs(f2.calls[0]!)).toContainEqual(['company_id', COMPANY_A]);
    expect(opsOf(f2.calls[0]!, 'is')).toContainEqual(['deleted_at', null]);
  });

  it('writes stamp company_id from ctx and only whitelisted columns', async () => {
    const f = fakeDb({ data: { id: ID, plate_number: 'A', capacity: 5 } });
    const ctx = tenantCtx(['buses.write'], { db: f.db, companyId: COMPANY_A });
    // simulate a bug upstream that smuggles protected keys past zod
    await busRepository.create(ctx, { plateNumber: 'A-1', capacity: 5, company_id: COMPANY_B, status: 'active', seats_booked: 9 } as never);
    const [row] = opsOf(f.calls[0]!, 'insert')[0]!;
    expect(row).toMatchObject({ company_id: COMPANY_A, plate_number: 'A-1', capacity: 5 });
    expect(row).not.toHaveProperty('seats_booked');
    expect((row as { company_id: string }).company_id).toBe(COMPANY_A);
  });

  it('updates are double-scoped (company + id) and cannot move company_id', async () => {
    const f = fakeDb({ data: { id: ID } });
    await busRepository.update(tenantCtx(['buses.write'], { db: f.db }), ID, { company_id: COMPANY_B, name: 'x' } as never);
    expect(opsOf(f.calls[0]!, 'update')[0]![0]).toEqual({ name: 'x' });
    expect(eqs(f.calls[0]!)).toEqual(expect.arrayContaining([['company_id', COMPANY_A], ['id', ID]]));
  });

  it('trips are created as draft; seats/status/blocked_until are not client-writable', async () => {
    const f = fakeDb({ data: { id: ID, capacity: 10, seats_booked: 0 } });
    await tripRepository.createDraft(tenantCtx(['trips.write'], { db: f.db }), {
      routeId: ID, departureAt: T1, arrivalAt: T2, price: 5, capacity: 10, status: 'scheduled', seats_booked: 3, blocked_until: T2,
    } as never);
    const [row] = opsOf(f.calls[0]!, 'insert')[0]! as [Record<string, unknown>];
    expect(row.company_id).toBe(COMPANY_A);
    // status is no longer a granted column (0011): the row never carries it, the database default 'draft' applies
    for (const k of ['status', 'seats_booked', 'blocked_until', 'buffer_minutes', 'template_id']) expect(row).not.toHaveProperty(k);
  });

  it('search text cannot add or remove filter clauses', async () => {
    const f = fakeDb({ data: [], count: 0 });
    await customerRepository.list(tenantCtx([], { db: f.db }), { page: 1, pageSize: 5, sort: 'created_at', dir: 'desc', q: 'x),company_id.eq.other,(y' });
    const [or] = opsOf(f.calls[0]!, 'or')[0]! as [string];
    expect(or.split(',').length).toBe(4); // exactly the 4 whitelisted columns
    expect(or).not.toContain('company_id');
  });

  it('createInvite never passes a company id to the RPC', async () => {
    const f = fakeDb({ data: [{ invite_id: ID, token: 'a'.repeat(64), expires_at: T2 }] });
    const out = await userRepository.createInvite(tenantCtx(['users.write'], { db: f.db }), { email: 'a@b.com', roleKey: 'manager' });
    const args = opsOf(f.calls[0]!, 'args')[0]![0] as Record<string, unknown>;
    expect(args).toEqual({ p_email: 'a@b.com', p_role_key: 'manager', p_company_id: null });
    expect(out.inviteId).toBe(ID);
  });

  it('db errors surface as AppError, never raw', async () => {
    const f = fakeDb({ error: { code: '23505', message: 'duplicate key value violates unique constraint "buses_company_id_plate_number_key"' } });
    await expect(busRepository.create(tenantCtx(['buses.write'], { db: f.db }), { plateNumber: 'A', capacity: 1 } as never)).rejects.toMatchObject({
      code: 'conflict',
      detail: 'plate_number_taken',
    });
  });
});

describe('pure helpers', () => {
  const ent = toEntitlements([
    { key: 'max_buses', int_value: 5, bool_value: null },
    { key: 'max_users', int_value: null, bool_value: null },
    { key: 'feature_analytics', int_value: null, bool_value: false },
    { key: 'feature_custom_domain', int_value: null, bool_value: true },
  ]);
  it('limits, unlimited, missing = 0, flags', () => {
    expect(limitFor(ent, 'max_buses')).toEqual({ unlimited: false, max: 5 });
    expect(limitFor(ent, 'max_users')).toEqual({ unlimited: true });
    expect(limitFor(ent, 'max_routes')).toEqual({ unlimited: false, max: 0 });
    expect(isWithinLimit(ent, 'max_buses', 4)).toBe(true);
    expect(isWithinLimit(ent, 'max_buses', 5)).toBe(false);
    expect(isWithinLimit(ent, 'max_users', 10_000)).toBe(true);
    expect(isFeatureEnabled(ent, 'feature_analytics')).toBe(false);
    expect(isFeatureEnabled(ent, 'feature_custom_domain')).toBe(true);
    expect(isFeatureEnabled(ent, 'nope')).toBe(false);
  });
  it('lapsed pending invites report as expired', () => {
    const row = { id: ID, email: 'a@b.c', status: 'pending' as const, expires_at: '2020-01-01T00:00:00Z', created_at: '2019-01-01T00:00:00Z', role: null };
    expect(toInvite(new Date('2026-01-01'))(row).status).toBe('expired');
    expect(toInvite(new Date('2019-06-01'))(row).status).toBe('pending');
  });
});

describe('trip transitions: authorize -> validate -> repository', () => {
  const tripId = '00000000-0000-4000-8000-000000000601';
  it('needs trips.write and validates the target status', async () => {
    const { makeTripService } = await import('./trips/service');
    const repo = { transition: vi.fn().mockResolvedValue({}), deleteDraft: vi.fn() } as never;
    const svc = makeTripService(repo);
    await expect(svc.transition(tenantCtx(['trips.read']), { tripId, to: 'scheduled' })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(svc.transition(tenantCtx(['trips.write']), { tripId, to: 'flying' })).rejects.toMatchObject({ code: 'validation' });
    await expect(svc.transition(tenantCtx(['trips.write']), { tripId, to: 'scheduled', companyId: 'x' })).rejects.toMatchObject({ code: 'validation' });
    await expect(svc.deleteDraft(tenantCtx(['trips.read']), tripId)).rejects.toMatchObject({ code: 'forbidden' });
    expect((repo as { transition: ReturnType<typeof vi.fn> }).transition).not.toHaveBeenCalled();
    await svc.transition(tenantCtx(['trips.write']), { tripId, to: 'scheduled' });
    expect((repo as { transition: ReturnType<typeof vi.fn> }).transition).toHaveBeenCalledTimes(1);
  });
});
