import Link from 'next/link';
import { AdminPagination } from '@/components/admin/AdminPagination';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { AdminEmptyState, AdminErrorState } from '@/components/admin/StateViews';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { fmtDate } from '@/components/admin/format';
import { expireStaleSubscriptionsAction } from '@/features/admin/actions';
import type { RawSearchParams } from '@/features/auth/search-params';
import type { AdminSubscriptionItem } from '@/features/subscriptions/admin-output';
import { SUBSCRIPTION_STATES, subscriptionListSchema, type SubscriptionListQuery } from '@/features/subscriptions/schema';
import { subscriptionService } from '@/features/subscriptions/service';
import type { Page } from '@/lib/db/pagination';
import { toClientError } from '@/lib/errors';
import { getPlatformServiceContext } from '@/lib/service/server';
import { firstParams } from '@/lib/validation/common';

export const metadata = { title: 'Subscriptions · Admin' };
export const dynamic = 'force-dynamic';

const LABEL: Record<string, string> = {
  live: 'Live', stale: 'Stale (period ended)', expiring: 'Expiring in 14 days', trialing: 'Trialing',
  active: 'Active', past_due: 'Past due', cancelled: 'Cancelled', expired: 'Expired',
};

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
  const canWrite = ctx.platformRole === 'super_admin' || ctx.platformRole === 'billing';
  const filtersActive = Boolean(query.q || query.state);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Subscriptions</h1>
        {canWrite ? (
          <ConfirmDialog
            triggerLabel="Expire stale subscriptions"
            title="Mark stale subscriptions as expired?"
            description="Every subscription whose status still says live but whose period has ended becomes expired, and each change is audited. Access rules do not change: expired periods already block new trips, buses and bookings."
            confirmLabel="Expire stale"
            action={expireStaleSubscriptionsAction}
            hidden={{}}
          />
        ) : null}
      </div>
      <p className="text-xs text-slate-500">Assign a plan, change status or extend a period from the company page.</p>

      <form method="get" className="flex flex-col gap-2 sm:flex-row" role="search">
        <input name="q" defaultValue={query.q ?? ''} maxLength={100} placeholder="Search company name or slug" aria-label="Search subscriptions" className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" />
        <select name="state" defaultValue={query.state ?? ''} aria-label="Filter by state" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
          <option value="">All states</option>
          {SUBSCRIPTION_STATES.map((s) => (
            <option key={s} value={s}>{LABEL[s]}</option>
          ))}
        </select>
        <select name="sort" defaultValue={query.sort} aria-label="Sort by" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
          <option value="period_end">Period end</option>
          <option value="created_at">Created</option>
        </select>
        <select name="dir" defaultValue={query.dir} aria-label="Direction" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
          <option value="asc">Ascending</option>
          <option value="desc">Descending</option>
        </select>
        <button type="submit" className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">Apply</button>
        {filtersActive ? <Link href="/admin/subscriptions" className="self-center text-xs text-slate-500 underline">Clear</Link> : null}
      </form>

      {'error' in result ? (
        <AdminErrorState message={result.error} />
      ) : result.data.items.length === 0 ? (
        <AdminEmptyState
          title={filtersActive ? 'No subscriptions match' : 'No subscriptions yet'}
          description={filtersActive ? 'Try a different search or clear the filters.' : 'Subscriptions appear here once a company has a plan.'}
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full min-w-[44rem] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium">Company</th>
                  <th scope="col" className="px-4 py-2 font-medium">Plan</th>
                  <th scope="col" className="px-4 py-2 font-medium">State</th>
                  <th scope="col" className="px-4 py-2 font-medium">Billing</th>
                  <th scope="col" className="px-4 py-2 font-medium">Period</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {result.data.items.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link href={`/admin/companies/${s.companyId}`} className="font-medium text-slate-900 underline-offset-2 hover:underline">{s.companyName}</Link>
                      <p className="flex items-center gap-2 text-xs text-slate-500">{s.companySlug} <StatusBadge status={s.companyStatus} /></p>
                    </td>
                    <td className="px-4 py-3">{s.planName}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={s.state} />
                      {s.state === 'live' ? <p className="mt-1 text-xs text-slate-500">{s.status.replace('_', ' ')}</p> : null}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{s.billingInterval}</td>
                    <td className="px-4 py-3 text-xs tabular-nums text-slate-600">{fmtDate(s.currentPeriodStart)} → {fmtDate(s.currentPeriodEnd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <AdminPagination
            basePath="/admin/subscriptions"
            params={{ q: query.q, state: query.state, sort: query.sort, dir: query.dir }}
            page={result.data.page}
            pageSize={result.data.pageSize}
            total={result.data.total}
          />
        </>
      )}
    </div>
  );
}
