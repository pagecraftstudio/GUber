import { z } from 'zod';
import { dateOnlySchema, idSchema, moneySchema, optionalText, text } from '@/lib/validation/common';

// No company_id anywhere: the company is derived by the database from the route / plan / request row.
export const planCreateSchema = z
  .strictObject({
    routeId: idSchema,
    name: text(2, 120),
    price: moneySchema,
    validityType: z.enum(['duration', 'range']),
    durationMonths: z.number().int().min(1).max(24).optional(),
    startsOn: dateOnlySchema.optional(),
    endsOn: dateOnlySchema.optional(),
  })
  .superRefine((v, ctx) => {
    // Mirrors route_plans_validity_shape (migration 0034).
    if (v.validityType === 'duration') {
      if (v.durationMonths === undefined) ctx.addIssue({ code: 'custom', path: ['durationMonths'], message: 'required' });
      if (v.startsOn !== undefined) ctx.addIssue({ code: 'custom', path: ['startsOn'], message: 'not_allowed' });
      if (v.endsOn !== undefined) ctx.addIssue({ code: 'custom', path: ['endsOn'], message: 'not_allowed' });
    } else {
      if (v.durationMonths !== undefined) ctx.addIssue({ code: 'custom', path: ['durationMonths'], message: 'not_allowed' });
      if (v.startsOn === undefined) ctx.addIssue({ code: 'custom', path: ['startsOn'], message: 'required' });
      if (v.endsOn === undefined) ctx.addIssue({ code: 'custom', path: ['endsOn'], message: 'required' });
      if (v.startsOn !== undefined && v.endsOn !== undefined && v.endsOn < v.startsOn) ctx.addIssue({ code: 'custom', path: ['endsOn'], message: 'before_start' });
    }
  });
export type PlanCreate = z.output<typeof planCreateSchema>;

/** Validity is fixed once a plan exists: members were approved against it. Only the name, the price and the on/off switch change. */
export const planUpdateSchema = z.strictObject({ name: text(2, 120), price: moneySchema, isActive: z.boolean() });
export type PlanUpdate = z.output<typeof planUpdateSchema>;

export const decisionSchema = z.strictObject({ approve: z.boolean(), note: optionalText(500) });
export type Decision = z.output<typeof decisionSchema>;

export const subscriptionListSchema = z.strictObject({ status: z.enum(['pending', 'active', 'rejected', 'cancelled', 'expired']).optional() });
export type SubscriptionListQuery = z.output<typeof subscriptionListSchema>;
