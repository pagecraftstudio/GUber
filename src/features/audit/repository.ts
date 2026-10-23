import { mapDbError } from '@/lib/db/map-error';
import { AppError } from '@/lib/errors';
import type { PlatformServiceContext } from '@/lib/service/context';
import {
  auditEntryRawSchema,
  auditListRawSchema,
  auditSummaryRawSchema,
  toAuditItem,
  type AuditEntry,
  type AuditListQuery,
  type AuditPage,
  type AuditSummary,
} from './schema';

export type AuditRepository = {
  list(ctx: PlatformServiceContext, q: AuditListQuery): Promise<AuditPage>;
  get(ctx: PlatformServiceContext, id: string): Promise<AuditEntry>;
  summary(ctx: PlatformServiceContext, days: number): Promise<AuditSummary>;
};

// Day filters become whole-day UTC bounds. `to` is inclusive of its last microsecond.
const startOfDay = (d: string) => `${d}T00:00:00Z`;
const endOfDay = (d: string) => `${d}T23:59:59.999999Z`;

export const auditRepository: AuditRepository = {
  // Read-only RPCs. Role is decided in Postgres (auth.uid() -> platform_users); no role or tenant selector is sent.
  async list(ctx, q) {
    const res = await ctx.db.rpc('admin_list_audit_logs', {
      p_company: q.company ?? null,
      p_namespace: q.namespace ?? null,
      p_action: null,
      p_entity_type: null,
      p_actor_type: q.actorType ?? null,
      p_actor: q.actor ?? null,
      p_from: q.from ? startOfDay(q.from) : null,
      p_to: q.to ? endOfDay(q.to) : null,
      p_before_at: q.bat ?? null,
      p_before_id: q.bid ?? null,
      p_limit: q.limit,
    });
    if (res.error) throw mapDbError(res.error);
    const p = auditListRawSchema.safeParse(res.data);
    if (!p.success) throw new AppError('internal', { cause: p.error });
    const { next_before_at: at, next_before_id: id } = p.data;
    return { items: p.data.items.map(toAuditItem), hasMore: p.data.has_more, next: p.data.has_more && at && id ? { bat: at, bid: id } : null };
  },

  async get(ctx, id) {
    const res = await ctx.db.rpc('admin_get_audit_log', { p_id: id });
    if (res.error) throw mapDbError(res.error);
    const p = auditEntryRawSchema.safeParse(res.data);
    if (!p.success) throw new AppError('internal', { cause: p.error });
    const r = p.data;
    return {
      id: r.id, createdAt: r.created_at, action: r.action, entityType: r.entity_type, entityId: r.entity_id,
      actorType: r.actor_type, actorId: r.actor_id, actorName: r.actor_name, companyId: r.company_id, companyName: r.company_name,
      actorEmail: r.actor_email, metadata: r.metadata, metadataRedacted: r.metadata_redacted,
    };
  },

  async summary(ctx, days) {
    const res = await ctx.db.rpc('admin_audit_summary', { p_days: days });
    if (res.error) throw mapDbError(res.error);
    const p = auditSummaryRawSchema.safeParse(res.data);
    if (!p.success) throw new AppError('internal', { cause: p.error });
    return {
      days: p.data.days,
      since: p.data.since,
      total: p.data.total,
      byNamespace: p.data.by_namespace,
      platformActors: p.data.platform_actors.map((a) => ({ actorId: a.actor_id, actorName: a.actor_name, count: a.count })),
    };
  },
};
