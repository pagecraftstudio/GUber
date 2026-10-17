import 'server-only';
import { cache } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { rawContextSchema, toAuthContext, type AuthContext } from './types';

/**
 * Resolves the caller's identity + company membership + permissions from the database.
 * Identity comes from the verified JWT (getUser), membership/permissions from my_context(), which derives
 * everything from auth.uid(). Nothing about tenancy is read from the request body, URL or cookies we control.
 */
export async function loadContext(supabase: SupabaseClient): Promise<AuthContext | null> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;

  const { data, error: rpcError } = await supabase.rpc('my_context');
  if (rpcError || !data) return null;

  const parsed = rawContextSchema.safeParse(data);
  return parsed.success ? toAuthContext(parsed.data) : null;
}

/** Memoised per request, so layouts and pages share one lookup. */
export const getAuthContext = cache(async (): Promise<AuthContext | null> => loadContext(await createClient()));
