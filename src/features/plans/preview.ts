import type { AdminPlan, EntitlementDefinition } from './output';

/**
 * "What can a company on this plan do?" in plain words, derived ONLY from the stored numbers (no second source of truth).
 * Known keys get natural phrases; a key added later falls back to its own name, so a new definition never needs a code change here.
 */
const THING: Record<string, string> = {
  max_users: 'company users', max_buses: 'buses', max_drivers: 'drivers', max_routes: 'active routes',
  max_trips_per_month: 'trips per month', max_bookings_per_month: 'bookings per month', max_route_plans: 'student route plans',
  feature_analytics: 'the analytics dashboard', feature_custom_domain: 'a custom domain', feature_notifications_sms: 'SMS notifications',
};
const thing = (key: string) => THING[key] ?? key.replace(/^(max|feature)_/, '').replace(/_/g, ' ');

export type PlanPreview = { allows: string[]; blocked: string[]; warnings: string[] };

export function describePlan(plan: AdminPlan, definitions: readonly EntitlementDefinition[]): PlanPreview {
  const byKey = new Map(plan.entitlements.map((e) => [e.key, e]));
  const allows: string[] = [];
  const blocked: string[] = [];
  let anyAllowed = false;
  for (const d of definitions) {
    const e = byKey.get(d.key);
    const name = thing(d.key);
    if (d.valueType === 'boolean') {
      if (e?.kind === 'flag' && e.enabled) { allows.push(`Includes ${name}`); anyAllowed = true; } else blocked.push(`Does not include ${name}`);
    } else {
      const unset = e?.kind !== 'limit';
      const limit = e?.kind === 'limit' ? e.limit : 0;
      if (!unset && limit === null) { allows.push(`Unlimited ${name}`); anyAllowed = true; }
      else if (limit !== null && limit > 0) { allows.push(`Up to ${limit.toLocaleString('en')} ${name}`); anyAllowed = true; }
      else blocked.push(`No ${name} (limit is 0${e ? '' : ', not set'})`);
    }
  }
  const warnings: string[] = [];
  if (plan.isActive && !anyAllowed && definitions.length > 0) warnings.push('This plan allows nothing yet: every limit is 0 and every feature is off. Set the limits before assigning it.');
  if (plan.isActive && plan.isPublic && plan.priceMonthly === 0 && plan.trialDays === 0) warnings.push('Public, free and no trial: companies can use it at no cost.');
  if (plan.isActive && plan.priceYearly !== null && plan.priceYearly > plan.priceMonthly * 12 && plan.priceMonthly > 0) warnings.push('The yearly price is higher than twelve monthly payments.');
  return { allows, blocked, warnings };
}
