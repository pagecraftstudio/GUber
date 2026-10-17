import { AppError, parseInput } from '@/lib/errors';
import { PERMISSIONS } from '@/lib/auth/permission-keys';
import type { Page } from '@/lib/db/pagination';
import { requirePermission } from '@/lib/service/authorize';
import type { TenantServiceContext } from '@/lib/service/context';
import { idSchema } from '@/lib/validation/common';
import { busRepository, type BusRepository } from './repository';
import { busCreateSchema, busListSchema, busUpdateSchema } from './schema';
import type { Bus } from './types';

/**
 * "Deactivate" is `update({ status: 'inactive' })`. The DB already refuses to assign an inactive bus to a trip;
 * Phase 5 adds the check that a bus with upcoming trips cannot be deactivated silently.
 */
export function makeBusService(repo: BusRepository) {
  return {
    async list(ctx: TenantServiceContext, rawQuery: unknown): Promise<Page<Bus>> {
      requirePermission(ctx, PERMISSIONS.busesRead);
      return repo.list(ctx, parseInput(busListSchema, rawQuery ?? {}));
    },
    async get(ctx: TenantServiceContext, rawId: unknown): Promise<Bus> {
      requirePermission(ctx, PERMISSIONS.busesRead);
      const bus = await repo.get(ctx, parseInput(idSchema, rawId));
      if (!bus) throw new AppError('not_found');
      return bus;
    },
    async create(ctx: TenantServiceContext, input: unknown): Promise<Bus> {
      requirePermission(ctx, PERMISSIONS.busesWrite);
      return repo.create(ctx, parseInput(busCreateSchema, input));
    },
    async update(ctx: TenantServiceContext, rawId: unknown, input: unknown): Promise<Bus> {
      requirePermission(ctx, PERMISSIONS.busesWrite);
      return repo.update(ctx, parseInput(idSchema, rawId), parseInput(busUpdateSchema, input));
    },
  };
}
export type BusService = ReturnType<typeof makeBusService>;
export const busService = makeBusService(busRepository);
