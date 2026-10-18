import { z } from 'zod';
import { toPage, type Page, type PageParams } from '@/lib/db/pagination';

/**
 * Shapes returned by admin_list_companies() and admin_company_detail() (migration 0017). Parsed at the trust
 * boundary, so a migration/UI drift fails closed in ONE place. Nothing here carries an invite token or token hash.
 */
const status = z.enum(['trial', 'active', 'suspended', 'cancelled']);
const count = z.number().int().nonnegative();
const nullableText = z.string().nullable();

export const adminCompanyListRawSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      slug: z.string(),
      status,
      contact_name: nullableText,
      contact_email: nullableText,
      created_at: z.string(),
      plan_code: nullableText,
      plan_name: nullableText,
      subscription_status: nullableText,
      period_end: nullableText,
    }),
  ),
  total: count,
  page: count,
  page_size: count,
});
export type AdminCompanyListRaw = z.output<typeof adminCompanyListRawSchema>;

export type AdminCompanyListItem = {
  id: string;
  name: string;
  slug: string;
  status: z.output<typeof status>;
  contactName: string | null;
  contactEmail: string | null;
  createdAt: string;
  planCode: string | null;
  planName: string | null;
  /** Status of the LIVE subscription only. null = no live subscription (none, or the period ended). */
  subscriptionStatus: string | null;
  periodEnd: string | null;
};

export const toAdminCompanyPage = (raw: AdminCompanyListRaw, params: PageParams): Page<AdminCompanyListItem> =>
  toPage(
    raw.items.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      status: r.status,
      contactName: r.contact_name,
      contactEmail: r.contact_email,
      createdAt: r.created_at,
      planCode: r.plan_code,
      planName: r.plan_name,
      subscriptionStatus: r.subscription_status,
      periodEnd: r.period_end,
    })),
    raw.total,
    params,
  );

export const adminCompanyDetailRawSchema = z.object({
  company: z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    status,
    legal_name: nullableText,
    tax_number: nullableText,
    contact_name: nullableText,
    contact_email: nullableText,
    contact_phone: nullableText,
    country: nullableText,
    suspended_at: nullableText,
    suspension_reason: nullableText,
    created_at: z.string(),
    updated_at: z.string(),
  }),
  settings: z
    .object({ timezone: z.string(), currency: z.string(), default_locale: z.string(), booking_enabled: z.boolean() })
    .nullable(),
  subscription: z
    .object({
      id: z.string(),
      plan_code: z.string(),
      plan_name: z.string(),
      status: z.string(),
      billing_interval: z.string(),
      current_period_start: z.string(),
      current_period_end: z.string(),
      cancel_at_period_end: z.boolean(),
      is_live: z.boolean(),
    })
    .nullable(),
  counts: z.object({ users: count, buses: count, drivers: count, routes: count, trips: count, bookings: count }),
  owners: z.array(z.object({ user_id: z.string(), full_name: z.string(), email: z.string(), status: z.string() })),
  pending_invites: z.array(
    z.object({ id: z.string(), email: z.string(), role_key: z.string(), expires_at: z.string(), created_at: z.string() }),
  ),
  notes: z.array(z.object({ id: z.string(), body: z.string(), created_at: z.string(), author_name: nullableText })).max(50),
  resume_status: z.enum(['trial', 'active']),
});
export type AdminCompanyDetailRaw = z.output<typeof adminCompanyDetailRawSchema>;

export type AdminCompanyDetail = {
  company: {
    id: string;
    name: string;
    slug: string;
    status: z.output<typeof status>;
    legalName: string | null;
    taxNumber: string | null;
    contactName: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    country: string | null;
    suspendedAt: string | null;
    suspensionReason: string | null;
    createdAt: string;
    updatedAt: string;
  };
  settings: { timezone: string; currency: string; defaultLocale: string; bookingEnabled: boolean } | null;
  /** The live subscription, or the most recent one (isLive = false) so the page can say "expired". Read-only here (7.4). */
  subscription: {
    id: string;
    planCode: string;
    planName: string;
    status: string;
    billingInterval: string;
    currentPeriodStart: string;
    currentPeriodEnd: string;
    cancelAtPeriodEnd: boolean;
    isLive: boolean;
  } | null;
  counts: AdminCompanyDetailRaw['counts'];
  owners: { userId: string; fullName: string; email: string; status: string }[];
  pendingInvites: { id: string; email: string; roleKey: string; expiresAt: string; createdAt: string }[];
  notes: { id: string; body: string; createdAt: string; authorName: string | null }[];
  /** Where "Reactivate" goes by default: the status the company had when it was last suspended. */
  resumeStatus: 'trial' | 'active';
};

export const toAdminCompanyDetail = (r: AdminCompanyDetailRaw): AdminCompanyDetail => ({
  company: {
    id: r.company.id,
    name: r.company.name,
    slug: r.company.slug,
    status: r.company.status,
    legalName: r.company.legal_name,
    taxNumber: r.company.tax_number,
    contactName: r.company.contact_name,
    contactEmail: r.company.contact_email,
    contactPhone: r.company.contact_phone,
    country: r.company.country,
    suspendedAt: r.company.suspended_at,
    suspensionReason: r.company.suspension_reason,
    createdAt: r.company.created_at,
    updatedAt: r.company.updated_at,
  },
  settings: r.settings
    ? {
        timezone: r.settings.timezone,
        currency: r.settings.currency,
        defaultLocale: r.settings.default_locale,
        bookingEnabled: r.settings.booking_enabled,
      }
    : null,
  subscription: r.subscription
    ? {
        id: r.subscription.id,
        planCode: r.subscription.plan_code,
        planName: r.subscription.plan_name,
        status: r.subscription.status,
        billingInterval: r.subscription.billing_interval,
        currentPeriodStart: r.subscription.current_period_start,
        currentPeriodEnd: r.subscription.current_period_end,
        cancelAtPeriodEnd: r.subscription.cancel_at_period_end,
        isLive: r.subscription.is_live,
      }
    : null,
  counts: r.counts,
  owners: r.owners.map((o) => ({ userId: o.user_id, fullName: o.full_name, email: o.email, status: o.status })),
  pendingInvites: r.pending_invites.map((i) => ({
    id: i.id,
    email: i.email,
    roleKey: i.role_key,
    expiresAt: i.expires_at,
    createdAt: i.created_at,
  })),
  notes: r.notes.map((n) => ({ id: n.id, body: n.body, createdAt: n.created_at, authorName: n.author_name })),
  resumeStatus: r.resume_status,
});

/** Result of admin_create_company(). `token` is shown once and must never be stored or logged. */
export const createCompanyRawSchema = z.object({
  company_id: z.guid(),
  invite_id: z.guid(),
  token: z.string().min(20),
  expires_at: z.string(),
});
export type CreatedCompany = { companyId: string; inviteId: string; token: string; expiresAt: string };
export const toCreatedCompany = (r: z.output<typeof createCompanyRawSchema>): CreatedCompany => ({
  companyId: r.company_id,
  inviteId: r.invite_id,
  token: r.token,
  expiresAt: r.expires_at,
});
