import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AdminErrorState } from '@/components/admin/StateViews';
import { fmtDateTime } from '@/components/admin/format';
import { actionLabel, ACTOR_LABEL, type AuditActorType } from '@/features/audit/catalog';
import { buildMetadataView } from '@/features/audit/diff';
import { auditHref, entityHref } from '@/features/audit/links';
import { auditService } from '@/features/audit/service';
import { adminPageOutcome } from '@/features/admin/page-errors';
import { getPlatformServiceContext } from '@/lib/service/server';

export const metadata = { title: 'Audit entry · Admin' };
export const dynamic = 'force-dynamic';

export default async function AuditEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPlatformServiceContext();
  const { id } = await params;
  try {
    const e = await auditService.get(ctx, id);
    const view = buildMetadataView(e.metadata);
    const subject = entityHref(e.entityType, e.entityId, e.companyId);
    return (
      <div className="min-w-0 max-w-full space-y-5">
        <div>
          <Link href="/admin/audit-logs" className="text-sm text-slate-600 underline">← Audit logs</Link>
          <h1 className="mt-1 text-2xl font-semibold">{actionLabel(e.action)}</h1>
          <p className="font-mono text-xs text-slate-500">{e.action}</p>
        </div>

        <dl className="grid gap-x-6 gap-y-3 rounded-xl border border-slate-200 bg-white p-4 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-slate-500">When</dt><dd><time dateTime={e.createdAt}>{fmtDateTime(e.createdAt)}</time></dd></div>
          <div><dt className="text-xs text-slate-500">Actor</dt>
            <dd>
              {e.actorId ? <Link href={auditHref({ actor: e.actorId })} className="underline-offset-2 hover:underline">{e.actorName ?? 'Unknown user'}</Link> : (e.actorName ?? '—')}
              <span className="text-xs text-slate-500"> · {ACTOR_LABEL[e.actorType as AuditActorType] ?? e.actorType}</span>
              {e.actorEmail ? <span className="block text-xs text-slate-500">{e.actorEmail}</span> : null}
            </dd></div>
          <div><dt className="text-xs text-slate-500">Company</dt>
            <dd>{e.companyId ? <Link href={`/admin/companies/${e.companyId}`} className="underline-offset-2 hover:underline">{e.companyName ?? 'Company'}</Link> : 'Platform'}</dd></div>
          <div><dt className="text-xs text-slate-500">Subject</dt>
            <dd>{subject ? <Link href={subject} className="underline-offset-2 hover:underline">{e.entityType}</Link> : e.entityType}
              {e.entityId ? <span className="block break-all font-mono text-xs text-slate-500">{e.entityId}</span> : null}</dd></div>
          <div className="sm:col-span-2"><dt className="text-xs text-slate-500">Entry id</dt><dd className="break-all font-mono text-xs">{e.id}</dd></div>
        </dl>

        <section aria-labelledby="h-details" className="min-w-0 max-w-full space-y-3">
          <h2 id="h-details" className="text-sm font-semibold text-slate-700">Details</h2>
          {e.metadataRedacted ? (
            <p role="status" className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">Details for this entry are not available to your role.</p>
          ) : view.rows.length === 0 && view.extra.length === 0 ? (
            <p className="text-sm text-slate-500">This entry carries no details.</p>
          ) : (
            <>
              {view.rows.length > 0 ? (
                <div className="relative max-w-full overflow-x-auto rounded-xl border border-slate-200 bg-white">
                  <table className="w-full min-w-[32rem] text-left text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <tr><th scope="col" className="px-4 py-2 font-medium">Field</th><th scope="col" className="px-4 py-2 font-medium">Before</th><th scope="col" className="px-4 py-2 font-medium">After</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {view.rows.map((r) => (
                        <tr key={r.key} className={r.changed ? 'bg-amber-50/60' : ''}>
                          <th scope="row" className="px-4 py-2 font-mono text-xs font-medium text-slate-700">{r.key}</th>
                          <td className="break-words px-4 py-2 text-slate-600">{r.before ?? '—'}</td>
                          <td className="break-words px-4 py-2 text-slate-900">{r.after ?? '—'}{r.changed ? <span className="sr-only"> (changed)</span> : null}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              {view.extra.length > 0 ? (
                <dl className="grid gap-x-6 gap-y-2 rounded-xl border border-slate-200 bg-white p-4 text-sm sm:grid-cols-2">
                  {view.extra.map((x) => <div key={x.key}><dt className="font-mono text-xs text-slate-500">{x.key}</dt><dd className="break-words">{x.value}</dd></div>)}
                </dl>
              ) : null}
            </>
          )}
        </section>
      </div>
    );
  } catch (err) {
    const outcome = adminPageOutcome(err, { invalidInputIsMissing: true });
    if (outcome.kind === 'missing') notFound();
    return <AdminErrorState message={outcome.message} />;
  }
}
