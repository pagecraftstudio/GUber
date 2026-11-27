import { createClient } from '@/lib/supabase/server';
import { requireTenant } from '@/lib/auth/guards';
import { PERMISSIONS } from '@/lib/auth/permission-keys';
import { createTenantServiceContext } from '@/lib/service/context';
import { routeService } from '@/features/routes/service';
import { shuttleService } from '@/features/shuttle/service';
import { ShuttleOverviewView } from '@/features/shuttle/ShuttleOverviewView';

export default async function ShuttleOverviewPage({ searchParams }: { searchParams: Promise<{ service?: string | string[] }> }) {
  const auth = await requireTenant(PERMISSIONS.shuttleRead);
  const ctx = createTenantServiceContext(await createClient(), auth);
  const has = (k: string) => auth.membership.permissions.includes(k);
  const [enabled, services, sp] = await Promise.all([shuttleService.isEnabled(ctx), shuttleService.listLiveServices(ctx), searchParams]);
  const wanted = Array.isArray(sp.service) ? sp.service[0] : sp.service;
  const serviceId = services.find((s) => s.id === wanted)?.id ?? services[0]?.id ?? null; // only a live service of this company can be picked
  const overview = serviceId ? await shuttleService.overview(ctx, { serviceId }) : null;
  return (
    <ShuttleOverviewView services={services.map((s) => ({ id: s.id, name: s.name }))} serviceId={serviceId} overview={overview} enabled={enabled}
      canOperate={has(PERMISSIONS.shuttleOperate)} canConfig={has(PERMISSIONS.shuttleConfig)} />
  );
}
