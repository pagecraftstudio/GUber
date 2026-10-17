import type { AuthContext, Membership, PlatformRole } from './types';

/**
 * THE one place that turns an AuthContext into access decisions. Pure (no I/O) so it is unit-testable.
 * Role names never appear in feature code: features ask `can(ctx, 'trips.write')`, and the permission
 * set comes from the database (role_permissions), so changing a role's grants needs no code change.
 * This is a UX/routing layer only. The real enforcement is RLS + RPC checks in Postgres.
 */

/** Tenant membership that is currently usable (company and member both active). */
export function activeMembership(ctx: AuthContext | null): Membership | null {
  const m = ctx?.membership;
  if (!ctx || !ctx.isActive || !m) return null;
  if (m.memberStatus !== 'active') return null;
  if (m.companyStatus !== 'trial' && m.companyStatus !== 'active') return null;
  return m;
}

export function can(ctx: AuthContext | null, permission: string): boolean {
  return activeMembership(ctx)?.permissions.includes(permission) ?? false;
}

export function canAny(ctx: AuthContext | null, permissions: readonly string[]): boolean {
  return permissions.some((p) => can(ctx, p));
}

export function hasPlatformRole(ctx: AuthContext | null, allowed?: readonly PlatformRole[]): boolean {
  if (!ctx || !ctx.isActive || !ctx.platformRole) return false;
  return allowed ? allowed.includes(ctx.platformRole) : true;
}

export type AccessState =
  | 'anonymous'
  | 'deactivated'
  | 'platform'
  | 'tenant'
  | 'tenant_locked' // member of a suspended/cancelled company, or membership suspended
  | 'no_access'; // signed in, but no membership and no platform role

export function accessState(ctx: AuthContext | null): AccessState {
  if (!ctx) return 'anonymous';
  if (!ctx.isActive) return 'deactivated';
  if (ctx.platformRole) return 'platform';
  if (activeMembership(ctx)) return 'tenant';
  if (ctx.membership) return 'tenant_locked';
  return 'no_access';
}

/** Where a signed-in user belongs after login. */
export function homePathFor(ctx: AuthContext | null): string {
  switch (accessState(ctx)) {
    case 'platform':
      return '/admin';
    case 'tenant':
      // a member whose only trip access is "assigned trips" is a driver: the mobile boarding page, not the staff dashboard
      return can(ctx, 'trips.read_assigned') && !can(ctx, 'trips.read') ? '/driver' : '/dashboard';
    case 'tenant_locked':
      return '/suspended';
    case 'deactivated':
    case 'no_access':
      return '/no-access';
    case 'anonymous':
      return '/login';
  }
}
