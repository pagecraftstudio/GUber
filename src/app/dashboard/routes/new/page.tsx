import { T } from '@/components/dashboard/T';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { requireTenant } from '@/lib/auth/guards';
import { createTenantServiceContext } from '@/lib/service/context';
import { planUsageService } from '@/features/subscriptions/usage-service';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { RouteForm } from '@/features/dashboard/RouteForm';

export default async function NewRoutePage() {
  const auth = await requireTenant('routes.write'); // no routes.write => /dashboard?error=forbidden
  const ctx = createTenantServiceContext(await createClient(), auth);
  const usage = await planUsageService.getOrNull(ctx);
  return (
    <>
      <PageHeader eyebrow="Network management" title="Add a route" description="Name the route, then list its stops in the order the bus visits them."
        action={<Link href="/dashboard/routes" className="text-xs font-bold text-blue-700 underline-offset-2 hover:underline dark:text-blue-300"><T>Back to routes</T></Link>} />
      <div className="max-w-4xl"><RouteForm stops={[]} usage={usage} /></div>
    </>
  );
}
