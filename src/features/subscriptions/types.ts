export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'cancelled' | 'expired';

/** Integer entitlement: `limit: null` = unlimited. Boolean entitlement: on/off. Mirrors plan_entitlements. */
export type Entitlement = { kind: 'limit'; limit: number | null } | { kind: 'flag'; enabled: boolean };
export type Entitlements = Record<string, Entitlement>;

type EntitlementRow = { key: string; int_value: number | null; bool_value: boolean | null };

export type PlanRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  price_monthly: number;
  price_yearly: number | null;
  currency: string;
  trial_days: number;
  is_public: boolean;
  is_active: boolean;
  sort_order: number;
  plan_entitlements: EntitlementRow[];
};

export type Plan = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  priceMonthly: number;
  priceYearly: number | null;
  currency: string;
  trialDays: number;
  isPublic: boolean;
  isActive: boolean;
  sortOrder: number;
  entitlements: Entitlements;
};

export type SubscriptionRow = {
  id: string;
  company_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  billing_interval: 'monthly' | 'yearly';
  trial_ends_at: string | null;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  cancelled_at: string | null;
  plan: PlanRow | null;
};

export type Subscription = {
  id: string;
  companyId: string;
  planId: string;
  status: SubscriptionStatus;
  billingInterval: 'monthly' | 'yearly';
  trialEndsAt: string | null;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  cancelledAt: string | null;
  plan: Plan | null;
};

const PLAN_FIELDS =
  'id,code,name,description,price_monthly,price_yearly,currency,trial_days,is_public,is_active,sort_order,plan_entitlements(key,int_value,bool_value)';
export const PLAN_SELECT = PLAN_FIELDS;
export const SUBSCRIPTION_SELECT =
  'id,company_id,plan_id,status,billing_interval,trial_ends_at,current_period_start,current_period_end,cancel_at_period_end,cancelled_at,plan:plans(id,code,name,description,price_monthly,price_yearly,currency,trial_days,is_public,is_active,sort_order,plan_entitlements(key,int_value,bool_value))';

export function toEntitlements(rows: readonly EntitlementRow[]): Entitlements {
  const out: Entitlements = {};
  for (const r of rows) {
    out[r.key] = r.bool_value !== null ? { kind: 'flag', enabled: r.bool_value } : { kind: 'limit', limit: r.int_value };
  }
  return out;
}

export const toPlan = (r: PlanRow): Plan => ({
  id: r.id,
  code: r.code,
  name: r.name,
  description: r.description,
  priceMonthly: r.price_monthly,
  priceYearly: r.price_yearly,
  currency: r.currency,
  trialDays: r.trial_days,
  isPublic: r.is_public,
  isActive: r.is_active,
  sortOrder: r.sort_order,
  entitlements: toEntitlements(r.plan_entitlements ?? []),
});

export const toSubscription = (r: SubscriptionRow): Subscription => ({
  id: r.id,
  companyId: r.company_id,
  planId: r.plan_id,
  status: r.status,
  billingInterval: r.billing_interval,
  trialEndsAt: r.trial_ends_at,
  currentPeriodStart: r.current_period_start,
  currentPeriodEnd: r.current_period_end,
  cancelAtPeriodEnd: r.cancel_at_period_end,
  cancelledAt: r.cancelled_at,
  plan: r.plan && toPlan(r.plan),
});
