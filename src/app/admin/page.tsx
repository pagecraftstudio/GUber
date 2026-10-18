import Link from 'next/link';
import { AdminEmptyState, AdminErrorState } from '@/components/admin/StateViews';
import { StatCard } from '@/components/admin/StatCard';
import { platformOverviewService } from '@/features/platform/service';
import type { PlatformOverview } from '@/features/platform/schema';
import { toClientError } from '@/lib/errors';
import { getPlatformServiceContext } from '@/lib/service/server';

export const metadata = { title: 'Admin overview' };
export const dynamic = 'force-dynamic'; // live platform numbers, never cached

async function load(): Promise<{ data: PlatformOverview } | { error: string }> {
  const ctx = await getPlatformServiceContext(); // guard: 404 / login redirect happens here, outside the try
  try {
    return { data: await platformOverviewService.getOverview(ctx) };
  } catch (e) {
    return { error: toClientError(e).message }; // safe message only; raw cause stays server-side
  }
}

const fmt = (iso: string) => new Date(iso).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';

export default async function AdminOverviewPage() {
  const res = await load();
  if ('error' in res) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Platform overview</h1>
        <AdminErrorState message={res.error} />
      </div>
    );
  }
  const { companies: c, subscriptions: s, usage: u, recentActivity } = res.data;
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Platform overview</h1>
        <p className="text-xs text-slate-500">As of {fmt(res.data.generatedAt)}</p>
      </div>

      <section aria-labelledby="h-companies" className="space-y-3">
        <h2 id="h-companies" className="text-sm font-semibold text-slate-700">Companies</h2>
        {c.total === 0 ? (
          <AdminEmptyState title="No companies yet" description="Companies appear here once they are created." />
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <StatCard label="Total" value={c.total} />
            <StatCard label="Active" value={c.active} tone="good" />
            <StatCard label="Trial" value={c.trial} tone="warn" />
            <StatCard label="Suspended" value={c.suspended} tone={c.suspended ? 'bad' : 'neutral'} />
            <StatCard label="Cancelled" value={c.cancelled} />
          </div>
        )}
      </section>

      <section aria-labelledby="h-subs" className="space-y-3">
        <h2 id="h-subs" className="text-sm font-semibold text-slate-700">Subscriptions</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <StatCard label="Active" value={s.active} tone="good" />
          <StatCard label="Trialing" value={s.trialing} tone="warn" />
          <StatCard label="Past due" value={s.pastDue} tone={s.pastDue ? 'bad' : 'neutral'} />
          <StatCard label="Expiring in 14 days" value={s.expiring14d} tone={s.expiring14d ? 'warn' : 'neutral'} />
          <StatCard label="Stale (period ended)" value={s.staleLive} tone={s.staleLive ? 'bad' : 'neutral'} hint="Status still live, period over" />
          <StatCard label="Companies without plan" value={s.companiesWithoutLive} tone={s.companiesWithoutLive ? 'bad' : 'neutral'} hint="New trips, buses, bookings blocked" />
        </div>
      </section>

      <section aria-labelledby="h-usage" className="space-y-3">
        <h2 id="h-usage" className="text-sm font-semibold text-slate-700">Usage</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <StatCard label="Trips" value={u.tripsTotal} />
          <StatCard label="Trips (30 days)" value={u.trips30d} />
          <StatCard label="Bookings" value={u.bookingsTotal} />
          <StatCard label="Bookings (30 days)" value={u.bookings30d} />
          <StatCard label="Customers" value={u.customersTotal} />
        </div>
      </section>

      <section aria-labelledby="h-activity" className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 id="h-activity" className="text-sm font-semibold text-slate-700">Recent platform activity</h2>
          <span className="text-xs text-slate-400">Full audit log: coming in 7.5</span>
        </div>
        {recentActivity.length === 0 ? (
          <AdminEmptyState title="No activity yet" description="Privileged platform actions are recorded here." />
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {recentActivity.map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">{a.action}</p>
                  <p className="truncate text-xs text-slate-500">
                    {a.entityType} · {a.actorType.replace('_', ' ')}
                    {a.companyName ? ` · ${a.companyName}` : ''}
                  </p>
                </div>
                <time dateTime={a.createdAt} className="text-xs tabular-nums text-slate-500">{fmt(a.createdAt)}</time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
