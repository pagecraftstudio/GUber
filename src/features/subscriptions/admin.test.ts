import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fakeDb, opsOf, platformCtx } from '@/test/helpers';
import { adminSubscriptionListRawSchema } from './admin-output';
import { subscriptionRepository, type SubscriptionRepository } from './repository';
import { assignSubscriptionSchema, setSubscriptionPeriodSchema, setSubscriptionStatusSchema, subscriptionListSchema } from './schema';
import { makeSubscriptionService } from './service';

const ID = '00000000-0000-4000-8000-000000000101';
const SUB = '00000000-0000-4000-8000-000000000401';
const ASSIGN = { planCode: 'starter', billingInterval: 'monthly', status: 'active', periodDays: '30' };

describe('subscription schemas', () => {
  it('assign: coerces days, accepts only trialing|active and monthly|yearly', () => {
    expect(assignSubscriptionSchema.parse(ASSIGN)).toMatchObject({ periodDays: 30, status: 'active' });
    for (const bad of [{ status: 'past_due' }, { status: 'expired' }, { billingInterval: 'weekly' }, { periodDays: '0' }, { periodDays: '1831' }, { periodDays: '' }, { planCode: '' }]) {
      expect(assignSubscriptionSchema.safeParse({ ...ASSIGN, ...bad }).success).toBe(false);
    }
  });
  it('assign is strict: no company id, role or period end can be smuggled in', () => {
    for (const k of ['companyId', 'role', 'periodEnd', 'planId', 'currentPeriodEnd']) {
      expect(assignSubscriptionSchema.safeParse({ ...ASSIGN, [k]: 'x' }).success).toBe(false);
    }
  });
  it('status: cancelled and expired need a reason of 3+ characters; trialing is never a target', () => {
    for (const status of ['cancelled', 'expired']) {
      expect(setSubscriptionStatusSchema.safeParse({ status }).success).toBe(false);
      expect(setSubscriptionStatusSchema.safeParse({ status, reason: 'ab' }).success).toBe(false);
      expect(setSubscriptionStatusSchema.parse({ status, reason: ' left ' }).reason).toBe('left');
    }
    expect(setSubscriptionStatusSchema.parse({ status: 'active', reason: '' })).toEqual({ status: 'active', reason: null });
    expect(setSubscriptionStatusSchema.safeParse({ status: 'trialing' }).success).toBe(false);
    expect(setSubscriptionStatusSchema.safeParse({ status: 'cancelled', reason: 'x'.repeat(501) }).success).toBe(false);
  });
  it('period: 1..1830 days, base defaults to now, only now|current_end', () => {
    expect(setSubscriptionPeriodSchema.parse({ days: '5' })).toEqual({ days: 5, from: 'now' });
    expect(setSubscriptionPeriodSchema.parse({ days: 5, from: 'current_end' }).from).toBe('current_end');
    for (const bad of [{ days: 0 }, { days: 1831 }, { days: 5, from: 'yesterday' }, { days: 5, extra: 1 }]) {
      expect(setSubscriptionPeriodSchema.safeParse(bad).success).toBe(false);
    }
  });
  it('list: defaults, bounded page size, only known states and sorts', () => {
    expect(subscriptionListSchema.parse({})).toMatchObject({ page: 1, pageSize: 25, sort: 'period_end', dir: 'asc' });
    for (const bad of [{ state: 'bogus' }, { sort: 'id' }, { dir: 'up' }, { pageSize: 101 }, { page: 0 }]) {
      expect(subscriptionListSchema.safeParse(bad).success).toBe(false);
    }
  });
});

const ITEM = {
  id: SUB, company_id: ID, company_name: 'A', company_slug: 'a', company_status: 'active', plan_code: 'starter', plan_name: 'Starter',
  status: 'active', state: 'live', billing_interval: 'monthly', current_period_start: '2030-01-01T00:00:00Z',
  current_period_end: '2030-02-01T00:00:00Z', cancel_at_period_end: false, created_at: '2030-01-01T00:00:00Z',
};
const LIST = { items: [ITEM], total: 1, page: 1, page_size: 25 };

describe('subscription admin output', () => {
  it('parses a list and fails closed on drift', () => {
    expect(adminSubscriptionListRawSchema.safeParse(LIST).success).toBe(true);
    expect(adminSubscriptionListRawSchema.safeParse({ ...LIST, items: [{ ...ITEM, state: 'paused' }] }).success).toBe(false);
    expect(adminSubscriptionListRawSchema.safeParse({ ...LIST, total: -1 }).success).toBe(false);
    expect(adminSubscriptionListRawSchema.safeParse({ ...LIST, items: [{ ...ITEM, billing_interval: 'weekly' }] }).success).toBe(false);
  });
});

describe('subscription admin repository', () => {
  it('adminList sends only whitelisted p_* arguments and maps the page', async () => {
    const { db, calls } = fakeDb({ data: LIST });
    const page = await subscriptionRepository.adminList(platformCtx('support', db), { q: 'a', state: 'stale', sort: 'created_at', dir: 'desc', page: 2, pageSize: 10 });
    expect(calls[0]!.target).toBe('rpc:admin_list_subscriptions');
    expect(opsOf(calls[0]!, 'args')[0]![0]).toEqual({ p_q: 'a', p_state: 'stale', p_sort: 'created_at', p_dir: 'desc', p_page: 2, p_page_size: 10 });
    expect(page.items[0]).toMatchObject({ companyName: 'A', state: 'live', planCode: 'starter' });
  });
  it('adminAssign sends no role, actor or end date: the DB computes the period', async () => {
    const { db, calls } = fakeDb({ data: { subscription_id: SUB } });
    const r = await subscriptionRepository.adminAssign(platformCtx('billing', db), ID, assignSubscriptionSchema.parse(ASSIGN));
    expect(r).toEqual({ subscriptionId: SUB });
    expect(opsOf(calls[0]!, 'args')[0]![0]).toEqual({ p_company: ID, p_plan_code: 'starter', p_billing_interval: 'monthly', p_status: 'active', p_period_days: 30 });
  });
  it('adminSetStatus / adminSetPeriod / adminExpireStale call the matching RPCs', async () => {
    let f = fakeDb({ data: { status: 'cancelled', previous_status: 'active' } });
    expect(await subscriptionRepository.adminSetStatus(platformCtx('billing', f.db), SUB, { status: 'cancelled', reason: 'left' })).toEqual({ status: 'cancelled', previousStatus: 'active' });
    expect(opsOf(f.calls[0]!, 'args')[0]![0]).toEqual({ p_subscription: SUB, p_status: 'cancelled', p_reason: 'left' });
    f = fakeDb({ data: { period_end: '2031-01-01T00:00:00Z' } });
    expect(await subscriptionRepository.adminSetPeriod(platformCtx('billing', f.db), SUB, { days: 5, from: 'now' })).toEqual({ periodEnd: '2031-01-01T00:00:00Z' });
    expect(opsOf(f.calls[0]!, 'args')[0]![0]).toEqual({ p_subscription: SUB, p_days: 5, p_from: 'now' });
    f = fakeDb({ data: { expired: 3 } });
    expect(await subscriptionRepository.adminExpireStale(platformCtx('billing', f.db))).toEqual({ expired: 3 });
    expect(f.calls[0]!.target).toBe('rpc:admin_expire_subscriptions');
  });
  it('a malformed RPC result fails closed as internal', async () => {
    await expect(subscriptionRepository.adminExpireStale(platformCtx('billing', fakeDb({ data: { expired: 'many' } }).db))).rejects.toMatchObject({ code: 'internal' });
    await expect(subscriptionRepository.adminAssign(platformCtx('billing', fakeDb({ data: {} }).db), ID, assignSubscriptionSchema.parse(ASSIGN))).rejects.toMatchObject({ code: 'internal' });
  });
  it.each([
    ['42501', 'forbidden'],
    ['P0002', 'not_found'],
    ['23514', 'business_rule'],
    ['22023', 'validation'],
  ])('maps %s to %s', async (code, want) => {
    const { db } = fakeDb({ error: { code, message: 'x' } });
    await expect(subscriptionRepository.adminSetPeriod(platformCtx('billing', db), SUB, { days: 5, from: 'now' })).rejects.toMatchObject({ code: want });
  });
});

const spyRepo = () => ({
  currentForTenant: vi.fn(), currentForCompany: vi.fn(), listPlans: vi.fn(),
  adminList: vi.fn().mockResolvedValue('list'),
  adminAssign: vi.fn().mockResolvedValue('assigned'),
  adminSetStatus: vi.fn().mockResolvedValue('status'),
  adminSetPeriod: vi.fn().mockResolvedValue('period'),
  adminExpireStale: vi.fn().mockResolvedValue('expired'),
});
type Svc = ReturnType<typeof makeSubscriptionService>;
type Ctx = ReturnType<typeof platformCtx>;

describe('subscription admin service: authorize -> validate -> repository', () => {
  const writers: [string, (s: Svc, c: Ctx) => Promise<unknown>][] = [
    ['assign', (s, c) => s.assign(c, ID, ASSIGN)],
    ['setStatus', (s, c) => s.setStatus(c, SUB, { status: 'active' })],
    ['setPeriod', (s, c) => s.setPeriod(c, SUB, { days: 5 })],
    ['expireStale', (s, c) => s.expireStale(c)],
  ];
  it.each(writers)('%s: super_admin and billing may; support and non-staff never reach the repository', async (_n, run) => {
    for (const role of ['super_admin', 'billing'] as const) {
      const repo = spyRepo();
      await expect(run(makeSubscriptionService(repo as unknown as SubscriptionRepository), platformCtx(role))).resolves.toBeDefined();
    }
    for (const role of ['support', null] as const) {
      const repo = spyRepo();
      await expect(run(makeSubscriptionService(repo as unknown as SubscriptionRepository), platformCtx(role))).rejects.toMatchObject({ code: 'forbidden' });
      for (const k of ['adminAssign', 'adminSetStatus', 'adminSetPeriod', 'adminExpireStale'] as const) expect(repo[k]).not.toHaveBeenCalled();
    }
  });
  it('a forbidden caller gets forbidden even with garbage input (authorize before validate)', async () => {
    const svc = makeSubscriptionService(spyRepo() as unknown as SubscriptionRepository);
    await expect(svc.assign(platformCtx('support'), ID, { garbage: true })).rejects.toMatchObject({ code: 'forbidden' });
  });
  it('an allowed caller with bad input gets validation and the repository is untouched', async () => {
    const repo = spyRepo();
    const svc = makeSubscriptionService(repo as unknown as SubscriptionRepository);
    await expect(svc.assign(platformCtx('billing'), ID, { ...ASSIGN, periodDays: 0 })).rejects.toMatchObject({ code: 'validation' });
    await expect(svc.assign(platformCtx('billing'), 'not-a-uuid', ASSIGN)).rejects.toMatchObject({ code: 'validation' });
    await expect(svc.setStatus(platformCtx('billing'), SUB, { status: 'cancelled' })).rejects.toMatchObject({ code: 'validation' });
    expect(repo.adminAssign).not.toHaveBeenCalled();
    expect(repo.adminSetStatus).not.toHaveBeenCalled();
  });
  it.each(['super_admin', 'support', 'billing'] as const)('%s may list; non-staff may not', async (role) => {
    const svc = makeSubscriptionService(spyRepo() as unknown as SubscriptionRepository);
    await expect(svc.adminList(platformCtx(role), {})).resolves.toBe('list');
    await expect(svc.adminList(platformCtx(null), {})).rejects.toMatchObject({ code: 'forbidden' });
  });
});

describe('subscription server actions (structural guard)', () => {
  const src = readFileSync(join(__dirname, '../admin/actions.ts'), 'utf8');
  const names = ['assignSubscriptionAction', 'setSubscriptionStatusAction', 'setSubscriptionPeriodAction', 'expireStaleSubscriptionsAction'];
  it.each(names)('%s runs the super_admin+billing guard before its try block', (name) => {
    const body = src.slice(src.indexOf(`function ${name}(`)).split(/\nexport async function /)[0]!;
    const guard = body.indexOf('getPlatformServiceContext(SUB_WRITERS)');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(body.indexOf('try {'));
  });
  it('SUB_WRITERS is exactly super_admin and billing', () => expect(src).toMatch(/SUB_WRITERS = ROLE_SETS\.subscriptionWriters/));
});
