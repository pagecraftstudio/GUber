import { AppError, parseInput } from '@/lib/errors';
import { PERMISSIONS } from '@/lib/auth/permission-keys';
import type { Page } from '@/lib/db/pagination';
import { requirePermission } from '@/lib/service/authorize';
import type { TenantServiceContext } from '@/lib/service/context';
import { idSchema } from '@/lib/validation/common';
import { tripRepository, type TripRepository } from './repository';
import { canCancel, nextStatus } from './lifecycle';
import { tripCreateSchema, tripListSchema, tripTransitionSchema, tripUpdateSchema } from './schema';
import type { Trip, TripTransitioned } from './types';

/**
 * Drafts + field edits (Phase 4), status machine, draft deletion and monthly limits (Phase 5, migration 0011).
 * Still open: rules for editing the time of a trip that already has bookings (needs a customer notification flow).
 */
export function makeTripService(repo: TripRepository) {
  return {
    async list(ctx: TenantServiceContext, rawQuery: unknown): Promise<Page<Trip>> {
      requirePermission(ctx, PERMISSIONS.tripsRead);
      return repo.list(ctx, parseInput(tripListSchema, rawQuery ?? {}));
    },
    async get(ctx: TenantServiceContext, rawId: unknown): Promise<Trip> {
      requirePermission(ctx, PERMISSIONS.tripsRead);
      const trip = await repo.get(ctx, parseInput(idSchema, rawId));
      if (!trip) throw new AppError('not_found');
      return trip;
    },
    async createDraft(ctx: TenantServiceContext, input: unknown): Promise<Trip> {
      requirePermission(ctx, PERMISSIONS.tripsWrite);
      return repo.createDraft(ctx, parseInput(tripCreateSchema, input));
    },
    async update(ctx: TenantServiceContext, rawId: unknown, input: unknown): Promise<Trip> {
      requirePermission(ctx, PERMISSIONS.tripsWrite);
      return repo.update(ctx, parseInput(idSchema, rawId), parseInput(tripUpdateSchema, input));
    },
    async transition(ctx: TenantServiceContext, raw: unknown): Promise<TripTransitioned> {
      requirePermission(ctx, PERMISSIONS.tripsWrite);
      return repo.transition(ctx, parseInput(tripTransitionSchema, raw));
    },
    /**
     * The single "next step" button. The next status is computed HERE from the trip as the database has it now, never taken
     * from the client; `expectedStatus` is what the user was looking at, so a stale page cannot push a trip two steps.
     */
    async advance(ctx: TenantServiceContext, rawId: unknown, expectedStatus: unknown): Promise<TripTransitioned> {
      requirePermission(ctx, PERMISSIONS.tripsWrite);
      const trip = await repo.get(ctx, parseInput(idSchema, rawId));
      if (!trip) throw new AppError('not_found');
      if (trip.status !== expectedStatus) throw new AppError('conflict', { detail: 'trip_changed' });
      const to = nextStatus(trip.status);
      if (!to) throw new AppError('business_rule', { detail: 'trip_final' });
      return repo.transition(ctx, { tripId: trip.id, to });
    },
    /** Cancel is its own action (bookings are cancelled with it, in the same database transaction). */
    async cancel(ctx: TenantServiceContext, rawId: unknown, reason?: unknown): Promise<TripTransitioned> {
      requirePermission(ctx, PERMISSIONS.tripsWrite);
      const parsed = parseInput(tripTransitionSchema, { tripId: rawId, to: 'cancelled', reason });
      const trip = await repo.get(ctx, parsed.tripId);
      if (!trip) throw new AppError('not_found');
      if (!canCancel(trip.status)) throw new AppError('business_rule', { detail: 'trip_final' });
      return repo.transition(ctx, parsed);
    },
    async deleteDraft(ctx: TenantServiceContext, rawId: unknown): Promise<void> {
      requirePermission(ctx, PERMISSIONS.tripsWrite);
      await repo.deleteDraft(ctx, parseInput(idSchema, rawId));
    },
  };
}
export type TripService = ReturnType<typeof makeTripService>;
export const tripService = makeTripService(tripRepository);
