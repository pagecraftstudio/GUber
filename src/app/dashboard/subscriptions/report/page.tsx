import { createClient } from '@/lib/supabase/server';
import { requireTenant } from '@/lib/auth/guards';
import { createTenantServiceContext } from '@/lib/service/context';
import { subscriptionReportService } from '@/features/subscription-reports/service';
import { ReportMasarView } from '@/features/dashboard/masar/ReportMasarView';

const first = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '');

export default async function SubscriptionReportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const auth = await requireTenant('analytics.read');
  const ctx = createTenantServiceContext(await createClient(), auth);
  const q = await searchParams;
  const asked = { from: first(q.from), to: first(q.to) };
  const typed = asked.from !== '' || asked.to !== '';
  const valid = !typed || subscriptionReportService.isValidRange(asked);
  const report = await subscriptionReportService.report(ctx, typed && valid ? asked : undefined);
  return <ReportMasarView {...report} invalid={!valid} />;
}
