import { mapColumns } from '@/lib/db/columns';
import { rangeFor, type Page } from '@/lib/db/pagination';
import { expectFound, expectMaybe, expectPage } from '@/lib/db/query';
import { ilikeAny } from '@/lib/db/search';
import type { PlatformServiceContext, TenantServiceContext } from '@/lib/service/context';
import type { CompanySettingsUpdate, PlatformCompanyListQuery } from './schema';
import {
  PLATFORM_COMPANY_SELECT,
  PROFILE_SELECT,
  SETTINGS_SELECT,
  toCompanyProfile,
  toCompanySettings,
  toPlatformCompany,
  type CompanyProfile,
  type CompanyProfileRow,
  type CompanySettings,
  type CompanySettingsRow,
  type PlatformCompany,
  type PlatformCompanyRow,
} from './types';

export type CompanyRepository = {
  profile(ctx: TenantServiceContext): Promise<CompanyProfile | null>;
  settings(ctx: TenantServiceContext): Promise<CompanySettings | null>;
  updateSettings(ctx: TenantServiceContext, patch: CompanySettingsUpdate): Promise<CompanySettings>;
  platformList(ctx: PlatformServiceContext, q: PlatformCompanyListQuery): Promise<Page<PlatformCompany>>;
  platformGet(ctx: PlatformServiceContext, id: string): Promise<PlatformCompany | null>;
};

const SETTINGS_COLUMNS = {
  timezone: 'timezone',
  currency: 'currency',
  defaultLocale: 'default_locale',
  supportedLocales: 'supported_locales',
  bookingEnabled: 'booking_enabled',
  allowGuestBooking: 'allow_guest_booking',
  bookingCutoffMinutes: 'booking_cutoff_minutes',
  cancellationWindowHours: 'cancellation_window_hours',
  maxSeatsPerBooking: 'max_seats_per_booking',
  tripBufferMinutes: 'trip_buffer_minutes',
} as const;

export const companyRepository: CompanyRepository = {
  // Tenants have NO policy on `companies` (0006, D3). They read the `my_company` view instead.
  async profile(ctx) {
    return expectMaybe<CompanyProfileRow, CompanyProfile>(
      await ctx.db.from('my_company').select(PROFILE_SELECT).eq('id', ctx.companyId).maybeSingle(),
      toCompanyProfile,
    );
  },

  async settings(ctx) {
    return expectMaybe<CompanySettingsRow, CompanySettings>(
      await ctx.db.from('company_settings').select(SETTINGS_SELECT).eq('company_id', ctx.companyId).maybeSingle(),
      toCompanySettings,
    );
  },

  async updateSettings(ctx, patch) {
    return expectFound<CompanySettingsRow, CompanySettings>(
      await ctx.db
        .from('company_settings')
        .update(mapColumns(patch, SETTINGS_COLUMNS))
        .eq('company_id', ctx.companyId)
        .select(SETTINGS_SELECT)
        .maybeSingle(),
      toCompanySettings,
    );
  },

  async platformList(ctx, q) {
    let query = ctx.db.from('companies').select(PLATFORM_COMPANY_SELECT, { count: 'exact' }).is('deleted_at', null);
    if (q.status) query = query.eq('status', q.status);
    const search = ilikeAny(['name', 'slug'], q.q);
    if (search) query = query.or(search);
    const { from, to } = rangeFor(q);
    return expectPage<PlatformCompanyRow, PlatformCompany>(
      await query.order(q.sort, { ascending: q.dir === 'asc' }).order('id').range(from, to),
      toPlatformCompany,
      q,
    );
  },

  async platformGet(ctx, id) {
    return expectMaybe<PlatformCompanyRow, PlatformCompany>(
      await ctx.db.from('companies').select(PLATFORM_COMPANY_SELECT).eq('id', id).maybeSingle(),
      toPlatformCompany,
    );
  },
};
