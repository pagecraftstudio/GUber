import { notFound } from 'next/navigation';

import { AuditEntryMasar } from '@/components/admin/masar/PlatformMasarViews';
import { AdminErrorState } from '@/components/admin/StateViews';

import { buildMetadataView } from '@/features/audit/diff';
import { entityHref } from '@/features/audit/links';
import { auditService } from '@/features/audit/service';
import { adminPageOutcome } from '@/features/admin/page-errors';
import { getPlatformServiceContext } from '@/lib/service/server';

export const metadata = { title: 'Audit entry · Admin' };
export const dynamic = 'force-dynamic';

export default async function AuditEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPlatformServiceContext();
  const { id } = await params;
  try {
    const e = await auditService.get(ctx, id);
    const view = buildMetadataView(e.metadata);
    const subject = entityHref(e.entityType, e.entityId, e.companyId);
    return <AuditEntryMasar e={e} view={view} subject={subject} />;
  } catch (err) {
    const outcome = adminPageOutcome(err, { invalidInputIsMissing: true });
    if (outcome.kind === 'missing') notFound();
    return <AdminErrorState message={outcome.message} />;
  }
}
