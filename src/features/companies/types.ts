export type CompanyStatus = 'trial' | 'active' | 'suspended' | 'cancelled';

/** Tenant-safe profile (from the `my_company` view): no suspension reason, no internal fields. */
export type CompanyProfileRow = {
  id: string;
  name: string;
  slug: string;
  status: CompanyStatus;
  legal_name: string | null;
  tax_number: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  country: string | null;
  created_at: string;
};
export type CompanyProfile = {
  id: string;
  name: string;
  slug: string;
  status: CompanyStatus;
  legalName: string | null;
  taxNumber: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  country: string | null;
  createdAt: string;
};
export const PROFILE_SELECT = 'id,name,slug,status,legal_name,tax_number,contact_email,contact_phone,country,created_at';
export const toCompanyProfile = (r: CompanyProfileRow): CompanyProfile => ({
  id: r.id,
  name: r.name,
  slug: r.slug,
  status: r.status,
  legalName: r.legal_name,
  taxNumber: r.tax_number,
  contactEmail: r.contact_email,
  contactPhone: r.contact_phone,
  country: r.country,
  createdAt: r.created_at,
});

/** Platform view of a company (includes internal suspension data). Never returned to tenant users. */
export type PlatformCompanyRow = CompanyProfileRow & {
  suspended_at: string | null;
  suspension_reason: string | null;
  updated_at: string;
  deleted_at: string | null;
};
export type PlatformCompany = CompanyProfile & {
  suspendedAt: string | null;
  suspensionReason: string | null;
  updatedAt: string;
  deletedAt: string | null;
};
export const PLATFORM_COMPANY_SELECT = `${PROFILE_SELECT},suspended_at,suspension_reason,updated_at,deleted_at`;
export const toPlatformCompany = (r: PlatformCompanyRow): PlatformCompany => ({
  ...toCompanyProfile(r),
  suspendedAt: r.suspended_at,
  suspensionReason: r.suspension_reason,
  updatedAt: r.updated_at,
  deletedAt: r.deleted_at,
});

export type CompanySettingsRow = {
  timezone: string;
  currency: string;
  default_locale: 'ar' | 'en';
  supported_locales: ('ar' | 'en')[];
  booking_enabled: boolean;
  allow_guest_booking: boolean;
  booking_cutoff_minutes: number;
  cancellation_window_hours: number;
  max_seats_per_booking: number;
  trip_buffer_minutes: number;
  updated_at: string;
};
export type CompanySettings = {
  timezone: string;
  currency: string;
  defaultLocale: 'ar' | 'en';
  supportedLocales: ('ar' | 'en')[];
  bookingEnabled: boolean;
  allowGuestBooking: boolean;
  bookingCutoffMinutes: number;
  cancellationWindowHours: number;
  maxSeatsPerBooking: number;
  /** Applied to NEW trips only (snapshotted into trips.buffer_minutes). */
  tripBufferMinutes: number;
  updatedAt: string;
};
export const SETTINGS_SELECT =
  'timezone,currency,default_locale,supported_locales,booking_enabled,allow_guest_booking,booking_cutoff_minutes,cancellation_window_hours,max_seats_per_booking,trip_buffer_minutes,updated_at';
export const toCompanySettings = (r: CompanySettingsRow): CompanySettings => ({
  timezone: r.timezone,
  currency: r.currency,
  defaultLocale: r.default_locale,
  supportedLocales: r.supported_locales,
  bookingEnabled: r.booking_enabled,
  allowGuestBooking: r.allow_guest_booking,
  bookingCutoffMinutes: r.booking_cutoff_minutes,
  cancellationWindowHours: r.cancellation_window_hours,
  maxSeatsPerBooking: r.max_seats_per_booking,
  tripBufferMinutes: r.trip_buffer_minutes,
  updatedAt: r.updated_at,
});
