import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import type { z } from 'zod';
import { getEnv } from '@/lib/env';
import { logger } from '@/lib/log';

/**
 * Server side of the anonymous public trip endpoints.
 *
 * SECURITY MODEL
 *  - Calls Supabase with the PUBLISHABLE key and NO user session: exactly what an anonymous browser could do, no more.
 *    There is no service-role key anywhere. The only privilege is the EXECUTE grant that public_search_trips /
 *    public_trip_stops already give to `anon`; tenant isolation and eligibility (published site, active company, live
 *    subscription since 0021) are decided inside those SECURITY DEFINER functions, not here.
 *  - Because no cookie or Authorization header of the visitor is forwarded, the answer cannot depend on who asks, which is
 *    the only reason it may be cached by a shared CDN.
 *  - Upstream details (SQLSTATE, messages, hints) are logged as codes only and never returned to the caller.
 *
 * WHAT THIS DOES NOT DO: it does not close the Supabase API itself. Anyone holding the (public by design) publishable key
 * can still call the RPCs directly; see docs/RATE-LIMITING.md section 3 for the residual risk and the options.
 */
export const UPSTREAM_TIMEOUT_MS = 8000;
/** Seats change on every booking, so the shared cache is short. The booking RPC is always authoritative. */
export const TRIPS_CACHE = 'public, max-age=0, s-maxage=30, stale-while-revalidate=60';
export const STOPS_CACHE = 'public, max-age=0, s-maxage=120, stale-while-revalidate=300';
const NO_STORE = { 'Cache-Control': 'no-store' } as const;

let client: SupabaseClient | undefined;
function anonClient(): SupabaseClient {
  if (client) return client;
  const env = getEnv();
  client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store', signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) }) },
  });
  return client;
}
/** Test seam. */
export function resetAnonClientForTests(): void { client = undefined; }

export const invalidRequest = () => NextResponse.json({ error: { code: 'invalid_request' } }, { status: 400, headers: NO_STORE });
const upstreamFailure = (status: 429 | 502) =>
  NextResponse.json({ error: { code: status === 429 ? 'rate_limited' : 'upstream_unavailable' } }, { status, headers: NO_STORE });

export async function publicRpc<S extends z.ZodType>(
  event: 'public_search.trips' | 'public_search.stops', fn: string, args: Record<string, unknown>, row: S, cacheControl: string,
): Promise<NextResponse> {
  try {
    const res = await anonClient().rpc(fn, args);
    if (res.error) {
      const limited = res.status === 429 || res.error.code === 'PT429';
      logger.warn(`${event}.failed`, { pgCode: res.error.code, httpStatus: res.status, outcome: limited ? 'rate_limited' : 'upstream' });
      return upstreamFailure(limited ? 429 : 502);
    }
    const parsed = row.array().safeParse(res.data ?? []);
    if (!parsed.success) {
      logger.error(`${event}.bad_shape`, { issues: parsed.error.issues.length });
      return upstreamFailure(502);
    }
    return NextResponse.json({ data: parsed.data }, { status: 200, headers: { 'Cache-Control': cacheControl } });
  } catch (e) {
    logger.error(`${event}.exception`, { error: e });
    return upstreamFailure(502);
  }
}
