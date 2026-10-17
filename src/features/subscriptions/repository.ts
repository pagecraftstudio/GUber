import { expectList, expectMaybe, asRow, asRows } from '@/lib/db/query';
import type { PlatformServiceContext, TenantServiceContext } from '@/lib/service/context';
import { PLAN_SELECT, SUBSCRIPTION_SELECT, toPlan, toSubscription, type Plan, type PlanRow, type Subscription, type SubscriptionRow } from './types';

/** Statuses that count as "the" subscription (same set as the unique index subscriptions_one_live_idx). */
const LIVE = ['trialing', 'active', 'past_due'] as const;

export type SubscriptionRepository = {
  currentForTenant(ctx: TenantServiceContext): Promise<Subscription | null>;
  currentForCompany(ctx: PlatformServiceContext, companyId: string): Promise<Subscription | null>;
  listPlans(ctx: PlatformServiceContext): Promise<Plan[]>;
};

export const subscriptionRepository: SubscriptionRepository = {
  async currentForTenant(ctx) {
    return expectMaybe<SubscriptionRow, Subscription>(
      asRow(await ctx.db.from('subscriptions').select(SUBSCRIPTION_SELECT).eq('company_id', ctx.companyId).in('status', [...LIVE]).maybeSingle()),
      toSubscription,
    );
  },

  async currentForCompany(ctx, companyId) {
    return expectMaybe<SubscriptionRow, Subscription>(
      asRow(await ctx.db.from('subscriptions').select(SUBSCRIPTION_SELECT).eq('company_id', companyId).in('status', [...LIVE]).maybeSingle()),
      toSubscription,
    );
  },

  async listPlans(ctx) {
    return expectList<PlanRow, Plan>(
      asRows(await ctx.db.from('plans').select(PLAN_SELECT).order('sort_order').order('code').limit(100)),
      toPlan,
    );
  },
};
