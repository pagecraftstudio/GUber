import { z } from 'zod';
import { idSchema, moneySchema, text } from '@/lib/validation/common';

// No company_id anywhere: the database derives the company from the route / service row (migration 0074).
// Limits mirror the CHECKs of shuttle_services and shuttle_fares.
export const serviceSaveSchema = z.strictObject({
  routeId: idSchema,
  name: text(1, 120),
  outboundDirection: z.enum(['forward', 'backward']),
  allowReverse: z.boolean(),
  requestTtlMinutes: z.number().int().min(1).max(240),
  allowWalkIn: z.boolean(),
  maxSeatsPerRequest: z.number().int().min(1).max(20),
  hubStopId: idSchema.nullable(),
});
export type ServiceSave = z.output<typeof serviceSaveSchema>;

export const serviceActiveSchema = z.strictObject({ serviceId: idSchema, active: z.boolean() });
export type ServiceActive = z.output<typeof serviceActiveSchema>;

export const faresSaveSchema = z
  .strictObject({
    serviceId: idSchema,
    fares: z.array(z.strictObject({ fromStopId: idSchema, toStopId: idSchema, price: moneySchema })).max(2000),
  })
  .superRefine((v, ctx) => {
    const seen = new Set<string>();
    v.fares.forEach((f, i) => {
      if (f.fromStopId === f.toStopId) ctx.addIssue({ code: 'custom', path: ['fares', i, 'toStopId'], message: 'same_stop' });
      const k = `${f.fromStopId}>${f.toStopId}`;
      if (seen.has(k)) ctx.addIssue({ code: 'custom', path: ['fares', i], message: 'duplicate_pair' });
      seen.add(k);
    });
  });
export type FaresSave = z.output<typeof faresSaveSchema>;
