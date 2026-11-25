// @vitest-environment jsdom
import axe from 'axe-core';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { polyfillDialog } from '@/ds/test-setup';
import { DsLangProvider } from '@/ds/lang';
import type { PlanOverview } from '@/features/plans/output';

vi.mock('next/navigation', () => ({ usePathname: () => '/admin/plans', useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push() {}, refresh() {} }) }));
vi.mock('@/features/admin/actions', () => {
  const stub = async () => ({ status: 'idle' as const });
  return { createPlanAction: stub, updatePlanAction: stub, setPlanActiveAction: stub, setPlanEntitlementAction: stub, createEntitlementDefinitionAction: stub };
});
import { PlansAdminView } from './PlansAdminView';

beforeAll(polyfillDialog);
afterEach(cleanup);
const wrap = (ui: React.ReactElement) => render(<DsLangProvider value="en">{ui}</DsLangProvider>);

const data: PlanOverview = {
  definitions: [{ key: 'max_buses', valueType: 'integer', description: null }, { key: 'max_users', valueType: 'integer', description: null }, { key: 'feature_analytics', valueType: 'boolean', description: null }, { key: 'max_new_thing', valueType: 'integer', description: null }],
  plans: [
    { id: 'p1', code: 'starter', name: 'Starter', description: null, priceMonthly: 1500, priceYearly: 15000, currency: 'EGP', trialDays: 14, isPublic: false, isActive: true, sortOrder: 1, liveSubscribers: 3, totalSubscriptions: 4,
      entitlements: [{ key: 'max_buses', kind: 'limit', limit: 5 }, { key: 'max_users', kind: 'limit', limit: null }, { key: 'feature_analytics', kind: 'flag', enabled: false }] },
    { id: 'p2', code: 'old', name: 'Old', description: 'legacy', priceMonthly: 0, priceYearly: null, currency: 'EGP', trialDays: 0, isPublic: false, isActive: false, sortOrder: 9, liveSubscribers: 0, totalSubscriptions: 0, entitlements: [] },
  ],
};

describe('PlansAdminView', () => {
  it('shows limits, unlimited, flags and "Not set (0)" for a key the plan has no row for', () => {
    const { container } = wrap(<PlansAdminView result={{ data }} isSuper />);
    const dl = container.querySelector('dl')!;
    expect(within(dl).getByText('Buses').nextElementSibling?.textContent).toContain('5');
    expect(within(dl).getByText('Users').nextElementSibling?.textContent).toContain('Unlimited');
    expect(within(dl).getByText('Analytics').nextElementSibling?.textContent).toContain('Not included');
    expect(within(dl).getByText('New thing').nextElementSibling?.textContent).toContain('Not set (0)');
    expect(screen.getByText(/3 live \/ 4 total subscriptions/)).toBeTruthy();
    expect(screen.getByText(/Archived \(cannot be assigned\)/)).toBeTruthy();
  });
  it('each card has a plain-language preview, with a warning for a plan that allows nothing', () => {
    const fresh = { ...data.plans[0]!, id: 'p3', code: 'fresh', name: 'Fresh', entitlements: data.definitions.map((d) => (d.valueType === 'integer' ? { key: d.key, kind: 'limit' as const, limit: 0 } : { key: d.key, kind: 'flag' as const, enabled: false })) };
    wrap(<PlansAdminView result={{ data: { ...data, plans: [data.plans[0]!, fresh] } }} isSuper />);
    expect(screen.getAllByText('What a company on this plan can do')).toHaveLength(2);
    expect(screen.getByText('Up to 5 buses')).toBeTruthy();
    expect(screen.getByText('Unlimited company users')).toBeTruthy();
    expect(screen.getAllByRole('note').some((n) => /allows nothing yet/.test(n.textContent ?? ''))).toBe(true);
  });
  it('super_admin gets the create / edit / archive / restore controls', () => {
    wrap(<PlansAdminView result={{ data }} isSuper />);
    for (const name of ['New plan', 'New limit key', 'Edit plan', 'Archive', 'Restore']) expect(screen.getAllByRole('button', { name: new RegExp(`^${name}$`) }).length, name).toBeGreaterThan(0);
  });
  it('any other platform role sees NO controls at all (read-only)', () => {
    wrap(<PlansAdminView result={{ data }} isSuper={false} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText(/Read-only for your role/)).toBeTruthy();
  });
  it('empty and error states', () => {
    wrap(<PlansAdminView result={{ data: { plans: [], definitions: [] } }} isSuper />);
    expect(screen.getByText('No plans')).toBeTruthy();
    cleanup();
    wrap(<PlansAdminView result={{ error: 'Nope' }} isSuper={false} />);
    expect(screen.getByRole('alert')).toBeTruthy();
  });
  it('has no serious accessibility violations', async () => {
    const { container } = wrap(<PlansAdminView result={{ data }} isSuper />);
    const r = await axe.run(container, { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } }, resultTypes: ['violations'] });
    expect(r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
  });
});
