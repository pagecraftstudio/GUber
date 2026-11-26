import 'server-only';
import { resolveTenantBySlug } from '@/lib/tenant/resolve';
import { resolveCustomHost } from '@/lib/tenant/resolve-custom';
import { makeCompanyResolver } from './tenant';

/** The real resolvers: the same anonymous database calls the public site uses (resolve_tenant_by_slug, resolve_tenant). One instance per server process. */
export const resolveTrackCompany = makeCompanyResolver({
  bySlug: (slug) => resolveTenantBySlug(slug),
  byHost: (hostname) => resolveCustomHost(hostname, { supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '' }),
});
