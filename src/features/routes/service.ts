import { AppError, parseInput } from '@/lib/errors';
import { PERMISSIONS } from '@/lib/auth/permission-keys';
import type { Page } from '@/lib/db/pagination';
import { requirePermission } from '@/lib/service/authorize';
import type { TenantServiceContext } from '@/lib/service/context';
import { idSchema } from '@/lib/validation/common';
import { routeRepository, type RouteRepository } from './repository';
import { stopListSaveSchema } from '@/features/stops/schema';
import { stopRepository, type StopRepository } from '@/features/stops/repository';
import { routeCreateSchema, routeListSchema, routeUpdateSchema } from './schema';
import type { Route } from './types';

/**
 * Order inside every method: authorize -> validate -> repository. Callers pass raw (unknown) input.
 * Phase 5 adds delete/archive rules (archiving a route that still has upcoming trips).
 */
export function makeRouteService(repo: RouteRepository, stopRepo: StopRepository = stopRepository) {
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
    /** Route fields, then the whole ordered stop list (atomic). Both validated first; if the stop save fails the route fields were already saved. */
    async updateWithStops(ctx: TenantServiceContext, rawId: unknown, routeInput: unknown, stopsInput: unknown): Promise<{ route: Route }> {
      requirePermission(ctx, PERMISSIONS.routesWrite);
      const id = parseInput(idSchema, rawId);
      const patch = parseInput(routeUpdateSchema, routeInput);
      const stops = parseInput(stopListSaveSchema, stopsInput);
      const route = await repo.update(ctx, id, patch);
      await stopRepo.saveAll(ctx, id, stops);
      return { route };
    },
    /**
     * Route + its ordered stops in ONE database transaction (create_route_with_stops). Both inputs are validated first;
     * any database refusal (stop rules, plan limit, permission) rolls the route back too, so a route never exists without its stops.
     */
    async createWithStops(ctx: TenantServiceContext, routeInput: unknown, stopsInput: unknown): Promise<{ route: Route }> {
      requirePermission(ctx, PERMISSIONS.routesWrite);
      const id = await repo.createWithStops(ctx, parseInput(routeCreateSchema, routeInput), parseInput(stopListSaveSchema, stopsInput));
      const route = await repo.get(ctx, id);
      if (!route) throw new AppError('internal');
      return { route };
    },
  };
}
export type RouteService = ReturnType<typeof makeRouteService>;
export const routeService = makeRouteService(routeRepository);
