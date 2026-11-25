import { describe, expect, it, vi } from 'vitest';
import { fakeDb, opsOf, platformCtx } from '@/test/helpers';
import { planOverviewRawSchema, toPlanOverview } from './output';
import { planRepository, type PlanRepository } from './repository';
import { createDefinitionSchema, createPlanSchema, setEntitlementSchema, setPlanActiveSchema, updatePlanSchema } from './schema';
import { makePlanService } from './service';

const ID = '00000000-0000-4000-8000-000000000501';
const NEW = { code: 'gold_1', name: ' Gold ', description: '', priceMonthly: '250.5', priceYearly: '', currency: 'egp', trialDays: '7', isPublic: 'no', sortOrder: '20' };

describe('plan schemas', () => {
  it('create: coerces form strings, trims, upper-cases the currency, and "" yearly means none (never 0)', () => {
    expect(createPlanSchema.parse(NEW)).toEqual({ code: 'gold_1', name: 'Gold', description: null, priceMonthly: 250.5, priceYearly: null, currency: 'EGP', trialDays: 7, isPublic: false, sortOrder: 20 });
  });
  it('create: refuses bad code, negative or fractional-cent price, bad currency, long trial, unknown public value', () => {
    for (const bad of [{ code: 'Gold' }, { code: 'a' }, { code: '1gold' }, { code: 'gold plan' }, { priceMonthly: '-1' }, { priceMonthly: '1.001' }, { priceMonthly: '' }, { priceMonthly: '  ' }, { trialDays: '' }, { sortOrder: '' }, { currency: 'EG' }, { currency: 'EGPP' }, { trialDays: '366' }, { trialDays: '1.5' }, { isPublic: 'maybe' }, { sortOrder: '1001' }, { name: '' }, { name: 'x'.repeat(81) }]) {
      expect(createPlanSchema.safeParse({ ...NEW, ...bad }).success, JSON.stringify(bad)).toBe(false);
    }
  });
  it('update is strict: the code, ids and any extra key are refused (the code is immutable)', () => {
    const { code: _c, ...fields } = NEW;
    expect(updatePlanSchema.safeParse(fields).success).toBe(true);
    for (const k of ['code', 'id', 'is_active', 'isActive', 'planId']) expect(updatePlanSchema.safeParse({ ...fields, [k]: 'x' }).success, k).toBe(false);
  });
  it('archive needs a reason of 3+ characters; restore does not', () => {
    expect(setPlanActiveSchema.safeParse({ active: 'false' }).success).toBe(false);
    expect(setPlanActiveSchema.safeParse({ active: 'false', reason: 'ab' }).success).toBe(false);
    expect(setPlanActiveSchema.parse({ active: 'false', reason: ' retired ' })).toEqual({ active: false, reason: 'retired' });
    expect(setPlanActiveSchema.parse({ active: 'true', reason: '' })).toEqual({ active: true, reason: null });
    expect(setPlanActiveSchema.safeParse({ active: 'yes' }).success).toBe(false);
  });
  it('entitlement value: number, unlimited, on, off; anything else is refused with a stable code', () => {
    expect(setEntitlementSchema.parse({ key: 'max_buses', value: ' 12 ' })).toEqual({ key: 'max_buses', int: 12, bool: null, unlimited: false });
    expect(setEntitlementSchema.parse({ key: 'max_buses', value: 'Unlimited' })).toEqual({ key: 'max_buses', int: null, bool: null, unlimited: true });
    expect(setEntitlementSchema.parse({ key: 'feature_analytics', value: 'ON' })).toEqual({ key: 'feature_analytics', int: null, bool: true, unlimited: false });
    expect(setEntitlementSchema.parse({ key: 'feature_analytics', value: 'off' })).toMatchObject({ bool: false });
    for (const value of ['', '-1', '1.5', 'many', '1e3', '9999999999', '0x10']) expect(setEntitlementSchema.safeParse({ key: 'max_buses', value }).success, value).toBe(false);
    expect(setEntitlementSchema.safeParse({ key: 'buses', value: '1' }).success).toBe(false);
    expect(setEntitlementSchema.safeParse({ key: 'max_buses', value: '1', planId: 'x' }).success).toBe(false);
  });
  it('definition: key must start with max_ or feature_; type is integer|boolean', () => {
    expect(createDefinitionSchema.parse({ key: 'max_vehicles', valueType: 'integer', description: '' })).toEqual({ key: 'max_vehicles', valueType: 'integer', description: null });
    for (const bad of [{ key: 'vehicles' }, { key: 'MAX_X1' }, { key: 'max_' }, { key: 'feature-x' }, { valueType: 'text' }]) {
      expect(createDefinitionSchema.safeParse({ key: 'max_vehicles', valueType: 'integer', ...bad }).success, JSON.stringify(bad)).toBe(false);
    }
  });
});

describe('plan repository -> RPC arguments', () => {
  it('create maps every field and returns the id', async () => {
    const f = fakeDb({ data: { plan_id: ID } });
    expect(await planRepository.create(platformCtx('super_admin', f.db), createPlanSchema.parse(NEW))).toEqual({ planId: ID });
    expect(f.calls[0]!.target).toBe('rpc:admin_create_plan');
    expect(opsOf(f.calls[0]!, 'args')[0]![0]).toEqual({ p_code: 'gold_1', p_name: 'Gold', p_description: null, p_price_monthly: 250.5, p_price_yearly: null, p_currency: 'EGP', p_trial_days: 7, p_is_public: false, p_sort_order: 20 });
  });
  it('update sends the editable fields only (never a code) and a null clears the yearly price', async () => {
    const f = fakeDb({ data: { plan_id: ID } });
    const { code: _c, ...fields } = NEW;
    await planRepository.update(platformCtx('super_admin', f.db), ID, updatePlanSchema.parse(fields));
    const args = opsOf(f.calls[0]!, 'args')[0]![0] as { p_plan: string; p_patch: Record<string, unknown> };
    expect(args.p_plan).toBe(ID);
    expect(Object.keys(args.p_patch).sort()).toEqual(['currency', 'description', 'is_public', 'name', 'price_monthly', 'price_yearly', 'sort_order', 'trial_days']);
    expect(args.p_patch.price_yearly).toBeNull();
  });
  it('setEntitlement maps number / unlimited / flag onto the three RPC arguments', async () => {
    const f = fakeDb({ data: { live_subscribers: 2 } });
    const ctx = platformCtx('super_admin', f.db);
    expect(await planRepository.setEntitlement(ctx, ID, setEntitlementSchema.parse({ key: 'max_buses', value: '12' }))).toEqual({ liveSubscribers: 2 });
    await planRepository.setEntitlement(ctx, ID, setEntitlementSchema.parse({ key: 'max_buses', value: 'unlimited' }));
    await planRepository.setEntitlement(ctx, ID, setEntitlementSchema.parse({ key: 'feature_analytics', value: 'on' }));
    expect(f.calls.map((c) => opsOf(c, 'args')[0]![0])).toEqual([
      { p_plan: ID, p_key: 'max_buses', p_int: 12, p_bool: null, p_unlimited: false },
      { p_plan: ID, p_key: 'max_buses', p_int: null, p_bool: null, p_unlimited: true },
      { p_plan: ID, p_key: 'feature_analytics', p_int: null, p_bool: true, p_unlimited: false },
    ]);
  });
  it('setActive and createDefinition call their RPCs', async () => {
    let f = fakeDb({ data: { changed: true, live_subscribers: 3 } });
    expect(await planRepository.setActive(platformCtx('super_admin', f.db), ID, { active: false, reason: 'retired' })).toEqual({ changed: true, liveSubscribers: 3 });
    expect(opsOf(f.calls[0]!, 'args')[0]![0]).toEqual({ p_plan: ID, p_active: false, p_reason: 'retired' });
    f = fakeDb({ data: { key: 'max_vehicles' } });
    expect(await planRepository.createDefinition(platformCtx('super_admin', f.db), { key: 'max_vehicles', valueType: 'integer', description: null })).toEqual({ key: 'max_vehicles' });
    expect(opsOf(f.calls[0]!, 'args')[0]![0]).toEqual({ p_key: 'max_vehicles', p_value_type: 'integer', p_description: null });
  });
  it('a malformed RPC result fails closed as internal', async () => {
    const ctx = (d: unknown) => platformCtx('super_admin', fakeDb({ data: d }).db);
    await expect(planRepository.create(ctx({}), createPlanSchema.parse(NEW))).rejects.toMatchObject({ code: 'internal' });
    await expect(planRepository.setEntitlement(ctx({}), ID, setEntitlementSchema.parse({ key: 'max_buses', value: '1' }))).rejects.toMatchObject({ code: 'internal' });
    await expect(planRepository.overview(ctx({ plans: 'x', definitions: [] }))).rejects.toMatchObject({ code: 'internal' });
  });
  it.each([['42501', 'forbidden'], ['P0002', 'not_found'], ['23514', 'business_rule'], ['22023', 'validation']])('maps %s to %s', async (code, want) => {
    const { db } = fakeDb({ error: { code, message: 'x' } });
    await expect(planRepository.setActive(platformCtx('super_admin', db), ID, { active: true, reason: null })).rejects.toMatchObject({ code: want });
  });
});

describe('plan overview output', () => {
  const RAW = {
    plans: [{ id: ID, code: 'starter', name: 'Starter', description: null, price_monthly: 100, price_yearly: null, currency: 'EGP', trial_days: 14, is_public: false, is_active: true, sort_order: 1, live_subscribers: 2, total_subscriptions: 5,
      entitlements: [{ key: 'max_buses', int_value: null, bool_value: null }, { key: 'feature_analytics', int_value: null, bool_value: true }, { key: 'max_users', int_value: 3, bool_value: null }] }],
    definitions: [{ key: 'max_buses', value_type: 'integer', description: 'Buses' }],
  };
  it('maps unlimited (NULL int), flags and limits', () => {
    const o = toPlanOverview(planOverviewRawSchema.parse(RAW));
    expect(o.plans[0]!.entitlements).toEqual([{ key: 'max_buses', kind: 'limit', limit: null }, { key: 'feature_analytics', kind: 'flag', enabled: true }, { key: 'max_users', kind: 'limit', limit: 3 }]);
    expect(o.plans[0]).toMatchObject({ liveSubscribers: 2, totalSubscriptions: 5, priceYearly: null });
  });
  it('fails closed on drift (unknown key, wrong type)', () => {
    expect(planOverviewRawSchema.safeParse({ ...RAW, extra: 1 }).success).toBe(false);
    expect(planOverviewRawSchema.safeParse({ ...RAW, definitions: [{ key: 'x', value_type: 'text', description: null }] }).success).toBe(false);
  });
});

const spy = () => ({
  overview: vi.fn().mockResolvedValue('o'), create: vi.fn().mockResolvedValue('c'), update: vi.fn().mockResolvedValue('u'),
  setActive: vi.fn().mockResolvedValue('a'), setEntitlement: vi.fn().mockResolvedValue('e'), createDefinition: vi.fn().mockResolvedValue('d'),
});
type Svc = ReturnType<typeof makePlanService>; type Ctx = ReturnType<typeof platformCtx>;

describe('plan service: authorize -> validate -> repository', () => {
  const writers: [string, (s: Svc, c: Ctx) => Promise<unknown>][] = [
    ['create', (s, c) => s.create(c, NEW)],
    ['update', (s, c) => { const { code: _c, ...f } = NEW; return s.update(c, ID, f); }],
    ['setActive', (s, c) => s.setActive(c, ID, { active: 'true' })],
    ['setEntitlement', (s, c) => s.setEntitlement(c, ID, { key: 'max_buses', value: '3' })],
    ['createDefinition', (s, c) => s.createDefinition(c, { key: 'max_x1', valueType: 'integer' })],
  ];
  it.each(writers)('%s: super_admin only; billing, support and non-staff never reach the repository', async (_n, run) => {
    await expect(run(makePlanService(spy() as unknown as PlanRepository), platformCtx('super_admin'))).resolves.toBeDefined();
    for (const role of ['billing', 'support', null] as const) {
      const repo = spy();
      await expect(run(makePlanService(repo as unknown as PlanRepository), platformCtx(role))).rejects.toMatchObject({ code: 'forbidden' });
      for (const k of ['create', 'update', 'setActive', 'setEntitlement', 'createDefinition'] as const) expect(repo[k]).not.toHaveBeenCalled();
    }
  });
  it('every platform role may read the overview; a non-staff caller may not', async () => {
    for (const role of ['super_admin', 'billing', 'support'] as const) await expect(makePlanService(spy() as unknown as PlanRepository).overview(platformCtx(role))).resolves.toBe('o');
    await expect(makePlanService(spy() as unknown as PlanRepository).overview(platformCtx(null))).rejects.toMatchObject({ code: 'forbidden' });
  });
  it('forbidden beats validation: garbage from support is forbidden, garbage from super_admin is validation', async () => {
    const svc = makePlanService(spy() as unknown as PlanRepository);
    await expect(svc.create(platformCtx('support'), { garbage: true })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(svc.create(platformCtx('super_admin'), { garbage: true })).rejects.toMatchObject({ code: 'validation' });
    await expect(svc.update(platformCtx('super_admin'), 'not-a-uuid', {})).rejects.toMatchObject({ code: 'validation' });
  });
});
