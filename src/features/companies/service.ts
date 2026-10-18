import { AppError, parseInput } from '@/lib/errors';
import { PERMISSIONS } from '@/lib/auth/permission-keys';
import type { Page } from '@/lib/db/pagination';
import { requirePermission, requirePlatformAccess } from '@/lib/service/authorize';
import type { PlatformServiceContext, TenantServiceContext } from '@/lib/service/context';
import { idSchema } from '@/lib/validation/common';
import { companyRepository, type CompanyRepository } from './repository';
import type { AdminCompanyDetail, AdminCompanyListItem, CreatedCompany } from './admin-output';
import {
  addCompanyNoteSchema,
  companySettingsUpdateSchema,
  createCompanySchema,
  inviteOwnerSchema,
  platformCompanyListSchema,
  setCompanyStatusSchema,
  updateCompanySchema,
} from './schema';
import type { CompanyProfile, CompanySettings, PlatformCompany } from './types';

/**
 * Tenant side: read own profile, read/update operational settings.
 * Platform side (7.3): list/detail for every platform role; create, edit, status and owner invites for super_admin;
 * notes for super_admin and support. All writes are audited RPCs (0017) and Postgres re-checks the role itself.
 * The role sets below are PROVISIONAL until the 7.6 role matrix decision.
 * A tenant cannot edit its own legal/contact profile yet: `companies` has no tenant write policy (needs an RPC).
 */
const SUPER_ADMIN = ['super_admin'] as const;
const NOTE_WRITERS = ['super_admin', 'support'] as const;

export function makeCompanyService(repo: CompanyRepository) {
  return {
    /** Any active member may read their own company's basic profile. */
    async getProfile(ctx: TenantServiceContext): Promise<CompanyProfile> {
      const profile = await repo.profile(ctx);
      if (!profile) throw new AppError('not_found');
      return profile;
    },
    async getSettings(ctx: TenantServiceContext): Promise<CompanySettings> {
      requirePermission(ctx, PERMISSIONS.settingsRead);
      const settings = await repo.settings(ctx);
      if (!settings) throw new AppError('not_found');
      return settings;
    },
    async updateSettings(ctx: TenantServiceContext, input: unknown): Promise<CompanySettings> {
      requirePermission(ctx, PERMISSIONS.settingsWrite);
      return repo.updateSettings(ctx, parseInput(companySettingsUpdateSchema, input));
    },
    async platformList(ctx: PlatformServiceContext, rawQuery: unknown): Promise<Page<PlatformCompany>> {
      requirePlatformAccess(ctx);
      return repo.platformList(ctx, parseInput(platformCompanyListSchema, rawQuery ?? {}));
    },
    async platformGet(ctx: PlatformServiceContext, rawId: unknown): Promise<PlatformCompany> {
      requirePlatformAccess(ctx);
      const company = await repo.platformGet(ctx, parseInput(idSchema, rawId));
      if (!company) throw new AppError('not_found');
      return company;
    },

    // ---- Phase 7.3. Order everywhere: authorize -> validate -> repository ----
    async adminList(ctx: PlatformServiceContext, rawQuery: unknown): Promise<Page<AdminCompanyListItem>> {
      requirePlatformAccess(ctx);
      return repo.adminList(ctx, parseInput(platformCompanyListSchema, rawQuery ?? {}));
    },
    async adminDetail(ctx: PlatformServiceContext, rawId: unknown): Promise<AdminCompanyDetail> {
      requirePlatformAccess(ctx);
      return repo.adminDetail(ctx, parseInput(idSchema, rawId));
    },
    /** Returns the raw owner invite token once. The caller builds the link and must not persist or log it. */
    async createCompany(ctx: PlatformServiceContext, input: unknown): Promise<CreatedCompany> {
      requirePlatformAccess(ctx, SUPER_ADMIN);
      return repo.adminCreate(ctx, parseInput(createCompanySchema, input));
    },
    async updateCompany(ctx: PlatformServiceContext, rawId: unknown, patch: unknown): Promise<{ changed: boolean }> {
      requirePlatformAccess(ctx, SUPER_ADMIN);
      return repo.adminUpdate(ctx, parseInput(idSchema, rawId), parseInput(updateCompanySchema, patch));
    },
    async setCompanyStatus(ctx: PlatformServiceContext, rawId: unknown, input: unknown) {
      requirePlatformAccess(ctx, SUPER_ADMIN);
      return repo.adminSetStatus(ctx, parseInput(idSchema, rawId), parseInput(setCompanyStatusSchema, input));
    },
    async addCompanyNote(ctx: PlatformServiceContext, rawId: unknown, input: unknown): Promise<void> {
      requirePlatformAccess(ctx, NOTE_WRITERS);
      const id = parseInput(idSchema, rawId);
      await repo.adminAddNote(ctx, id, parseInput(addCompanyNoteSchema, input).body);
    },
    /** Role is fixed to 'owner' here; no role key is accepted from the caller. */
    async inviteOwner(ctx: PlatformServiceContext, rawId: unknown, input: unknown) {
      requirePlatformAccess(ctx, SUPER_ADMIN);
      const id = parseInput(idSchema, rawId);
      return repo.adminInviteOwner(ctx, id, parseInput(inviteOwnerSchema, input).email);
    },
    async revokeInvite(ctx: PlatformServiceContext, rawInviteId: unknown): Promise<void> {
      requirePlatformAccess(ctx, SUPER_ADMIN);
      await repo.adminRevokeInvite(ctx, parseInput(idSchema, rawInviteId));
    },
  };
}
export type CompanyService = ReturnType<typeof makeCompanyService>;
export const companyService = makeCompanyService(companyRepository);
