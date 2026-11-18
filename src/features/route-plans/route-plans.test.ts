import { describe, expect, it, vi } from 'vitest';
import { AppError } from '@/lib/errors';
import { tenantCtx } from '@/test/helpers';
import { makeRoutePlanService } from './service';
import type { RoutePlanRepository } from './repository';
import { decisionSchema, planCreateSchema, planUpdateSchema } from './schema';
import { toRoutePlan, toSubscription } from './types';

const ID = '00000000-0000-4000-8000-000000000201';
const base = { routeId: ID, name: 'Monthly', price: 900 };

const repo = () => ({ listPlans: vi.fn(async () => []), createPlan: vi.fn(async () => ID), updatePlan: vi.fn(), archivePlan: vi.fn(), listSubscriptions: vi.fn(async () => []), decide: vi.fn(), futureBookings: vi.fn(async () => []), revoke: vi.fn() }) as unknown as RoutePlanRepository & Record<string, ReturnType<typeof vi.fn>>;

describe('planCreateSchema (mirrors route_plans_validity_shape)', () => {
  it('accepts a duration plan and a range plan', () => {
    expect(planCreateSchema.safeParse({ ...base, validityType: 'duration', durationMonths: 1 }).success).toBe(true);
    expect(planCreateSchema.safeParse({ ...base, validityType: 'range', startsOn: '2026-12-01', endsOn: '2027-03-01' }).success).toBe(true);
  });
  it('refuses a duration plan without months or with dates', () => {
    expect(planCreateSchema.safeParse({ ...base, validityType: 'duration' }).success).toBe(false);
    expect(planCreateSchema.safeParse({ ...base, validityType: 'duration', durationMonths: 1, startsOn: '2026-12-01' }).success).toBe(false);
  });
  it('refuses a range plan without both dates, with months, or ending before it starts', () => {
    expect(planCreateSchema.safeParse({ ...base, validityType: 'range', startsOn: '2026-12-01' }).success).toBe(false);
    expect(planCreateSchema.safeParse({ ...base, validityType: 'range', durationMonths: 1, startsOn: '2026-12-01', endsOn: '2027-01-01' }).success).toBe(false);
    expect(planCreateSchema.safeParse({ ...base, validityType: 'range', startsOn: '2027-01-01', endsOn: '2026-12-01' }).success).toBe(false);
  });
  it('bounds months, price and rejects a company id', () => {
    expect(planCreateSchema.safeParse({ ...base, validityType: 'duration', durationMonths: 0 }).success).toBe(false);
    expect(planCreateSchema.safeParse({ ...base, validityType: 'duration', durationMonths: 25 }).success).toBe(false);
    expect(planCreateSchema.safeParse({ ...base, price: -1, validityType: 'duration', durationMonths: 1 }).success).toBe(false);
    expect(planCreateSchema.safeParse({ ...base, price: 10.505, validityType: 'duration', durationMonths: 1 }).success).toBe(false);
    expect(planCreateSchema.safeParse({ ...base, validityType: 'duration', durationMonths: 1, companyId: ID }).success).toBe(false);
  });
});

describe('update and decision schemas', () => {
  it('update cannot touch validity or the route', () => {
    expect(planUpdateSchema.safeParse({ name: 'X1', price: 5, isActive: true }).success).toBe(true);
    expect(planUpdateSchema.safeParse({ name: 'X1', price: 5, isActive: true, validityType: 'range' }).success).toBe(false);
    expect(planUpdateSchema.safeParse({ name: 'X1', price: 5, isActive: true, routeId: ID }).success).toBe(false);
  });
  it('decision needs a boolean and a short note', () => {
    expect(decisionSchema.safeParse({ approve: true }).success).toBe(true);
    expect(decisionSchema.safeParse({ approve: 'yes' }).success).toBe(false);
    expect(decisionSchema.safeParse({ approve: false, note: 'x'.repeat(501) }).success).toBe(false);
  });
});

describe('route plan service authorization', () => {
  it('plans: read needs routes.read, write needs routes.write, nothing reaches the repository without it', async () => {
    const r = repo();
    const s = makeRoutePlanService(r);
    await expect(s.listPlans(tenantCtx(['bookings.read']))).rejects.toBeInstanceOf(AppError);
    await expect(s.createPlan(tenantCtx(['routes.read']), { ...base, validityType: 'duration', durationMonths: 1 })).rejects.toBeInstanceOf(AppError);
    await expect(s.updatePlan(tenantCtx(['routes.read']), ID, { name: 'X1', price: 1, isActive: true })).rejects.toBeInstanceOf(AppError);
    await expect(s.archivePlan(tenantCtx(['routes.read']), ID)).rejects.toBeInstanceOf(AppError);
    expect(r.listPlans).not.toHaveBeenCalled();
    expect(r.createPlan).not.toHaveBeenCalled();
    await expect(s.createPlan(tenantCtx(['routes.write']), { ...base, validityType: 'duration', durationMonths: 1 })).resolves.toBe(ID);
    expect(r.createPlan).toHaveBeenCalledTimes(1);
  });
  it('inbox: read needs bookings.read, deciding needs bookings.write (operations cannot decide)', async () => {
    const r = repo();
    const s = makeRoutePlanService(r);
    await expect(s.listSubscriptions(tenantCtx(['routes.read']))).rejects.toBeInstanceOf(AppError);
    await expect(s.decide(tenantCtx(['bookings.read']), ID, { approve: true })).rejects.toBeInstanceOf(AppError);
    expect(r.decide).not.toHaveBeenCalled();
    await s.decide(tenantCtx(['bookings.write']), ID, { approve: true, note: 'ok' });
    expect(r.decide).toHaveBeenCalledTimes(1);
  });
  it('validates before the repository: a bad decision or id never reaches it', async () => {
    const r = repo();
    const s = makeRoutePlanService(r);
    await expect(s.decide(tenantCtx(['bookings.write']), 'nope', { approve: true })).rejects.toBeInstanceOf(AppError);
    await expect(s.decide(tenantCtx(['bookings.write']), ID, { approve: 'x' })).rejects.toBeInstanceOf(AppError);
    expect(r.decide).not.toHaveBeenCalled();
  });
});

describe('revoke (Phase E1)', () => {
  const U1 = '00000000-0000-4000-8000-000000000301';
  it('needs bookings.write for both the warning list and the revoke', async () => {
    const r = repo(); const s = makeRoutePlanService(r);
    await expect(s.futureBookings(tenantCtx(['bookings.read']), ID)).rejects.toBeInstanceOf(AppError);
    await expect(s.revoke(tenantCtx(['bookings.read']), ID, { cancelBookingIds: [] })).rejects.toBeInstanceOf(AppError);
    expect(r.futureBookings).not.toHaveBeenCalled(); expect(r.revoke).not.toHaveBeenCalled();
    await s.revoke(tenantCtx(['bookings.write']), ID, { cancelBookingIds: [U1], reason: 'left' });
    expect(r.revoke).toHaveBeenCalledWith(expect.anything(), ID, { cancelBookingIds: [U1], reason: 'left' });
  });
  it('validates ids and rejects extra keys (no company id from the client)', async () => {
    const r = repo(); const s = makeRoutePlanService(r); const c = tenantCtx(['bookings.write']);
    await expect(s.revoke(c, ID, { cancelBookingIds: ['nope'] })).rejects.toBeInstanceOf(AppError);
    await expect(s.revoke(c, ID, { cancelBookingIds: [], companyId: ID })).rejects.toBeInstanceOf(AppError);
    await expect(s.revoke(c, ID, { cancelBookingIds: Array(201).fill(U1) })).rejects.toBeInstanceOf(AppError);
    await expect(s.revoke(c, 'bad', { cancelBookingIds: [] })).rejects.toBeInstanceOf(AppError);
    expect(r.revoke).not.toHaveBeenCalled();
  });
});

describe('row mapping', () => {
  it('maps a plan with an embedded route (object or array) and numeric price strings', () => {
    const row = { id: ID, route_id: ID, name: 'M', price: '900.00', validity_type: 'duration' as const, duration_months: 1, starts_on: null, ends_on: null, is_active: true, created_at: 'x' };
    expect(toRoutePlan({ ...row, route: { name: 'Cairo to Galala' } }).routeName).toBe('Cairo to Galala');
    expect(toRoutePlan({ ...row, route: [{ name: 'A' }] }).routeName).toBe('A');
    expect(toRoutePlan({ ...row, route: null })).toMatchObject({ routeName: '', price: 900 });
  });
  it('maps a subscription and tolerates a hidden plan name', () => {
    const s = toSubscription({ id: ID, plan_id: ID, plan_name: null, route_name: null, masar_id: 'MSR-AAAA-BBBB', member_name: 'N', member_phone: '+201', status: 'pending', price: '5', currency: 'EGP', valid_from: null, valid_to: null, requested_at: 'x', decided_at: null, decision_note: null });
    expect(s).toMatchObject({ planName: '', routeName: '', price: 5, status: 'pending' });
  });
});
