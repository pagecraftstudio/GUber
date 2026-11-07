import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { requireTenant } from '@/lib/auth/guards';
import { createTenantServiceContext } from '@/lib/service/context';
import { customerService } from '@/features/customers/service';
import { AppError } from '@/lib/errors';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { DataTable } from '@/components/dashboard/DataTable';

const PAGE_SIZE = 25;
const link = 'inline-flex min-h-8 items-center text-sm font-bold text-blue-700 underline-offset-2 hover:underline dark:text-blue-300';

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const sp = await searchParams;
  const auth = await requireTenant('customers.read'); // no customers.read => /dashboard?error=forbidden
  const ctx = createTenantServiceContext(await createClient(), auth);
  const q = (sp.q ?? '').trim().slice(0, 200);
  let page;
  try {
    page = await customerService.list(ctx, { q: q || undefined, page: Number(sp.page) || 1, pageSize: PAGE_SIZE, sort: 'created_at', dir: 'desc' });
  } catch (e) {
    if (e instanceof AppError && e.code === 'validation') page = await customerService.list(ctx, { page: 1, pageSize: PAGE_SIZE, sort: 'created_at', dir: 'desc' });
    else throw e;
  }
  const qs = (n: number) => `/dashboard/customers?${new URLSearchParams({ ...(q ? { q } : {}), page: String(n) })}`;
  const lastPage = Math.max(1, Math.ceil(page.total / page.pageSize));
  return (
    <>
      <PageHeader eyebrow="Passenger operations" title="Customers" description="People who booked with your company. Search by name, phone, email or student number." />
      <form method="get" role="search" aria-label="Search customers" className="mb-4 flex max-w-xl flex-wrap items-end gap-2">
        <div className="min-w-56 flex-1">
          <label htmlFor="customer-q" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Search customers</label>
          <input id="customer-q" name="q" type="search" defaultValue={q} maxLength={200} autoComplete="off" className="mt-1 min-h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-950" />
        </div>
        <button type="submit" className="min-h-10 rounded-xl bg-[#14243A] px-4 text-sm font-bold text-white">Search</button>
        {q && <Link href="/dashboard/customers" className={link}>Clear search</Link>}
      </form>
      <p role="status" className="mb-3 text-sm text-slate-600 dark:text-slate-400">{page.total === 0 ? (q ? 'No customers match your search.' : 'No customers yet.') : `${page.total} customer${page.total === 1 ? '' : 's'}${q ? ' found' : ''} · page ${page.page} of ${lastPage}`}</p>
      <DataTable rows={page.items} emptyTitle={q ? 'No matching customers' : 'No customers yet'} emptyText={q ? 'Try a different name, phone or email.' : 'Customers appear here after their first booking.'} columns={[
        { key: 'name', label: 'Name', render: (c) => <Link href={`/dashboard/customers/${c.id}`} className={link}>{c.fullName}</Link> },
        { key: 'phone', label: 'Phone', render: (c) => <span dir="ltr">{c.phone}</span> },
        { key: 'email', label: 'Email', render: (c) => c.email ?? '—' },
        { key: 'university', label: 'University', render: (c) => c.university ?? '—' },
        { key: 'created', label: 'Since', render: (c) => new Date(c.createdAt).toLocaleDateString() },
      ]} />
      {lastPage > 1 && (
        <nav aria-label="Customer pages" className="mt-4 flex items-center gap-4">
          {page.page > 1 ? <Link href={qs(page.page - 1)} rel="prev" className={link}>Previous page</Link> : <span aria-disabled="true" className="text-sm text-slate-500">Previous page</span>}
          {page.hasMore ? <Link href={qs(page.page + 1)} rel="next" className={link}>Next page</Link> : <span aria-disabled="true" className="text-sm text-slate-500">Next page</span>}
        </nav>
      )}
    </>
  );
}
