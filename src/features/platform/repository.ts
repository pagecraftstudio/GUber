import { mapDbError } from '@/lib/db/map-error';
import { AppError } from '@/lib/errors';
import type { PlatformServiceContext } from '@/lib/service/context';
import { overviewRawSchema, toPlatformOverview, type PlatformOverview } from './schema';

export type PlatformOverviewRepository = {
  overview(ctx: PlatformServiceContext): Promise<PlatformOverview>;
};

export const platformOverviewRepository: PlatformOverviewRepository = {
  // The RPC takes no arguments: role comes from auth.uid() inside Postgres, never from the caller.
  async overview(ctx) {
    const res = await ctx.db.rpc('admin_platform_overview');
    if (res.error) throw mapDbError(res.error);
    const parsed = overviewRawSchema.safeParse(res.data);
    if (!parsed.success) throw new AppError('internal', { cause: parsed.error });
    return toPlatformOverview(parsed.data);
  },
};
