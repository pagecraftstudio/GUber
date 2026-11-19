import { z } from 'zod';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), 'invalid date');
/** The range is checked again by the database (max 366 days); here it only has to be well formed and ordered. */
export const rangeSchema = z.strictObject({ from: day, to: day }).refine((r) => r.from <= r.to, { message: 'invalid range', path: ['to'] })
  .refine((r) => (Date.parse(`${r.to}T00:00:00Z`) - Date.parse(`${r.from}T00:00:00Z`)) / 86_400_000 <= 366, { message: 'range too long', path: ['to'] });
export type Range = z.output<typeof rangeSchema>;
export const DEMAND_DAYS = 7;
