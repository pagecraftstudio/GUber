import { createClient } from '@/lib/supabase/server';
import { requireTenant } from '@/lib/auth/guards';
import { PERMISSIONS } from '@/lib/auth/permission-keys';
import { createTenantServiceContext } from '@/lib/service/context';
import { routeService } from '@/features/routes/service';
import { stopService } from '@/features/stops/service';
import { shuttleService } from '@/features/shuttle/service';
import { ShuttleSettingsView } from '@/features/shuttle/ShuttleSettingsView';

export default async function ShuttleSettingsPage({ searchParams }: { searchParams: Promise<{ route?: string | string[] }> }) {
  const auth = await requireTenant(PERMISSIONS.shuttleRead);
  const ctx = createTenantServiceContext(await createClient(), auth);
  const canWrite = auth.membership.permissions.includes(PERMISSIONS.shuttleConfig);
  const [enabled, routes, sp] = await Promise.all([
    shuttleService.isEnabled(ctx),
    routeService.list(ctx, { page: 1, pageSize: 100, isActive: 'true' }),
    searchParams,
  ]);
  const wanted = Array.isArray(sp.route) ? sp.route[0] : sp.route;
  const routeId = routes.items.find((r) => r.id === wanted)?.id ?? routes.items[0]?.id ?? null; // only a route of this company can be picked
  const service = routeId ? await shuttleService.liveServiceForRoute(ctx, routeId) : null;
  const [allStops, fares] = await Promise.all([
    routeId ? stopService.listByRoute(ctx, routeId) : Promise.resolve([]),
    service ? shuttleService.listFares(ctx, service.id) : Promise.resolve([]),
  ]);
  const stops = allStops.filter((s) => s.isActive).sort((a, b) => a.stopOrder - b.stopOrder).map((s) => ({ id: s.id, name: s.name }));
  return <ShuttleSettingsView routes={routes.items.map((r) => ({ id: r.id, name: r.name }))} routeId={routeId} enabled={enabled} canWrite={canWrite} service={service} stops={stops} fares={fares} />;
}
