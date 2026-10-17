import { z } from 'zod';
import { pageQuerySchema } from '@/lib/db/pagination';
import { atLeastOneField, optionalEmail, optionalText, phoneSchema, text } from '@/lib/validation/common';

export const customerCreateSchema = z.strictObject({
  fullName: text(2, 100),
  phone: phoneSchema,
  email: optionalEmail,
  university: optionalText(120),
  studentId: optionalText(50),
  notes: optionalText(1000),
});
export type CustomerCreate = z.output<typeof customerCreateSchema>;

export const customerUpdateSchema = atLeastOneField(
  z.strictObject({
    fullName: text(2, 100).optional(),
    phone: phoneSchema.optional(),
    email: optionalEmail,
    university: optionalText(120),
    studentId: optionalText(50),
    notes: optionalText(1000),
  }),
);
export type CustomerUpdate = z.output<typeof customerUpdateSchema>;

export const customerListSchema = pageQuerySchema.extend({
  q: z.string().max(200).optional(),
  sort: z.enum(['full_name', 'created_at']).default('created_at'),
  dir: z.enum(['asc', 'desc']).default('desc'),
});
export type CustomerListQuery = z.output<typeof customerListSchema>;
