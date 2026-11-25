import { PlansAdminView } from '@/components/admin/masar/PlansAdminView';
import { planService } from '@/features/plans/service';
import type { PlanOverview } from '@/features/plans/output';
import { toClientError } from '@/lib/errors';
import { getPlatformServiceContext } from '@/lib/service/server';

export const metadata = { title: 'Plans · Admin' };
export const dynamic = 'force-dynamic';

/** Every platform role may read the plans; only super_admin sees the edit controls (and Postgres refuses everyone else regardless). */
export default async function PlansPage() {
  const ctx = await getPlatformServiceContext();
  let result: { data: PlanOverview } | { error: string };
  try {
    result = { data: await planService.overview(ctx) };
  } catch (e) {
    result = { error: toClientError(e).message };
  }
  return <PlansAdminView result={result} isSuper={ctx.auth.platformRole === 'super_admin'} />;
}
