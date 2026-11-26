import type { TenantConfig } from './config';
import { classifyHost, isSlug } from './host';
import { platformUrl, tenantUrl } from './url';

/**
 * Decides what the proxy does with a request. PURE: no I/O, no globals (the proxy may not rely on shared state, and a pure
 * decision is trivially testable). The proxy executes the decision; the one thing it cannot decide alone is which tenant owns a
 * custom hostname, which needs the database ('resolve-custom').
 *
 * SECURITY BY CONSTRUCTION: on a tenant host EVERY path is rewritten under /s/<slug>. '/dashboard' becomes '/s/<slug>/dashboard',
 * which is a tenant page that does not exist, so no staff or admin route can ever be reached through a tenant host. The
 * redirect list below is a convenience for people who type the wrong host; nothing depends on it.
 */
export type TenantDecision =
  | { action: 'pass' }
  | { action: 'rewrite'; pathname: string; slug: string }
  | { action: 'redirect'; location: string }
  | { action: 'not-found' }
  | { action: 'resolve-custom'; hostname: string };

/** Platform areas. On a tenant host these redirect to the same path on the platform host. */
export const PLATFORM_PREFIXES = [
  '/dashboard', '/admin', '/driver', '/staff', '/company', '/login', '/register', '/my-bookings', '/my-subscriptions',
  '/no-access', '/suspended', '/auth', '/continue', '/forgot-password', '/reset-password', '/invite', '/app',
] as const;

/**
 * The only API paths reachable on a tenant host: anonymous cacheable public data, the CSP report sink, and the analytics ingest (P10).
 * /api/track is public by design, refuses any request whose Origin is not this host, resolves the company from the host itself (never the body)
 * and records nothing without the visitor's consent. A tenant host has no session, so it can never act as a signed-in user.
 */
export const TENANT_HOST_API = ['/api/public', '/api/csp-report', '/api/track'] as const;

const isUnder = (path: string, prefix: string): boolean => path === prefix || path.startsWith(`${prefix}/`);

export interface RouteInput { host: string | null; pathname: string; search: string }

/** `slug` is the tenant already resolved for a custom host (second call of the same function). */
export function decideTenantRoute(input: RouteInput, cfg: TenantConfig, resolvedSlug?: string): TenantDecision {
  const { pathname, search } = input;
  const kind = classifyHost(input.host, cfg);

  if (kind.kind === 'invalid') return { action: 'not-found' };

  if (kind.kind === 'platform') {
    // Subdomain mode: the path form is retired, send it to the real host (308 keeps method and is cacheable).
    if (cfg.mode === 'subdomain' && isUnder(pathname, '/s')) {
      const m = /^\/s\/([^/]+)(\/.*)?$/.exec(pathname);
      if (m && isSlug(m[1]!)) return { action: 'redirect', location: tenantUrl(cfg, m[1]!, `${m[2] ?? '/'}${search}`) };
      return { action: 'not-found' };
    }
    return { action: 'pass' };
  }

  // ---- tenant host (subdomain or custom) ----
  let slug: string;
  if (kind.kind === 'tenant') slug = kind.slug;
  else if (resolvedSlug !== undefined) slug = resolvedSlug;
  else return { action: 'resolve-custom', hostname: kind.hostname };
  if (!isSlug(slug)) return { action: 'not-found' };

  if (isUnder(pathname, '/s')) return { action: 'not-found' };                     // internal prefix is never public on a tenant host
  if (isUnder(pathname, '/api')) return TENANT_HOST_API.some((p) => isUnder(pathname, p)) ? { action: 'pass' } : { action: 'not-found' };
  if (PLATFORM_PREFIXES.some((p) => isUnder(pathname, p))) return { action: 'redirect', location: platformUrl(cfg, `${pathname}${search}`) };
  return { action: 'rewrite', slug, pathname: `/s/${slug}${pathname === '/' ? '' : pathname}` };
}
