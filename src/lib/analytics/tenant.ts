import type { TenantConfig } from '@/lib/tenant/config';
import { classifyHost, isSlug } from '@/lib/tenant/host';
import type { CustomHostResult } from '@/lib/tenant/resolve-custom';

/**
 * Which company an analytics request belongs to, decided on the SERVER from the request itself (P10).
 * The browser never sends a company id, and the request body is never an authority: the host (checked same-origin by the route)
 * and the page path are the inputs, the database's anonymous resolvers are the answer. Suspended and unknown companies resolve
 * to "no tenant", exactly like the public site does.
 */
export type TenantRef = { slug: string } | { hostname: string } | null;

/**
 * Pure. Path mode: the tenant is in the URL (/s/<slug>/...). Subdomain mode: the tenant is the HOST (<slug>.<platform domain>,
 * or a custom domain that must be looked up); the path says nothing. Platform pages (marketplace, dashboard) have no tenant.
 */
export function tenantRefFor(host: string | null, path: string, cfg: TenantConfig): TenantRef {
  if (cfg.mode === 'path') {
    const m = /^\/s\/([^/?#]+)/.exec(path);
    return m && isSlug(m[1]!) ? { slug: m[1]! } : null;
  }
  const kind = classifyHost(host, cfg);
  if (kind.kind === 'tenant') return { slug: kind.slug };
  if (kind.kind === 'custom') return { hostname: kind.hostname };
  return null;
}

export type CompanyResult = { ok: true; companyId: string | null } | { ok: false };

export interface CompanyResolverDeps {
  bySlug: (slug: string) => Promise<{ companyId: string } | null>;
  byHost: (hostname: string) => Promise<CustomHostResult>;
  now?: () => number;
}

/**
 * ref -> company id.
 *   { ok: true,  companyId: null }  no tenant involved (a platform page): record without a company.
 *   { ok: true,  companyId: '...' } resolved.
 *   { ok: false }                   a tenant was named but is unknown, suspended or could not be resolved: DROP the event.
 *                                   It is never recorded as platform-level, and a lookup failure never breaks the page.
 * Results (hits and misses, not errors) are kept 60 s per server instance. This only saves lookups; correctness never depends on it.
 */
export function makeCompanyResolver(deps: CompanyResolverDeps, opts: { ttlMs?: number; max?: number } = {}) {
  const ttl = opts.ttlMs ?? 60_000, max = opts.max ?? 500, now = deps.now ?? Date.now;
  const cache = new Map<string, { at: number; companyId: string | null }>();

  const remember = (key: string, companyId: string | null) => {
    if (cache.size >= max) cache.delete(cache.keys().next().value as string);   // oldest first (Map keeps insertion order)
    cache.set(key, { at: now(), companyId });
  };

  return async function resolve(ref: TenantRef): Promise<CompanyResult> {
    if (ref === null) return { ok: true, companyId: null };
    const key = 'slug' in ref ? `s:${ref.slug}` : `h:${ref.hostname}`;
    const hit = cache.get(key);
    if (hit && now() - hit.at < ttl) return hit.companyId ? { ok: true, companyId: hit.companyId } : { ok: false };
    try {
      let slug: string | null;
      if ('slug' in ref) slug = ref.slug;
      else {
        const r = await deps.byHost(ref.hostname);
        if (!r.ok) return { ok: false };                                         // outage: fail closed, cache nothing
        slug = r.slug;
      }
      const tenant = slug ? await deps.bySlug(slug) : null;
      remember(key, tenant?.companyId ?? null);
      return tenant ? { ok: true, companyId: tenant.companyId } : { ok: false };
    } catch {
      return { ok: false };
    }
  };
}
