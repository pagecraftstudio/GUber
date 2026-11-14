import { ROLE_SETS } from '@/features/platform/permissions';
import { EditCompanyForm as EditCompanyFormMasar } from '@/components/admin/masar/CompanyFormsMasar';
import { Breadcrumbs } from '@/ds/data/Layout';
import { ErrorState } from '@/ds/feedback/States';

import { notFound } from 'next/navigation';

import { companyService } from '@/features/companies/service';
import type { AdminCompanyDetail } from '@/features/companies/admin-output';
import { adminPageOutcome } from '@/features/admin/page-errors';
import { getPlatformServiceContext } from '@/lib/service/server';
import { idSchema } from '@/lib/validation/common';

export const metadata = { title: 'Edit company · Admin' };
export const dynamic = 'force-dynamic';

export default async function EditCompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPlatformServiceContext(ROLE_SETS.superAdminOnly);
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
  if ('error' in result) return <ErrorState title="Could not load this company" description={result.error} />;

  const c = result.data.company;
  return (
    <div className="max-w-xl space-y-6">
      <div className="space-y-3">
        <Breadcrumbs items={[{ label: 'Companies', href: '/admin/companies' }, { label: c.name, href: `/admin/companies/${c.id}` }, { label: 'Edit' }]} />
        <h1 className="text-2xl font-medium text-ink-primary">Edit company</h1>
        <p className="text-[13px] text-ink-muted">The slug is fixed.</p>
      </div>
      <EditCompanyFormMasar company={{ id: c.id, name: c.name, legalName: c.legalName, taxNumber: c.taxNumber, contactName: c.contactName, contactEmail: c.contactEmail, contactPhone: c.contactPhone, country: c.country }} />
    </div>
  );
}
