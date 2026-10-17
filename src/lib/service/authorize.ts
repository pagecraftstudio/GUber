import { can, canAny, hasPlatformRole } from '@/lib/auth/permissions';
import type { PermissionKey } from '@/lib/auth/permission-keys';
import type { PlatformRole } from '@/lib/auth/types';
import { AppError } from '@/lib/errors';
import type { PlatformServiceContext, TenantServiceContext } from './context';

/**
 * The only authorization primitives services use. They delegate to `can()` (src/lib/auth/permissions.ts),
 * so role names never appear in feature code. These checks give clean errors and fast failure; the database
 * (RLS + triggers + RPC checks) remains the real enforcement.
 */
export function requirePermission(ctx: TenantServiceContext, key: PermissionKey): void {
  if (!can(ctx.auth, key)) throw new AppError('forbidden');
}

export function requireAnyPermission(ctx: TenantServiceContext, keys: readonly PermissionKey[]): void {
  if (!canAny(ctx.auth, keys)) throw new AppError('forbidden');
}

export function requirePlatformAccess(ctx: PlatformServiceContext, allowed?: readonly PlatformRole[]): void {
  if (!hasPlatformRole(ctx.auth, allowed)) throw new AppError('forbidden');
}
