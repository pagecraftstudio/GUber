import { PERMISSIONS } from '@/lib/auth/permission-keys';
import { parseInput } from '@/lib/errors';
import { requirePermission } from '@/lib/service/authorize';
import type { TenantServiceContext } from '@/lib/service/context';
import { subscriptionReportRepository, type SubscriptionReportRepository } from './repository';
import { rangeSchema } from './schema';
import type { SubscriptionReport } from './types';

/** authorize (analytics.read) -> validate -> repository. */
export function makeSubscriptionReportService(repo: SubscriptionReportRepository) {
  return {
    async report(ctx: TenantServiceContext, input: unknown): Promise<SubscriptionReport> {
      requirePermission(ctx, PERMISSIONS.analyticsRead);
      return repo.report(ctx, parseInput(rangeSchema, input));
    },
  };
}
export const subscriptionReportService = makeSubscriptionReportService(subscriptionReportRepository);
