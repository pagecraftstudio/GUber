import { ROLE_SETS } from '@/features/platform/permissions';
import { parseInput } from '@/lib/errors';
import { requirePlatformAccess } from '@/lib/service/authorize';
import type { PlatformServiceContext } from '@/lib/service/context';
import { idSchema } from '@/lib/validation/common';
import { planRepository, type PlanRepository } from './repository';
import { createDefinitionSchema, createPlanSchema, setEntitlementSchema, setPlanActiveSchema, updatePlanSchema } from './schema';

/**
 * Platform plans (P8, decision D1). Reading: any platform role. Writing: super_admin only, in the service AND in Postgres.
 * Order everywhere: authorize -> validate -> repository.
 */
const WRITERS = ROLE_SETS.superAdminOnly;

export function makePlanService(repo: PlanRepository) {
  return {
    async overview(ctx: PlatformServiceContext) { requirePlatformAccess(ctx); return repo.overview(ctx); },
    async create(ctx: PlatformServiceContext, input: unknown) { requirePlatformAccess(ctx, WRITERS); return repo.create(ctx, parseInput(createPlanSchema, input)); },
    async update(ctx: PlatformServiceContext, rawId: unknown, input: unknown) {
      requirePlatformAccess(ctx, WRITERS);
      return repo.update(ctx, parseInput(idSchema, rawId), parseInput(updatePlanSchema, input));
    },
    async setActive(ctx: PlatformServiceContext, rawId: unknown, input: unknown) {
      requirePlatformAccess(ctx, WRITERS);
      return repo.setActive(ctx, parseInput(idSchema, rawId), parseInput(setPlanActiveSchema, input));
    },
    async setEntitlement(ctx: PlatformServiceContext, rawId: unknown, input: unknown) {
      requirePlatformAccess(ctx, WRITERS);
      return repo.setEntitlement(ctx, parseInput(idSchema, rawId), parseInput(setEntitlementSchema, input));
    },
    async createDefinition(ctx: PlatformServiceContext, input: unknown) { requirePlatformAccess(ctx, WRITERS); return repo.createDefinition(ctx, parseInput(createDefinitionSchema, input)); },
  };
}
export type PlanService = ReturnType<typeof makePlanService>;
export const planService = makePlanService(planRepository);
