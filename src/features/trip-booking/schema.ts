import { z } from 'zod';
import { idSchema, phoneSchema } from '@/lib/validation/common';

const optional = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : undefined));

/**
 * What a student sends to book a seat. NO company id and NO customer id: the company comes from the trip and the customer from the
 * session (create_my_booking, 0013). The idempotency key is made by the form once per booking attempt, so a double click or a retry after
 * a lost response returns the same booking instead of creating a second one.
 */
export const seatsSchema = z.number().int().min(1).max(20);
export const bookTripSchema = z.strictObject({
  tripId: idSchema,
  seats: seatsSchema,
  fullName: z.string().trim().min(1).max(120),
  phone: phoneSchema,
  email: optional(254),
  university: optional(200),
  studentId: optional(100),
  pickupStopId: idSchema.optional(),
  dropoffStopId: idSchema.optional(),
  notes: optional(1000),
  idempotencyKey: z.string().min(8).max(128),
});
export type BookTripInput = z.output<typeof bookTripSchema>;
