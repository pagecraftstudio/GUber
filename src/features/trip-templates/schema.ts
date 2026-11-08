import { z } from 'zod';
import { dateOnlySchema, idSchema, moneySchema, text } from '@/lib/validation/common';

const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'invalid_time');
const days = z
  .array(z.number().int().min(1).max(7))
  .min(1)
  .max(7)
  .transform((d) => [...new Set(d)].sort((a, b) => a - b));

/** No company id, no is_active, no generated_through: the company comes from the session, the others are server-owned. */
export const templateCreateSchema = z
  .strictObject({
    name: text(1, 120),
    routeId: idSchema,
    busId: idSchema.nullable().optional(),
    driverId: idSchema.nullable().optional(),
    departureTime: timeOfDay,
    durationMinutes: z.number().int().min(1).max(1440),
    daysOfWeek: days,
    startDate: dateOnlySchema,
    endDate: dateOnlySchema.nullable().optional(),
    price: moneySchema,
    capacity: z.number().int().min(1).max(100),
    /** Go-and-return (all four together or none): return route, return times, return-only price, go+return price. */
    returnRouteId: idSchema.nullable().optional(),
    returnTimes: z.array(timeOfDay).max(10).transform((t) => [...new Set(t)].sort()).optional(),
    returnDayOffset: z.number().int().min(0).max(7).optional(),
    returnPrice: moneySchema.nullable().optional(),
    roundTripPrice: moneySchema.nullable().optional(),
  })
  .refine((v) => !v.endDate || v.endDate >= v.startDate, { path: ['endDate'], message: 'must_be_after_start' })
  .refine(
    (v) => {
      const on = (v.returnTimes?.length ?? 0) > 0;
      const parts = [v.returnRouteId, v.returnPrice, v.roundTripPrice].map((x) => x !== null && x !== undefined);
      return on ? parts.every(Boolean) : !parts.some(Boolean);
    },
    { path: ['returnTimes'], message: 'return_incomplete' },
  );
export type TemplateCreate = z.output<typeof templateCreateSchema>;

export const generateSchema = z.strictObject({ templateId: idSchema, days: z.number().int().min(1).max(60).default(28) });
export const templateActiveSchema = z.strictObject({ templateId: idSchema, isActive: z.boolean() });
