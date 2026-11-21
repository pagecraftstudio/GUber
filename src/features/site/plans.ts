import { z } from 'zod';

/**
 * A public subscription plan as the website shows it. Allow-list of the columns public_route_plans (0034) returns: a column added to the
 * RPC later is not shown until it is added here on purpose. Plain module (no server-only): the dashboard canvas draws it in the browser.
 */
export const sitePlanRowSchema = z.object({
  plan_id: z.uuid(), company_id: z.uuid(), route_id: z.uuid(), origin_name: z.string(), destination_name: z.string(), name: z.string(),
  price: z.union([z.number(), z.string().regex(/^\d+(\.\d+)?$/)]), currency: z.string(),
  validity_type: z.enum(['duration', 'range']), duration_months: z.number().int().nullable(), starts_on: z.string().nullable(), ends_on: z.string().nullable(),
});
export type SitePlan = z.infer<typeof sitePlanRowSchema>;

export const needsPlans = (sections: { type: string }[][]): boolean => sections.some((p) => p.some((s) => s.type === 'subscriptions'));

/** Where a visitor goes to request a plan: the platform's own member page (it asks them to sign in first and brings them back). */
export const planRequestPath = (planId: string): string => `/my-subscriptions/plans?plan=${encodeURIComponent(planId)}`;

/** Where a visitor goes to book a trip: the platform's own booking page (it asks them to sign in first and brings them back). */
export const tripBookPath = (tripId: string): string => `/my-bookings/book/${encodeURIComponent(tripId)}`;
