import { parseInput } from '@/lib/errors';
import { PERMISSIONS } from '@/lib/auth/permission-keys';
import { requirePermission, requirePlatformAccess } from '@/lib/service/authorize';
import type { PlatformServiceContext, TenantServiceContext } from '@/lib/service/context';
import { idSchema } from '@/lib/validation/common';
import { subscriptionRepository, type SubscriptionRepository } from './repository';
import type { Page } from '@/lib/db/pagination';
import type { AdminSubscriptionItem } from './admin-output';
import { assignSubscriptionSchema, setSubscriptionPeriodSchema, setSubscriptionStatusSchema, subscriptionListSchema } from './schema';
import type { Plan, Subscription } from './types';

/**
 * Tenant side: read-only. Platform side (7.4): list for every platform role; assign, status, period and expiry for
 * super_admin and billing through audited RPCs (0018). Invoices and payments stay read-only until billing work.
 * The role sets are PROVISIONAL until the 7.6 role matrix decision.
 *
 * Known gap: only holders of `billing.read` (owner) can read their subscription, so a manager cannot see plan
 * limits. The database still enforces them. A `my_entitlements()` RPC (Phase 11) fixes the display side.
 */
const SUB_WRITERS = ['super_admin', 'billing'] as const;

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

    // ---- Phase 7.4. Order everywhere: authorize -> validate -> repository ----
    async adminList(ctx: PlatformServiceContext, rawQuery: unknown): Promise<Page<AdminSubscriptionItem>> {
      requirePlatformAccess(ctx);
      return repo.adminList(ctx, parseInput(subscriptionListSchema, rawQuery ?? {}));
    },
    async assign(ctx: PlatformServiceContext, rawCompanyId: unknown, input: unknown) {
      requirePlatformAccess(ctx, SUB_WRITERS);
      const companyId = parseInput(idSchema, rawCompanyId);
      return repo.adminAssign(ctx, companyId, parseInput(assignSubscriptionSchema, input));
    },
    async setStatus(ctx: PlatformServiceContext, rawId: unknown, input: unknown) {
      requirePlatformAccess(ctx, SUB_WRITERS);
      const id = parseInput(idSchema, rawId);
      return repo.adminSetStatus(ctx, id, parseInput(setSubscriptionStatusSchema, input));
    },
    async setPeriod(ctx: PlatformServiceContext, rawId: unknown, input: unknown) {
      requirePlatformAccess(ctx, SUB_WRITERS);
      const id = parseInput(idSchema, rawId);
      return repo.adminSetPeriod(ctx, id, parseInput(setSubscriptionPeriodSchema, input));
    },
    async expireStale(ctx: PlatformServiceContext) {
      requirePlatformAccess(ctx, SUB_WRITERS);
      return repo.adminExpireStale(ctx);
    },
  };
}
export type SubscriptionService = ReturnType<typeof makeSubscriptionService>;
export const subscriptionService = makeSubscriptionService(subscriptionRepository);
