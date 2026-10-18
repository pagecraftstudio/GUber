import { requirePlatformAccess } from '@/lib/service/authorize';
import type { PlatformServiceContext } from '@/lib/service/context';
import { platformOverviewRepository, type PlatformOverviewRepository } from './repository';
import type { PlatformOverview } from './schema';

export function makePlatformOverviewService(repo: PlatformOverviewRepository) {
  return {
    /** Read-only. Every platform role may view; Postgres re-checks with assert_platform(). */
    async getOverview(ctx: PlatformServiceContext): Promise<PlatformOverview> {
      requirePlatformAccess(ctx);
      return repo.overview(ctx);
    },
  };
}
export type PlatformOverviewService = ReturnType<typeof makePlatformOverviewService>;
export const platformOverviewService = makePlatformOverviewService(platformOverviewRepository);
