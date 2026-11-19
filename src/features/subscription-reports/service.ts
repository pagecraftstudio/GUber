import { PERMISSIONS } from '@/lib/auth/permission-keys';
import { parseInput } from '@/lib/errors';
import { requirePermission } from '@/lib/service/authorize';
import type { TenantServiceContext } from '@/lib/service/context';
import { subscriptionReportRepository, type SubscriptionReportRepository } from './repository';
import { rangeSchema } from './schema';
import type { SubscriptionReport } from './types';

const DAY = 86_400_000;
/** The company-local calendar day (YYYY-MM-DD) for an instant. */
export const localDay = (at: Date, timeZone: string) => new Intl.DateTimeFormat('en-CA', { timeZone }).format(at);
/** Last 30 days ending today on the company's clock. */
export const defaultRange = (timeZone: string, now = new Date()) => ({ from: localDay(new Date(now.getTime() - 29 * DAY), timeZone), to: localDay(now, timeZone) });

/** authorize (analytics.read) -> validate -> repository. No input = the default range on the company's clock. */
export function makeSubscriptionReportService(repo: SubscriptionReportRepository) {
  return {
    async report(ctx: TenantServiceContext, input?: unknown): Promise<SubscriptionReport> {
      requirePermission(ctx, PERMISSIONS.analyticsRead);
      const range = input === undefined ? undefined : parseInput(rangeSchema, input);
      const zone = await repo.timeZone(ctx);
      return repo.report(ctx, range ?? defaultRange(zone), zone);
    },
    /** For a page that must tell "no range chosen" from "bad range": validity of a typed range, no database call. */
    isValidRange: (input: unknown) => rangeSchema.safeParse(input).success,
  };
}
export const subscriptionReportService = makeSubscriptionReportService(subscriptionReportRepository);
