import Link from 'next/link';
import { CompanyDetailMasarView } from '@/components/admin/masar/CompanyDetailMasarView';

import { notFound } from 'next/navigation';

import { AdminErrorState } from '@/components/admin/StateViews';

import type { AdminCompanyDetail } from '@/features/companies/admin-output';
import { companyService } from '@/features/companies/service';
import { subscriptionService } from '@/features/subscriptions/service';

import type { AuditItem } from '@/features/audit/schema';
import { auditService } from '@/features/audit/service';
import { adminPageOutcome } from '@/features/admin/page-errors';
import { getPlatformServiceContext } from '@/lib/service/server';
import { idSchema } from '@/lib/validation/common';

export const metadata = { title: 'Company · Admin' };
export const dynamic = 'force-dynamic';



export default async function CompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPlatformServiceContext();
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();

  let result: { data: AdminCompanyDetail } | { error: string } | { missing: true };
  try {
    result = { data: await companyService.adminDetail(ctx, id) };
  } catch (e) {
    const outcome = adminPageOutcome(e);
    result = outcome.kind === 'missing' ? { missing: true } : { error: outcome.message };
  }
  if ('missing' in result) notFound();
  if ('error' in result) {
    return (
      <div className="space-y-4">
        <Link href="/admin/companies" className="text-xs text-ink-muted underline">Companies</Link>
        <AdminErrorState message={result.error} />
      </div>
    );
  }

  const { company: c } = result.data;
  // UI visibility only. The services and Postgres authorise every one of these actions again.
  const isSuper = ctx.auth.platformRole === 'super_admin';
  const canSub = isSuper || ctx.auth.platformRole === 'billing';
  let planOptions: { value: string; label: string }[] = [];
  if (canSub && c.status !== 'cancelled') {
    try {
      planOptions = (await subscriptionService.listPlans(ctx)).filter((p) => p.isActive).map((p) => ({ value: p.code, label: p.name }));
    } catch {
      planOptions = []; // the assign button is hidden when the plan list cannot load; the rest of the page still renders
    }
  }
  const canNote = isSuper || ctx.auth.platformRole === 'support';
  let activity: AuditItem[] | null = null;
  try {
    activity = (await auditService.list(ctx, { company: c.id, limit: 10 })).items;
  } catch {
    activity = null; // the activity card is secondary: the page still renders without it
  }

  const usage = await companyService.adminSubscriptionUsage(ctx, id).catch(() => null);
  return (
    <>
      <CompanyDetailMasarView data={result.data} isSuper={isSuper} canSub={canSub} canNote={canNote} canAct={ctx.auth.platformRole === 'super_admin' || ctx.auth.platformRole === 'support'} planOptions={planOptions} activity={activity} />
      {usage ? (
        <section aria-label="Member subscriptions" className="mt-6 text-sm">
          <h2 className="mb-2 text-base font-medium">Member subscriptions</h2>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {([['Active plans', usage.plans], ['Active subscriptions', usage.active], ['Pending requests', usage.pending], ['Scans, last 30 days', usage.scans30d], ['Revenue, last 30 days', usage.revenue30d]] as const).map(([k, v]) => (
              <div key={k}><dt className="text-ink-secondary">{k}</dt><dd className="text-lg tabular-nums">{v}</dd></div>
            ))}
          </dl>
        </section>
      ) : null}
    </>
  );
}
