import { z } from 'zod';
import { createBookingSchema } from '@/features/bookings/schema';

/** Staff entry. The booking fields are exactly the RPC's; money received is the only addition (bounded again by the database). */
export const staffBookingSchema = createBookingSchema.extend({
  amountReceived: z.number().finite().min(0).max(9_999_999_999.99).refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, 'max 2 decimals').optional(),
});
export type StaffBookingInput = z.output<typeof staffBookingSchema>;

/** Egyptian local mobile numbers (01XXXXXXXXX) become +201XXXXXXXXX; anything else is left for phoneSchema to judge. */
export function toE164Eg(raw: string): string {
  const d = raw.replace(/[\s\-()]/g, '');
  return /^01[0125]\d{8}$/.test(d) ? `+2${d}` : d;
}
