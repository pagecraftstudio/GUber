import { T } from '@/components/dashboard/T';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { requireTenant } from '@/lib/auth/guards';
import { createTenantServiceContext } from '@/lib/service/context';
import { routeService } from '@/features/routes/service';
import { busService } from '@/features/buses/service';
import { driverService } from '@/features/drivers/service';
import { planUsageService } from '@/features/subscriptions/usage-service';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { TripDraftForm } from '@/features/dashboard/TripDraftForm';

export default async function NewTripPage() {
  const auth = await requireTenant('trips.write'); // no trips.write => /dashboard?error=forbidden
  const ctx = createTenantServiceContext(await createClient(), auth);
  const has = (p: string) => auth.membership.permissions.includes(p);
  const [routes, buses, drivers, usage] = await Promise.all([
    has('routes.read') ? routeService.list(ctx, { page: 1, pageSize: 100 }) : Promise.resolve({ items: [] }),
    has('buses.read') ? busService.list(ctx, { page: 1, pageSize: 100 }) : Promise.resolve({ items: [] }),
    has('drivers.read') ? driverService.list(ctx, { page: 1, pageSize: 100 }) : Promise.resolve({ items: [] }),
    planUsageService.getOrNull(ctx),
  ]);
  return (
    <>
      <PageHeader eyebrow="Scheduling & dispatch" title="Add a trip" description="Create a trip draft and assign an available bus and driver."
        action={<Link href="/dashboard/trips" className="text-xs font-bold text-blue-700 underline-offset-2 hover:underline dark:text-blue-300"><T>Back to trips</T></Link>} />
      <div className="max-w-4xl">
        <TripDraftForm usage={usage}
          routes={routes.items.map((r) => ({ id: r.id, label: r.name, origin: r.originName, destination: r.destinationName }))}
          buses={buses.items.map((b) => ({ id: b.id, plateNumber: b.plateNumber, capacity: b.capacity }))}
          drivers={drivers.items.filter((d) => d.status === 'active').map((d) => ({ id: d.id, label: d.fullName }))} />
      </div>
    </>
  );
}
