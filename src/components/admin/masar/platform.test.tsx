// @vitest-environment jsdom
import axe from 'axe-core';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { polyfillDialog } from '@/ds/test-setup';
import { DsLangProvider } from '@/ds/lang';
import type { AdminActionState } from '@/features/admin/action-state';
import type { AuditEntry, AuditItem } from '@/features/audit/schema';
import { buildMetadataView } from '@/features/audit/diff';
import type { PlatformOverview } from '@/features/platform/schema';
import type { AdminSubscriptionItem } from '@/features/subscriptions/admin-output';

vi.mock('next/navigation', () => ({ usePathname: () => '/admin', useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push() {}, refresh() {} }) }));

import { AuditEntryMasar, AuditListMasar, AuditTableMasar, PlansMasar, PlatformOverviewMasar, SubscriptionsMasar } from './PlatformMasarViews';

beforeAll(polyfillDialog);
afterEach(cleanup);
const wrap = (ui: React.ReactElement) => render(<DsLangProvider value="en">{ui}</DsLangProvider>);
const bad = async (el: HTMLElement) => {
  const r = await axe.run(el, { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } }, resultTypes: ['violations'] });
  return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join('|')}`);
};

const overview = (over: Partial<PlatformOverview> = {}): PlatformOverview => ({
  generatedAt: '2030-05-01T10:30:00Z',
  companies: { total: 12, trial: 3, active: 7, suspended: 1, cancelled: 1 },
  subscriptions: { trialing: 3, active: 7, pastDue: 2, expiring14d: 1, staleLive: 0, companiesWithoutLive: 1 },
  usage: { tripsTotal: 1234, trips30d: 210, bookingsTotal: 9876, bookings30d: 1500, customersTotal: 4321 },
  recentActivity: [{ id: 'a1', createdAt: '2030-05-01T09:00:00Z', action: 'company.suspended', entityType: 'company', actorType: 'platform_user', companyId: 'c1', companyName: 'Delta Coach' }],
  ...over,
} as PlatformOverview);

describe('platform overview', () => {
  it('shows the figures with Latin digits, flags what needs attention in words, and links to the audit entry', async () => {
    const { container } = wrap(<PlatformOverviewMasar res={{ data: overview() }} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Platform overview' })).toBeTruthy();
    expect(screen.getByText('1,234')).toBeTruthy();
    expect(screen.getByText('Locked out until reactivated')).toBeTruthy(); // suspended > 0
    expect(screen.getByText('Needs follow-up')).toBeTruthy(); // past due > 0
    expect(screen.queryByText('Status still live, period over')).toBeNull(); // stale = 0: no noise
    expect(screen.getByRole('link', { name: 'Company suspended' }).getAttribute('href')).toBe('/admin/audit-logs/a1');
    expect(screen.getByText(/^As of .*2030.* UTC$/)).toBeTruthy();
    expect(await bad(container)).toEqual([]);
  });
  it('empty companies and empty activity are explained, an error is a real alert', () => {
    wrap(<PlatformOverviewMasar res={{ data: overview({ companies: { total: 0, trial: 0, active: 0, suspended: 0, cancelled: 0 }, recentActivity: [] }) }} />);
    expect(screen.getByText('No companies yet')).toBeTruthy();
    expect(screen.getByText('No activity yet')).toBeTruthy();
    cleanup();
    wrap(<PlatformOverviewMasar res={{ error: 'Something went wrong' }} />);
    expect(screen.getByRole('alert').textContent).toContain('Something went wrong');
  });
});

describe('plans', () => {
  const plan = { id: 'p1', code: 'starter', name: 'Starter', priceMonthly: 1500, priceYearly: 15000, currency: 'EGP', trialDays: 14, isActive: true, isPublic: false,
    entitlements: { max_buses: { kind: 'limit', limit: 5 }, max_users: { kind: 'limit', limit: null }, feature_analytics: { kind: 'flag', enabled: false } } };
  it('is read-only and spells out limits, unlimited and flags in words', async () => {
    const { container } = wrap(<PlansMasar result={{ data: [plan as never] }} />);
    expect(screen.getByText(/1,500 EGP \/ month/)).toBeTruthy();
    expect(screen.getByText('Not public', { exact: false })).toBeTruthy();
    const dl = container.querySelector('dl')!;
    expect(within(dl).getByText('Buses').nextElementSibling?.textContent).toBe('5');
    expect(within(dl).getByText('Users').nextElementSibling?.textContent).toBe('Unlimited');
    expect(within(dl).getByText('Analytics').nextElementSibling?.textContent).toBe('Not included');
    expect(screen.queryByRole('button')).toBeNull();
    expect(await bad(container)).toEqual([]);
  });
  it('empty and error states', () => {
    wrap(<PlansMasar result={{ data: [] }} />);
    expect(screen.getByText('No plans')).toBeTruthy();
    cleanup();
    wrap(<PlansMasar result={{ error: 'Nope' }} />);
    expect(screen.getByRole('alert')).toBeTruthy();
  });
});

describe('subscriptions', () => {
  const sub = (n: number, over: Partial<AdminSubscriptionItem> = {}): AdminSubscriptionItem => ({ id: `s${n}`, companyId: `c${n}`, companyName: `Delta ${n}`, companySlug: `delta-${n}`, companyStatus: 'active', planCode: 'pro', planName: 'Pro', status: 'active', state: 'live', billingInterval: 'monthly', currentPeriodStart: '2030-04-01T00:00:00Z', currentPeriodEnd: '2030-05-01T00:00:00Z', cancelAtPeriodEnd: false, createdAt: '2030-03-01T00:00:00Z', ...over });
  const page = (items: AdminSubscriptionItem[], total = items.length) => ({ data: { items, total, page: 1, pageSize: 20, hasMore: false } as never });
  const q = { sort: 'period_end', dir: 'asc' };
  const expire = vi.fn(async (_p: AdminActionState, _fd: FormData) => ({ status: 'ok' }) as AdminActionState);

  it('lists companies with state in words (stale is not green) and the period', async () => {
    const { container } = wrap(<SubscriptionsMasar query={q} canWrite result={page([sub(1), sub(2, { state: 'stale' })])} expireAction={expire} />);
    const rows = within(screen.getByRole('table', { name: 'Subscriptions' })).getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(within(rows[1]!).getByRole('link', { name: 'Delta 1' }).getAttribute('href')).toBe('/admin/companies/c1');
    expect(within(rows[1]!).getByText('Live')).toBeTruthy();
    expect(within(rows[2]!).getByText('Stale')).toBeTruthy();
    expect(rows[1]!.textContent).toMatch(/2030/);
    expect(await bad(container)).toEqual([]);
  });
  it('the expire action is confirmed first and runs the same server action; read-only roles do not get it', async () => {
    const u = userEvent.setup();
    wrap(<SubscriptionsMasar query={q} canWrite result={page([sub(1)])} expireAction={expire} />);
    await u.click(screen.getByRole('button', { name: 'Expire stale subscriptions' }));
    expect(expire).not.toHaveBeenCalled();
    await u.click(screen.getByRole('button', { name: 'Expire stale' }));
    await waitFor(() => expect(expire).toHaveBeenCalledTimes(1));
    cleanup();
    wrap(<SubscriptionsMasar query={q} canWrite={false} result={page([sub(1)])} expireAction={expire} />);
    expect(screen.queryByRole('button', { name: 'Expire stale subscriptions' })).toBeNull();
  });
  it('filters become removable chips and an empty filtered list says so', () => {
    wrap(<SubscriptionsMasar query={{ ...q, q: 'delta', state: 'stale' }} canWrite result={page([])} expireAction={expire} />);
    expect(screen.getByRole('link', { name: 'Remove filter: Search: delta' }).getAttribute('href')).toBe('/admin/subscriptions?state=stale&sort=period_end&dir=asc');
    expect(screen.getByText('No subscriptions match')).toBeTruthy();
  });
});

describe('audit log', () => {
  const item = (n: number, over: Partial<AuditItem> = {}): AuditItem => ({ id: `e${n}`, createdAt: '2030-05-01T09:00:00Z', action: 'company.suspended', entityType: 'company', entityId: `c${n}`, actorType: 'platform_user', actorId: 'u1', actorName: 'Mona Ali', companyId: `c${n}`, companyName: 'Delta Coach', changedKeys: ['status'], ...over });
  const summary = { days: 7, since: '2030-04-24T00:00:00Z', total: 1500, byNamespace: [{ namespace: 'company', count: 20 }], platformActors: [{ actorId: 'u1', actorName: 'Mona Ali', count: 9 }] };

  it('shows the summary, the table, filters as chips and keeps them across the paging links', async () => {
    const { container } = wrap(<AuditListMasar query={{ company: 'c1', namespace: 'company' }} page={{ data: { items: [item(1)], hasMore: true, next: { bat: '2030-05-01T09:00:00Z', bid: 'e1' } } }} summary={summary} days={7} ignored={false} />);
    expect(screen.getByText('Last 7 days: 1,500 entries')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Older entries →' }).getAttribute('href')).toContain('company=c1');
    expect(screen.getByRole('link', { name: 'Remove filter: Company: Delta Coach' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '30 days' }).getAttribute('href')).toContain('days=30');
    expect(screen.getByRole('link', { name: '7 days' }).getAttribute('aria-current')).toBe('true');
    expect(await bad(container)).toEqual([]);
  });
  it('invalid filters are reported, an empty log is explained, the first page has no "Newest" link', () => {
    wrap(<AuditListMasar query={{}} page={{ data: { items: [], hasMore: false, next: null } }} summary={null} days={7} ignored />);
    expect(screen.getByText('Some filters were not valid and were ignored.')).toBeTruthy();
    expect(screen.getByText('No audit entries yet')).toBeTruthy();
  });
  it('table renders text only (a script name is not markup) and links to the entry', () => {
    const { container } = wrap(<AuditTableMasar items={[item(1, { actorName: '<img src=x onerror=alert(1)>' })]} />);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByRole('link', { name: 'Company suspended' }).getAttribute('href')).toBe('/admin/audit-logs/e1');
  });

  const entry = (over: Partial<AuditEntry> = {}): AuditEntry => ({ ...item(1), actorEmail: 'mona@masar.example', metadata: { before: { status: 'active' }, after: { status: 'suspended' } }, metadataRedacted: false, ...over }) as AuditEntry;
  it('entry detail: before/after table with the change written out in words', async () => {
    const e = entry();
    const { container } = wrap(<AuditEntryMasar e={e} view={buildMetadataView(e.metadata)} subject="/admin/companies/c1" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Company suspended' })).toBeTruthy();
    const table = screen.getByRole('table', { name: 'Changed fields' });
    expect(within(table).getByText('suspended')).toBeTruthy();
    expect(table.textContent).toContain('changed');
    expect(await bad(container)).toEqual([]);
  });
  it('a redacted entry says the details are not available to this role and shows no table', () => {
    const e = entry({ metadata: null, metadataRedacted: true });
    wrap(<AuditEntryMasar e={e} view={buildMetadataView(null)} subject={null} />);
    expect(screen.getByText('Details for this entry are not available to your role.')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });
});
