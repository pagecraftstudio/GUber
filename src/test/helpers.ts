import type { SupabaseClient } from '@supabase/supabase-js';
import type { PlatformServiceContext, TenantServiceContext } from '@/lib/service/context';
import type { AuthContext, PlatformRole } from '@/lib/auth/types';

export const COMPANY_A = '00000000-0000-4000-8000-000000000101';
export const COMPANY_B = '00000000-0000-4000-8000-000000000102';
const USER = '00000000-0000-4000-8000-000000000002';

type Result = { data?: unknown; error?: unknown; count?: number | null };
export type Recorded = { target: string; ops: Array<[string, unknown[]]> };

/**
 * Records every builder call (`from('x').select(...).eq(...)`) and resolves to a canned result.
 * Lets unit tests assert WHAT the repositories ask the database, without a database.
 */
export function fakeDb(result: Result = {}) {
  const calls: Recorded[] = [];
  const make = (target: string) => {
    const rec: Recorded = { target, ops: [] };
    calls.push(rec);
    const proxy: unknown = new Proxy(function noop() {}, {
      get(_t, prop) {
        if (prop === 'then') {
          return (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
            Promise.resolve({ data: result.data ?? null, error: result.error ?? null, count: result.count ?? null }).then(resolve, reject);
        }
        return (...args: unknown[]) => {
          rec.ops.push([String(prop), args]);
          return proxy;
        };
      },
    });
    return proxy;
  };
  const db = {
    from: (table: string) => make(table),
    rpc: (fn: string, args: unknown) => {
      const p = make(`rpc:${fn}`) as { _args?: unknown };
      calls[calls.length - 1]!.ops.push(['args', [args]]);
      return p;
    },
  } as unknown as SupabaseClient;
  return { db, calls };
}

export const opsOf = (rec: Recorded, name: string) => rec.ops.filter(([n]) => n === name).map(([, a]) => a);

export function tenantCtx(permissions: string[], over: { db?: SupabaseClient; companyId?: string } = {}): TenantServiceContext {
  const companyId = over.companyId ?? COMPANY_A;
  const auth: AuthContext & { membership: NonNullable<AuthContext['membership']> } = {
    userId: USER,
    email: 'u@test.dev',
    fullName: 'U',
    locale: 'en',
    isActive: true,
    platformRole: null,
    membership: {
      companyId,
      companyName: 'A',
      companySlug: 'a',
      companyStatus: 'active',
      memberStatus: 'active',
      roleKey: 'x',
      permissions,
    },
  };
  return { db: over.db ?? fakeDb().db, auth, companyId };
}

export function platformCtx(role: PlatformRole | null, db: SupabaseClient = fakeDb().db): PlatformServiceContext {
  return {
    db,
    auth: { userId: USER, email: 'p@test.dev', fullName: 'P', locale: 'en', isActive: true, platformRole: role, membership: null },
  };
}
