import { z } from 'zod';
import { atLeastOneField, optionalText, text } from '@/lib/validation/common';
import { STOP_LIMITS, validateStopList } from './validate';

const lat = z.number().min(-90).max(90);
const lng = z.number().min(-180).max(180);
const stopType = z.enum(['pickup', 'dropoff', 'both']);
const order = z.number().int().min(1).max(32767);
const offset = z.number().int().min(0).max(32767);

export const stopCreateSchema = z
  .strictObject({
    name: text(2, 120),
    address: optionalText(300),
    latitude: lat.nullable().optional(),
    longitude: lng.nullable().optional(),
    stopType: stopType.optional(),
    offsetMinutes: offset.optional(),
    isActive: z.boolean().optional(),
    stopOrder: order.optional(), // omitted = append at the end
  })
  .refine((v) => (v.latitude == null) === (v.longitude == null), { path: ['longitude'], message: 'coords_both_or_neither' });
export type StopCreate = z.output<typeof stopCreateSchema>;

// stopOrder is intentionally NOT updatable here: reordering needs an atomic multi-row operation (Phase 5 RPC).
export const stopUpdateSchema = atLeastOneField(
  z.strictObject({
    name: text(2, 120).optional(),
    address: optionalText(300),
    latitude: lat.nullable().optional(),
    longitude: lng.nullable().optional(),
    stopType: stopType.optional(),
    offsetMinutes: offset.optional(),
    isActive: z.boolean().optional(),
  }),
).refine(
  (v) =>
    (v.latitude === undefined && v.longitude === undefined) ||
    (v.latitude !== undefined && v.longitude !== undefined && (v.latitude === null) === (v.longitude === null)),
  { path: ['longitude'], message: 'coords_both_or_neither' },
);
export type StopUpdate = z.output<typeof stopUpdateSchema>;

/** One item of a whole-list save. `id` present = existing stop of THIS route (the database re-checks that), absent = new. */
const stopSaveItem = z.strictObject({
  id: z.guid().nullable().optional(),
  name: text(STOP_LIMITS.nameMin, STOP_LIMITS.nameMax),
  address: optionalText(STOP_LIMITS.addressMax),
  latitude: lat.nullable().optional(),
  longitude: lng.nullable().optional(),
  stopType: stopType.optional(),
  offsetMinutes: offset,
  isActive: z.boolean().optional(),
});

/** The ordered list IS the order: array position becomes stop_order 1..n. No separate order field to get out of sync. */
export const stopListSaveSchema = z
  .array(stopSaveItem)
  .max(STOP_LIMITS.max)
  .superRefine((list, ctx) => {
    for (const issue of validateStopList(list.map((s) => ({ ...s, address: s.address ?? null })))) {
      ctx.addIssue({ code: 'custom', path: issue.index === null ? [] : [issue.index, issue.field], message: issue.code });
    }
  });
export type StopListSave = z.output<typeof stopListSaveSchema>;
