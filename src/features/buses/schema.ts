import { z } from 'zod';
import { pageQuerySchema } from '@/lib/db/pagination';
import { atLeastOneField, optionalText, text } from '@/lib/validation/common';

const status = z.enum(['active', 'maintenance', 'inactive']);
// Whitespace collapsed + upper-cased so "ab 123" and "AB 123" cannot both exist (unique per company).
const plate = text(2, 20).transform((v) => v.replace(/\s+/g, ' ').toUpperCase());
const capacity = z.number().int().min(1).max(100);
const year = z.number().int().min(1950).max(2100).nullable().optional();

export const busCreateSchema = z.strictObject({
  plateNumber: plate,
  name: optionalText(80),
  capacity,
  make: optionalText(60),
  model: optionalText(60),
  year,
  status: status.optional(),
  notes: optionalText(1000),
});
export type BusCreate = z.output<typeof busCreateSchema>;

export const busUpdateSchema = atLeastOneField(
  z.strictObject({
    plateNumber: plate.optional(),
    name: optionalText(80),
    capacity: capacity.optional(),
    make: optionalText(60),
    model: optionalText(60),
    year,
    status: status.optional(),
    notes: optionalText(1000),
  }),
);
export type BusUpdate = z.output<typeof busUpdateSchema>;

export const busListSchema = pageQuerySchema.extend({
  q: z.string().max(200).optional(),
  status: status.optional(),
  sort: z.enum(['plate_number', 'capacity', 'created_at']).default('plate_number'),
  dir: z.enum(['asc', 'desc']).default('asc'),
});
export type BusListQuery = z.output<typeof busListSchema>;
