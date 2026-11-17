import { createClient } from '@/lib/supabase/server';
import { requireTenant } from '@/lib/auth/guards';
import { createTenantServiceContext } from '@/lib/service/context';
import { routePlanService } from '@/features/route-plans/service';
import { SubscriptionsMasarView, type RequestFilter } from '@/features/dashboard/masar/PlansMasarViews';
import type { SubscriptionStatus } from '@/features/route-plans/types';

const FILTERS: Record<RequestFilter, SubscriptionStatus[] | null> = { all: null, pending: ['pending'], active: ['active'], closed: ['rejected', 'cancelled', 'expired'] };

export default async function SubscriptionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const auth = await requireTenant('bookings.read');
  const ctx = createTenantServiceContext(await createClient(), auth);
  const raw = (await searchParams).status;
  const filter: RequestFilter = typeof raw === 'string' && raw in FILTERS ? (raw as RequestFilter) : 'pending';
  const wanted = FILTERS[filter];
  // one status = filtered in the database (so a long history can never hide pending rows); 'closed' spans three statuses
  const rows = await routePlanService.listSubscriptions(ctx, wanted && wanted.length === 1 ? { status: wanted[0] } : {});
  return <SubscriptionsMasarView rows={wanted ? rows.filter((r) => wanted.includes(r.status)) : rows} filter={filter} canDecide={auth.membership.permissions.includes('bookings.write')} />;
}
