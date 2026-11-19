import { createClient } from '@/lib/supabase/server';
import { requireTenant } from '@/lib/auth/guards';
import { createTenantServiceContext } from '@/lib/service/context';
import { subscriptionReportService } from '@/features/subscription-reports/service';
import { rangeSchema } from '@/features/subscription-reports/schema';
import { ReportMasarView } from '@/features/dashboard/masar/ReportMasarView';

const iso = (d: Date) => d.toISOString().slice(0, 10);
const first = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '');

export default async function SubscriptionReportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const auth = await requireTenant('analytics.read');
  const ctx = createTenantServiceContext(await createClient(), auth);
  const q = await searchParams;
  const today = new Date();
  const fallback = { from: iso(new Date(today.getTime() - 29 * 86_400_000)), to: iso(today) };
  const asked = { from: first(q.from), to: first(q.to) };
  const valid = asked.from === '' && asked.to === '' ? true : rangeSchema.safeParse(asked).success;
  const range = asked.from && asked.to && valid ? asked : fallback;
  const report = await subscriptionReportService.report(ctx, range);
  return <ReportMasarView {...report} invalid={!valid} />;
}
