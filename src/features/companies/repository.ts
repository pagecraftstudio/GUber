import { mapColumns } from '@/lib/db/columns';
import { mapDbError } from '@/lib/db/map-error';
import { rangeFor, type Page } from '@/lib/db/pagination';
import { expectFound, expectMaybe, expectPage } from '@/lib/db/query';
import { ilikeAny } from '@/lib/db/search';
import { AppError } from '@/lib/errors';
import type { PlatformServiceContext, TenantServiceContext } from '@/lib/service/context';
import { createInviteResultSchema } from '@/features/users/schema';
import {
  adminCompanyDetailRawSchema,
  adminCompanyListRawSchema,
  createCompanyRawSchema,
  toAdminCompanyDetail,
  toAdminCompanyPage,
  toCreatedCompany,
  type AdminCompanyDetail,
  type AdminCompanyListItem,
  type CreatedCompany,
} from './admin-output';
import type {
  CompanySettingsUpdate,
  CreateCompanyInput,
  PlatformCompanyListQuery,
  SetCompanyStatusInput,
  UpdateCompanyInput,
} from './schema';
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
  // Phase 7.3: every one of these is a SECURITY DEFINER RPC (migration 0017). There is no direct table write.
  adminList(ctx: PlatformServiceContext, q: PlatformCompanyListQuery): Promise<Page<AdminCompanyListItem>>;
  adminDetail(ctx: PlatformServiceContext, id: string): Promise<AdminCompanyDetail>;
  adminCreate(ctx: PlatformServiceContext, input: CreateCompanyInput): Promise<CreatedCompany>;
  adminUpdate(ctx: PlatformServiceContext, id: string, patch: UpdateCompanyInput): Promise<{ changed: boolean }>;
  adminSetStatus(ctx: PlatformServiceContext, id: string, input: SetCompanyStatusInput): Promise<{ previousStatus: string; status: string }>;
  adminAddNote(ctx: PlatformServiceContext, id: string, body: string): Promise<void>;
  /** Re-issues an OWNER invite through the existing create_invite() RPC (already audited). Token is returned once. */
  adminInviteOwner(ctx: PlatformServiceContext, id: string, email: string): Promise<{ inviteId: string; token: string; expiresAt: string }>;
  adminRevokeInvite(ctx: PlatformServiceContext, inviteId: string): Promise<void>;
};

/** camelCase patch key -> key inside admin_update_company()'s jsonb patch. Anything else never reaches the RPC. */
const COMPANY_PATCH_KEYS = {
  name: 'name',
  legalName: 'legal_name',
  taxNumber: 'tax_number',
  contactName: 'contact_name',
  contactEmail: 'contact_email',
  contactPhone: 'contact_phone',
  country: 'country',
} as const;

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
  async adminList(ctx, q) {
    const res = await ctx.db.rpc('admin_list_companies', {
      p_q: q.q ?? null,
      p_status: q.status ?? null,
      p_sort: q.sort,
      p_dir: q.dir,
      p_page: q.page,
      p_page_size: q.pageSize,
    });
    if (res.error) throw mapDbError(res.error);
    const parsed = adminCompanyListRawSchema.safeParse(res.data);
    if (!parsed.success) throw new AppError('internal', { cause: parsed.error });
    return toAdminCompanyPage(parsed.data, q);
  },

  async adminDetail(ctx, id) {
    const res = await ctx.db.rpc('admin_company_detail', { p_company: id });
    if (res.error) throw mapDbError(res.error); // P0002 -> not_found, 42501 -> forbidden
    const parsed = adminCompanyDetailRawSchema.safeParse(res.data);
    if (!parsed.success) throw new AppError('internal', { cause: parsed.error });
    return toAdminCompanyDetail(parsed.data);
  },

  async adminCreate(ctx, input) {
    const res = await ctx.db.rpc('admin_create_company', {
      p_name: input.name,
      p_slug: input.slug,
      p_contact_name: input.contactName ?? null,
      p_contact_email: input.contactEmail ?? null,
      p_contact_phone: input.contactPhone ?? null,
      p_legal_name: input.legalName ?? null,
      p_country: input.country ?? null,
      p_plan_code: input.planCode,
      p_trial_days: input.trialDays ?? null,
      p_owner_email: input.ownerEmail,
    });
    if (res.error) throw mapDbError(res.error);
    const parsed = createCompanyRawSchema.safeParse(res.data);
    if (!parsed.success) throw new AppError('internal'); // never attach the payload: it holds the invite token
    return toCreatedCompany(parsed.data);
  },

  async adminUpdate(ctx, id, patch) {
    const res = await ctx.db.rpc('admin_update_company', { p_company: id, p_patch: mapColumns(patch, COMPANY_PATCH_KEYS) });
    if (res.error) throw mapDbError(res.error);
    const changed = (res.data as { changed?: unknown } | null)?.changed;
    if (typeof changed !== 'boolean') throw new AppError('internal');
    return { changed };
  },

  async adminSetStatus(ctx, id, input) {
    const res = await ctx.db.rpc('admin_set_company_status', {
      p_company: id,
      p_status: input.status,
      p_reason: input.reason ?? null,
    });
    if (res.error) throw mapDbError(res.error);
    const d = res.data as { status?: unknown; previous_status?: unknown } | null;
    if (typeof d?.status !== 'string' || typeof d.previous_status !== 'string') throw new AppError('internal');
    return { status: d.status, previousStatus: d.previous_status };
  },

  async adminAddNote(ctx, id, body) {
    const res = await ctx.db.rpc('admin_add_note', { p_company: id, p_body: body });
    if (res.error) throw mapDbError(res.error);
  },

  async adminInviteOwner(ctx, id, email) {
    const res = await ctx.db.rpc('create_invite', { p_email: email, p_role_key: 'owner', p_company_id: id });
    if (res.error) throw mapDbError(res.error);
    const parsed = createInviteResultSchema.safeParse(res.data);
    if (!parsed.success) throw new AppError('internal');
    const row = parsed.data[0]!;
    return { inviteId: row.invite_id, token: row.token, expiresAt: row.expires_at };
  },

  async adminRevokeInvite(ctx, inviteId) {
    const res = await ctx.db.rpc('revoke_invite', { p_invite_id: inviteId });
    if (res.error) throw mapDbError(res.error);
  },
};
