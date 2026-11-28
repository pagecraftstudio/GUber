import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireTenant } from '@/lib/auth/guards';
import { PERMISSIONS } from '@/lib/auth/permission-keys';
import { createTenantServiceContext } from '@/lib/service/context';
import { AppError } from '@/lib/errors';
import { shuttleService } from '@/features/shuttle/service';
import { ShuttleVehicleView } from '@/features/shuttle/ShuttleVehicleView';
import { idSchema } from '@/lib/validation/common';

export default async function ShuttleVehiclePage({ params }: { params: Promise<{ id: string }> }) {
  const auth = await requireTenant(PERMISSIONS.shuttleRead);
  const ctx = createTenantServiceContext(await createClient(), auth);
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();
  try {
    const detail = await shuttleService.vehicleDetail(ctx, id);
    return <ShuttleVehicleView d={detail} canOperate={auth.membership.permissions.includes(PERMISSIONS.shuttleOperate)} />;
  } catch (e) {
    if (e instanceof AppError && e.code === 'not_found') notFound(); // missing or another company's: the same answer
    throw e;
  }
}
