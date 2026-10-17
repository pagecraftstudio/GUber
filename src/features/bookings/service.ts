import { AppError, parseInput } from '@/lib/errors';
import { PERMISSIONS } from '@/lib/auth/permission-keys';
import type { Page } from '@/lib/db/pagination';
import { requirePermission } from '@/lib/service/authorize';
import type { TenantServiceContext } from '@/lib/service/context';
import { idSchema } from '@/lib/validation/common';
import { bookingRepository, type BookingRepository } from './repository';
import { bookingListSchema, cancelBookingSchema, createBookingSchema, setBookingStatusSchema, setPaymentStatusSchema } from './schema';
import type { Booking, BookingCancelled, BookingCreated, BookingPaymentChanged, BookingStatusChanged } from './types';

export function makeBookingService(repo: BookingRepository) {
  return {
    async list(ctx: TenantServiceContext, rawQuery: unknown): Promise<Page<Booking>> {
      requirePermission(ctx, PERMISSIONS.bookingsRead);
      return repo.list(ctx, parseInput(bookingListSchema, rawQuery ?? {}));
    },
    async get(ctx: TenantServiceContext, rawId: unknown): Promise<Booking> {
      requirePermission(ctx, PERMISSIONS.bookingsRead);
      const booking = await repo.get(ctx, parseInput(idSchema, rawId));
      if (!booking) throw new AppError('not_found');
      return booking;
    },
    // Writes: authorization FIRST (bookings.write), then validation, then the RPC (which authorizes again against
    // the trip's own company: defence in depth, never trusting the context alone).
    async create(ctx: TenantServiceContext, raw: unknown): Promise<BookingCreated> {
      requirePermission(ctx, PERMISSIONS.bookingsWrite);
      return repo.create(ctx, parseInput(createBookingSchema, raw));
    },
    async cancel(ctx: TenantServiceContext, raw: unknown): Promise<BookingCancelled> {
      requirePermission(ctx, PERMISSIONS.bookingsWrite);
      return repo.cancel(ctx, parseInput(cancelBookingSchema, raw));
    },
    async setStatus(ctx: TenantServiceContext, raw: unknown): Promise<BookingStatusChanged> {
      requirePermission(ctx, PERMISSIONS.bookingsWrite);
      return repo.setStatus(ctx, parseInput(setBookingStatusSchema, raw));
    },
    async setPaymentStatus(ctx: TenantServiceContext, raw: unknown): Promise<BookingPaymentChanged> {
      requirePermission(ctx, PERMISSIONS.bookingsWrite);
      return repo.setPaymentStatus(ctx, parseInput(setPaymentStatusSchema, raw));
    },
  };
}
export type BookingService = ReturnType<typeof makeBookingService>;
export const bookingService = makeBookingService(bookingRepository);
