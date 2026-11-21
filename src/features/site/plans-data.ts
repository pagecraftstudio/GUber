import 'server-only';
import { cache } from 'react';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { getEnv } from '@/lib/env';
import { sitePlanRowSchema, type SitePlan } from './plans';

/**
 * Public plans of ONE company for the `subscriptions` section, through the anonymous RPC public_route_plans (0034): which plans are public
 * is decided inside it. company_id is the one resolve_tenant_by_slug returned (or the signed-in staff member's own company in the editor),
 * never taken from a URL or from content. A failure THROWS; an empty list is a normal state.
 */
export const getSitePlans = cache(async (companyId: string): Promise<SitePlan[]> => {
  const env = getEnv();
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.rpc('public_route_plans', { p_company_id: companyId });
  if (error) throw new Error(`public_route_plans failed (${error.code ?? 'unknown'})`);
  const parsed = z.array(sitePlanRowSchema).safeParse(data ?? []);
  if (!parsed.success) throw new Error('public_route_plans returned an unexpected shape');
  return parsed.data.filter((p) => p.company_id === companyId);          // defence in depth: never render another company's plan
});
