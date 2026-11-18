import { z } from 'zod';
import { dateOnlySchema, idSchema, phoneSchema } from '@/lib/validation/common';

// No user id and no company id anywhere: the database derives the member from the session and the company from the plan / subscription row.
export const requestSchema = z.strictObject({ planId: idSchema });
export const subscriptionIdSchema = idSchema;
export const daySchema = z.strictObject({ subscriptionId: idSchema, day: dateOnlySchema });
export const returnOptionsSchema = z.strictObject({ subscriptionId: idSchema, outboundTripId: idSchema });
/** Returning today = a return trip id. Not returning = no return trip. There is no third state. */
export const bookSchema = z.strictObject({ subscriptionId: idSchema, outboundTripId: idSchema, returnTripId: idSchema.optional() });
export const phoneUpdateSchema = z.strictObject({ phone: phoneSchema });
export type BookInput = z.output<typeof bookSchema>;
