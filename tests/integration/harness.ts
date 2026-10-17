import { createHmac } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { rawContextSchema, toAuthContext } from '@/lib/auth/types';
import { createPlatformServiceContext, createTenantServiceContext, type PlatformServiceContext, type TenantServiceContext } from '@/lib/service/context';

/**
 * Real-database harness. PostgREST is called directly (it serves /, supabase-js adds /rest/v1, so the fetch
 * wrapper strips it). Each test user is a JWT signed with the PostgREST secret, exactly what GoTrue would issue;
 * from there everything is real: auth.uid(), RLS, triggers, constraints, grants, RPCs.
 * Fixture users/companies come from supabase/tests/01_helpers_fixtures.sql (t.u(n) = ...-0000000000nn).
 */
export const URL_ = process.env.PGRST_URL ?? '';
const SECRET = process.env.PGRST_JWT_SECRET ?? '';

export const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const U = { superAdmin: 1, ownerA: 2, managerA: 3, opsA: 4, bookingA: 5, driverA: 6, ownerB: 7, ownerC: 8, support: 9, billing: 10 } as const;
export const IDS = {
  companyA: uid(101), companyB: uid(102),
  routeA1: uid(201), routeB1: uid(203),
  stopB1: uid(213),
  busA1: uid(221), busA3Inactive: uid(223), busA4: uid(225), busB1: uid(224),
  driverA2: uid(232), driverA3: uid(234),
  tripB1: uid(243), tripA1: uid(241),
  customerA1: uid(251), customerB1: uid(252),
  bookingA1: uid(261), bookingB1: uid(262),
};

function b64(o: unknown) {
  return Buffer.from(JSON.stringify(o)).toString('base64url');
}
export function jwtFor(sub: string | null): string {
  const h = b64({ alg: 'HS256', typ: 'JWT' });
  const p = b64({ ...(sub ? { sub } : {}), role: sub ? 'authenticated' : 'anon', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 });
  return `${h}.${p}.${createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url')}`;
}

export function clientFor(n: number | null): SupabaseClient {
  const token = jwtFor(n === null ? null : uid(n));
  return createClient('http://postgrest.local', token, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: { Authorization: `Bearer ${token}` },
      fetch: (input, init) => fetch(String(input).replace('http://postgrest.local/rest/v1', URL_), init),
    },
  });
}

async function authFor(db: SupabaseClient) {
  const { data, error } = await db.rpc('my_context');
  if (error) throw new Error(`my_context failed: ${error.message}`);
  return toAuthContext(rawContextSchema.parse(data));
}

/** Same derivation as production: membership + permissions come from my_context(), never from the test. */
export async function tenantAs(n: number): Promise<TenantServiceContext> {
  const db = clientFor(n);
  return createTenantServiceContext(db, await authFor(db));
}
export async function platformAs(n: number): Promise<PlatformServiceContext> {
  const db = clientFor(n);
  return createPlatformServiceContext(db, await authFor(db));
}

export const rnd = () => Math.random().toString(36).slice(2, 8).toUpperCase();
