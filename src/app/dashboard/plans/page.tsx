import { createClient } from '@/lib/supabase/server';
import { requireTenant } from '@/lib/auth/guards';
import { createTenantServiceContext } from '@/lib/service/context';
import { routeService } from '@/features/routes/service';
import { routePlanService } from '@/features/route-plans/service';
import { companyService } from '@/features/companies/service';
import { planUsageService } from '@/features/subscriptions/usage-service';
import { PlansMasarView } from '@/features/dashboard/masar/PlansMasarViews';

export default async function PlansPage() {
  const auth = await requireTenant('routes.read');
  const ctx = createTenantServiceContext(await createClient(), auth);
  const canWrite = auth.membership.permissions.includes('routes.write');
  const [plans, routes, usage, currency] = await Promise.all([
    routePlanService.listPlans(ctx),
    canWrite ? routeService.list(ctx, { page: 1, pageSize: 100, isActive: 'true' }) : Promise.resolve({ items: [] }),
    canWrite ? planUsageService.getOrNull(ctx) : Promise.resolve(null),
    companyService.getSettings(ctx).then((s) => s.currency).catch(() => ''), // roles without settings.read just see plain numbers
  ]);
  return <PlansMasarView rows={plans} routes={routes.items.map((r) => ({ id: r.id, name: r.name }))} currency={currency} canWrite={canWrite} usage={usage} />;
}
