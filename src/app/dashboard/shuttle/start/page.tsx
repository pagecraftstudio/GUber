import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireTenant } from '@/lib/auth/guards';
import { PERMISSIONS } from '@/lib/auth/permission-keys';
import { createTenantServiceContext } from '@/lib/service/context';
import { busService } from '@/features/buses/service';
import { driverService } from '@/features/drivers/service';
import { stopService } from '@/features/stops/service';
import { companyTimeZone } from '@/features/trips/company-timezone';
import { shuttleService } from '@/features/shuttle/service';
import { ShuttleStartView } from '@/features/shuttle/ShuttleStartView';

export default async function ShuttleStartPage({ searchParams }: { searchParams: Promise<{ service?: string | string[] }> }) {
  const auth = await requireTenant(PERMISSIONS.shuttleOperate);
  const ctx = createTenantServiceContext(await createClient(), auth);
  const sp = await searchParams;
  const wanted = Array.isArray(sp.service) ? sp.service[0] : sp.service;
  const services = await shuttleService.listLiveServices(ctx);
  const service = services.find((s) => s.id === wanted) ?? services[0];
  if (!service) notFound();
  const [tz, allStops, buses, drivers] = await Promise.all([
    companyTimeZone(ctx),
    stopService.listByRoute(ctx, service.routeId),
    busService.list(ctx, { page: 1, pageSize: 100, status: 'active' }),
    driverService.list(ctx, { page: 1, pageSize: 100, status: 'active' }),
  ]);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  // idx = position among ACTIVE stops in stop order, exactly how the database numbers the day snapshot
  const stops = allStops.filter((s) => s.isActive).sort((a, b) => a.stopOrder - b.stopOrder).map((s, idx) => ({ idx, name: s.name }));
  return (
    <ShuttleStartView serviceId={service.id} serviceName={service.name} today={today} stops={stops}
      buses={buses.items.map((b) => ({ id: b.id, plate: b.plateNumber, capacity: b.capacity }))} drivers={drivers.items.map((d) => ({ id: d.id, name: d.fullName }))} />
  );
}
