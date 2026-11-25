import { describe, expect, it } from 'vitest';
import type { AdminPlan, EntitlementDefinition } from './output';
import { describePlan } from './preview';

const DEFS: EntitlementDefinition[] = [
  { key: 'max_buses', valueType: 'integer', description: null }, { key: 'max_users', valueType: 'integer', description: null },
  { key: 'max_drivers', valueType: 'integer', description: null }, { key: 'feature_analytics', valueType: 'boolean', description: null },
  { key: 'max_vehicles_per_route', valueType: 'integer', description: null },
];
const plan = (over: Partial<AdminPlan> = {}): AdminPlan => ({
  id: 'p', code: 'x', name: 'X', description: null, priceMonthly: 100, priceYearly: null, currency: 'EGP', trialDays: 14, isPublic: false, isActive: true, sortOrder: 1, liveSubscribers: 0, totalSubscriptions: 0,
  entitlements: [{ key: 'max_buses', kind: 'limit', limit: 5 }, { key: 'max_users', kind: 'limit', limit: null }, { key: 'max_drivers', kind: 'limit', limit: 0 }, { key: 'feature_analytics', kind: 'flag', enabled: true }],
  ...over,
});

describe('describePlan', () => {
  it('limits, unlimited, zero, flags, and a key with no row, in plain words', () => {
    const r = describePlan(plan(), DEFS);
    expect(r.allows).toEqual(['Up to 5 buses', 'Unlimited company users', 'Includes the analytics dashboard']);
    expect(r.blocked).toEqual(['No drivers (limit is 0)', 'No vehicles per route (limit is 0, not set)']);
    expect(r.warnings).toEqual([]);
  });
  it('a disabled flag is listed as not included', () => {
    expect(describePlan(plan({ entitlements: [{ key: 'feature_analytics', kind: 'flag', enabled: false }] }), DEFS).blocked).toContain('Does not include the analytics dashboard');
  });
  it('a brand-new plan (all zero / off) warns that it allows nothing', () => {
    const fresh = plan({ entitlements: DEFS.map((d) => (d.valueType === 'integer' ? { key: d.key, kind: 'limit' as const, limit: 0 } : { key: d.key, kind: 'flag' as const, enabled: false })) });
    expect(describePlan(fresh, DEFS).warnings[0]).toMatch(/allows nothing yet/);
  });
  it('an archived plan gets no warnings (nobody can be assigned to it)', () => {
    expect(describePlan(plan({ isActive: false, entitlements: [] }), DEFS).warnings).toEqual([]);
  });
  it('warns on public + free + no trial, and on a yearly price above 12 monthly payments', () => {
    expect(describePlan(plan({ isPublic: true, priceMonthly: 0, trialDays: 0 }), DEFS).warnings.join(' ')).toMatch(/free and no trial/);
    expect(describePlan(plan({ priceMonthly: 100, priceYearly: 1300 }), DEFS).warnings.join(' ')).toMatch(/yearly price is higher/);
    expect(describePlan(plan({ priceMonthly: 100, priceYearly: 1000 }), DEFS).warnings).toEqual([]);
  });
});
