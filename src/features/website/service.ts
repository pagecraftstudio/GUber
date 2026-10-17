import { parseInput } from '@/lib/errors';
import { PERMISSIONS } from '@/lib/auth/permission-keys';
import { requirePermission } from '@/lib/service/authorize';
import type { TenantServiceContext } from '@/lib/service/context';
import { websiteRepository, type WebsiteRepository } from './repository';
import { websiteSettingsUpdateSchema } from './schema';
import { DEFAULT_WEBSITE_SETTINGS, type WebsiteSettings } from './types';

/** Draft website settings only. Sections/pages are Phase 6-7; publishing (immutable snapshot) is Phase 7. */
export function makeWebsiteService(repo: WebsiteRepository) {
  return {
    async getSettings(ctx: TenantServiceContext): Promise<WebsiteSettings> {
      requirePermission(ctx, PERMISSIONS.websiteRead);
      return (await repo.get(ctx)) ?? DEFAULT_WEBSITE_SETTINGS;
    },
    async updateSettings(ctx: TenantServiceContext, input: unknown): Promise<WebsiteSettings> {
      requirePermission(ctx, PERMISSIONS.websiteWrite);
      return repo.save(ctx, parseInput(websiteSettingsUpdateSchema, input));
    },
  };
}
export type WebsiteService = ReturnType<typeof makeWebsiteService>;
export const websiteService = makeWebsiteService(websiteRepository);
