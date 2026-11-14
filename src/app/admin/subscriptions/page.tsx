
import { SubscriptionsMasar } from '@/components/admin/masar/PlatformMasarViews';


import { expireStaleSubscriptionsAction } from '@/features/admin/actions';
import type { RawSearchParams } from '@/features/auth/search-params';
import type { AdminSubscriptionItem } from '@/features/subscriptions/admin-output';
import { subscriptionListSchema, type SubscriptionListQuery } from '@/features/subscriptions/schema';
import { subscriptionService } from '@/features/subscriptions/service';
import type { Page } from '@/lib/db/pagination';
import { toClientError } from '@/lib/errors';
import { getPlatformServiceContext } from '@/lib/service/server';
import { firstParams } from '@/lib/validation/common';

export const metadata = { title: 'Subscriptions · Admin' };
export const dynamic = 'force-dynamic';


export default async function SubscriptionsPage({ searchParams }: { searchParams: RawSearchParams }) {
  const ctx = await getPlatformServiceContext(); // any platform role may browse
  const parsed = subscriptionListSchema.safeParse(firstParams(await searchParams));
  const query: SubscriptionListQuery = parsed.success ? parsed.data : subscriptionListSchema.parse({});

  let result: { data: Page<AdminSubscriptionItem> } | { error: string };
  try {
    result = { data: await subscriptionService.adminList(ctx, query) };
  } catch (e) {
    result = { error: toClientError(e).message };
  }
  const canWrite = ctx.auth.platformRole === 'super_admin' || ctx.auth.platformRole === 'billing';
  return <SubscriptionsMasar query={{ q: query.q, state: query.state, sort: query.sort, dir: query.dir }} result={result} canWrite={canWrite} expireAction={expireStaleSubscriptionsAction} />;
}
