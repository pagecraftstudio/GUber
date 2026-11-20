/**
 * Tenant routing configuration (pure; no imports, so next.config.ts, the proxy and tests can all load it).
 *
 *   TENANT_MODE=path       (default) every tenant is served at <SITE_URL>/s/<slug>. Needs no domain. Used on guber-six.vercel.app.
 *   TENANT_MODE=subdomain  tenants are served at <slug>.<PLATFORM_DOMAIN> (and at verified custom domains).
 *                          Needs PLATFORM_DOMAIN, a wildcard DNS record and a wildcard certificate.
 *
 * Switching modes is configuration only: the same /s/[slug] route renders the site in both; in subdomain mode the proxy
 * rewrites <slug>.<domain>/x to /s/<slug>/x, so there is exactly one render path.
 */
export type TenantMode = 'path' | 'subdomain';

export interface TenantConfig {
  mode: TenantMode;
  /** Lowercase hostname without port, e.g. "malaky.app". null in path mode. */
  platformDomain: string | null;
  /** Origin of the platform app, no trailing slash, e.g. "https://malaky.app". */
  siteUrl: string;
  /** Hosts that always serve the platform app (marketplace, dashboard, admin, driver). Subdomain mode only matters. */
  platformHosts: ReadonlySet<string>;
}

export type TenantEnv = Record<string, string | undefined>;

/** Same shape the database enforces on domains.hostname (migration 0042), plus bare "localhost" for local development. */
export const HOSTNAME_RE = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$/;
export const isValidPlatformDomain = (v: string): boolean => v === 'localhost' || (v.length <= 253 && HOSTNAME_RE.test(v) && !/(^|\.)xn--/.test(v));

function hostOf(url: string): string | null {
  try { return new URL(url).hostname.toLowerCase(); } catch { return null; }
}

/** Problems only (names + kinds, never values). Empty = valid. */
export function checkTenantEnv(env: TenantEnv): { name: string; problem: string }[] {
  const issues: { name: string; problem: string }[] = [];
  const mode = (env.TENANT_MODE ?? '').trim();
  if (mode !== '' && mode !== 'path' && mode !== 'subdomain') issues.push({ name: 'TENANT_MODE', problem: 'must be "path" or "subdomain"' });
  const domain = (env.PLATFORM_DOMAIN ?? '').trim();
  if (mode === 'subdomain' && domain === '') issues.push({ name: 'PLATFORM_DOMAIN', problem: 'is required when TENANT_MODE is "subdomain"' });
  if (domain !== '' && !isValidPlatformDomain(domain.toLowerCase())) issues.push({ name: 'PLATFORM_DOMAIN', problem: 'must be a bare hostname (no scheme, port, path or wildcard)' });
  for (const h of (env.PLATFORM_EXTRA_HOSTS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)) {
    if (h !== 'localhost' && !HOSTNAME_RE.test(h)) { issues.push({ name: 'PLATFORM_EXTRA_HOSTS', problem: 'contains an entry that is not a bare hostname' }); break; }
  }
  return issues;
}

/**
 * Never throws: an unusable configuration degrades to path mode, which serves no tenant by host at all. checkTenantEnv() is what
 * fails the build, so a bad value is loud at build time and harmless at run time.
 */
export function readTenantConfig(env: TenantEnv): TenantConfig {
  const siteUrl = (env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').trim().replace(/\/+$/, '');
  const domain = (env.PLATFORM_DOMAIN ?? '').trim().toLowerCase();
  const wantsSubdomain = (env.TENANT_MODE ?? '').trim() === 'subdomain';
  const usable = wantsSubdomain && domain !== '' && isValidPlatformDomain(domain);

  const platformHosts = new Set<string>();
  if (usable) {
    platformHosts.add(domain);
    platformHosts.add(`www.${domain}`);
    const siteHost = hostOf(siteUrl);
    if (siteHost) platformHosts.add(siteHost);
    for (const h of (env.PLATFORM_EXTRA_HOSTS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)) platformHosts.add(h);
  }
  return { mode: usable ? 'subdomain' : 'path', platformDomain: usable ? domain : null, siteUrl, platformHosts };
}
