import type { SupabaseClient } from '@supabase/supabase-js';
import { activeMembership } from '@/lib/auth/permissions';
import type { AuthContext, Membership } from '@/lib/auth/types';
import { AppError } from '@/lib/errors';

/**
 * What every tenant service/repository call receives. `companyId` is derived from the authenticated user's
 * membership (my_context(), Phase 3) and is NEVER read from request input. `db` is the caller's own
 * RLS-bound client, so Postgres re-checks every statement as a second lock.
 */
export type TenantServiceContext = {
  readonly db: SupabaseClient;
  readonly auth: AuthContext & { membership: Membership };
  readonly companyId: string;
};

/** MALAKY staff context. Authorization is the platform role, checked by `requirePlatformAccess`. */
export type PlatformServiceContext = {
  readonly db: SupabaseClient;
  readonly auth: AuthContext;
};

export function createTenantServiceContext(db: SupabaseClient, auth: AuthContext): TenantServiceContext {
  const membership = activeMembership(auth);
  if (!membership) throw new AppError('forbidden'); // no membership, suspended member or suspended company
  return { db, auth: { ...auth, membership }, companyId: membership.companyId };
}

export function createPlatformServiceContext(db: SupabaseClient, auth: AuthContext): PlatformServiceContext {
  return { db, auth };
}
