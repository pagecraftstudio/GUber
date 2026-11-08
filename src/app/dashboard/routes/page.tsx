import { T } from '@/components/dashboard/T';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { requireTenant } from '@/lib/auth/guards';
import { createTenantServiceContext } from '@/lib/service/context';
import { routeService } from '@/features/routes/service';
import { planUsageService } from '@/features/subscriptions/usage-service';
import { PlanLimitNotice } from '@/components/dashboard/FormParts';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { DataTable, StatusPill } from '@/components/dashboard/DataTable';
import { RouteActiveSwitch } from '@/features/dashboard/InlineControls';

const link = 'inline-flex min-h-11 items-center rounded-xl bg-blue-700 px-4 text-xs font-bold text-white hover:bg-blue-800';

export default async function RoutesPage() {
  const auth = await requireTenant('routes.read');
  const ctx = createTenantServiceContext(await createClient(), auth);
  const canWrite = auth.membership.permissions.includes('routes.write');
  const [page, usage] = await Promise.all([routeService.list(ctx, { page: 1, pageSize: 100 }), canWrite ? planUsageService.getOrNull(ctx) : Promise.resolve(null)]);
  return (
    <>
      <PageHeader eyebrow="Network management" title="Routes & destinations" description="Create and maintain your company's travel corridors and their stops."
        action={canWrite ? <Link href="/dashboard/routes/new" className={link}><T>Add a route</T></Link> : undefined} />
      {canWrite && <div className="mb-5"><PlanLimitNotice usage={usage} resource="max_routes" /></div>}
      <DataTable rows={page.items} columns={[
        { key: 'name', label: 'Route', render: (r) => <div><Link href={`/dashboard/routes/${r.id}`} className="font-bold text-blue-700 underline-offset-2 hover:underline dark:text-blue-300">{r.name}</Link><p className="text-xs text-slate-600 dark:text-slate-400">{r.code || <T>No route code</T>}</p></div> },
        { key: 'origin', label: 'Origin', render: (r) => r.originName },
        { key: 'destination', label: 'Destination', render: (r) => r.destinationName },
        { key: 'status', label: 'Status', render: (r) => <StatusPill value={r.isActive ? 'active' : 'inactive'} /> },
        { key: 'manage', label: 'Manage', render: (r) => (
          <div className="flex items-center gap-3">
            <Link href={`/dashboard/routes/${r.id}`} className="text-xs font-bold text-blue-700 underline-offset-2 hover:underline dark:text-blue-300" aria-label={`${canWrite ? 'Edit' : 'View'} ${r.name}`}>{canWrite ? <T>Edit</T> : <T>View</T>}</Link>
            {canWrite && <RouteActiveSwitch id={r.id} isActive={r.isActive} name={r.name} />}
          </div>) },
      ]} />
    </>
  );
}
