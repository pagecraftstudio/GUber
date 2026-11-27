import { PERMISSIONS } from '@/lib/auth/permission-keys';
import { parseInput } from '@/lib/errors';
import { requirePermission } from '@/lib/service/authorize';
import type { TenantServiceContext } from '@/lib/service/context';
import { idSchema } from '@/lib/validation/common';
import { shuttleRepository, type ShuttleRepository } from './repository';
import { cancelDaySchema, faresSaveSchema, overviewQuerySchema, serviceActiveSchema, serviceSaveSchema, startDaySchema } from './schema';
import type { ShuttleFare, ShuttleOverview, ShuttleService, StartDayResult } from './types';

/** Order inside every method: authorize -> validate -> repository. Reads need shuttle.read, every change needs shuttle.config. */
export function makeShuttleService(repo: ShuttleRepository) {
  return {
    async isEnabled(ctx: TenantServiceContext): Promise<boolean> {
      requirePermission(ctx, PERMISSIONS.shuttleRead);
      return repo.isEnabled(ctx);
    },
    async liveServiceForRoute(ctx: TenantServiceContext, rawRouteId: unknown): Promise<ShuttleService | null> {
      requirePermission(ctx, PERMISSIONS.shuttleRead);
      return repo.liveServiceForRoute(ctx, parseInput(idSchema, rawRouteId));
    },
    async listFares(ctx: TenantServiceContext, rawServiceId: unknown): Promise<ShuttleFare[]> {
      requirePermission(ctx, PERMISSIONS.shuttleRead);
      return repo.listFares(ctx, parseInput(idSchema, rawServiceId));
    },
    async saveService(ctx: TenantServiceContext, input: unknown): Promise<string> {
      requirePermission(ctx, PERMISSIONS.shuttleConfig);
      return repo.saveService(ctx, parseInput(serviceSaveSchema, input));
    },
    async setServiceActive(ctx: TenantServiceContext, input: unknown): Promise<void> {
      requirePermission(ctx, PERMISSIONS.shuttleConfig);
      return repo.setServiceActive(ctx, parseInput(serviceActiveSchema, input));
    },
    async saveFares(ctx: TenantServiceContext, input: unknown): Promise<number> {
      requirePermission(ctx, PERMISSIONS.shuttleConfig);
      return repo.saveFares(ctx, parseInput(faresSaveSchema, input));
    },
    async listLiveServices(ctx: TenantServiceContext): Promise<ShuttleService[]> {
      requirePermission(ctx, PERMISSIONS.shuttleRead);
      return repo.listLiveServices(ctx);
    },
    async overview(ctx: TenantServiceContext, input: unknown): Promise<ShuttleOverview> {
      requirePermission(ctx, PERMISSIONS.shuttleRead);
      return repo.overview(ctx, parseInput(overviewQuerySchema, input));
    },
    /** Starting or cancelling a day runs the operation: shuttle.operate (owner, manager, operations). */
    async startDay(ctx: TenantServiceContext, input: unknown): Promise<StartDayResult> {
      requirePermission(ctx, PERMISSIONS.shuttleOperate);
      return repo.startDay(ctx, parseInput(startDaySchema, input));
    },
    async cancelDay(ctx: TenantServiceContext, input: unknown): Promise<void> {
      requirePermission(ctx, PERMISSIONS.shuttleOperate);
      return repo.cancelDay(ctx, parseInput(cancelDaySchema, input));
    },
  };
}
export type ShuttleFeatureService = ReturnType<typeof makeShuttleService>;
export const shuttleService = makeShuttleService(shuttleRepository);
