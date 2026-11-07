import { T } from '@/components/dashboard/T';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireTenant } from '@/lib/auth/guards';
import { AppError } from '@/lib/errors';
import { createTenantServiceContext } from '@/lib/service/context';
import { routeService } from '@/features/routes/service';
import { stopService } from '@/features/stops/service';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { RouteForm } from '@/features/dashboard/RouteForm';

export default async function EditRoutePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant('routes.read');
  const ctx = createTenantServiceContext(await createClient(), auth);
  const canWrite = auth.membership.permissions.includes('routes.write');
  let route;
  try {
    route = await routeService.get(ctx, id); // malformed id and "someone else's route" both end here: 404, same answer
  } catch (e) {
    if (e instanceof AppError && (e.code === 'not_found' || e.code === 'validation')) notFound();
    throw e;
  }
  const stops = await stopService.listByRoute(ctx, route.id);
  return (
    <>
      <PageHeader eyebrow="Network management" title={route.name} description={canWrite ? 'Edit the route and its stops.' : 'Route details and stops.'}
        action={<Link href="/dashboard/routes" className="text-xs font-bold text-blue-700 underline-offset-2 hover:underline dark:text-blue-300"><T>Back to routes</T></Link>} />
      <div className="max-w-4xl">
        <RouteForm route={{ id: route.id, name: route.name, code: route.code, originName: route.originName, destinationName: route.destinationName, description: route.description }} stops={stops} usage={null} readOnly={!canWrite} />
      </div>
    </>
  );
}
