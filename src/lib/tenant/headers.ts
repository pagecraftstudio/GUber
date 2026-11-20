import type { TenantConfig } from './config';

/**
 * Path mode serves every tenant on the PLATFORM's own host. That host is not a tenant's brand and must not be indexed under
 * /s/<slug> (it would compete with the tenant's real domain later). Static next.config headers, so they apply to every
 * response of the route, including errors and cached pages, without the proxy being involved.
 */
export function buildTenantHeaders(cfg: TenantConfig): { source: string; headers: { key: string; value: string }[] }[] {
  if (cfg.mode !== 'path') return [];
  return [{ source: '/s/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] }];
}
