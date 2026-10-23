import { ROLE_SETS } from '@/features/platform/permissions';
import { parseInput } from '@/lib/errors';
import { requirePlatformAccess } from '@/lib/service/authorize';
import type { PlatformServiceContext } from '@/lib/service/context';
import { idSchema } from '@/lib/validation/common';
import { auditRepository, type AuditRepository } from './repository';
import { auditListSchema, auditSummaryDaysSchema, type AuditEntry, type AuditPage, type AuditSummary } from './schema';

/**
 * Read-only. Roles are PROVISIONAL until the 7.6 matrix: every platform role may list and open entries (billing sees
 * metadata only for subscription entries, enforced in Postgres); the summary is super_admin and support only.
 * There is intentionally no write method: audit_logs is append-only and written only by SECURITY DEFINER code.
 */
export const AUDIT_SUMMARY_ROLES = ROLE_SETS.auditSummary;

export function makeAuditService(repo: AuditRepository) {
  return {
    async list(ctx: PlatformServiceContext, rawQuery: unknown): Promise<AuditPage> {
      requirePlatformAccess(ctx);
      return repo.list(ctx, parseInput(auditListSchema, rawQuery ?? {}));
    },
    async get(ctx: PlatformServiceContext, rawId: unknown): Promise<AuditEntry> {
      requirePlatformAccess(ctx);
      return repo.get(ctx, parseInput(idSchema, rawId));
    },
    async summary(ctx: PlatformServiceContext, rawDays?: unknown): Promise<AuditSummary> {
      requirePlatformAccess(ctx, AUDIT_SUMMARY_ROLES);
      return repo.summary(ctx, parseInput(auditSummaryDaysSchema, rawDays));
    },
  };
}
export type AuditService = ReturnType<typeof makeAuditService>;
export const auditService = makeAuditService(auditRepository);
