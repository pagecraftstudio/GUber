import { z } from 'zod';
import { pageQuerySchema } from '@/lib/db/pagination';
import { optionalText, text } from '@/lib/validation/common';

// Phase 7.4 inputs for the admin_*subscription* RPCs (migration 0018). No role, actor or company authority is ever an
// input; ids are targets that Postgres authorises. The DB repeats every rule here.

/** live = live status and period not ended; stale = live status but period ended; expiring = live and ends within 14 days. */
export const SUBSCRIPTION_STATES = ['live', 'stale', 'expiring', 'trialing', 'active', 'past_due', 'cancelled', 'expired'] as const;

export const subscriptionListSchema = pageQuerySchema.extend({
  q: z.string().max(200).optional(),
  state: z.enum(SUBSCRIPTION_STATES).optional(),
  sort: z.enum(['period_end', 'created_at']).default('period_end'),
  dir: z.enum(['asc', 'desc']).default('asc'),
});
export type SubscriptionListQuery = z.output<typeof subscriptionListSchema>;

const days = z.coerce.number().int().min(1).max(1830);

export const assignSubscriptionSchema = z.strictObject({
  planCode: text(1, 64),
  billingInterval: z.enum(['monthly', 'yearly']),
  status: z.enum(['trialing', 'active']),
  periodDays: days,
});
export type AssignSubscriptionInput = z.output<typeof assignSubscriptionSchema>;

export const SUBSCRIPTION_REASON_STATUSES: readonly string[] = ['cancelled', 'expired'];

export const setSubscriptionStatusSchema = z
  .strictObject({
    status: z.enum(['active', 'past_due', 'cancelled', 'expired']),
    reason: optionalText(500),
  })
  .refine((v) => !SUBSCRIPTION_REASON_STATUSES.includes(v.status) || (v.reason != null && v.reason.length >= 3), {
    path: ['reason'],
    message: 'reason_required',
  });
export type SetSubscriptionStatusInput = z.output<typeof setSubscriptionStatusSchema>;

export const setSubscriptionPeriodSchema = z.strictObject({
  days,
  from: z.enum(['now', 'current_end']).default('now'),
});
export type SetSubscriptionPeriodInput = z.output<typeof setSubscriptionPeriodSchema>;
