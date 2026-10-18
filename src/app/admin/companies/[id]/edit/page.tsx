import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EditCompanyForm } from '@/components/admin/CompanyForms';
import { AdminErrorState } from '@/components/admin/StateViews';
import { companyService } from '@/features/companies/service';
import type { AdminCompanyDetail } from '@/features/companies/admin-output';
import { AppError, toClientError } from '@/lib/errors';
import { getPlatformServiceContext } from '@/lib/service/server';
import { idSchema } from '@/lib/validation/common';

export const metadata = { title: 'Edit company · Admin' };
export const dynamic = 'force-dynamic';

export default async function EditCompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPlatformServiceContext(['super_admin']);
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();

  let result: { data: AdminCompanyDetail } | { error: string } | { missing: true };
  try {
    result = { data: await companyService.adminDetail(ctx, id) };
  } catch (e) {
    result = e instanceof AppError && e.code === 'not_found' ? { missing: true } : { error: toClientError(e).message };
  }
  if ('missing' in result) notFound();
  if ('error' in result) return <AdminErrorState message={result.error} />;

  const c = result.data.company;
  return (
    <div className="max-w-xl space-y-5">
      <div>
        <Link href={`/admin/companies/${c.id}`} className="text-xs text-slate-500 underline">{c.name}</Link>
        <h1 className="text-2xl font-semibold">Edit company</h1>
        <p className="text-xs text-slate-500">Slug <span className="font-mono">{c.slug}</span> is fixed.</p>
      </div>
      <EditCompanyForm company={{ id: c.id, name: c.name, legalName: c.legalName, taxNumber: c.taxNumber, contactName: c.contactName, contactEmail: c.contactEmail, contactPhone: c.contactPhone, country: c.country }} />
    </div>
  );
}
