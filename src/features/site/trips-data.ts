import 'server-only';
import { cache } from 'react';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { getEnv } from '@/lib/env';
import { publicTripRowSchema } from '@/lib/public-search/schema';

export type SiteTrip = z.infer<typeof publicTripRowSchema>;

/**
 * Bookable trips of ONE company for the `trips` / `routes` sections. Same anonymous RPC the marketplace uses (public_search_trips);
 * company scoping and eligibility (published, active, live subscription) are decided inside it, not here. company_id is the one
 * resolve_tenant_by_slug returned for this request's slug: it is never taken from the URL, a query string or content.
 * A failure THROWS (generic error page); an empty list is a normal state ("no upcoming trips").
 */
export const getSiteTrips = cache(async (companyId: string): Promise<SiteTrip[]> => {
  const env = getEnv();
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.rpc('public_search_trips', {
    p_origin: null, p_destination: null, p_date: null, p_company_id: companyId, p_limit: 20, p_offset: 0,
  });
  if (error) throw new Error(`public_search_trips failed (${error.code ?? 'unknown'})`);
  const parsed = z.array(publicTripRowSchema).safeParse(data ?? []);
  if (!parsed.success) throw new Error('public_search_trips returned an unexpected shape');
  return parsed.data.filter((t) => t.company_id === companyId);          // defence in depth: never render another company's row
});
