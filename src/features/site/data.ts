import 'server-only';
import { cache } from 'react';
import { createClient } from '@supabase/supabase-js';
import { getEnv } from '@/lib/env';
import { isSlug } from '@/lib/tenant/host';
import { publicSiteSchema, SUPPORTED_SCHEMA_VERSIONS, type PublicSite } from './schema';

/**
 * The ONE read path for a tenant's public site: get_public_site(p_slug), anonymous (publishable key, no session = exactly what a
 * visitor's browser could do). Returns:
 *   - null  -> unknown, suspended, never published or unpublished. The RPC collapses all four on purpose (no enumeration);
 *              the renderer cannot and must not tell them apart. Caller: notFound().
 *   - THROWS on a transport/database error or a response that does not match the contract (including a snapshot schema version
 *     this build does not know). The route's error boundary shows a generic "temporarily unavailable"; an outage is never
 *     reported as "no such site".
 * React cache() dedupes the call between layout, page and generateMetadata within one request.
 */
export const getPublicSite = cache(async (slug: string): Promise<PublicSite | null> => {
  if (!isSlug(slug)) return null;
  const env = getEnv();
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.rpc('get_public_site', { p_slug: slug });
  if (error) throw new Error(`get_public_site failed (${error.code ?? 'unknown'})`);
  if (data === null) return null;
  const parsed = publicSiteSchema.safeParse(data);
  if (!parsed.success) throw new Error('get_public_site returned an unexpected shape');
  if (!SUPPORTED_SCHEMA_VERSIONS.includes(parsed.data.site.schema_version)) throw new Error('unsupported site snapshot version');
  return parsed.data;
});
