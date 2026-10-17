import { z } from 'zod';
import { pageQuerySchema } from '@/lib/db/pagination';
import { atLeastOneField, boolParam, optionalText, text } from '@/lib/validation/common';

// No company_id anywhere: tenant comes from the session, and strict objects reject it if a client sends it.
const fields = {
  name: text(2, 120),
  code: optionalText(30),
  originName: text(2, 120),
  destinationName: text(2, 120),
  description: optionalText(1000),
  isActive: z.boolean(),
};

export const routeCreateSchema = z.strictObject({
  name: fields.name,
  code: fields.code,
  originName: fields.originName,
  destinationName: fields.destinationName,
  description: fields.description,
  isActive: fields.isActive.optional(),
});
export type RouteCreate = z.output<typeof routeCreateSchema>;

export const routeUpdateSchema = atLeastOneField(
  z.strictObject({
    name: fields.name.optional(),
    code: fields.code,
    originName: fields.originName.optional(),
    destinationName: fields.destinationName.optional(),
    description: fields.description,
    isActive: fields.isActive.optional(),
  }),
);
export type RouteUpdate = z.output<typeof routeUpdateSchema>;

export const routeListSchema = pageQuerySchema.extend({
  q: z.string().max(200).optional(),
  isActive: boolParam.optional(),
  sort: z.enum(['name', 'created_at']).default('name'),
  dir: z.enum(['asc', 'desc']).default('asc'),
});
export type RouteListQuery = z.output<typeof routeListSchema>;
