import { z } from 'zod';

/** Output of admin_plan_overview (0064). Fails closed on drift: a malformed result is an internal error, never a half-rendered page. */
const entitlementRaw = z.strictObject({ key: z.string(), int_value: z.number().int().nullable(), bool_value: z.boolean().nullable() });
const planRaw = z.strictObject({
  id: z.guid(), code: z.string(), name: z.string(), description: z.string().nullable(),
  price_monthly: z.number(), price_yearly: z.number().nullable(), currency: z.string(),
  trial_days: z.number().int(), is_public: z.boolean(), is_active: z.boolean(), sort_order: z.number().int(),
  live_subscribers: z.number().int(), total_subscriptions: z.number().int(), entitlements: z.array(entitlementRaw),
});
const definitionRaw = z.strictObject({ key: z.string(), value_type: z.enum(['integer', 'boolean']), description: z.string().nullable() });
export const planOverviewRawSchema = z.strictObject({ plans: z.array(planRaw), definitions: z.array(definitionRaw) });

export type PlanEntitlementValue = { key: string; kind: 'limit'; limit: number | null } | { key: string; kind: 'flag'; enabled: boolean };
export type AdminPlan = {
  id: string; code: string; name: string; description: string | null;
  priceMonthly: number; priceYearly: number | null; currency: string; trialDays: number;
  isPublic: boolean; isActive: boolean; sortOrder: number; liveSubscribers: number; totalSubscriptions: number;
  entitlements: PlanEntitlementValue[];
};
export type EntitlementDefinition = { key: string; valueType: 'integer' | 'boolean'; description: string | null };
export type PlanOverview = { plans: AdminPlan[]; definitions: EntitlementDefinition[] };

export function toPlanOverview(raw: z.output<typeof planOverviewRawSchema>): PlanOverview {
  return {
    plans: raw.plans.map((p) => ({
      id: p.id, code: p.code, name: p.name, description: p.description,
      priceMonthly: p.price_monthly, priceYearly: p.price_yearly, currency: p.currency, trialDays: p.trial_days,
      isPublic: p.is_public, isActive: p.is_active, sortOrder: p.sort_order,
      liveSubscribers: p.live_subscribers, totalSubscriptions: p.total_subscriptions,
      entitlements: p.entitlements.map((e) => (e.bool_value !== null ? { key: e.key, kind: 'flag' as const, enabled: e.bool_value } : { key: e.key, kind: 'limit' as const, limit: e.int_value })),
    })),
    definitions: raw.definitions.map((d) => ({ key: d.key, valueType: d.value_type, description: d.description })),
  };
}
