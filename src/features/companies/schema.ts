import { z } from 'zod';
import { pageQuerySchema } from '@/lib/db/pagination';
import { atLeastOneField, emailSchema, optionalEmail, optionalText, phoneSchema, text } from '@/lib/validation/common';

const locale = z.enum(['ar', 'en']);

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Company settings patch. company_id is never an input. Cross-field rule (default locale must be supported) is
 * checked here when both are present, and always by the DB check constraint `company_settings_locales_valid`.
 */
export const companySettingsUpdateSchema = atLeastOneField(
  z.strictObject({
    timezone: z.string().min(1).max(64).refine(isValidTimeZone, 'invalid_timezone').optional(),
    currency: z.string().regex(/^[A-Z]{3}$/, 'invalid_currency').optional(),
    defaultLocale: locale.optional(),
    supportedLocales: z.array(locale).min(1).max(2).refine((v) => new Set(v).size === v.length, 'duplicate_locale').optional(),
    bookingEnabled: z.boolean().optional(),
    allowGuestBooking: z.boolean().optional(),
    bookingCutoffMinutes: z.number().int().min(0).max(525_600).optional(),
    cancellationWindowHours: z.number().int().min(0).max(8_760).optional(),
    maxSeatsPerBooking: z.number().int().min(1).max(50).optional(),
    tripBufferMinutes: z.number().int().min(0).max(600).optional(),
  }),
).refine((v) => !v.defaultLocale || !v.supportedLocales || v.supportedLocales.includes(v.defaultLocale), {
  path: ['defaultLocale'],
  message: 'locale_not_supported',
});
export type CompanySettingsUpdate = z.output<typeof companySettingsUpdateSchema>;

export const platformCompanyListSchema = pageQuerySchema.extend({
  q: z.string().max(200).optional(),
  status: z.enum(['trial', 'active', 'suspended', 'cancelled']).optional(),
  sort: z.enum(['name', 'created_at']).default('created_at'),
  dir: z.enum(['asc', 'desc']).default('desc'),
});
export type PlatformCompanyListQuery = z.output<typeof platformCompanyListSchema>;

// ======================= Phase 7.3: superadmin company management =======================
// Inputs for the admin_* RPCs (migration 0017). No role, actor or tenant flag is ever an input: Postgres derives
// them from auth.uid(). `companyId` appears only as a TARGET, validated as a uuid here and authorised in the RPC.
// The DB repeats every rule below, so a caller that skips this layer still cannot store bad data.

const RESERVED_SLUGS = ['www', 'admin', 'api', 'app', 'mail', 'support', 'static', 'assets', 'cdn', 'dashboard', 'platform', 'status', 'blog', 'docs'];

/** Same pattern as companies_slug_format (0002). Lower-cased first, so "Acme-Bus" is accepted as "acme-bus". */
export const companySlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/, 'invalid_slug')
  .refine((v) => !RESERVED_SLUGS.includes(v), 'reserved_slug');

/** HTML forms send '' for an empty field: that means "no value". */
const blankToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);

const optionalPhone = z.preprocess(blankToNull, phoneSchema.nullable().optional());

const countrySchema = z
  .string()
  .trim()
  .transform((v) => v.toUpperCase())
  .pipe(z.string().regex(/^[A-Z]{2}$/, 'invalid_country'));
const optionalCountry = z.preprocess(blankToNull, countrySchema.nullable().optional());

export const createCompanySchema = z.strictObject({
  name: text(1, 120),
  slug: companySlugSchema,
  contactName: optionalText(120),
  contactEmail: optionalEmail,
  contactPhone: optionalPhone,
  legalName: optionalText(200),
  country: optionalCountry,
  planCode: text(1, 64),
  /** Blank = the plan's own trial length. */
  trialDays: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.coerce.number().int().min(1).max(365).optional(),
  ),
  ownerEmail: emailSchema,
});
export type CreateCompanyInput = z.output<typeof createCompanySchema>;

/** PATCH semantics: a key that is present changes (null/'' clears a nullable field); an absent key is untouched. */
export const updateCompanySchema = atLeastOneField(
  z.strictObject({
    name: text(1, 120).optional(),
    legalName: optionalText(200),
    taxNumber: optionalText(50),
    contactName: optionalText(120),
    contactEmail: optionalEmail,
    contactPhone: optionalPhone,
    country: optionalCountry,
  }),
);
export type UpdateCompanyInput = z.output<typeof updateCompanySchema>;

export const COMPANY_STATUSES = ['trial', 'active', 'suspended', 'cancelled'] as const;
/** Statuses that need a written reason (the RPC enforces the same 3..500 rule). */
export const REASON_REQUIRED_STATUSES: readonly string[] = ['suspended', 'cancelled'];

export const setCompanyStatusSchema = z
  .strictObject({
    status: z.enum(COMPANY_STATUSES),
    reason: optionalText(500),
  })
  .refine((v) => !REASON_REQUIRED_STATUSES.includes(v.status) || (v.reason != null && v.reason.length >= 3), {
    path: ['reason'],
    message: 'reason_required',
  });
export type SetCompanyStatusInput = z.output<typeof setCompanyStatusSchema>;

export const addCompanyNoteSchema = z.strictObject({ body: text(1, 2000) });
export type AddCompanyNoteInput = z.output<typeof addCompanyNoteSchema>;

/** Owner (re)invite. The role is fixed to 'owner' in the service, never taken from input. */
export const inviteOwnerSchema = z.strictObject({ email: emailSchema });
export type InviteOwnerInput = z.output<typeof inviteOwnerSchema>;
