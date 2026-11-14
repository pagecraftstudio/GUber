import { ROLE_SETS } from '@/features/platform/permissions';
import { CreateCompanyForm as CreateCompanyFormMasar } from '@/components/admin/masar/CompanyFormsMasar';
import { Breadcrumbs } from '@/ds/data/Layout';
import { ErrorState } from '@/ds/feedback/States';

import { type PlanOption } from '@/components/admin/CompanyForms';
import { subscriptionService } from '@/features/subscriptions/service';
import { toClientError } from '@/lib/errors';
import { getPlatformServiceContext } from '@/lib/service/server';

export const metadata = { title: 'New company · Admin' };
export const dynamic = 'force-dynamic';

export default async function NewCompanyPage() {
  const ctx = await getPlatformServiceContext(ROLE_SETS.superAdminOnly); // support and billing get a 404, like any non-staff user

  let plans: PlanOption[] = [];
  let error: string | null = null;
  try {
    plans = (await subscriptionService.listPlans(ctx))
      .filter((p) => p.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((p) => ({ code: p.code, name: p.name, trialDays: p.trialDays }));
  } catch (e) {
    error = toClientError(e).message;
  }

  return (
    <div className="max-w-xl space-y-6">
      <div className="space-y-3"><Breadcrumbs items={[{ label: 'Companies', href: '/admin/companies' }, { label: 'New company' }]} /><h1 className="text-2xl font-medium text-ink-primary">New company</h1></div>
      {error ? <ErrorState title="Could not load plans" description={error} /> : <CreateCompanyFormMasar plans={plans} />}
    </div>
  );
}
