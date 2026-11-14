

import { createClient } from '@/lib/supabase/server';import { requireTenant } from '@/lib/auth/guards';import { createTenantServiceContext } from '@/lib/service/context';import { busService } from '@/features/buses/service';
import { planUsageService } from '@/features/subscriptions/usage-service';
import { BusesMasarView } from '@/features/dashboard/masar/ListsMasarViews';
export default async function BusesPage(){const auth=await requireTenant('buses.read'),ctx=createTenantServiceContext(await createClient(),auth),page=await busService.list(ctx,{page:1,pageSize:100}),canWrite=auth.membership.permissions.includes('buses.write'),usage=canWrite?await planUsageService.getOrNull(ctx):null;return <BusesMasarView rows={page.items} canWrite={canWrite} usage={usage}/>;}
