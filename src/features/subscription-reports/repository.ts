import { mapDbError } from '@/lib/db/map-error';
import type { TenantServiceContext } from '@/lib/service/context';
import { DEMAND_DAYS, type Range } from './schema';
import { toDailyReport, toPlanReport, toTripDemand, type DailyReportRow, type DemandRow, type PlanReportRow, type SubscriptionReport } from './types';

export type SubscriptionReportRepository = { report(ctx: TenantServiceContext, range: Range): Promise<SubscriptionReport> };

/** ctx.companyId comes from the authenticated membership; the functions re-check analytics.read for it, so it is never trusted on its own. */
export const subscriptionReportRepository: SubscriptionReportRepository = {
  async report(ctx, { from, to }) {
    const args = { p_company: ctx.companyId, p_from: from, p_to: to };
    const [plans, days, demand] = await Promise.all([
      ctx.db.rpc('subscription_plan_report', args),
      ctx.db.rpc('subscription_daily_report', args),
      ctx.db.rpc('subscription_trip_demand', { p_company: ctx.companyId, p_days: DEMAND_DAYS }),
    ]);
    for (const r of [plans, days, demand]) if (r.error) throw mapDbError(r.error);
    return { from, to,
      plans: ((plans.data ?? []) as PlanReportRow[]).map(toPlanReport),
      days: ((days.data ?? []) as DailyReportRow[]).map(toDailyReport),
      demand: ((demand.data ?? []) as DemandRow[]).map(toTripDemand) };
  },
};
