import { PLATFORM_ROLES, type PlatformRole } from '@/lib/auth/types';

/**
 * Single source of truth for which platform roles may do what (Phase 7.6).
 *
 * This is the APPLICATION mirror of the database rule: every admin RPC calls
 * app_private.assert_platform(<roles>) and Postgres is the real enforcement point. The arrays here
 * only decide what the UI shows and short-circuit server actions before a round trip.
 * `permissions.test.ts` scans the migrations and fails if an RPC's role list disagrees with this file.
 */
export const ROLE_SETS = {
  /** Read access to every admin section (data is still redacted per role inside Postgres). */
  anyStaff: PLATFORM_ROLES,
  /** Company lifecycle: create, edit, suspend, reactivate, cancel, domains. */
  superAdminOnly: ['super_admin'],
  /** Internal notes on a company. */
  noteWriters: ['super_admin', 'support'],
  /** Subscription / plan mutations. */
  subscriptionWriters: ['super_admin', 'billing'],
  /** Audit summary counters (billing sees entries, redacted, but not the aggregate). */
  auditSummary: ['super_admin', 'support'],
} as const satisfies Record<string, readonly PlatformRole[]>;

export type RoleSetName = keyof typeof ROLE_SETS;

export const canRole = (role: PlatformRole | null | undefined, set: RoleSetName): boolean =>
  role != null && (ROLE_SETS[set] as readonly PlatformRole[]).includes(role);
