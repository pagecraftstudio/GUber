import Link from 'next/link';
import { AdminErrorState } from '@/components/admin/StateViews';
import { CreateCompanyForm, type PlanOption } from '@/components/admin/CompanyForms';
import { subscriptionService } from '@/features/subscriptions/service';
import { toClientError } from '@/lib/errors';
import { getPlatformServiceContext } from '@/lib/service/server';

export const metadata = { title: 'New company · Admin' };
export const dynamic = 'force-dynamic';

export default async function NewCompanyPage() {
  const ctx = await getPlatformServiceContext(['super_admin']); // support and billing get a 404, like any non-staff user

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
    <div className="max-w-xl space-y-5">
      <div>
        <Link href="/admin/companies" className="text-xs text-slate-500 underline">Companies</Link>
        <h1 className="text-2xl font-semibold">New company</h1>
      </div>
      {error ? <AdminErrorState message={error} /> : <CreateCompanyForm plans={plans} />}
    </div>
  );
}
