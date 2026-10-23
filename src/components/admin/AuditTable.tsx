import Link from 'next/link';
import { fmtDateTime } from '@/components/admin/format';
import { actionLabel, ACTOR_LABEL, type AuditActorType } from '@/features/audit/catalog';
import { auditHref, entityHref } from '@/features/audit/links';
import type { AuditItem } from '@/features/audit/schema';

const actorKind = (t: string) => ACTOR_LABEL[t as AuditActorType] ?? t;

/** Server component. All values are rendered as text (escaped). `compact` drops the company column for per-company views. */
export function AuditTable({ items, compact = false }: { items: AuditItem[]; compact?: boolean }) {
  return (
    <div className="relative overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[40rem] text-left text-sm">
        <caption className="sr-only">Audit entries, newest first</caption>
        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th scope="col" className="px-4 py-2 font-medium">When</th>
            <th scope="col" className="px-4 py-2 font-medium">Action</th>
            <th scope="col" className="px-4 py-2 font-medium">Actor</th>
            {compact ? null : <th scope="col" className="px-4 py-2 font-medium">Company</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((a) => {
            const subject = entityHref(a.entityType, a.entityId, a.companyId);
            return (
              <tr key={a.id} className="align-top hover:bg-slate-50">
                <td className="whitespace-nowrap px-4 py-3 text-xs tabular-nums text-slate-600">
                  <time dateTime={a.createdAt}>{fmtDateTime(a.createdAt)}</time>
                </td>
                <td className="px-4 py-3">
                  <Link href={`/admin/audit-logs/${a.id}`} className="font-medium text-slate-900 underline-offset-2 hover:underline">{actionLabel(a.action)}</Link>
                  <p className="text-xs text-slate-500">
                    {a.action} · {subject ? <Link href={subject} className="underline">{a.entityType}</Link> : a.entityType}
                  </p>
                  {a.changedKeys.length > 0 ? <p className="mt-0.5 text-xs text-slate-400">Fields: {a.changedKeys.join(', ')}</p> : null}
                </td>
                <td className="px-4 py-3 text-slate-700">
                  {a.actorId ? <Link href={auditHref({ actor: a.actorId })} className="underline-offset-2 hover:underline">{a.actorName ?? 'Unknown user'}</Link> : <span>{a.actorName ?? '—'}</span>}
                  <p className="text-xs text-slate-500">{actorKind(a.actorType)}</p>
                </td>
                {compact ? null : (
                  <td className="px-4 py-3 text-slate-700">
                    {a.companyId ? <Link href={auditHref({ company: a.companyId })} className="underline-offset-2 hover:underline">{a.companyName ?? 'Company'}</Link> : <span className="text-slate-400">Platform</span>}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
