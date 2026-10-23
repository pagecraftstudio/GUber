/** Builds /admin/audit-logs URLs. Only known keys, only non-empty values: nothing arbitrary is ever echoed into a link. */
const KEYS = ['company', 'namespace', 'actorType', 'actor', 'from', 'to', 'bat', 'bid', 'days'] as const;
export type AuditLinkParams = Partial<Record<(typeof KEYS)[number], string | undefined>>;

export function auditHref(params: AuditLinkParams = {}): string {
  const qs = new URLSearchParams();
  for (const k of KEYS) {
    const v = params[k];
    if (v) qs.set(k, v);
  }
  const s = qs.toString();
  return s ? `/admin/audit-logs?${s}` : '/admin/audit-logs';
}

/** Where an entry's subject lives in the admin UI, or null when there is no page for it. */
export function entityHref(entityType: string, entityId: string | null, companyId: string | null): string | null {
  if (entityType === 'company' && entityId) return `/admin/companies/${entityId}`;
  if ((entityType === 'subscription' || entityType === 'company_note' || entityType === 'company_invite') && companyId) return `/admin/companies/${companyId}`;
  return null;
}
