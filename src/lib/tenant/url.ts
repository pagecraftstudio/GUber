import type { TenantConfig } from './config';
import { isSlug } from './host';

/**
 * THE ONLY place that knows how a tenant URL looks. No other code builds '/s/<slug>' or '<slug>.<domain>' by hand, so the
 * switch from path mode to a bought domain is configuration, not a code search.
 */
function ensurePath(path: string): string {
  if (!path.startsWith('/') || path.startsWith('//')) throw new Error('tenant path must start with a single "/"');
  return path;
}

/** Absolute URL of a page on a tenant's site. */
export function tenantUrl(cfg: TenantConfig, slug: string, path = '/'): string {
  if (!isSlug(slug)) throw new Error('invalid tenant slug');
  const p = ensurePath(path);
  if (cfg.mode === 'path') return `${cfg.siteUrl}/s/${slug}${p === '/' ? '' : p}`;
  const site = new URL(cfg.siteUrl);
  return `${site.protocol}//${slug}.${cfg.platformDomain}${site.port ? `:${site.port}` : ''}${p}`;
}

/**
 * Link target to use INSIDE a tenant site (relative, so it keeps the visitor on the host they are on):
 * '/s/<slug>/trips' in path mode, '/trips' in subdomain mode.
 */
export function tenantHref(cfg: TenantConfig, slug: string, path = '/'): string {
  if (!isSlug(slug)) throw new Error('invalid tenant slug');
  const p = ensurePath(path);
  return cfg.mode === 'path' ? `/s/${slug}${p === '/' ? '' : p}` : p;
}

/** Absolute URL of a platform page (login, dashboard, ...). */
export function platformUrl(cfg: TenantConfig, path = '/'): string {
  return `${cfg.siteUrl}${ensurePath(path)}`;
}
