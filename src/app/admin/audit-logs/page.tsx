
import { AuditListMasar } from '@/components/admin/masar/PlatformMasarViews';


import { auditListSchema, type AuditPage, type AuditSummary } from '@/features/audit/schema';
import { auditService, AUDIT_SUMMARY_ROLES } from '@/features/audit/service';
import type { RawSearchParams } from '@/features/auth/search-params';
import { hasPlatformRole } from '@/lib/auth/permissions';
import { toClientError } from '@/lib/errors';
import { getPlatformServiceContext } from '@/lib/service/server';
import { firstParams } from '@/lib/validation/common';

export const metadata = { title: 'Audit logs · Admin' };
export const dynamic = 'force-dynamic';

export default async function AuditLogsPage({ searchParams }: { searchParams: RawSearchParams }) {
  const ctx = await getPlatformServiceContext(); // any platform role; metadata redaction happens in Postgres
  // An HTML form submits every field, empty ones as "". Treat blank as "not set" so one empty box cannot invalidate the rest.
  const raw = Object.fromEntries(Object.entries(firstParams(await searchParams)).filter(([, v]) => v !== undefined && v !== ''));
  const parsed = auditListSchema.safeParse(raw);
  const query = parsed.success ? parsed.data : auditListSchema.parse({});
  const ignored = !parsed.success;
  const showSummary = hasPlatformRole(ctx.auth, AUDIT_SUMMARY_ROLES);
  const days = raw.days === '30' ? 30 : 7;

  let page: { data: AuditPage } | { error: string };
  try {
    page = { data: await auditService.list(ctx, query) };
  } catch (e) {
    page = { error: toClientError(e).message };
  }
  let summary: AuditSummary | null = null;
  if (showSummary) {
    try {
      summary = await auditService.summary(ctx, days);
    } catch {
      summary = null; // the summary is a convenience; the list below still renders
    }
  }

  return <AuditListMasar query={{ company: query.company, namespace: query.namespace, actorType: query.actorType, actor: query.actor, from: query.from, to: query.to, bat: query.bat }} page={page} summary={summary} days={days} ignored={ignored} />;
}
