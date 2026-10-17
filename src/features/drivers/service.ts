import { AppError, parseInput } from '@/lib/errors';
import { PERMISSIONS } from '@/lib/auth/permission-keys';
import type { Page } from '@/lib/db/pagination';
import { requirePermission } from '@/lib/service/authorize';
import type { TenantServiceContext } from '@/lib/service/context';
import { idSchema } from '@/lib/validation/common';
import { driverRepository, type DriverRepository } from './repository';
import { driverCreateSchema, driverListSchema, driverUpdateSchema } from './schema';
import type { Driver } from './types';

/** "Deactivate" is `update({ status: 'inactive' })`. The DB refuses to assign an inactive driver to a trip. */
export function makeDriverService(repo: DriverRepository) {
  return {
    async list(ctx: TenantServiceContext, rawQuery: unknown): Promise<Page<Driver>> {
      requirePermission(ctx, PERMISSIONS.driversRead);
      return repo.list(ctx, parseInput(driverListSchema, rawQuery ?? {}));
    },
    async get(ctx: TenantServiceContext, rawId: unknown): Promise<Driver> {
      requirePermission(ctx, PERMISSIONS.driversRead);
      const driver = await repo.get(ctx, parseInput(idSchema, rawId));
      if (!driver) throw new AppError('not_found');
      return driver;
    },
    async create(ctx: TenantServiceContext, input: unknown): Promise<Driver> {
      requirePermission(ctx, PERMISSIONS.driversWrite);
      return repo.create(ctx, parseInput(driverCreateSchema, input));
    },
    async update(ctx: TenantServiceContext, rawId: unknown, input: unknown): Promise<Driver> {
      requirePermission(ctx, PERMISSIONS.driversWrite);
      return repo.update(ctx, parseInput(idSchema, rawId), parseInput(driverUpdateSchema, input));
    },
  };
}
export type DriverService = ReturnType<typeof makeDriverService>;
export const driverService = makeDriverService(driverRepository);
