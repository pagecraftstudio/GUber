import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getEnv } from '@/lib/env';
import { siteIsHttps } from '@/lib/supabase/cookie-options';

let client: SupabaseClient | undefined;

/**
 * Browser Supabase client (publishable key only; the service-role key never exists in the browser bundle).
 * Session lives in cookies via @supabase/ssr, so the Next.js proxy and server components see the same user.
 * Every call runs with the USER's JWT, so RLS and the SECURITY DEFINER RPC checks apply.
 */
export function getSupabaseBrowser(): SupabaseClient {
  if (client) return client;
  const env = getEnv();
  client = createBrowserClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookieOptions: siteIsHttps(env.NEXT_PUBLIC_SITE_URL) ? { secure: true } : {},
  });
  return client;
}
