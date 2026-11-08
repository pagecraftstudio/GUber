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
  })
  .refine((v) => !v.endDate || v.endDate >= v.startDate, { path: ['endDate'], message: 'must_be_after_start' });
export type TemplateCreate = z.output<typeof templateCreateSchema>;

export const generateSchema = z.strictObject({ templateId: idSchema, days: z.number().int().min(1).max(60).default(28) });
export const templateActiveSchema = z.strictObject({ templateId: idSchema, isActive: z.boolean() });
