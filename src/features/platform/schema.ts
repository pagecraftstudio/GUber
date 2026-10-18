import { z } from 'zod';

const count = z.number().int().nonnegative();

/**
 * Shape returned by public.admin_platform_overview() (migration 0016). Parsed at the trust boundary so a
 * migration/UI drift fails loudly in one place instead of rendering NaN. Audit metadata is never part of it.
 */
export const overviewRawSchema = z.object({
  generated_at: z.string(),
  companies: z.object({ total: count, trial: count, active: count, suspended: count, cancelled: count }),
  subscriptions: z.object({
    trialing: count,
    active: count,
    past_due: count,
    expiring_14d: count,
    stale_live: count,
    companies_without_live: count,
  }),
  usage: z.object({ trips_total: count, trips_30d: count, bookings_total: count, bookings_30d: count, customers_total: count }),
  recent_activity: z
    .array(
      z.object({
        id: z.string(),
        created_at: z.string(),
        action: z.string(),
        entity_type: z.string(),
        actor_type: z.string(),
        company_id: z.string().nullable(),
        company_name: z.string().nullable(),
      }),
    )
    .max(10),
});
export type OverviewRaw = z.output<typeof overviewRawSchema>;

export type ActivityItem = {
  id: string;
  createdAt: string;
  action: string;
  entityType: string;
  actorType: string;
  companyId: string | null;
  companyName: string | null;
};

export type PlatformOverview = {
  generatedAt: string;
  companies: OverviewRaw['companies'];
  subscriptions: {
    trialing: number;
    active: number;
    pastDue: number;
    expiring14d: number;
    /** Status still says live but the period ended: entitlement checks already treat it as expired. */
    staleLive: number;
    /** Trial/active companies with no live subscription (new trips/buses/bookings are blocked for them). */
    companiesWithoutLive: number;
  };
  usage: { tripsTotal: number; trips30d: number; bookingsTotal: number; bookings30d: number; customersTotal: number };
  recentActivity: ActivityItem[];
};

export const toPlatformOverview = (r: OverviewRaw): PlatformOverview => ({
  generatedAt: r.generated_at,
  companies: r.companies,
  subscriptions: {
    trialing: r.subscriptions.trialing,
    active: r.subscriptions.active,
    pastDue: r.subscriptions.past_due,
    expiring14d: r.subscriptions.expiring_14d,
    staleLive: r.subscriptions.stale_live,
    companiesWithoutLive: r.subscriptions.companies_without_live,
  },
  usage: {
    tripsTotal: r.usage.trips_total,
    trips30d: r.usage.trips_30d,
    bookingsTotal: r.usage.bookings_total,
    bookings30d: r.usage.bookings_30d,
    customersTotal: r.usage.customers_total,
  },
  recentActivity: r.recent_activity.map((a) => ({
    id: a.id,
    createdAt: a.created_at,
    action: a.action,
    entityType: a.entity_type,
    actorType: a.actor_type,
    companyId: a.company_id,
    companyName: a.company_name,
  })),
});
