
import { createClient } from '@/lib/supabase/server';
import { requireTenant } from '@/lib/auth/guards';
import { createTenantServiceContext } from '@/lib/service/context';
import { routeService } from '@/features/routes/service';
import { planUsageService } from '@/features/subscriptions/usage-service';


import { RoutesMasarView } from '@/features/dashboard/masar/ListsMasarViews';


export default async function RoutesPage() {
  const auth = await requireTenant('routes.read');
  const ctx = createTenantServiceContext(await createClient(), auth);
  const canWrite = auth.membership.permissions.includes('routes.write');
  const [page, usage] = await Promise.all([routeService.list(ctx, { page: 1, pageSize: 100 }), canWrite ? planUsageService.getOrNull(ctx) : Promise.resolve(null)]);
  return <RoutesMasarView rows={page.items} canWrite={canWrite} usage={usage} />;
}
