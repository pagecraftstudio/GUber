import { AnalyticsView } from '@/components/admin/masar/AnalyticsView';
import type { RawSearchParams } from '@/features/auth/search-params';
import { analyticsService } from '@/features/analytics/service';
import { analyticsQuerySchema, type AnalyticsPage as Data } from '@/features/analytics/types';
import { ROLE_SETS } from '@/features/platform/permissions';
import { toClientError } from '@/lib/errors';
import { getPlatformServiceContext } from '@/lib/service/server';
import { firstParams } from '@/lib/validation/common';

export const metadata = { title: 'Analytics · Admin' };
export const dynamic = 'force-dynamic';

/** Platform analytics (aggregates). Super admin only: nav hides it, this guard and every RPC refuse everyone else. */
export default async function AnalyticsPage({ searchParams }: { searchParams: RawSearchParams }) {
  const ctx = await getPlatformServiceContext(ROLE_SETS.superAdminOnly);
  const raw = Object.fromEntries(Object.entries(firstParams(await searchParams)).filter(([, v]) => v !== undefined && v !== ''));
  const parsed = analyticsQuerySchema.safeParse(raw);
  const days = (parsed.success ? parsed.data : analyticsQuerySchema.parse({})).days;
  let page: { data: Data } | { error: string };
  try {
    page = { data: await analyticsService.load(ctx, days) };
  } catch (e) {
    page = { error: toClientError(e).message };
  }
  return <AnalyticsView days={days} page={page} />;
}
