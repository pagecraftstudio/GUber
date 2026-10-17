import 'server-only';
import { requirePlatform, requireTenant } from '@/lib/auth/guards';
import type { PermissionKey } from '@/lib/auth/permission-keys';
import type { PlatformRole } from '@/lib/auth/types';
import { createClient } from '@/lib/supabase/server';
import {
  createPlatformServiceContext,
  createTenantServiceContext,
  type PlatformServiceContext,
  type TenantServiceContext,
} from './context';

/**
 * Entry points for pages, layouts and Server Actions. They reuse the Phase 3 guards (which redirect or 404
 * when the caller is not allowed), then bind a request-scoped Supabase client running with the USER's JWT.
 * There is deliberately no service-role client anywhere in Phase 4.
 */
export async function getTenantServiceContext(permission?: PermissionKey): Promise<TenantServiceContext> {
  const auth = await requireTenant(permission);
  return createTenantServiceContext(await createClient(), auth);
}

export async function getPlatformServiceContext(allowed?: readonly PlatformRole[]): Promise<PlatformServiceContext> {
  const auth = await requirePlatform(allowed);
  return createPlatformServiceContext(await createClient(), auth);
}
