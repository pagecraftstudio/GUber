import Link from 'next/link';
import { AdminPagination } from '@/components/admin/AdminPagination';
import { AdminEmptyState, AdminErrorState } from '@/components/admin/StateViews';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { fmtDate } from '@/components/admin/format';
import type { AdminCompanyListItem } from '@/features/companies/admin-output';
import { companyService } from '@/features/companies/service';
import { COMPANY_STATUSES, platformCompanyListSchema, type PlatformCompanyListQuery } from '@/features/companies/schema';
import type { RawSearchParams } from '@/features/auth/search-params';
import { toClientError } from '@/lib/errors';
import type { Page } from '@/lib/db/pagination';
import { getPlatformServiceContext } from '@/lib/service/server';
import { firstParams } from '@/lib/validation/common';

export const metadata = { title: 'Companies · Admin' };
export const dynamic = 'force-dynamic';

export default async function CompaniesPage({ searchParams }: { searchParams: RawSearchParams }) {
  const ctx = await getPlatformServiceContext(); // any platform role may browse; 404 / login redirect otherwise
  // Bad or hostile query strings fall back to defaults instead of erroring: the page is a read view.
  const parsed = platformCompanyListSchema.safeParse(firstParams(await searchParams));
  const query: PlatformCompanyListQuery = parsed.success ? parsed.data : platformCompanyListSchema.parse({});

  let result: { data: Page<AdminCompanyListItem> } | { error: string };
  try {
    result = { data: await companyService.adminList(ctx, query) };
  } catch (e) {
    result = { error: toClientError(e).message };
  }
  const canCreate = ctx.platformRole === 'super_admin';
  const filtersActive = Boolean(query.q || query.status);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Companies</h1>
        {canCreate ? (
          <Link href="/admin/companies/new" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">New company</Link>
        ) : null}
      </div>

      <form method="get" className="flex flex-col gap-2 sm:flex-row" role="search">
        <input name="q" defaultValue={query.q ?? ''} maxLength={100} placeholder="Search name, slug or contact email" aria-label="Search companies" className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" />
        <select name="status" defaultValue={query.status ?? ''} aria-label="Filter by status" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
          <option value="">All statuses</option>
          {COMPANY_STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <button type="submit" className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">Search</button>
        {filtersActive ? <Link href="/admin/companies" className="self-center text-xs text-slate-500 underline">Clear</Link> : null}
      </form>

      {'error' in result ? (
        <AdminErrorState message={result.error} />
      ) : result.data.items.length === 0 ? (
        <AdminEmptyState
          title={filtersActive ? 'No companies match' : 'No companies yet'}
          description={filtersActive ? 'Try a different search or clear the filters.' : 'Companies appear here once they are created.'}
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium">Company</th>
                  <th scope="col" className="px-4 py-2 font-medium">Status</th>
                  <th scope="col" className="px-4 py-2 font-medium">Plan</th>
                  <th scope="col" className="px-4 py-2 font-medium">Contact</th>
                  <th scope="col" className="px-4 py-2 font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {result.data.items.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link href={`/admin/companies/${c.id}`} className="font-medium text-slate-900 underline-offset-2 hover:underline">{c.name}</Link>
                      <p className="text-xs text-slate-500">{c.slug}</p>
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                    <td className="px-4 py-3">
                      {c.planName ? (
                        <>
                          <p>{c.planName}</p>
                          {c.subscriptionStatus ? <StatusBadge status={c.subscriptionStatus} /> : null}
                        </>
                      ) : (
                        <span className="text-xs font-medium text-red-700">No live plan</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {c.contactName ? <p>{c.contactName}</p> : null}
                      {c.contactEmail ? <p>{c.contactEmail}</p> : null}
                      {!c.contactName && !c.contactEmail ? <span className="text-slate-400">—</span> : null}
                    </td>
                    <td className="px-4 py-3 text-xs tabular-nums text-slate-600">{fmtDate(c.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <AdminPagination
            basePath="/admin/companies"
            params={{ q: query.q, status: query.status }}
            page={result.data.page}
            pageSize={result.data.pageSize}
            total={result.data.total}
          />
        </>
      )}
    </div>
  );
}
