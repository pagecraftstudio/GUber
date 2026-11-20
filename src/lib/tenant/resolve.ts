import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { getEnv } from '@/lib/env';
import { isSlug } from './host';

export interface ResolvedTenant { companyId: string; slug: string; status: string }

/**
 * slug -> tenant, for the /s/[slug] route. Anonymous (publishable key, no session): exactly what a visitor's browser could do.
 * Returns null for an unknown slug AND for a suspended/deleted company: resolve_tenant_by_slug answers the same in both cases on purpose,
 * so a visitor cannot tell "no such company" from "company suspended" (no enumeration, no data about the tenant).
 * A transport/database error THROWS (the route's error boundary shows a generic 500); it is never reported as "not found".
 */
export async function resolveTenantBySlug(slug: string): Promise<ResolvedTenant | null> {
  if (!isSlug(slug)) return null;
  const env = getEnv();
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.rpc('resolve_tenant_by_slug', { p_slug: slug });
  if (error) throw new Error(`resolve_tenant_by_slug failed (${error.code ?? 'unknown'})`);
  const row = (data as { company_id: string; slug: string; status: string }[] | null)?.[0];
  return row ? { companyId: row.company_id, slug: row.slug, status: row.status } : null;
}
