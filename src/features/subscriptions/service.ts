import { parseInput } from '@/lib/errors';
import { PERMISSIONS } from '@/lib/auth/permission-keys';
import { requirePermission, requirePlatformAccess } from '@/lib/service/authorize';
import type { PlatformServiceContext, TenantServiceContext } from '@/lib/service/context';
import { idSchema } from '@/lib/validation/common';
import { subscriptionRepository, type SubscriptionRepository } from './repository';
import type { Plan, Subscription } from './types';

/**
 * READ-ONLY in Phase 4. Subscriptions, invoices and payments have no client write path except platform staff
 * tables policies, and those writes would skip audit logging (audit_logs is server-only). Plan assignment,
 * renewal and cancellation become audited RPCs in Phase 10/11.
 *
 * Known gap: only holders of `billing.read` (owner) can read their subscription, so a manager cannot see plan
 * limits. The database still enforces them. A `my_entitlements()` RPC (Phase 11) fixes the display side.
 */
export function makeSubscriptionService(repo: SubscriptionRepository) {
  return {
    /** The tenant's live subscription (trialing / active / past_due), or null. */
    async getCurrent(ctx: TenantServiceContext): Promise<Subscription | null> {
      requirePermission(ctx, PERMISSIONS.billingRead);
      return repo.currentForTenant(ctx);
    },
    /** Platform side: any platform role may read; `companyId` is authorised by the platform role, not by tenancy. */
    async getCurrentForCompany(ctx: PlatformServiceContext, rawCompanyId: unknown): Promise<Subscription | null> {
      requirePlatformAccess(ctx);
      return repo.currentForCompany(ctx, parseInput(idSchema, rawCompanyId));
    },
    async listPlans(ctx: PlatformServiceContext): Promise<Plan[]> {
      requirePlatformAccess(ctx);
      return repo.listPlans(ctx);
    },
  };
}
export type SubscriptionService = ReturnType<typeof makeSubscriptionService>;
export const subscriptionService = makeSubscriptionService(subscriptionRepository);
