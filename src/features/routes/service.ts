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
     * Route + its ordered stops. Both inputs are validated BEFORE anything is written, so a bad stop list never leaves
     * a half-created route. The two writes are separate statements (route insert, then the atomic stop RPC); if the
     * second one still fails (database refused it) the route exists without stops and the failure is returned, not
     * thrown, so the caller can send the user to the edit page of that route instead of losing their input.
     */
    async createWithStops(ctx: TenantServiceContext, routeInput: unknown, stopsInput: unknown): Promise<{ route: Route; stopsError: AppError | null }> {
      requirePermission(ctx, PERMISSIONS.routesWrite);
      const routeData = parseInput(routeCreateSchema, routeInput);
      const stops = parseInput(stopListSaveSchema, stopsInput);
      const route = await repo.create(ctx, routeData);
      try {
        await stopRepo.saveAll(ctx, route.id, stops);
        return { route, stopsError: null };
      } catch (e) {
        if (e instanceof AppError) return { route, stopsError: e };
        throw e;
      }
    },
  };
}
export type RouteService = ReturnType<typeof makeRouteService>;
export const routeService = makeRouteService(routeRepository);
