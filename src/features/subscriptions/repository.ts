import { mapDbError } from '@/lib/db/map-error';
import type { Page } from '@/lib/db/pagination';
import { expectList, expectMaybe, asRow, asRows } from '@/lib/db/query';
import { AppError } from '@/lib/errors';
import type { PlatformServiceContext, TenantServiceContext } from '@/lib/service/context';
import { adminSubscriptionListRawSchema, toAdminSubscriptionPage, type AdminSubscriptionItem } from './admin-output';
import type { AssignSubscriptionInput, SetSubscriptionPeriodInput, SetSubscriptionStatusInput, SubscriptionListQuery } from './schema';
import { PLAN_SELECT, SUBSCRIPTION_SELECT, toPlan, toSubscription, type Plan, type PlanRow, type Subscription, type SubscriptionRow } from './types';

/** Statuses that count as "the" subscription (same set as the unique index subscriptions_one_live_idx). */
const LIVE = ['trialing', 'active', 'past_due'] as const;

export type SubscriptionRepository = {
  currentForTenant(ctx: TenantServiceContext): Promise<Subscription | null>;
  currentForCompany(ctx: PlatformServiceContext, companyId: string): Promise<Subscription | null>;
  listPlans(ctx: PlatformServiceContext): Promise<Plan[]>;
  // Phase 7.4: every write is a SECURITY DEFINER RPC (migration 0018). There is no direct table write.
  adminList(ctx: PlatformServiceContext, q: SubscriptionListQuery): Promise<Page<AdminSubscriptionItem>>;
  adminAssign(ctx: PlatformServiceContext, companyId: string, input: AssignSubscriptionInput): Promise<{ subscriptionId: string }>;
  adminSetStatus(ctx: PlatformServiceContext, id: string, input: SetSubscriptionStatusInput): Promise<{ status: string; previousStatus: string }>;
  adminSetPeriod(ctx: PlatformServiceContext, id: string, input: SetSubscriptionPeriodInput): Promise<{ periodEnd: string }>;
  adminExpireStale(ctx: PlatformServiceContext): Promise<{ expired: number }>;
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

  async adminList(ctx, q) {
    const res = await ctx.db.rpc('admin_list_subscriptions', {
      p_q: q.q ?? null,
      p_state: q.state ?? null,
      p_sort: q.sort,
      p_dir: q.dir,
      p_page: q.page,
      p_page_size: q.pageSize,
    });
    if (res.error) throw mapDbError(res.error);
    const parsed = adminSubscriptionListRawSchema.safeParse(res.data);
    if (!parsed.success) throw new AppError('internal', { cause: parsed.error });
    return toAdminSubscriptionPage(parsed.data, q);
  },

  async adminAssign(ctx, companyId, input) {
    const res = await ctx.db.rpc('admin_assign_subscription', {
      p_company: companyId,
      p_plan_code: input.planCode,
      p_billing_interval: input.billingInterval,
      p_status: input.status,
      p_period_days: input.periodDays,
    });
    if (res.error) throw mapDbError(res.error);
    const id = (res.data as { subscription_id?: unknown } | null)?.subscription_id;
    if (typeof id !== 'string') throw new AppError('internal');
    return { subscriptionId: id };
  },

  async adminSetStatus(ctx, id, input) {
    const res = await ctx.db.rpc('admin_set_subscription_status', { p_subscription: id, p_status: input.status, p_reason: input.reason ?? null });
    if (res.error) throw mapDbError(res.error);
    const d = res.data as { status?: unknown; previous_status?: unknown } | null;
    if (typeof d?.status !== 'string' || typeof d.previous_status !== 'string') throw new AppError('internal');
    return { status: d.status, previousStatus: d.previous_status };
  },

  async adminSetPeriod(ctx, id, input) {
    const res = await ctx.db.rpc('admin_set_subscription_period', { p_subscription: id, p_days: input.days, p_from: input.from });
    if (res.error) throw mapDbError(res.error);
    const end = (res.data as { period_end?: unknown } | null)?.period_end;
    if (typeof end !== 'string') throw new AppError('internal');
    return { periodEnd: end };
  },

  async adminExpireStale(ctx) {
    const res = await ctx.db.rpc('admin_expire_subscriptions');
    if (res.error) throw mapDbError(res.error);
    const n = (res.data as { expired?: unknown } | null)?.expired;
    if (typeof n !== 'number') throw new AppError('internal');
    return { expired: n };
  },
};
