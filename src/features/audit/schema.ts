import { z } from 'zod';
import { ACTOR_TYPES, AUDIT_NAMESPACES } from './catalog';

export const AUDIT_PAGE_SIZE = 50;

/** Query-string filters for /admin/audit-logs. Cursor times stay STRINGS: Date would cut microseconds and skip or repeat rows. */
const isoInstant = z.iso.datetime({ offset: true });
export const auditListSchema = z
  .object({
    company: z.guid().optional(),
    namespace: z.enum(AUDIT_NAMESPACES).optional(),
    actorType: z.enum(ACTOR_TYPES).optional(),
    actor: z.guid().optional(),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    bat: isoInstant.optional(),
    bid: z.guid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(AUDIT_PAGE_SIZE),
  })
  .refine((v) => (v.bat === undefined) === (v.bid === undefined), { path: ['bat'], message: 'invalid_cursor' })
  .refine((v) => !v.from || !v.to || v.from <= v.to, { path: ['from'], message: 'invalid_range' });
export type AuditListQuery = z.output<typeof auditListSchema>;

export const auditSummaryDaysSchema = z.coerce.number().int().min(1).max(90).default(7);

const item = z.object({
  id: z.string(),
  created_at: z.string(),
  action: z.string(),
  entity_type: z.string(),
  entity_id: z.string().nullable(),
  actor_type: z.string(),
  actor_id: z.string().nullable(),
  actor_name: z.string().nullable(),
  company_id: z.string().nullable(),
  company_name: z.string().nullable(),
  changed_keys: z.array(z.string()),
});

/** Shape returned by admin_list_audit_logs() (0019). */
export const auditListRawSchema = z.object({
  items: z.array(item).max(100),
  has_more: z.boolean(),
  next_before_at: z.string().nullable(),
  next_before_id: z.string().nullable(),
});

/** Shape returned by admin_get_audit_log() (0019). `metadata` is null when redacted for the caller's role. */
export const auditEntryRawSchema = item.omit({ changed_keys: true }).extend({
  actor_email: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  metadata_redacted: z.boolean(),
});

export const auditSummaryRawSchema = z.object({
  days: z.number().int(),
  since: z.string(),
  total: z.number().int().nonnegative(),
  by_namespace: z.array(z.object({ namespace: z.string(), count: z.number().int() })),
  platform_actors: z.array(z.object({ actor_id: z.string().nullable(), actor_name: z.string().nullable(), count: z.number().int() })),
});

export type AuditItem = {
  id: string;
  createdAt: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorType: string;
  actorId: string | null;
  actorName: string | null;
  companyId: string | null;
  companyName: string | null;
  /** Field names present in the after-snapshot. Values are only on the detail page. */
  changedKeys: string[];
};
export type AuditPage = { items: AuditItem[]; hasMore: boolean; next: { bat: string; bid: string } | null };
export type AuditEntry = Omit<AuditItem, 'changedKeys'> & { actorEmail: string | null; metadata: Record<string, unknown> | null; metadataRedacted: boolean };
export type AuditSummary = {
  days: number;
  since: string;
  total: number;
  byNamespace: { namespace: string; count: number }[];
  platformActors: { actorId: string | null; actorName: string | null; count: number }[];
};

type Raw = z.output<typeof item>;
export const toAuditItem = (r: Raw): AuditItem => ({
  id: r.id,
  createdAt: r.created_at,
  action: r.action,
  entityType: r.entity_type,
  entityId: r.entity_id,
  actorType: r.actor_type,
  actorId: r.actor_id,
  actorName: r.actor_name,
  companyId: r.company_id,
  companyName: r.company_name,
  changedKeys: r.changed_keys,
});
