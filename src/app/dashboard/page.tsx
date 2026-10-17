import { Alert } from '@/components/ui/Alert';
import { readFlash, type RawSearchParams } from '@/features/auth/search-params';
import { requireTenant } from '@/lib/auth/guards';

export const metadata = { title: 'Dashboard' };

// Placeholder: the real dashboard is Phase 9. It shows what the auth layer resolved, to verify Phase 3 end to end.
export default async function DashboardPage({ searchParams }: { searchParams: RawSearchParams }) {
  const ctx = await requireTenant();
  const { error, notice } = await readFlash(searchParams);
  return (
    <div className="space-y-6">
      {error ? <Alert kind="error">{error}</Alert> : null}
      {notice ? <Alert kind="info">{notice}</Alert> : null}
      <h1 className="text-2xl font-semibold">Welcome, {ctx.fullName}</h1>
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Resolved access (Phase 3 check)</h2>
        <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
          <dt className="text-slate-500">Company</dt>
          <dd>{ctx.membership.companyName} ({ctx.membership.companyStatus})</dd>
          <dt className="text-slate-500">Role</dt>
          <dd>{ctx.membership.roleKey}</dd>
          <dt className="text-slate-500">Permissions</dt>
          <dd className="flex flex-wrap gap-1.5">
            {ctx.membership.permissions.map((p) => (
              <code key={p} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{p}</code>
            ))}
          </dd>
        </dl>
      </section>
    </div>
  );
}
