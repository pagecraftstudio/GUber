import { AdminEmptyState, AdminErrorState } from '@/components/admin/StateViews';
import { subscriptionService } from '@/features/subscriptions/service';
import type { Plan } from '@/features/subscriptions/types';
import { toClientError } from '@/lib/errors';
import { getPlatformServiceContext } from '@/lib/service/server';

export const metadata = { title: 'Plans · Admin' };
export const dynamic = 'force-dynamic';

const KEY_LABEL: Record<string, string> = {
  max_users: 'Users', max_buses: 'Buses', max_drivers: 'Drivers', max_routes: 'Routes',
  max_trips_per_month: 'Trips / month', max_bookings_per_month: 'Bookings / month',
  feature_analytics: 'Analytics', feature_custom_domain: 'Custom domain', feature_notifications_sms: 'SMS notifications',
};

function entitlementText(e: Plan['entitlements'][string]): string {
  return e.kind === 'flag' ? (e.enabled ? 'Included' : 'Not included') : e.limit === null ? 'Unlimited' : e.limit.toLocaleString('en-US');
}

/** Read-only by design: editing plans and prices is a later decision (no write RPC exists for plans). */
export default async function PlansPage() {
  const ctx = await getPlatformServiceContext();
  let result: { data: Plan[] } | { error: string };
  try {
    result = { data: await subscriptionService.listPlans(ctx) };
  } catch (e) {
    result = { error: toClientError(e).message };
  }
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Plans</h1>
        <p className="text-xs text-slate-500">Read-only. Limits are enforced by the database on every new user, bus, driver, route, trip and booking.</p>
      </div>
      {'error' in result ? (
        <AdminErrorState message={result.error} />
      ) : result.data.length === 0 ? (
        <AdminEmptyState title="No plans" description="Plans are created by migrations." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {result.data.map((p) => (
            <article key={p.id} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
              <header className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-base font-semibold">{p.name}</h2>
                  <span className="font-mono text-xs text-slate-500">{p.code}</span>
                </div>
                <p className="text-xs text-slate-500">
                  {p.priceMonthly.toLocaleString('en-US')} {p.currency} / month
                  {p.priceYearly !== null ? ` · ${p.priceYearly.toLocaleString('en-US')} / year` : ''} · {p.trialDays}-day trial
                </p>
                <p className="text-xs text-slate-500">{p.isActive ? 'Active' : 'Inactive (cannot be assigned)'} · {p.isPublic ? 'Public' : 'Not public'}</p>
              </header>
              <dl className="divide-y divide-slate-100 text-sm">
                {Object.entries(p.entitlements).map(([key, e]) => (
                  <div key={key} className="flex justify-between gap-3 py-1.5">
                    <dt className="text-slate-600">{KEY_LABEL[key] ?? key}</dt>
                    <dd className="tabular-nums text-slate-900">{entitlementText(e)}</dd>
                  </div>
                ))}
              </dl>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
