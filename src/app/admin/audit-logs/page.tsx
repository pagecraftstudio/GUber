import Link from 'next/link';
import { AdminEmptyState, AdminErrorState } from '@/components/admin/StateViews';
import { AuditTable } from '@/components/admin/AuditTable';
import { ACTOR_LABEL, ACTOR_TYPES, AUDIT_NAMESPACES, NAMESPACE_LABEL } from '@/features/audit/catalog';
import { auditHref } from '@/features/audit/links';
import { auditListSchema, type AuditPage, type AuditSummary } from '@/features/audit/schema';
import { auditService, AUDIT_SUMMARY_ROLES } from '@/features/audit/service';
import type { RawSearchParams } from '@/features/auth/search-params';
import { hasPlatformRole } from '@/lib/auth/permissions';
import { toClientError } from '@/lib/errors';
import { getPlatformServiceContext } from '@/lib/service/server';
import { firstParams } from '@/lib/validation/common';

export const metadata = { title: 'Audit logs · Admin' };
export const dynamic = 'force-dynamic';

export default async function AuditLogsPage({ searchParams }: { searchParams: RawSearchParams }) {
  const ctx = await getPlatformServiceContext(); // any platform role; metadata redaction happens in Postgres
  // An HTML form submits every field, empty ones as "". Treat blank as "not set" so one empty box cannot invalidate the rest.
  const raw = Object.fromEntries(Object.entries(firstParams(await searchParams)).filter(([, v]) => v !== undefined && v !== ''));
  const parsed = auditListSchema.safeParse(raw);
  const query = parsed.success ? parsed.data : auditListSchema.parse({});
  const ignored = !parsed.success;
  const showSummary = hasPlatformRole(ctx.auth, AUDIT_SUMMARY_ROLES);
  const days = raw.days === '30' ? 30 : 7;

  let page: { data: AuditPage } | { error: string };
  try {
    page = { data: await auditService.list(ctx, query) };
  } catch (e) {
    page = { error: toClientError(e).message };
  }
  let summary: AuditSummary | null = null;
  if (showSummary) {
    try {
      summary = await auditService.summary(ctx, days);
    } catch {
      summary = null; // the summary is a convenience; the list below still renders
    }
  }

  const filtered = Boolean(query.company || query.namespace || query.actorType || query.actor || query.from || query.to);
  const keep = { company: query.company, namespace: query.namespace, actorType: query.actorType, actor: query.actor, from: query.from, to: query.to };
  const chip = 'inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-700';
  const firstName = 'error' in page ? null : page.data.items.find((i) => i.companyId === query.company)?.companyName;
  const actorName = 'error' in page ? null : page.data.items.find((i) => i.actorId === query.actor)?.actorName;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Audit logs</h1>
        <p className="text-xs text-slate-500">Append-only record of privileged actions. Newest first. Viewing the log is not itself logged.</p>
      </div>

      {summary ? (
        <section aria-labelledby="h-sum" className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="h-sum" className="text-sm font-semibold text-slate-700">Last {summary.days} days: {summary.total.toLocaleString('en-US')} entries</h2>
            <span className="flex gap-3 text-xs">
              <Link href={auditHref({ ...keep, days: '7' })} className={days === 7 ? 'font-semibold underline' : 'text-slate-500 underline'}>7 days</Link>
              <Link href={auditHref({ ...keep, days: '30' })} className={days === 30 ? 'font-semibold underline' : 'text-slate-500 underline'}>30 days</Link>
            </span>
          </div>
          <div className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">By area</p>
              {summary.byNamespace.length === 0 ? <p className="text-xs text-slate-500">No activity.</p> : (
                <ul className="mt-1 space-y-0.5">
                  {summary.byNamespace.map((n) => (
                    <li key={n.namespace} className="flex justify-between"><Link href={auditHref({ ...keep, namespace: n.namespace })} className="underline-offset-2 hover:underline">{n.namespace}</Link><span className="tabular-nums text-slate-600">{n.count}</span></li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">MALAKY staff activity</p>
              {summary.platformActors.length === 0 ? <p className="text-xs text-slate-500">No staff activity.</p> : (
                <ul className="mt-1 space-y-0.5">
                  {summary.platformActors.map((a) => (
                    <li key={a.actorId ?? 'none'} className="flex justify-between">
                      {a.actorId ? <Link href={auditHref({ actor: a.actorId })} className="underline-offset-2 hover:underline">{a.actorName ?? 'Unknown user'}</Link> : <span>{a.actorName ?? 'Unknown'}</span>}
                      <span className="tabular-nums text-slate-600">{a.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      ) : null}

      <form method="get" role="search" className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
        {query.company ? <input type="hidden" name="company" value={query.company} /> : null}
        {query.actor ? <input type="hidden" name="actor" value={query.actor} /> : null}
        <label className="text-xs text-slate-600">Area
          <select name="namespace" defaultValue={query.namespace ?? ''} className="mt-1 block rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
            <option value="">All areas</option>
            {AUDIT_NAMESPACES.map((n) => <option key={n} value={n}>{NAMESPACE_LABEL[n]}</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-600">Actor type
          <select name="actorType" defaultValue={query.actorType ?? ''} className="mt-1 block rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
            <option value="">Anyone</option>
            {ACTOR_TYPES.map((t) => <option key={t} value={t}>{ACTOR_LABEL[t]}</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-600">From (UTC)
          <input type="date" name="from" defaultValue={query.from ?? ''} className="mt-1 block rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" />
        </label>
        <label className="text-xs text-slate-600">To (UTC)
          <input type="date" name="to" defaultValue={query.to ?? ''} className="mt-1 block rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" />
        </label>
        <button type="submit" className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">Apply</button>
        {filtered ? <Link href="/admin/audit-logs" className="self-center text-xs text-slate-500 underline">Clear all</Link> : null}
      </form>

      {query.company || query.actor ? (
        <p className="flex flex-wrap gap-2 text-xs">
          {query.company ? <span className={chip}>Company: {firstName ?? query.company.slice(0, 8)} <Link aria-label="Remove company filter" href={auditHref({ ...keep, company: undefined })} className="font-semibold">×</Link></span> : null}
          {query.actor ? <span className={chip}>Actor: {actorName ?? query.actor.slice(0, 8)} <Link aria-label="Remove actor filter" href={auditHref({ ...keep, actor: undefined })} className="font-semibold">×</Link></span> : null}
        </p>
      ) : null}
      {ignored ? <p role="status" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">Some filters were not valid and were ignored.</p> : null}

      {'error' in page ? (
        <AdminErrorState message={page.error} />
      ) : page.data.items.length === 0 ? (
        <AdminEmptyState title={filtered || query.bat ? 'No entries match' : 'No audit entries yet'}
          description={filtered || query.bat ? 'Try a wider date range or clear the filters.' : 'Privileged actions are recorded here as they happen.'} />
      ) : (
        <>
          <AuditTable items={page.data.items} />
          <nav aria-label="Pagination" className="flex items-center justify-between gap-3 text-xs">
            {query.bat ? <Link href={auditHref(keep)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-100">← Newest</Link> : <span />}
            {page.data.next ? (
              <Link href={auditHref({ ...keep, bat: page.data.next.bat, bid: page.data.next.bid })} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-100">Older entries →</Link>
            ) : <span className="text-slate-400">End of log</span>}
          </nav>
        </>
      )}
    </div>
  );
}
