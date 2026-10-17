import { AppError, parseInput } from '@/lib/errors';
import { PERMISSIONS } from '@/lib/auth/permission-keys';
import type { Page } from '@/lib/db/pagination';
import { requirePermission } from '@/lib/service/authorize';
import type { TenantServiceContext } from '@/lib/service/context';
import { idSchema } from '@/lib/validation/common';
import { routeRepository, type RouteRepository } from './repository';
import { routeCreateSchema, routeListSchema, routeUpdateSchema } from './schema';
import type { Route } from './types';

/**
 * Order inside every method: authorize -> validate -> repository. Callers pass raw (unknown) input.
 * Phase 5 adds delete/archive rules (archiving a route that still has upcoming trips).
 */
export function makeRouteService(repo: RouteRepository) {
  return {
    async list(ctx: TenantServiceContext, rawQuery: unknown): Promise<Page<Route>> {
      requirePermission(ctx, PERMISSIONS.routesRead);
      return repo.list(ctx, parseInput(routeListSchema, rawQuery ?? {}));
    },
    async get(ctx: TenantServiceContext, rawId: unknown): Promise<Route> {
      requirePermission(ctx, PERMISSIONS.routesRead);
      const route = await repo.get(ctx, parseInput(idSchema, rawId));
      if (!route) throw new AppError('not_found');
      return route;
    },
    async create(ctx: TenantServiceContext, input: unknown): Promise<Route> {
      requirePermission(ctx, PERMISSIONS.routesWrite);
      return repo.create(ctx, parseInput(routeCreateSchema, input));
    },
    async update(ctx: TenantServiceContext, rawId: unknown, input: unknown): Promise<Route> {
      requirePermission(ctx, PERMISSIONS.routesWrite);
      return repo.update(ctx, parseInput(idSchema, rawId), parseInput(routeUpdateSchema, input));
    },
  };
}
export type RouteService = ReturnType<typeof makeRouteService>;
export const routeService = makeRouteService(routeRepository);
