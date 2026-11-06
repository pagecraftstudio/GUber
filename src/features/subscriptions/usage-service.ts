import { mapDbError } from '@/lib/db/map-error';
import type { TenantServiceContext } from '@/lib/service/context';
import { allowanceFor, parsePlanUsage, type Allowance, type PlanUsage, type UsageKey } from './usage';

/**
 * Read-only plan usage for form messages. Any active member may read the numbers (no plan name or price: those stay
 * behind billing.read). The company is `ctx.companyId` (from the session) and Postgres re-checks membership.
 */
export function makePlanUsageService() {
  return {
    async get(ctx: TenantServiceContext): Promise<PlanUsage> {
      const { data, error } = await ctx.db.rpc('my_plan_usage', { p_company: ctx.companyId });
      if (error) throw mapDbError(error);
      const usage = parsePlanUsage(data);
      if (!usage) throw mapDbError({ message: 'malformed my_plan_usage result' });
      return usage;
    },
    /** For pages: a failure (or a malformed answer) means "unknown", never a made-up number. Enforcement is unaffected. */
    async getOrNull(ctx: TenantServiceContext): Promise<PlanUsage | null> {
      try {
        return await this.get(ctx);
      } catch {
        return null;
      }
    },
    async allowance(ctx: TenantServiceContext, key: UsageKey, month?: string): Promise<Allowance> {
      return allowanceFor(await this.getOrNull(ctx), key, month);
    },
  };
}
export type PlanUsageService = ReturnType<typeof makePlanUsageService>;
export const planUsageService = makePlanUsageService();
