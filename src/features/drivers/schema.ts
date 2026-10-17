import { z } from 'zod';
import { pageQuerySchema } from '@/lib/db/pagination';
import { atLeastOneField, dateOnlySchema, optionalText, phoneSchema, text } from '@/lib/validation/common';

const status = z.enum(['active', 'inactive']);
const licenseExpiry = dateOnlySchema.nullable().optional();

// `userId` and `photoMediaId` are deliberately absent. userId: attaching a login account changes who may read
// trips, so it needs "target is a member of this company with the driver role". photoMediaId: arrives with
// storage (Phase 13), which must also check the media row's bucket/kind.
export const driverCreateSchema = z.strictObject({
  fullName: text(2, 100),
  phone: phoneSchema,
  licenseNumber: optionalText(50),
  licenseExpiry,
  status: status.optional(),
  notes: optionalText(1000),
});
export type DriverCreate = z.output<typeof driverCreateSchema>;

export const driverUpdateSchema = atLeastOneField(
  z.strictObject({
    fullName: text(2, 100).optional(),
    phone: phoneSchema.optional(),
    licenseNumber: optionalText(50),
    licenseExpiry,
      status: status.optional(),
    notes: optionalText(1000),
  }),
);
export type DriverUpdate = z.output<typeof driverUpdateSchema>;

export const driverListSchema = pageQuerySchema.extend({
  q: z.string().max(200).optional(),
  status: status.optional(),
  sort: z.enum(['full_name', 'created_at']).default('full_name'),
  dir: z.enum(['asc', 'desc']).default('asc'),
});
export type DriverListQuery = z.output<typeof driverListSchema>;
