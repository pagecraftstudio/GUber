import { z } from 'zod';
import { pageQuerySchema } from '@/lib/db/pagination';
import { idSchema, instantSchema, optionalEmail, optionalText, phoneSchema, text } from '@/lib/validation/common';

export const bookingListSchema = pageQuerySchema.extend({
  q: z.string().max(100).optional(), // booking reference
  status: z.enum(['pending', 'confirmed', 'cancelled', 'completed', 'no_show']).optional(),
  paymentStatus: z.enum(['unpaid', 'partial', 'paid', 'refunded']).optional(),
  tripId: idSchema.optional(),
  customerId: idSchema.optional(),
  createdFrom: instantSchema.optional(),
  createdTo: instantSchema.optional(),
  dir: z.enum(['asc', 'desc']).default('desc'),
});
export type BookingListQuery = z.output<typeof bookingListSchema>;

/**
 * Money is NEVER accepted from the client: the price is the trip's price at booking time and the company is derived
 * from the trip inside the RPC. Phone is normalised to E.164 here and re-checked by the database.
 */
export const createBookingSchema = z
  .object({
    tripId: idSchema,
    customerName: text(1, 120),
    customerPhone: phoneSchema,
    seats: z.number().int().min(1).max(100),
    customerEmail: optionalEmail,
    university: optionalText(200),
    studentId: optionalText(100),
    pickupStopId: idSchema.nullable().optional(),
    dropoffStopId: idSchema.nullable().optional(),
    /** Send one per user action. A retry with the same key never books twice. */
    idempotencyKey: z.string().trim().min(8).max(128).optional(),
    notes: optionalText(1000),
    status: z.enum(['pending', 'confirmed']).default('confirmed'),
  })
  .strict();
export type CreateBookingInput = z.output<typeof createBookingSchema>;

export const cancelBookingSchema = z.object({ bookingId: idSchema, reason: optionalText(500) }).strict();
export type CancelBookingInput = z.output<typeof cancelBookingSchema>;

export const setBookingStatusSchema = z.object({ bookingId: idSchema, status: z.enum(['confirmed', 'completed', 'no_show']) }).strict();
export type SetBookingStatusInput = z.output<typeof setBookingStatusSchema>;

export const setPaymentStatusSchema = z.object({ bookingId: idSchema, paymentStatus: z.enum(['unpaid', 'partial', 'paid', 'refunded']) }).strict();
export type SetPaymentStatusInput = z.output<typeof setPaymentStatusSchema>;
