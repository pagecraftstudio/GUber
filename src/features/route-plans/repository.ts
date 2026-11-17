import { expectList } from '@/lib/db/query';
import { mapDbError } from '@/lib/db/map-error';
import type { TenantServiceContext } from '@/lib/service/context';
import type { Decision, PlanCreate, PlanUpdate, SubscriptionListQuery } from './schema';
import { PLAN_SELECT, SUBSCRIPTION_SELECT, toRoutePlan, toSubscription, type RoutePlan, type RoutePlanRow, type RouteSubscription, type SubscriptionRow } from './types';

export type RoutePlanRepository = {
  listPlans(ctx: TenantServiceContext): Promise<RoutePlan[]>;
  createPlan(ctx: TenantServiceContext, input: PlanCreate): Promise<string>;
  updatePlan(ctx: TenantServiceContext, id: string, patch: PlanUpdate): Promise<void>;
  archivePlan(ctx: TenantServiceContext, id: string): Promise<void>;
  listSubscriptions(ctx: TenantServiceContext, q: SubscriptionListQuery): Promise<RouteSubscription[]>;
  decide(ctx: TenantServiceContext, id: string, d: Decision): Promise<void>;
};

const LIMIT = 200; // a company's inbox is bounded on purpose; filter by status to see the rest

export const routePlanRepository: RoutePlanRepository = {
  async listPlans(ctx) {
    const res = await ctx.db.from('route_plans').select(PLAN_SELECT).eq('company_id', ctx.companyId).is('deleted_at', null) // RLS does not hide archived rows
      .order('created_at', { ascending: false }).order('id').limit(LIMIT);
    return expectList<RoutePlanRow, RoutePlan>(res as never, toRoutePlan);
  },

  async createPlan(ctx, i) {
    // The RPC derives the company from the route and checks routes.write; the plan limit is a trigger.
    const { data, error } = await ctx.db.rpc('create_route_plan', {
      p_route_id: i.routeId, p_name: i.name, p_price: i.price, p_validity_type: i.validityType,
      p_duration_months: i.durationMonths ?? null, p_starts_on: i.startsOn ?? null, p_ends_on: i.endsOn ?? null,
    });
    if (error) throw mapDbError(error);
    if (typeof data !== 'string') throw mapDbError({ message: 'empty create_route_plan result' });
    return data;
  },

  async updatePlan(ctx, id, patch) {
    const { error } = await ctx.db.rpc('update_route_plan', { p_plan_id: id, p_name: patch.name, p_price: patch.price, p_is_active: patch.isActive });
    if (error) throw mapDbError(error);
  },

  async archivePlan(ctx, id) {
    const { error } = await ctx.db.rpc('archive_route_plan', { p_plan_id: id });
    if (error) throw mapDbError(error);
  },

  async listSubscriptions(ctx, q) {
    let query = ctx.db.from('route_subscription_list').select(SUBSCRIPTION_SELECT).eq('company_id', ctx.companyId);
    if (q.status) query = query.eq('status', q.status);
    const res = await query.order('requested_at', { ascending: false }).order('id').limit(LIMIT);
    return expectList<SubscriptionRow, RouteSubscription>(res as never, toSubscription);
  },

  async decide(ctx, id, d) {
    const { error } = await ctx.db.rpc('decide_route_subscription', { p_id: id, p_approve: d.approve, p_note: d.note ?? null });
    if (error) throw mapDbError(error);
  },
};
