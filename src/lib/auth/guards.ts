import 'server-only';
import { notFound, redirect } from 'next/navigation';
import { getAuthContext } from './context';
import { accessState, activeMembership, can, hasPlatformRole, homePathFor } from './permissions';
import type { AuthContext, Membership, PlatformRole } from './types';

export type TenantContext = AuthContext & { membership: Membership };

/**
 * Server-side guards. Call them from layouts/pages/actions. proxy.ts only does a coarse "is there a session"
 * redirect for UX; these are the actual gates (they re-verify with the database on every request).
 */

export async function requireUser(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  return ctx;
}

/** Signed-in tenant staff with a usable (non-suspended) company. Optionally also requires a permission. */
export async function requireTenant(permission?: string): Promise<TenantContext> {
  const ctx = await requireUser();
  const state = accessState(ctx);
  if (state !== 'tenant') redirect(homePathFor(ctx));
  const membership = activeMembership(ctx);
  if (!membership) redirect(homePathFor(ctx));
  if (permission && !can(ctx, permission)) redirect('/dashboard?error=forbidden');
  return { ...ctx, membership };
}

/** Active driver of a usable company (permission-driven, not role-name driven). Boarding itself is re-authorized per call in Postgres. */
export async function requireDriver(): Promise<TenantContext> {
  const ctx = await requireTenant();
  if (!can(ctx, 'trips.read_assigned')) redirect(homePathFor(ctx));
  return ctx;
}

/** Platform staff only. Unknown to everyone else (404, not 403) so /admin is not discoverable. */
export async function requirePlatform(allowed?: readonly PlatformRole[]): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login?next=/admin');
  if (!hasPlatformRole(ctx, allowed)) notFound();
  return ctx;
}
