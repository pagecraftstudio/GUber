import { AppError, parseInput } from '@/lib/errors';
import { PERMISSIONS } from '@/lib/auth/permission-keys';
import type { Page } from '@/lib/db/pagination';
import { requirePermission, requirePlatformAccess } from '@/lib/service/authorize';
import type { PlatformServiceContext, TenantServiceContext } from '@/lib/service/context';
import { idSchema } from '@/lib/validation/common';
import { companyRepository, type CompanyRepository } from './repository';
import { companySettingsUpdateSchema, platformCompanyListSchema } from './schema';
import type { CompanyProfile, CompanySettings, PlatformCompany } from './types';

/**
 * Tenant side: read own profile, read/update operational settings.
 * Platform side: READ ONLY. Creating, editing and suspending companies must be audited and atomic (company +
 * subscription + domain + owner invite), and `audit_logs` is server-written only, so they become RPCs in Phase 10.
 * A tenant cannot edit its own legal/contact profile yet either: `companies` has no tenant write policy (needs an RPC).
 */
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
  };
}
export type CompanyService = ReturnType<typeof makeCompanyService>;
export const companyService = makeCompanyService(companyRepository);
