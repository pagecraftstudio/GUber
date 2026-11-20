import { HOSTNAME_RE, type TenantConfig } from './config';

/** Same rule as companies.slug in the database (0002): 3-40 chars, lowercase, single hyphens between alphanumerics. */
export const SLUG_RE = /^[a-z0-9](-?[a-z0-9])*$/;
export const isSlug = (v: string): boolean => v.length >= 3 && v.length <= 40 && SLUG_RE.test(v);

/**
 * Host header -> bare lowercase hostname, or null when it is not a plausible DNS name.
 * Lowercases, drops ONE numeric port and ONE trailing dot, refuses IPv6 literals, empty labels and anything outside [a-z0-9.-].
 * (An IPv4 address survives this step and is rejected later because a valid hostname's last label must start with a letter.)
 */
export function normalizeHost(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let h = raw.trim().toLowerCase();
  if (h.startsWith('[')) return null;
  const colon = h.indexOf(':');
  if (colon !== -1) {
    if (!/^:\d{1,5}$/.test(h.slice(colon))) return null;
    h = h.slice(0, colon);
  }
  if (h.endsWith('.')) h = h.slice(0, -1);
  if (h === '' || h.length > 253 || h.startsWith('.') || h.endsWith('.') || h.includes('..') || !/^[a-z0-9.-]+$/.test(h)) return null;
  return h;
}

export type HostKind =
  | { kind: 'platform' }
  | { kind: 'tenant'; slug: string }          // <slug>.PLATFORM_DOMAIN
  | { kind: 'custom'; hostname: string }      // any other valid hostname: must be resolved through the database
  | { kind: 'invalid' };

/** Path mode has no host-based tenants: every host is the platform. Pure; no database access. */
export function classifyHost(host: string | null, cfg: TenantConfig): HostKind {
  if (cfg.mode === 'path') return { kind: 'platform' };
  if (host === null) return { kind: 'invalid' };
  if (cfg.platformHosts.has(host)) return { kind: 'platform' };

  const suffix = `.${cfg.platformDomain}`;
  if (host.endsWith(suffix)) {
    const label = host.slice(0, -suffix.length);
    return isSlug(label) ? { kind: 'tenant', slug: label } : { kind: 'invalid' };     // nested labels ("a.b.domain") and bad slugs
  }
  return HOSTNAME_RE.test(host) && !/(^|\.)xn--/.test(host) ? { kind: 'custom', hostname: host } : { kind: 'invalid' };
}
