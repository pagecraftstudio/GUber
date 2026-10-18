import { z } from 'zod';
import { toPage, type Page, type PageParams } from '@/lib/db/pagination';

/** Shape returned by admin_list_subscriptions() (0018). Parsed at the trust boundary so drift fails closed in one place. */
const count = z.number().int().nonnegative();

export const adminSubscriptionListRawSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      company_id: z.string(),
      company_name: z.string(),
      company_slug: z.string(),
      company_status: z.enum(['trial', 'active', 'suspended', 'cancelled']),
      plan_code: z.string(),
      plan_name: z.string(),
      status: z.enum(['trialing', 'active', 'past_due', 'cancelled', 'expired']),
      state: z.enum(['live', 'stale', 'cancelled', 'expired']),
      billing_interval: z.enum(['monthly', 'yearly']),
      current_period_start: z.string(),
      current_period_end: z.string(),
      cancel_at_period_end: z.boolean(),
      created_at: z.string(),
    }),
  ),
  total: count,
  page: count,
  page_size: count,
});
export type AdminSubscriptionListRaw = z.output<typeof adminSubscriptionListRawSchema>;

export type AdminSubscriptionItem = {
  id: string;
  companyId: string;
  companyName: string;
  companySlug: string;
  companyStatus: 'trial' | 'active' | 'suspended' | 'cancelled';
  planCode: string;
  planName: string;
  status: 'trialing' | 'active' | 'past_due' | 'cancelled' | 'expired';
  /** live | stale (live status, period ended) | cancelled | expired */
  state: 'live' | 'stale' | 'cancelled' | 'expired';
  billingInterval: 'monthly' | 'yearly';
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
};

export const toAdminSubscriptionPage = (raw: AdminSubscriptionListRaw, params: PageParams): Page<AdminSubscriptionItem> =>
  toPage(
    raw.items.map((r) => ({
      id: r.id,
      companyId: r.company_id,
      companyName: r.company_name,
      companySlug: r.company_slug,
      companyStatus: r.company_status,
      planCode: r.plan_code,
      planName: r.plan_name,
      status: r.status,
      state: r.state,
      billingInterval: r.billing_interval,
      currentPeriodStart: r.current_period_start,
      currentPeriodEnd: r.current_period_end,
      cancelAtPeriodEnd: r.cancel_at_period_end,
      createdAt: r.created_at,
    })),
    raw.total,
    params,
  );
