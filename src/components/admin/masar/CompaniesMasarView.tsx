import Link from 'next/link';
import { TriangleAlert } from 'lucide-react';
import { StatusBadge } from '@/ds/data/StatusBadge';
import { Pagination } from '@/ds/data/Pagination';
import { EmptyState, ErrorState } from '@/ds/feedback/States';
import { formatDate, formatNumber } from '@/ds/format';
import { Identifier } from '@/ds/format/Identifier';
import { buttonClass } from '@/ds/primitives/button-class';
import { PageHeaderMasar } from '@/features/dashboard/masar/PageHeaderMasar';
import { UrlFilterBar } from '@/features/dashboard/masar/UrlFilterBar';
import type { AdminCompanyListItem } from '@/features/companies/admin-output';
import { COMPANY_STATUSES } from '@/features/companies/schema';
import type { Page } from '@/lib/db/pagination';
import { statusLabel } from '@/ds/data/status-map';

const href = (p: Record<string, string | undefined>, page?: number) => {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v) qs.set(k, v);
  if (page && page > 1) qs.set('page', String(page));
  const s = qs.toString();
  return s ? `/admin/companies?${s}` : '/admin/companies';
};

export interface CompaniesMasarViewProps { query: { q?: string; status?: string }; result: { data: Page<AdminCompanyListItem> } | { error: string }; canCreate: boolean }

/** Companies list, dense and scannable. Same query, same permission, same URL parameters as the old page; only the drawing differs. */
export function CompaniesMasarView({ query, result, canCreate }: CompaniesMasarViewProps) {
  const filtersActive = Boolean(query.q || query.status);
  const chips = [
    ...(query.q ? [{ key: 'q', label: `Search: ${query.q}`, href: href({ status: query.status }) }] : []),
    ...(query.status ? [{ key: 'status', label: `Status: ${statusLabel('company', query.status, 'en')}`, href: href({ q: query.q }) }] : []),
  ];
  const total = 'data' in result ? result.data.total : null;
  return (
    <div>
      <PageHeaderMasar
        title="Companies"
        description={total === null ? undefined : `${formatNumber(total, 'en')} ${total === 1 ? 'company' : 'companies'}${filtersActive ? ' match' : ''}`}
        actions={canCreate ? <Link href="/admin/companies/new" className={buttonClass('primary', 'md')}>New company</Link> : undefined}
      />
      <UrlFilterBar
        fields={[
          { kind: 'search', name: 'q', label: 'Search', value: query.q ?? '', placeholder: 'Name, slug or contact email' },
          { kind: 'select', name: 'status', label: 'Status', value: query.status ?? '', allLabel: 'All statuses', options: COMPANY_STATUSES.map((s) => [s, statusLabel('company', s, 'en')] as const) },
        ]}
        keep={{}} chips={chips} clearHref="/admin/companies"
      />
      {'error' in result ? (
        <ErrorState title="Could not load companies" description={result.error} />
      ) : result.data.items.length === 0 ? (
        <EmptyState title={filtersActive ? 'No companies match' : 'No companies yet'} description={filtersActive ? 'Try a different search or clear the filters.' : 'Companies appear here once they are created.'} />
      ) : (
        <div className="space-y-4">
          <div className="relative overflow-x-auto rounded-ds-md border border-line-default bg-surface-card">
            <table className="w-full min-w-[44rem] border-collapse text-sm">
              <caption className="sr-only">Companies</caption>
              <thead className="bg-surface-sunken text-start text-[13px] font-medium text-ink-secondary">
                <tr>{['Company', 'Status', 'Plan', 'Contact', 'Created'].map((h) => <th key={h} scope="col" className="px-4 py-2.5 text-start font-medium">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-line-default">
                {result.data.items.map((c) => (
                  <tr key={c.id} className="align-top hover:bg-surface-page">
                    <td className="px-4 py-3">
                      <Link href={`/admin/companies/${c.id}`} className="font-medium text-ink-primary underline-offset-2 hover:underline">{c.name}</Link>
                      <p className="text-[13px] text-ink-muted"><Identifier value={c.slug} /></p>
                    </td>
                    <td className="px-4 py-3"><StatusBadge domain="company" value={c.status} lang="en" /></td>
                    <td className="px-4 py-3">
                      {c.planName ? (
                        <div className="flex flex-col items-start gap-1"><span className="text-ink-primary">{c.planName}</span>{c.subscriptionStatus ? <StatusBadge domain="subscription" value={c.subscriptionStatus} lang="en" /> : null}</div>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-status-error-fg"><TriangleAlert size={14} strokeWidth={1.5} aria-hidden="true" />No live plan</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-ink-secondary">
                      {c.contactName ? <p>{c.contactName}</p> : null}
                      {c.contactEmail ? <p><Identifier value={c.contactEmail} /></p> : null}
                      {!c.contactName && !c.contactEmail ? <span className="text-ink-muted">—</span> : null}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-ink-secondary tabular-nums">{formatDate(c.createdAt, 'en', { timeZone: 'UTC', style: 'long' })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={result.data.page} pageCount={Math.max(1, Math.ceil(result.data.total / result.data.pageSize))} hrefBase="/admin/companies" hrefParams={{ q: query.q, status: query.status }} lang="en" />
        </div>
      )}
    </div>
  );
}
