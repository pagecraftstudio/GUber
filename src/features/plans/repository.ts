import { mapDbError } from '@/lib/db/map-error';
import { AppError } from '@/lib/errors';
import type { PlatformServiceContext } from '@/lib/service/context';
import { planOverviewRawSchema, toPlanOverview, type PlanOverview } from './output';
import type { CreateDefinitionInput, CreatePlanInput, SetEntitlementInput, SetPlanActiveInput, UpdatePlanInput } from './schema';

/** Every write is a SECURITY DEFINER RPC (migration 0064). There is no direct table write on plans (removed in 0015). */
export type PlanRepository = {
  overview(ctx: PlatformServiceContext): Promise<PlanOverview>;
  create(ctx: PlatformServiceContext, input: CreatePlanInput): Promise<{ planId: string }>;
  update(ctx: PlatformServiceContext, planId: string, input: UpdatePlanInput): Promise<void>;
  setActive(ctx: PlatformServiceContext, planId: string, input: SetPlanActiveInput): Promise<{ changed: boolean; liveSubscribers: number }>;
  setEntitlement(ctx: PlatformServiceContext, planId: string, input: SetEntitlementInput): Promise<{ liveSubscribers: number }>;
  createDefinition(ctx: PlatformServiceContext, input: CreateDefinitionInput): Promise<{ key: string }>;
};

const obj = (d: unknown): Record<string, unknown> => (d && typeof d === 'object' ? (d as Record<string, unknown>) : {});

export const planRepository: PlanRepository = {
  async overview(ctx) {
    const res = await ctx.db.rpc('admin_plan_overview');
    if (res.error) throw mapDbError(res.error);
    const parsed = planOverviewRawSchema.safeParse(res.data);
    if (!parsed.success) throw new AppError('internal', { cause: parsed.error });
    return toPlanOverview(parsed.data);
  },

  async create(ctx, i) {
    const res = await ctx.db.rpc('admin_create_plan', {
      p_code: i.code, p_name: i.name, p_description: i.description ?? null, p_price_monthly: i.priceMonthly, p_price_yearly: i.priceYearly,
      p_currency: i.currency, p_trial_days: i.trialDays, p_is_public: i.isPublic, p_sort_order: i.sortOrder,
    });
    if (res.error) throw mapDbError(res.error);
    const id = obj(res.data).plan_id;
    if (typeof id !== 'string') throw new AppError('internal');
    return { planId: id };
  },

  async update(ctx, planId, i) {
    const res = await ctx.db.rpc('admin_update_plan', {
      p_plan: planId,
      p_patch: { name: i.name, description: i.description ?? null, price_monthly: i.priceMonthly, price_yearly: i.priceYearly, currency: i.currency, trial_days: i.trialDays, is_public: i.isPublic, sort_order: i.sortOrder },
    });
    if (res.error) throw mapDbError(res.error);
  },

  async setActive(ctx, planId, i) {
    const res = await ctx.db.rpc('admin_set_plan_active', { p_plan: planId, p_active: i.active, p_reason: i.reason ?? null });
    if (res.error) throw mapDbError(res.error);
    const d = obj(res.data);
    if (typeof d.changed !== 'boolean') throw new AppError('internal');
    return { changed: d.changed, liveSubscribers: typeof d.live_subscribers === 'number' ? d.live_subscribers : 0 };
  },

  async setEntitlement(ctx, planId, i) {
    const res = await ctx.db.rpc('admin_set_plan_entitlement', { p_plan: planId, p_key: i.key, p_int: i.int, p_bool: i.bool, p_unlimited: i.unlimited });
    if (res.error) throw mapDbError(res.error);
    const n = obj(res.data).live_subscribers;
    if (typeof n !== 'number') throw new AppError('internal');
    return { liveSubscribers: n };
  },

  async createDefinition(ctx, i) {
    const res = await ctx.db.rpc('admin_create_entitlement_definition', { p_key: i.key, p_value_type: i.valueType, p_description: i.description ?? null });
    if (res.error) throw mapDbError(res.error);
    const key = obj(res.data).key;
    if (typeof key !== 'string') throw new AppError('internal');
    return { key };
  },
};
