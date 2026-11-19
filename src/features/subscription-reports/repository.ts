import { mapDbError } from '@/lib/db/map-error';
import type { TenantServiceContext } from '@/lib/service/context';
import { DEMAND_DAYS, type Range } from './schema';
import { toDailyReport, toPlanReport, toTripDemand, type DailyReportRow, type DemandRow, type PlanReportRow, type SubscriptionReport } from './types';

export const DEFAULT_ZONE = 'Africa/Cairo';
export type SubscriptionReportRepository = {
  timeZone(ctx: TenantServiceContext): Promise<string>;
  report(ctx: TenantServiceContext, range: Range, timeZone: string): Promise<SubscriptionReport>;
};

/** ctx.companyId comes from the authenticated membership; the functions re-check analytics.read for it, so it is never trusted on its own. */
export const subscriptionReportRepository: SubscriptionReportRepository = {
  async timeZone(ctx) {
    const { data, error } = await ctx.db.from('company_settings').select('timezone').eq('company_id', ctx.companyId).maybeSingle();
    if (error) throw mapDbError(error);
    return (data?.timezone as string | undefined) ?? DEFAULT_ZONE;
  },
  async report(ctx, { from, to }, timeZone) {
    const args = { p_company: ctx.companyId, p_from: from, p_to: to };
    const [plans, days, demand] = await Promise.all([
      ctx.db.rpc('subscription_plan_report', args),
      ctx.db.rpc('subscription_daily_report', args),
      ctx.db.rpc('subscription_trip_demand', { p_company: ctx.companyId, p_days: DEMAND_DAYS }),
    ]);
    for (const r of [plans, days, demand]) if (r.error) throw mapDbError(r.error);
    return { from, to, timeZone,
      plans: ((plans.data ?? []) as PlanReportRow[]).map(toPlanReport),
      days: ((days.data ?? []) as DailyReportRow[]).map(toDailyReport),
      demand: ((demand.data ?? []) as DemandRow[]).map(toTripDemand) };
  },
};
