import { describe, expect, it, vi } from 'vitest';
import { AppError } from '@/lib/errors';
import { fakeDb, platformCtx } from '@/test/helpers';
import { navFor, isNavActive, ADMIN_NAV } from './nav';
import { platformOverviewRepository } from './repository';
import { overviewRawSchema, toPlatformOverview } from './schema';
import { makePlatformOverviewService } from './service';

const RAW = {
  generated_at: '2030-01-01T00:00:00Z',
  companies: { total: 3, trial: 1, active: 1, suspended: 1, cancelled: 0 },
  subscriptions: { trialing: 1, active: 1, past_due: 0, expiring_14d: 1, stale_live: 0, companies_without_live: 1 },
  usage: { trips_total: 10, trips_30d: 4, bookings_total: 20, bookings_30d: 8, customers_total: 5 },
  recent_activity: [
    { id: 'a1', created_at: '2030-01-01T00:00:00Z', action: 'x.y', entity_type: 'company', actor_type: 'platform_user', company_id: null, company_name: null },
  ],
};

describe('overview schema', () => {
  it('maps snake_case rows to the camelCase view model', () => {
    const o = toPlatformOverview(overviewRawSchema.parse(RAW));
    expect(o.subscriptions).toMatchObject({ pastDue: 0, expiring14d: 1, staleLive: 0, companiesWithoutLive: 1 });
    expect(o.usage.bookings30d).toBe(8);
    expect(o.recentActivity[0]).toMatchObject({ entityType: 'company', companyName: null });
  });
  it('rejects negative, fractional or missing counts and unknown drift', () => {
    expect(overviewRawSchema.safeParse({ ...RAW, companies: { ...RAW.companies, total: -1 } }).success).toBe(false);
    expect(overviewRawSchema.safeParse({ ...RAW, usage: { ...RAW.usage, trips_total: 1.5 } }).success).toBe(false);
    expect(overviewRawSchema.safeParse({ ...RAW, usage: undefined }).success).toBe(false);
  });
  it('caps recent activity at 10', () => {
    const many = Array.from({ length: 11 }, (_, i) => ({ ...RAW.recent_activity[0]!, id: `a${i}` }));
    expect(overviewRawSchema.safeParse({ ...RAW, recent_activity: many }).success).toBe(false);
  });
});

describe('overview repository', () => {
  it('calls the RPC with NO arguments (no client company id or role)', async () => {
    const { db, calls } = fakeDb({ data: RAW });
    await platformOverviewRepository.overview(platformCtx('support', db));
    expect(calls[0]!.target).toBe('rpc:admin_platform_overview');
  });
  it('maps 42501 to forbidden', async () => {
    const { db } = fakeDb({ error: { code: '42501', message: 'forbidden' } });
    await expect(platformOverviewRepository.overview(platformCtx('support', db))).rejects.toMatchObject({ code: 'forbidden' });
  });
  it('an unexpected payload fails closed as internal, without leaking the payload', async () => {
    const { db } = fakeDb({ data: { companies: 'oops' } });
    const err = await platformOverviewRepository.overview(platformCtx('support', db)).catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({ code: 'internal' });
    expect(err.message).not.toContain('oops');
  });
});

describe('overview service', () => {
  it.each(['super_admin', 'support', 'billing'] as const)('%s may read', async (role) => {
    const repo = { overview: vi.fn().mockResolvedValue('ok') };
    await expect(makePlatformOverviewService(repo).getOverview(platformCtx(role))).resolves.toBe('ok');
  });
  it('a non-platform caller never reaches the repository', async () => {
    const repo = { overview: vi.fn() };
    await expect(makePlatformOverviewService(repo).getOverview(platformCtx(null))).rejects.toMatchObject({ code: 'forbidden' });
    expect(repo.overview).not.toHaveBeenCalled();
  });
});

describe('admin nav', () => {
  it('shows nothing without a platform role', () => expect(navFor(null)).toEqual([]));
  it('every platform role sees the overview', () => {
    for (const r of ['super_admin', 'support', 'billing'] as const) expect(navFor(r).some((i) => i.href === '/admin')).toBe(true);
  });
  it('overview, companies, subscriptions and plans are available in 7.4 (audit logs still disabled, no dead links)', () => {
    expect(ADMIN_NAV.filter((i) => i.available).map((i) => i.href)).toEqual(['/admin', '/admin/companies', '/admin/subscriptions', '/admin/plans']);
  });
  it('active matching: overview is exact, sections match by prefix without false positives', () => {
    expect(isNavActive('/admin', '/admin')).toBe(true);
    expect(isNavActive('/admin', '/admin/companies')).toBe(false);
    expect(isNavActive('/admin/companies', '/admin/companies/123')).toBe(true);
    expect(isNavActive('/admin/companies', '/admin/companiesX')).toBe(false);
  });
});
