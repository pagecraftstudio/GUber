import { parseInput } from '@/lib/errors';
import { PERMISSIONS } from '@/lib/auth/permission-keys';
import { requirePermission } from '@/lib/service/authorize';
import type { TenantServiceContext } from '@/lib/service/context';
import { tripTemplateRepository, type TripTemplateRepository } from './repository';
import { generateSchema, templateActiveSchema, templateCreateSchema } from './schema';
import type { GenerateResult, TripTemplate } from './types';

/** Regular (weekly) trips: templates + generation of real trips from them. */
export function makeTripTemplateService(repo: TripTemplateRepository) {
  return {
    async list(ctx: TenantServiceContext): Promise<TripTemplate[]> {
      requirePermission(ctx, PERMISSIONS.tripsRead);
      return repo.list(ctx);
    },
    /** Creates the template, then generates its first trips so the schedule is live immediately. */
    async create(ctx: TenantServiceContext, input: unknown): Promise<{ template: TripTemplate; generated: GenerateResult }> {
      requirePermission(ctx, PERMISSIONS.tripsWrite);
      const template = await repo.create(ctx, parseInput(templateCreateSchema, input));
      return { template, generated: await repo.generate(ctx, template.id, 28) };
    },
    async generate(ctx: TenantServiceContext, input: unknown): Promise<GenerateResult> {
      requirePermission(ctx, PERMISSIONS.tripsWrite);
      const p = parseInput(generateSchema, input);
      return repo.generate(ctx, p.templateId, p.days);
    },
    async setActive(ctx: TenantServiceContext, input: unknown): Promise<TripTemplate> {
      requirePermission(ctx, PERMISSIONS.tripsWrite);
      const p = parseInput(templateActiveSchema, input);
      return repo.setActive(ctx, p.templateId, p.isActive);
    },
  };
}
export const tripTemplateService = makeTripTemplateService(tripTemplateRepository);
