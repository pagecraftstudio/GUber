
import { createClient } from '@/lib/supabase/server';
import { requireTenant } from '@/lib/auth/guards';
import { createTenantServiceContext } from '@/lib/service/context';
import { customerService } from '@/features/customers/service';
import { AppError } from '@/lib/errors';

import { CustomersMasarView } from '@/features/dashboard/masar/ListsMasarViews';

const PAGE_SIZE = 25;

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const sp = await searchParams;
  const auth = await requireTenant('customers.read'); // no customers.read => /dashboard?error=forbidden
  const ctx = createTenantServiceContext(await createClient(), auth);
  const q = (sp.q ?? '').trim().slice(0, 200);
  let page;
  try {
    page = await customerService.list(ctx, { q: q || undefined, page: Number(sp.page) || 1, pageSize: PAGE_SIZE, sort: 'created_at', dir: 'desc' });
  } catch (e) {
    if (e instanceof AppError && e.code === 'validation') page = await customerService.list(ctx, { page: 1, pageSize: PAGE_SIZE, sort: 'created_at', dir: 'desc' });
    else throw e;
  }
  return <CustomersMasarView rows={page.items} q={q} page={page.page} pageSize={page.pageSize} total={page.total} />;
}
