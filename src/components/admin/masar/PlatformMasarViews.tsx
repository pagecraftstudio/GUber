import Link from 'next/link';
import { Check, Clock, TriangleAlert } from 'lucide-react';
import { StatusBadge } from '@/ds/data/StatusBadge';
import { MetricCard } from '@/ds/data/Layout';
import { Pagination } from '@/ds/data/Pagination';
import { EmptyState, ErrorState } from '@/ds/feedback/States';
import { InlineAlert } from '@/ds/feedback/InlineAlert';
import { formatDate, formatDateTime, formatNumber } from '@/ds/format';
import { Identifier } from '@/ds/format/Identifier';
import { buttonClass } from '@/ds/primitives/button-class';
import { cx, FOCUS } from '@/ds/primitives/cx';
import { PageHeaderMasar } from '@/features/dashboard/masar/PageHeaderMasar';
import { UrlFilterBar } from '@/features/dashboard/masar/UrlFilterBar';
import { actionLabel, ACTOR_LABEL, ACTOR_TYPES, AUDIT_NAMESPACES, NAMESPACE_LABEL, type AuditActorType } from '@/features/audit/catalog';
import { auditHref, entityHref } from '@/features/audit/links';
import type { AuditEntry, AuditItem, AuditPage, AuditSummary } from '@/features/audit/schema';
import type { MetadataView } from '@/features/audit/diff';
import type { PlatformOverview } from '@/features/platform/schema';
import type { Plan } from '@/features/subscriptions/types';
import type { AdminSubscriptionItem } from '@/features/subscriptions/admin-output';
import { SUBSCRIPTION_STATES } from '@/features/subscriptions/schema';
import type { Page } from '@/lib/db/pagination';
import { AdminActionDialog } from './AdminActionDialog';
import type { AdminActionState } from '@/features/admin/action-state';

/** Admin is English-only (decision in the terminology sheet). Instants are shown in UTC with the zone written out, as before. */
const utc = (iso: string) => `${formatDateTime(iso, 'en', { timeZone: 'UTC' })} UTC`;
const card = 'rounded-ds-md border border-line-default bg-surface-card';
const th = 'px-4 py-2.5 text-start text-[13px] font-medium text-ink-secondary';
const link = cx('text-ink-primary underline-offset-2 hover:underline', FOCUS);
const mutedLink = cx('text-ink-link underline-offset-2 hover:underline', FOCUS);
const H2 = ({ id, children }: { id: string; children: React.ReactNode }) => <h2 id={id} className="text-base font-medium text-ink-primary">{children}</h2>;
const n = (v: number) => formatNumber(v, 'en');

type Loaded<T> = { data: T } | { error: string };

// ---------------------------------------------------------------- Overview
export function PlatformOverviewMasar({ res }: { res: Loaded<PlatformOverview> }) {
  if ('error' in res) return <div><PageHeaderMasar title="Platform overview" /><ErrorState title="Could not load the overview" description={res.error} /></div>;
  const { companies: c, subscriptions: s, usage: u, recentActivity } = res.data;
  const flag = (v: number, text: string) => (v > 0 ? text : undefined);
  return (
    <div className="space-y-8">
      <PageHeaderMasar title="Platform overview" description={`As of ${utc(res.data.generatedAt)}`} />

      <section aria-labelledby="h-companies" className="space-y-3">
        <H2 id="h-companies">Companies</H2>
        {c.total === 0 ? <EmptyState title="No companies yet" description="Companies appear here once they are created." /> : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <MetricCard label="Total" value={n(c.total)} />
            <MetricCard label="Active" value={n(c.active)} />
            <MetricCard label="Trial" value={n(c.trial)} />
            <MetricCard label="Suspended" value={n(c.suspended)} comparison={flag(c.suspended, 'Locked out until reactivated')} />
            <MetricCard label="Cancelled" value={n(c.cancelled)} />
          </div>
        )}
      </section>

      <section aria-labelledby="h-subs" className="space-y-3">
        <H2 id="h-subs">Subscriptions</H2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <MetricCard label="Active" value={n(s.active)} />
          <MetricCard label="Trialing" value={n(s.trialing)} />
          <MetricCard label="Past due" value={n(s.pastDue)} comparison={flag(s.pastDue, 'Needs follow-up')} />
          <MetricCard label="Expiring in 14 days" value={n(s.expiring14d)} comparison={flag(s.expiring14d, 'Renew or extend')} />
          <MetricCard label="Stale (period ended)" value={n(s.staleLive)} comparison={s.staleLive ? 'Status still live, period over' : undefined} />
          <MetricCard label="Companies without plan" value={n(s.companiesWithoutLive)} comparison={s.companiesWithoutLive ? 'New trips, buses, bookings blocked' : undefined} />
        </div>
      </section>

      <section aria-labelledby="h-usage" className="space-y-3">
        <H2 id="h-usage">Usage</H2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <MetricCard label="Trips" value={n(u.tripsTotal)} />
          <MetricCard label="Trips (30 days)" value={n(u.trips30d)} />
          <MetricCard label="Bookings" value={n(u.bookingsTotal)} />
          <MetricCard label="Bookings (30 days)" value={n(u.bookings30d)} />
          <MetricCard label="Customers" value={n(u.customersTotal)} />
        </div>
      </section>

      <section aria-labelledby="h-activity" className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <H2 id="h-activity">Recent platform activity</H2>
          <Link href="/admin/audit-logs" className={cx('text-sm', mutedLink)}>View all</Link>
        </div>
        {recentActivity.length === 0 ? <EmptyState title="No activity yet" description="Privileged platform actions are recorded here." /> : (
          <ul className={cx(card, 'divide-y divide-line-default')}>
            {recentActivity.map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3">
                <div className="min-w-0">
                  <Link href={`/admin/audit-logs/${a.id}`} className={cx('block truncate text-sm font-medium', link)}>{actionLabel(a.action)}</Link>
                  <p className="truncate text-[13px] text-ink-secondary">{a.entityType} · {a.actorType.replace('_', ' ')}{a.companyName ? ` · ${a.companyName}` : ''}</p>
                </div>
                <time dateTime={a.createdAt} className="text-[13px] text-ink-muted tabular-nums">{utc(a.createdAt)}</time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- Plans
const KEY_LABEL: Record<string, string> = {
  max_users: 'Users', max_buses: 'Buses', max_drivers: 'Drivers', max_routes: 'Routes', max_trips_per_month: 'Trips / month', max_bookings_per_month: 'Bookings / month',
  feature_analytics: 'Analytics', feature_custom_domain: 'Custom domain', feature_notifications_sms: 'SMS notifications',
};
const entitlementText = (e: Plan['entitlements'][string]): string => (e.kind === 'flag' ? (e.enabled ? 'Included' : 'Not included') : e.limit === null ? 'Unlimited' : n(e.limit));

export function PlansMasar({ result }: { result: Loaded<Plan[]> }) {
  return (
    <div>
      <PageHeaderMasar title="Plans" description="Read-only. Limits are enforced by the database on every new user, bus, driver, route, trip and booking." />
      {'error' in result ? <ErrorState title="Could not load plans" description={result.error} /> : result.data.length === 0 ? <EmptyState title="No plans" description="Plans are created by migrations." /> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {result.data.map((p) => (
            <article key={p.id} className={cx(card, 'space-y-3 p-5')}>
              <header className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-base font-medium text-ink-primary">{p.name}</h2>
                  <Identifier value={p.code} />
                </div>
                <p className="text-[13px] text-ink-secondary tabular-nums">
                  {n(p.priceMonthly)} {p.currency} / month{p.priceYearly !== null ? ` · ${n(p.priceYearly)} / year` : ''} · {p.trialDays}-day trial
                </p>
                <p className="text-[13px] text-ink-secondary">{p.isActive ? 'Active' : 'Inactive (cannot be assigned)'} · {p.isPublic ? 'Public' : 'Not public'}</p>
              </header>
              <dl className="divide-y divide-line-default text-sm">
                {Object.entries(p.entitlements).map(([key, e]) => (
                  <div key={key} className="flex justify-between gap-3 py-2">
                    <dt className="text-ink-secondary">{KEY_LABEL[key] ?? key}</dt>
                    <dd className="text-ink-primary tabular-nums">{entitlementText(e)}</dd>
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

// ---------------------------------------------------------------- Subscriptions
const STATE_LABEL: Record<string, string> = { live: 'Live', stale: 'Stale (period ended)', expiring: 'Expiring in 14 days', trialing: 'Trialing', active: 'Active', past_due: 'Past due', cancelled: 'Cancelled', expired: 'Expired' };

/** The list's "state" adds live, stale and expiring to the stored statuses; icon + text + tint like every other status. */
function StateBadge({ state }: { state: string }) {
  if (state === 'live') return <span className="inline-flex h-6 items-center gap-1.5 rounded-ds-sm bg-status-success-bg px-2 text-[13px] font-medium text-status-success-fg"><Check size={14} strokeWidth={1.5} aria-hidden="true" />Live</span>;
  if (state === 'stale') return <span className="inline-flex h-6 items-center gap-1.5 rounded-ds-sm bg-status-error-bg px-2 text-[13px] font-medium text-status-error-fg"><TriangleAlert size={14} strokeWidth={1.5} aria-hidden="true" />Stale</span>;
  if (state === 'expiring') return <span className="inline-flex h-6 items-center gap-1.5 rounded-ds-sm bg-status-warning-bg px-2 text-[13px] font-medium text-status-warning-fg"><Clock size={14} strokeWidth={1.5} aria-hidden="true" />Expiring</span>;
  return <StatusBadge domain="subscription" value={state} lang="en" />;
}

export interface SubscriptionsMasarProps {
  query: { q?: string | undefined; state?: string | undefined; sort: string; dir: string };
  result: Loaded<Page<AdminSubscriptionItem>>;
  canWrite: boolean;
  expireAction: (prev: AdminActionState, fd: FormData) => Promise<AdminActionState>;
}

export function SubscriptionsMasar({ query, result, canWrite, expireAction }: SubscriptionsMasarProps) {
  const filtersActive = Boolean(query.q || query.state);
  const base = '/admin/subscriptions';
  const hrefWith = (over: Record<string, string | undefined>) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries({ q: query.q, state: query.state, sort: query.sort, dir: query.dir, ...over })) if (v) qs.set(k, v);
    const s = qs.toString();
    return s ? `${base}?${s}` : base;
  };
  const chips = [
    ...(query.q ? [{ key: 'q', label: `Search: ${query.q}`, href: hrefWith({ q: undefined }) }] : []),
    ...(query.state ? [{ key: 'state', label: `State: ${STATE_LABEL[query.state] ?? query.state}`, href: hrefWith({ state: undefined }) }] : []),
  ];
  return (
    <div>
      <PageHeaderMasar title="Subscriptions" description="Assign a plan, change status or extend a period from the company page."
        actions={canWrite ? (
          <AdminActionDialog triggerLabel="Expire stale subscriptions" title="Mark stale subscriptions as expired?"
            description="Every subscription whose status still says live but whose period has ended becomes expired, and each change is audited. Access rules do not change: expired periods already block new trips, buses and bookings."
            confirmLabel="Expire stale" action={expireAction} hidden={{}} />
        ) : undefined} />
      <UrlFilterBar
        fields={[
          { kind: 'search', name: 'q', label: 'Search', value: query.q ?? '', placeholder: 'Company name or slug' },
          { kind: 'select', name: 'state', label: 'State', value: query.state ?? '', allLabel: 'All states', options: SUBSCRIPTION_STATES.map((s) => [s, STATE_LABEL[s] ?? s] as const) },
          { kind: 'select', name: 'sort', label: 'Sort by', value: query.sort, options: [['period_end', 'Period end'], ['created_at', 'Created']] },
          { kind: 'select', name: 'dir', label: 'Direction', value: query.dir, options: [['asc', 'Ascending'], ['desc', 'Descending']] },
        ]}
        keep={{}} chips={chips} clearHref={base} />
      {'error' in result ? <ErrorState title="Could not load subscriptions" description={result.error} /> : result.data.items.length === 0 ? (
        <EmptyState title={filtersActive ? 'No subscriptions match' : 'No subscriptions yet'} description={filtersActive ? 'Try a different search or clear the filters.' : 'Subscriptions appear here once a company has a plan.'} />
      ) : (
        <div className="space-y-4">
          <div className={cx(card, 'relative overflow-x-auto')}>
            <table className="w-full min-w-[44rem] border-collapse text-sm">
              <caption className="sr-only">Subscriptions</caption>
              <thead className="bg-surface-sunken"><tr>{['Company', 'Plan', 'State', 'Billing', 'Period'].map((h) => <th key={h} scope="col" className={th}>{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-line-default">
                {result.data.items.map((s) => (
                  <tr key={s.id} className="align-top hover:bg-surface-page">
                    <td className="px-4 py-3">
                      <Link href={`/admin/companies/${s.companyId}`} className={cx('font-medium', link)}>{s.companyName}</Link>
                      <p className="flex flex-wrap items-center gap-2 text-[13px] text-ink-muted"><Identifier value={s.companySlug} /><StatusBadge domain="company" value={s.companyStatus} lang="en" /></p>
                    </td>
                    <td className="px-4 py-3 text-ink-primary">{s.planName}</td>
                    <td className="px-4 py-3"><StateBadge state={s.state} />{s.state === 'live' ? <p className="mt-1 text-[13px] text-ink-muted">{(STATE_LABEL[s.status] ?? s.status.replace('_', ' '))}</p> : null}</td>
                    <td className="px-4 py-3 text-[13px] text-ink-secondary">{s.billingInterval === 'yearly' ? 'Yearly' : s.billingInterval === 'monthly' ? 'Monthly' : s.billingInterval}</td>
                    <td className="px-4 py-3 text-[13px] text-ink-secondary tabular-nums">{formatDate(s.currentPeriodStart, 'en', { timeZone: 'UTC' })} → {formatDate(s.currentPeriodEnd, 'en', { timeZone: 'UTC' })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={result.data.page} pageCount={Math.max(1, Math.ceil(result.data.total / result.data.pageSize))} hrefBase={base} hrefParams={{ q: query.q, state: query.state, sort: query.sort, dir: query.dir }} lang="en" />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Audit
const actorKind = (t: string) => ACTOR_LABEL[t as AuditActorType] ?? t;

/** Server component. All values are rendered as text (escaped). `compact` drops the company column for per-company views. */
export function AuditTableMasar({ items, compact = false }: { items: AuditItem[]; compact?: boolean }) {
  return (
    <div className={cx(card, 'relative overflow-x-auto')}>
      <table className="w-full min-w-[40rem] border-collapse text-sm">
        <caption className="sr-only">Audit entries, newest first</caption>
        <thead className="bg-surface-sunken"><tr><th scope="col" className={th}>When</th><th scope="col" className={th}>Action</th><th scope="col" className={th}>Actor</th>{compact ? null : <th scope="col" className={th}>Company</th>}</tr></thead>
        <tbody className="divide-y divide-line-default">
          {items.map((a) => {
            const subject = entityHref(a.entityType, a.entityId, a.companyId);
            return (
              <tr key={a.id} className="align-top hover:bg-surface-page">
                <td className="px-4 py-3 text-[13px] whitespace-nowrap text-ink-secondary tabular-nums"><time dateTime={a.createdAt}>{utc(a.createdAt)}</time></td>
                <td className="px-4 py-3">
                  <Link href={`/admin/audit-logs/${a.id}`} className={cx('font-medium', link)}>{actionLabel(a.action)}</Link>
                  <p className="text-[13px] text-ink-secondary"><Identifier value={a.action} /> · {subject ? <Link href={subject} className={mutedLink}>{a.entityType}</Link> : a.entityType}</p>
                  {a.changedKeys.length > 0 ? <p className="mt-0.5 text-[13px] text-ink-muted">Fields: {a.changedKeys.join(', ')}</p> : null}
                </td>
                <td className="px-4 py-3 text-ink-primary">
                  {a.actorId ? <Link href={auditHref({ actor: a.actorId })} className={link}>{a.actorName ?? 'Unknown user'}</Link> : <span>{a.actorName ?? '—'}</span>}
                  <p className="text-[13px] text-ink-secondary">{actorKind(a.actorType)}</p>
                </td>
                {compact ? null : <td className="px-4 py-3 text-ink-primary">{a.companyId ? <Link href={auditHref({ company: a.companyId })} className={link}>{a.companyName ?? 'Company'}</Link> : <span className="text-ink-muted">Platform</span>}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export interface AuditListMasarProps {
  query: { company?: string | undefined; namespace?: string | undefined; actorType?: string | undefined; actor?: string | undefined; from?: string | undefined; to?: string | undefined; bat?: string | undefined };
  page: Loaded<AuditPage>;
  summary: AuditSummary | null;
  days: 7 | 30;
  ignored: boolean;
}

export function AuditListMasar({ query, page, summary, days, ignored }: AuditListMasarProps) {
  const keep = { company: query.company, namespace: query.namespace, actorType: query.actorType, actor: query.actor, from: query.from, to: query.to };
  const filtered = Boolean(query.company || query.namespace || query.actorType || query.actor || query.from || query.to);
  const companyName = 'error' in page ? null : page.data.items.find((i) => i.companyId === query.company)?.companyName;
  const actorName = 'error' in page ? null : page.data.items.find((i) => i.actorId === query.actor)?.actorName;
  const chips = [
    ...(query.company ? [{ key: 'company', label: `Company: ${companyName ?? query.company.slice(0, 8)}`, href: auditHref({ ...keep, company: undefined }) }] : []),
    ...(query.actor ? [{ key: 'actor', label: `Actor: ${actorName ?? query.actor.slice(0, 8)}`, href: auditHref({ ...keep, actor: undefined }) }] : []),
  ];
  const hidden: Record<string, string> = {};
  if (query.company) hidden.company = query.company;
  if (query.actor) hidden.actor = query.actor;
  return (
    <div className="space-y-5">
      <PageHeaderMasar title="Audit logs" description="Append-only record of privileged actions. Newest first. Viewing the log is not itself logged." />

      {summary ? (
        <section aria-labelledby="h-sum" className={cx(card, 'space-y-4 p-5')}>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <H2 id="h-sum">Last {summary.days} days: {n(summary.total)} entries</H2>
            <nav aria-label="Summary period" className="flex gap-3 text-sm">
              {([7, 30] as const).map((d) => <Link key={d} href={auditHref({ ...keep, days: String(d) })} aria-current={days === d ? 'true' : undefined} className={cx(FOCUS, days === d ? 'font-medium text-ink-primary underline' : 'text-ink-link underline-offset-2 hover:underline')}>{d} days</Link>)}
            </nav>
          </div>
          <div className="grid gap-5 text-sm sm:grid-cols-2">
            <div>
              <h3 className="text-[13px] font-medium text-ink-secondary">By area</h3>
              {summary.byNamespace.length === 0 ? <p className="text-[13px] text-ink-muted">No activity.</p> : (
                <ul className="mt-1 space-y-1">{summary.byNamespace.map((x) => <li key={x.namespace} className="flex justify-between"><Link href={auditHref({ ...keep, namespace: x.namespace })} className={link}>{x.namespace}</Link><span className="text-ink-secondary tabular-nums">{n(x.count)}</span></li>)}</ul>
              )}
            </div>
            <div>
              <h3 className="text-[13px] font-medium text-ink-secondary">MASAR platform team activity</h3>
              {summary.platformActors.length === 0 ? <p className="text-[13px] text-ink-muted">No staff activity.</p> : (
                <ul className="mt-1 space-y-1">{summary.platformActors.map((a) => (
                  <li key={a.actorId ?? 'none'} className="flex justify-between">
                    {a.actorId ? <Link href={auditHref({ actor: a.actorId })} className={link}>{a.actorName ?? 'Unknown user'}</Link> : <span>{a.actorName ?? 'Unknown'}</span>}
                    <span className="text-ink-secondary tabular-nums">{n(a.count)}</span>
                  </li>))}</ul>
              )}
            </div>
          </div>
        </section>
      ) : null}

      <UrlFilterBar
        fields={[
          { kind: 'select', name: 'namespace', label: 'Area', value: query.namespace ?? '', allLabel: 'All areas', options: AUDIT_NAMESPACES.map((x) => [x, NAMESPACE_LABEL[x]] as const) },
          { kind: 'select', name: 'actorType', label: 'Actor type', value: query.actorType ?? '', allLabel: 'Anyone', options: ACTOR_TYPES.map((x) => [x, ACTOR_LABEL[x]] as const) },
          { kind: 'date', name: 'from', label: 'From (UTC)', value: query.from ?? '' },
          { kind: 'date', name: 'to', label: 'To (UTC)', value: query.to ?? '' },
        ]}
        keep={hidden} chips={chips} clearHref="/admin/audit-logs" />
      {ignored ? <InlineAlert tone="warning">Some filters were not valid and were ignored.</InlineAlert> : null}

      {'error' in page ? <ErrorState title="Could not load the audit log" description={page.error} /> : page.data.items.length === 0 ? (
        <EmptyState title={filtered || query.bat ? 'No entries match' : 'No audit entries yet'} description={filtered || query.bat ? 'Try a wider date range or clear the filters.' : 'Privileged actions are recorded here as they happen.'} />
      ) : (
        <>
          <AuditTableMasar items={page.data.items} />
          <nav aria-label="Pagination" className="flex items-center justify-between gap-3">
            {query.bat ? <Link href={auditHref(keep)} className={buttonClass('secondary', 'md')}>← Newest</Link> : <span />}
            {page.data.next ? <Link href={auditHref({ ...keep, bat: page.data.next.bat, bid: page.data.next.bid })} className={buttonClass('secondary', 'md')}>Older entries →</Link> : <span className="text-[13px] text-ink-muted">End of log</span>}
          </nav>
        </>
      )}
    </div>
  );
}

export function AuditEntryMasar({ e, view, subject }: { e: AuditEntry; view: MetadataView; subject: string | null }) {
  const dt = 'text-[13px] text-ink-secondary';
  return (
    <div className="min-w-0 max-w-full space-y-5">
      <div>
        <Link href="/admin/audit-logs" className={cx('text-sm', mutedLink)}>← Audit logs</Link>
        <PageHeaderMasar title={actionLabel(e.action)} description={<Identifier value={e.action} />} />
      </div>
      <dl className={cx(card, 'grid gap-x-6 gap-y-4 p-5 text-sm sm:grid-cols-2')}>
        <div><dt className={dt}>When</dt><dd className="text-ink-primary tabular-nums"><time dateTime={e.createdAt}>{utc(e.createdAt)}</time></dd></div>
        <div><dt className={dt}>Actor</dt>
          <dd className="text-ink-primary">
            {e.actorId ? <Link href={auditHref({ actor: e.actorId })} className={link}>{e.actorName ?? 'Unknown user'}</Link> : (e.actorName ?? '—')}
            <span className={dt}> · {actorKind(e.actorType)}</span>
            {e.actorEmail ? <span className={cx('block', dt)}><Identifier value={e.actorEmail} /></span> : null}
          </dd></div>
        <div><dt className={dt}>Company</dt><dd className="text-ink-primary">{e.companyId ? <Link href={`/admin/companies/${e.companyId}`} className={link}>{e.companyName ?? 'Company'}</Link> : 'Platform'}</dd></div>
        <div><dt className={dt}>Subject</dt>
          <dd className="text-ink-primary">{subject ? <Link href={subject} className={link}>{e.entityType}</Link> : e.entityType}{e.entityId ? <span className={cx('block break-all', dt)}><Identifier value={e.entityId} /></span> : null}</dd></div>
        <div className="sm:col-span-2"><dt className={dt}>Entry id</dt><dd className="break-all text-[13px] text-ink-primary"><Identifier value={e.id} /></dd></div>
      </dl>

      <section aria-labelledby="h-details" className="min-w-0 max-w-full space-y-3">
        <H2 id="h-details">Details</H2>
        {e.metadataRedacted ? <InlineAlert tone="info">Details for this entry are not available to your role.</InlineAlert>
          : view.rows.length === 0 && view.extra.length === 0 ? <p className="text-sm text-ink-secondary">This entry carries no details.</p> : (
            <>
              {view.rows.length > 0 ? (
                <div className={cx(card, 'relative max-w-full overflow-x-auto')}>
                  <table className="w-full min-w-[32rem] border-collapse text-sm">
                    <caption className="sr-only">Changed fields</caption>
                    <thead className="bg-surface-sunken"><tr><th scope="col" className={th}>Field</th><th scope="col" className={th}>Before</th><th scope="col" className={th}>After</th></tr></thead>
                    <tbody className="divide-y divide-line-default">
                      {view.rows.map((r) => (
                        <tr key={r.key} className={r.changed ? 'bg-status-warning-bg' : ''}>
                          <th scope="row" className="px-4 py-2.5 text-start text-[13px] font-medium text-ink-primary"><Identifier value={r.key} /></th>
                          <td className="px-4 py-2.5 break-words text-ink-secondary">{r.before ?? '—'}</td>
                          <td className="px-4 py-2.5 break-words text-ink-primary">{r.after ?? '—'}{r.changed ? <span className="text-[13px] text-status-warning-fg"> · changed</span> : null}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              {view.extra.length > 0 ? (
                <dl className={cx(card, 'grid gap-x-6 gap-y-3 p-5 text-sm sm:grid-cols-2')}>
                  {view.extra.map((x) => <div key={x.key}><dt className={dt}><Identifier value={x.key} /></dt><dd className="break-words text-ink-primary">{x.value}</dd></div>)}
                </dl>
              ) : null}
            </>
          )}
      </section>
    </div>
  );
}
