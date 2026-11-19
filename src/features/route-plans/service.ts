import { PERMISSIONS } from '@/lib/auth/permission-keys';
import { parseInput } from '@/lib/errors';
import { requirePermission } from '@/lib/service/authorize';
import type { TenantServiceContext } from '@/lib/service/context';
import { idSchema } from '@/lib/validation/common';
import { routePlanRepository, type RoutePlanRepository } from './repository';
import { decisionSchema, planCreateSchema, revokeSchema, planUpdateSchema, subscriptionListSchema } from './schema';
import type { ExpiringSubscription, FutureBooking, RoutePlan, RouteSubscription } from './types';

/** Order inside every method: authorize -> validate -> repository. Plans follow routes.* ; the request inbox follows bookings.*. */
export function makeRoutePlanService(repo: RoutePlanRepository) {
  return {
    async listPlans(ctx: TenantServiceContext): Promise<RoutePlan[]> {
      requirePermission(ctx, PERMISSIONS.routesRead);
      return repo.listPlans(ctx);
    },
    async createPlan(ctx: TenantServiceContext, input: unknown): Promise<string> {
      requirePermission(ctx, PERMISSIONS.routesWrite);
      return repo.createPlan(ctx, parseInput(planCreateSchema, input));
    },
    async updatePlan(ctx: TenantServiceContext, rawId: unknown, input: unknown): Promise<void> {
      requirePermission(ctx, PERMISSIONS.routesWrite);
      return repo.updatePlan(ctx, parseInput(idSchema, rawId), parseInput(planUpdateSchema, input));
    },
    async archivePlan(ctx: TenantServiceContext, rawId: unknown): Promise<void> {
      requirePermission(ctx, PERMISSIONS.routesWrite);
      return repo.archivePlan(ctx, parseInput(idSchema, rawId));
    },
    async listSubscriptions(ctx: TenantServiceContext, rawQuery?: unknown): Promise<RouteSubscription[]> {
      requirePermission(ctx, PERMISSIONS.bookingsRead);
      return repo.listSubscriptions(ctx, parseInput(subscriptionListSchema, rawQuery ?? {}));
    },
    async expiringSubscriptions(ctx: TenantServiceContext): Promise<ExpiringSubscription[]> {
      requirePermission(ctx, PERMISSIONS.bookingsRead);
      return repo.expiring(ctx);
    },
    async decide(ctx: TenantServiceContext, rawId: unknown, input: unknown): Promise<void> {
      requirePermission(ctx, PERMISSIONS.bookingsWrite);
      return repo.decide(ctx, parseInput(idSchema, rawId), parseInput(decisionSchema, input));
    },
    async futureBookings(ctx: TenantServiceContext, rawId: unknown): Promise<FutureBooking[]> {
      requirePermission(ctx, PERMISSIONS.bookingsWrite);
      return repo.futureBookings(ctx, parseInput(idSchema, rawId));
    },
    async revoke(ctx: TenantServiceContext, rawId: unknown, input: unknown): Promise<void> {
      requirePermission(ctx, PERMISSIONS.bookingsWrite);
      return repo.revoke(ctx, parseInput(idSchema, rawId), parseInput(revokeSchema, input));
    },
  };
}
export type RoutePlanService = ReturnType<typeof makeRoutePlanService>;
export const routePlanService = makeRoutePlanService(routePlanRepository);
