import type { SupabaseClient } from '@supabase/supabase-js';
import type { ZodType } from 'zod';
import { mapDbError } from '@/lib/db/map-error';
import { AppError } from '@/lib/errors';
import {
  cohortRowsSchema, funnelRowsSchema, gapRowsSchema, overviewRowsSchema, toCohorts, toDays, toFunnel, toGaps, toUsage, usageRowsSchema,
  type AnalyticsPage, type GapRow, type UsageRow,
} from './types';

type Db = { readonly db: SupabaseClient };

async function call<T>({ db }: Db, fn: string, args: Record<string, unknown>, schema: ZodType<T>): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw mapDbError(error);
  const p = schema.safeParse(data ?? []);
  if (!p.success) throw new AppError('internal', { cause: p.error });
  return p.data;
}

/** Aggregates only. Every RPC re-checks super admin in Postgres (0070); nothing here is authority. */
export const analyticsService = {
  async load(ctx: Db, days: number): Promise<AnalyticsPage> {
    const [overview, funnel, usage, gaps, cohorts] = await Promise.all([
      call(ctx, 'admin_analytics_overview', { p_days: days }, overviewRowsSchema),
      call(ctx, 'admin_funnel', { p_days: days }, funnelRowsSchema),
      call(ctx, 'admin_event_usage', { p_days: days }, usageRowsSchema),
      call(ctx, 'admin_demand_gaps', { p_days: days, p_min_zero: 1, p_limit: 50 }, gapRowsSchema),
      call(ctx, 'admin_cohorts', {}, cohortRowsSchema),
    ]);
    return { days, overview: toDays(overview), funnel: toFunnel(funnel), usage: toUsage(usage).slice(0, 30), gaps: toGaps(gaps), cohorts: toCohorts(cohorts) };
  },
  async gapsForExport(ctx: Db, days: number): Promise<GapRow[]> {
    return toGaps(await call(ctx, 'admin_demand_gaps', { p_days: days, p_min_zero: 1, p_limit: 500 }, gapRowsSchema));
  },
  async usageForExport(ctx: Db, days: number): Promise<UsageRow[]> {
    return toUsage(await call(ctx, 'admin_event_usage', { p_days: days }, usageRowsSchema));
  },
};
