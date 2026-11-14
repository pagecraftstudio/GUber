import { CompaniesMasarView } from '@/components/admin/masar/CompaniesMasarView';


import type { AdminCompanyListItem } from '@/features/companies/admin-output';
import { companyService } from '@/features/companies/service';
import { platformCompanyListSchema, type PlatformCompanyListQuery } from '@/features/companies/schema';
import type { RawSearchParams } from '@/features/auth/search-params';
import { toClientError } from '@/lib/errors';
import type { Page } from '@/lib/db/pagination';
import { getPlatformServiceContext } from '@/lib/service/server';
import { firstParams } from '@/lib/validation/common';

export const metadata = { title: 'Companies · Admin' };
export const dynamic = 'force-dynamic';

export default async function CompaniesPage({ searchParams }: { searchParams: RawSearchParams }) {
  const ctx = await getPlatformServiceContext(); // any platform role may browse; 404 / login redirect otherwise
  // Bad or hostile query strings fall back to defaults instead of erroring: the page is a read view.
  const parsed = platformCompanyListSchema.safeParse(firstParams(await searchParams));
  const query: PlatformCompanyListQuery = parsed.success ? parsed.data : platformCompanyListSchema.parse({});

  let result: { data: Page<AdminCompanyListItem> } | { error: string };
  try {
    result = { data: await companyService.adminList(ctx, query) };
  } catch (e) {
    result = { error: toClientError(e).message };
  }
  const canCreate = ctx.auth.platformRole === 'super_admin';
  // Presentation only: the query, the role check and the URL parameters above are the same for both looks.
  return <CompaniesMasarView query={{ q: query.q, status: query.status }} result={result} canCreate={canCreate} />;
}
