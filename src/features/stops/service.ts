import { AppError, parseInput } from '@/lib/errors';
import { PERMISSIONS } from '@/lib/auth/permission-keys';
import { requirePermission } from '@/lib/service/authorize';
import type { TenantServiceContext } from '@/lib/service/context';
import { idSchema } from '@/lib/validation/common';
import { stopRepository, type StopRepository } from './repository';
import { stopCreateSchema, stopListSaveSchema, stopUpdateSchema } from './schema';
import type { Stop } from './types';

/** Stops inherit the `routes.*` permissions (RLS does the same). Add, edit, remove and reorder go through saveAll (one atomic RPC). */
export function makeStopService(repo: StopRepository) {
  return {
    async listByRoute(ctx: TenantServiceContext, rawRouteId: unknown): Promise<Stop[]> {
      requirePermission(ctx, PERMISSIONS.routesRead);
      return repo.listByRoute(ctx, parseInput(idSchema, rawRouteId));
    },
    async get(ctx: TenantServiceContext, rawId: unknown): Promise<Stop> {
      requirePermission(ctx, PERMISSIONS.routesRead);
      const stop = await repo.get(ctx, parseInput(idSchema, rawId));
      if (!stop) throw new AppError('not_found');
      return stop;
    },
    async create(ctx: TenantServiceContext, rawRouteId: unknown, input: unknown): Promise<Stop> {
      requirePermission(ctx, PERMISSIONS.routesWrite);
      return repo.create(ctx, parseInput(idSchema, rawRouteId), parseInput(stopCreateSchema, input));
    },
    async update(ctx: TenantServiceContext, rawId: unknown, input: unknown): Promise<Stop> {
      requirePermission(ctx, PERMISSIONS.routesWrite);
      return repo.update(ctx, parseInput(idSchema, rawId), parseInput(stopUpdateSchema, input));
    },
    /** Replaces the whole ordered stop list of one route atomically (add / edit / remove / reorder). */
    async saveAll(ctx: TenantServiceContext, rawRouteId: unknown, input: unknown) {
      requirePermission(ctx, PERMISSIONS.routesWrite);
      return repo.saveAll(ctx, parseInput(idSchema, rawRouteId), parseInput(stopListSaveSchema, input));
    },
  };
}
export type StopService = ReturnType<typeof makeStopService>;
export const stopService = makeStopService(stopRepository);
