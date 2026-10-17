import { z } from 'zod';
import { pageQuerySchema } from '@/lib/db/pagination';
import { atLeastOneField } from '@/lib/validation/common';

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
