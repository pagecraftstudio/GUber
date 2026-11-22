import { AppError, parseInput } from '@/lib/errors';
import { PERMISSIONS } from '@/lib/auth/permission-keys';
import { requirePermission } from '@/lib/service/authorize';
import type { TenantServiceContext } from '@/lib/service/context';
import { bookingService, type BookingService } from '@/features/bookings/service';
import type { BookingCreated } from '@/features/bookings/types';
import { staffBookingSchema } from './schema';

export type StaffBookingResult = { booking: BookingCreated; amountRecorded: number; amountError?: string };

/**
 * A booking taken by staff: the normal create_booking RPC (source 'staff', capacity and trip rules unchanged), then the
 * money received through set_booking_amount_paid. A rejected amount never undoes the seats; it is reported so staff can
 * fix it on the booking.
 */
export function makeStaffBookingService(bookings: BookingService) {
  return {
    async create(ctx: TenantServiceContext, raw: unknown): Promise<StaffBookingResult> {
      requirePermission(ctx, PERMISSIONS.bookingsWrite);
      const { amountReceived, ...input } = parseInput(staffBookingSchema, raw);
      const booking = await bookings.create(ctx, { ...input, status: 'confirmed' });
      if (!amountReceived || booking.idempotentReplay) return { booking, amountRecorded: 0 };
      try {
        await bookings.setAmountPaid(ctx, { bookingId: booking.id, amount: amountReceived });
        return { booking, amountRecorded: amountReceived };
      } catch (e) {
        if (e instanceof AppError) return { booking, amountRecorded: 0, amountError: e.detail === 'amount_exceeds_total' ? 'amount_exceeds_total' : 'amount_invalid' };
        throw e;
      }
    },
  };
}
export const staffBookingService = makeStaffBookingService(bookingService);
