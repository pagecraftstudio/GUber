
import { PlansMasar } from '@/components/admin/masar/PlatformMasarViews';
import { subscriptionService } from '@/features/subscriptions/service';
import type { Plan } from '@/features/subscriptions/types';
import { toClientError } from '@/lib/errors';
import { getPlatformServiceContext } from '@/lib/service/server';

export const metadata = { title: 'Plans · Admin' };
export const dynamic = 'force-dynamic';



/** Read-only by design: editing plans and prices is a later decision (no write RPC exists for plans). */
export default async function PlansPage() {
  const ctx = await getPlatformServiceContext();
  let result: { data: Plan[] } | { error: string };
  try {
    result = { data: await subscriptionService.listPlans(ctx) };
  } catch (e) {
    result = { error: toClientError(e).message };
  }
  return <PlansMasar result={result} />;
}
