import { z } from 'zod';
import { pageQuerySchema } from '@/lib/db/pagination';
import { atLeastOneField, idSchema, instantSchema, moneySchema, optionalText } from '@/lib/validation/common';

const capacity = z.number().int().min(1).max(100);
const statusEnum = z.enum(['draft', 'scheduled', 'boarding', 'in_progress', 'completed', 'cancelled']);

/**
 * Phase 4 creates trips as DRAFT only. There is no `status`, `seatsBooked`, `blockedUntil`, `bufferMinutes` or
 * `templateId` field: status changes are a Phase 5 state machine, and the other three are database-owned.
 * Drafts are not subject to bus/driver overlap checks (the DB applies those once a trip goes live).
 */
export const tripCreateSchema = z
  .strictObject({
    routeId: idSchema,
    busId: idSchema.nullable().optional(),
    driverId: idSchema.nullable().optional(),
    departureAt: instantSchema,
    arrivalAt: instantSchema,
    price: moneySchema,
    capacity,
    notes: optionalText(1000),
  })
  .refine((v) => Date.parse(v.arrivalAt) > Date.parse(v.departureAt), { path: ['arrivalAt'], message: 'must_be_after_departure' });
export type TripCreate = z.output<typeof tripCreateSchema>;

export const tripUpdateSchema = atLeastOneField(
  z.strictObject({
    routeId: idSchema.optional(),
    busId: idSchema.nullable().optional(),
    driverId: idSchema.nullable().optional(),
    departureAt: instantSchema.optional(),
    arrivalAt: instantSchema.optional(),
    price: moneySchema.optional(),
    capacity: capacity.optional(),
    notes: optionalText(1000),
  }),
).refine((v) => v.departureAt === undefined || v.arrivalAt === undefined || Date.parse(v.arrivalAt) > Date.parse(v.departureAt), {
  path: ['arrivalAt'],
  message: 'must_be_after_departure',
});
export type TripUpdate = z.output<typeof tripUpdateSchema>;

export const tripListSchema = pageQuerySchema.extend({
  status: statusEnum.optional(),
  routeId: idSchema.optional(),
  busId: idSchema.optional(),
  driverId: idSchema.optional(),
  from: instantSchema.optional(), // departure_at >= from
  to: instantSchema.optional(), // departure_at < to
  dir: z.enum(['asc', 'desc']).default('asc'),
});
export type TripListQuery = z.output<typeof tripListSchema>;

/** Status changes go through the state machine RPC only. The company comes from the trip, never from input. */
export const tripTransitionSchema = z
  .strictObject({ tripId: idSchema, to: statusEnum, reason: optionalText(500) });
export type TripTransitionInput = z.output<typeof tripTransitionSchema>;
