import { describe, expect, it } from 'vitest';
import { checkTenantEnv, readTenantConfig, type TenantConfig } from './config';
import { classifyHost, isSlug, normalizeHost } from './host';
import { decideTenantRoute } from './route';
import { tenantHref, tenantUrl, platformUrl } from './url';
import { buildTenantHeaders } from './headers';
import { resolveCustomHost } from './resolve-custom';

const path = readTenantConfig({ NEXT_PUBLIC_SITE_URL: 'https://guber-six.vercel.app' });
const sub = readTenantConfig({ TENANT_MODE: 'subdomain', PLATFORM_DOMAIN: 'Malaky.App', NEXT_PUBLIC_SITE_URL: 'https://malaky.app/', PLATFORM_EXTRA_HOSTS: 'guber-six.vercel.app, localhost' });
const local = readTenantConfig({ TENANT_MODE: 'subdomain', PLATFORM_DOMAIN: 'localtest.me', NEXT_PUBLIC_SITE_URL: 'http://localtest.me:3000' });

describe('config', () => {
  it('defaults to path mode and trims the site url', () => {
    expect(path.mode).toBe('path');
    expect(path.platformDomain).toBeNull();
    expect(readTenantConfig({ NEXT_PUBLIC_SITE_URL: 'https://x.test///' }).siteUrl).toBe('https://x.test');
  });
  it('subdomain mode lowercases the domain and lists the platform hosts', () => {
    expect(sub.mode).toBe('subdomain');
    expect(sub.platformDomain).toBe('malaky.app');
    expect([...sub.platformHosts].sort()).toEqual(['guber-six.vercel.app', 'localhost', 'malaky.app', 'www.malaky.app']);
  });
  it('an unusable subdomain configuration degrades to path mode (serves no tenant by host), never throws', () => {
    expect(readTenantConfig({ TENANT_MODE: 'subdomain' }).mode).toBe('path');
    expect(readTenantConfig({ TENANT_MODE: 'subdomain', PLATFORM_DOMAIN: 'https://bad/' }).mode).toBe('path');
    expect(readTenantConfig({ TENANT_MODE: 'weird', PLATFORM_DOMAIN: 'malaky.app' }).mode).toBe('path');
  });
  it('validation names the variable and the kind of problem, never the value', () => {
    expect(checkTenantEnv({})).toEqual([]);
    expect(checkTenantEnv({ TENANT_MODE: 'path' })).toEqual([]);
    expect(checkTenantEnv({ TENANT_MODE: 'subdomain' })).toEqual([{ name: 'PLATFORM_DOMAIN', problem: 'is required when TENANT_MODE is "subdomain"' }]);
    expect(checkTenantEnv({ TENANT_MODE: 'x' }).map((i) => i.name)).toEqual(['TENANT_MODE']);
    for (const bad of ['https://malaky.app', 'malaky.app:3000', '*.malaky.app', 'malaky.app/x', 'a..b.com', 'xn--e1afmkfd.com']) {
      const issues = checkTenantEnv({ TENANT_MODE: 'subdomain', PLATFORM_DOMAIN: bad });
      expect(issues.map((i) => i.name), bad).toEqual(['PLATFORM_DOMAIN']);
      expect(JSON.stringify(issues)).not.toContain(bad);
    }
    expect(checkTenantEnv({ PLATFORM_EXTRA_HOSTS: 'ok.vercel.app,not a host' }).map((i) => i.name)).toEqual(['PLATFORM_EXTRA_HOSTS']);
    expect(checkTenantEnv({ TENANT_MODE: 'subdomain', PLATFORM_DOMAIN: 'localhost' })).toEqual([]);
  });
});

describe('normalizeHost', () => {
  it('lowercases, drops one port and one trailing dot', () => {
    expect(normalizeHost('WWW.Shop-A.com')).toBe('www.shop-a.com');
    expect(normalizeHost('a.test:3000')).toBe('a.test');
    expect(normalizeHost('a.test.')).toBe('a.test');
    expect(normalizeHost(' a.test ')).toBe('a.test');
  });
  it('refuses anything that is not a plausible DNS name', () => {
    for (const bad of [null, undefined, '', '  ', '[::1]', '[::1]:3000', 'a..b', 'a.test:abc', 'a.test:1:2', 'a b.test', 'a_b.test', 'a.test/x', 'a@b.test', '*.a.test', 'a.test..', 'é.test', 'a.test:123456']) {
      expect(normalizeHost(bad as string | null | undefined), String(bad)).toBeNull();
    }
    expect(normalizeHost(`${'a'.repeat(250)}.com`)).toBeNull();
  });
});

describe('isSlug (mirrors companies.slug)', () => {
  it('accepts 3-40 lowercase alphanumerics with single hyphens', () => {
    for (const ok of ['abc', 'company-a', 'a1b', 'x'.repeat(40)]) expect(isSlug(ok), ok).toBe(true);
    for (const bad of ['ab', 'x'.repeat(41), '-abc', 'abc-', 'a--b', 'ABC', 'a_b', 'a.b', 'a b', '']) expect(isSlug(bad), bad).toBe(false);
  });
});

describe('classifyHost', () => {
  it('path mode has no host-based tenants: every host is the platform, even a hostile one', () => {
    for (const h of ['guber-six.vercel.app', 'evil.com', null, '10.0.0.1']) expect(classifyHost(h, path)).toEqual({ kind: 'platform' });
  });
  it('subdomain mode', () => {
    expect(classifyHost('malaky.app', sub)).toEqual({ kind: 'platform' });
    expect(classifyHost('www.malaky.app', sub)).toEqual({ kind: 'platform' });
    expect(classifyHost('guber-six.vercel.app', sub)).toEqual({ kind: 'platform' });
    expect(classifyHost('localhost', sub)).toEqual({ kind: 'platform' });
    expect(classifyHost('company-a.malaky.app', sub)).toEqual({ kind: 'tenant', slug: 'company-a' });
    expect(classifyHost('www.shop-a.com', sub)).toEqual({ kind: 'custom', hostname: 'www.shop-a.com' });
  });
  it('rejects look-alikes and malformed hosts', () => {
    for (const h of ['a.b.malaky.app', 'ab.malaky.app', '-x-.malaky.app', 'evilmalaky.app.evil.com.', '10.0.0.1', 'localhost2', 'xn--e1afmkfd.com', null]) {
      const k = classifyHost(h, sub).kind;
      expect(k === 'invalid' || (k === 'custom' && h === 'evilmalaky.app.evil.com.'), String(h)).toBe(true);
    }
    expect(classifyHost('notmalaky.app', sub)).toEqual({ kind: 'custom', hostname: 'notmalaky.app' });          // not a tenant of malaky.app
    expect(classifyHost('malaky.app.evil.com', sub)).toEqual({ kind: 'custom', hostname: 'malaky.app.evil.com' });
  });
});

describe('tenantUrl / tenantHref / platformUrl (the only place URLs are built)', () => {
  it('path mode', () => {
    expect(tenantUrl(path, 'company-a')).toBe('https://guber-six.vercel.app/s/company-a');
    expect(tenantUrl(path, 'company-a', '/trips?x=1')).toBe('https://guber-six.vercel.app/s/company-a/trips?x=1');
    expect(tenantHref(path, 'company-a')).toBe('/s/company-a');
    expect(tenantHref(path, 'company-a', '/trips')).toBe('/s/company-a/trips');
    expect(platformUrl(path, '/login')).toBe('https://guber-six.vercel.app/login');
  });
  it('subdomain mode keeps protocol and port of the site url', () => {
    expect(tenantUrl(sub, 'company-a', '/trips')).toBe('https://company-a.malaky.app/trips');
    expect(tenantUrl(sub, 'company-a')).toBe('https://company-a.malaky.app/');
    expect(tenantUrl(local, 'company-a', '/x')).toBe('http://company-a.localtest.me:3000/x');
    expect(tenantHref(sub, 'company-a', '/trips')).toBe('/trips');
    expect(tenantHref(sub, 'company-a')).toBe('/');
    expect(platformUrl(sub, '/dashboard')).toBe('https://malaky.app/dashboard');
  });
  it('refuses a slug or path that could build a hostile URL', () => {
    for (const bad of ['', 'a', 'evil.com', 'a/b', 'A B', 'x@y.com', '../x']) expect(() => tenantUrl(sub, bad), bad).toThrow();
    for (const bad of ['trips', '//evil.com', 'https://evil.com']) expect(() => tenantUrl(sub, 'company-a', bad), bad).toThrow();
    expect(() => tenantHref(path, 'company-a', '//evil.com')).toThrow();
  });
});

const dec = (cfg: TenantConfig, host: string | null, pathname: string, search = '', resolved?: string) => decideTenantRoute({ host, pathname, search }, cfg, resolved);

describe('decideTenantRoute: path mode', () => {
  it('never touches anything (the platform behaves exactly as before)', () => {
    for (const p of ['/', '/dashboard', '/s/company-a', '/s/company-a/trips', '/api/health']) expect(dec(path, 'evil.com', p), p).toEqual({ action: 'pass' });
  });
});

describe('decideTenantRoute: subdomain mode, platform host', () => {
  it('passes the platform app through', () => {
    for (const p of ['/', '/dashboard', '/login', '/admin/companies', '/api/health']) expect(dec(sub, 'malaky.app', p), p).toEqual({ action: 'pass' });
  });
  it('retires the path form with a permanent redirect to the real host, keeping path and query', () => {
    expect(dec(sub, 'malaky.app', '/s/company-a')).toEqual({ action: 'redirect', location: 'https://company-a.malaky.app/' });
    expect(dec(sub, 'malaky.app', '/s/company-a/trips', '?d=1')).toEqual({ action: 'redirect', location: 'https://company-a.malaky.app/trips?d=1' });
  });
  it('an invalid slug in the retired path form is a 404, not a redirect to a made-up host', () => {
    for (const p of ['/s', '/s/', '/s/A', '/s/evil.com/x', '/s/a b']) expect(dec(sub, 'malaky.app', p), p).toEqual({ action: 'not-found' });
  });
  it('an unusable host is a 404', () => {
    for (const h of ['10.0.0.1', null, 'a.b.malaky.app', '-.malaky.app']) expect(dec(sub, h, '/'), String(h)).toEqual({ action: 'not-found' });
  });
});

describe('decideTenantRoute: subdomain mode, tenant host', () => {
  const host = 'company-a.malaky.app';
  it('rewrites every ordinary path under /s/<slug>', () => {
    expect(dec(sub, host, '/')).toEqual({ action: 'rewrite', slug: 'company-a', pathname: '/s/company-a' });
    expect(dec(sub, host, '/trips')).toEqual({ action: 'rewrite', slug: 'company-a', pathname: '/s/company-a/trips' });
    expect(dec(sub, host, '/robots.txt')).toEqual({ action: 'rewrite', slug: 'company-a', pathname: '/s/company-a/robots.txt' });
  });
  it('platform areas redirect to the platform host (path and query kept)', () => {
    expect(dec(sub, host, '/dashboard/trips', '?a=1')).toEqual({ action: 'redirect', location: 'https://malaky.app/dashboard/trips?a=1' });
    for (const p of ['/admin', '/driver', '/staff', '/login', '/company/login', '/my-bookings', '/auth/confirm', '/app/x']) {
      expect(dec(sub, host, p), p).toMatchObject({ action: 'redirect' });
    }
  });
  it('the redirect target is always the configured platform host, whatever the request says', () => {
    for (const h of [host, 'www.shop-a.com']) {
      const d = dec(sub, h, '/dashboard', '', 'company-a');
      expect(d).toEqual({ action: 'redirect', location: 'https://malaky.app/dashboard' });
    }
  });
  it('the internal /s prefix is not public on a tenant host (no /s/other-company, no /s/x/s/y)', () => {
    for (const p of ['/s', '/s/', '/s/company-b', '/s/company-b/trips']) expect(dec(sub, host, p), p).toEqual({ action: 'not-found' });
  });
  it('only anonymous public data and the CSP sink are reachable under /api', () => {
    expect(dec(sub, host, '/api/public/trips')).toEqual({ action: 'pass' });
    expect(dec(sub, host, '/api/csp-report')).toEqual({ action: 'pass' });
    expect(dec(sub, host, '/api/track')).toEqual({ action: 'pass' });               // analytics ingest (P10): same-origin, consent-gated, tenant from the host
    for (const p of ['/api/health', '/api/telemetry', '/api', '/api/publicx', '/api/trackx', '/api/admin/x']) expect(dec(sub, host, p), p).toEqual({ action: 'not-found' });
  });
  it('a prefix lookalike is NOT treated as a platform area (it is just a tenant page)', () => {
    expect(dec(sub, host, '/dashboards')).toEqual({ action: 'rewrite', slug: 'company-a', pathname: '/s/company-a/dashboards' });
    expect(dec(sub, host, '/administrator')).toMatchObject({ action: 'rewrite' });
  });
  it('even a path that is not in the redirect list can only ever land UNDER the tenant prefix', () => {
    for (const p of ['/some/new/staff/page', '/..%2fdashboard', '/%2e%2e/admin', '//evil.com', '/\\evil.com']) {
      const d = dec(sub, host, p);
      expect(d.action === 'rewrite' ? d.pathname.startsWith('/s/company-a') : true, p).toBe(true);
    }
  });
});

describe('decideTenantRoute: custom host', () => {
  it('asks for resolution first, then behaves like a tenant host for the resolved slug', () => {
    expect(dec(sub, 'www.shop-a.com', '/trips')).toEqual({ action: 'resolve-custom', hostname: 'www.shop-a.com' });
    expect(dec(sub, 'www.shop-a.com', '/trips', '', 'company-a')).toEqual({ action: 'rewrite', slug: 'company-a', pathname: '/s/company-a/trips' });
    expect(dec(sub, 'www.shop-a.com', '/s/company-b', '', 'company-a')).toEqual({ action: 'not-found' });
  });
  it('a resolved slug that is not a valid slug is refused (defence in depth against a bad upstream answer)', () => {
    expect(dec(sub, 'www.shop-a.com', '/', '', 'Bad Slug')).toEqual({ action: 'not-found' });
  });
});

describe('buildTenantHeaders', () => {
  it('path mode: noindex for every /s/* response', () => {
    expect(buildTenantHeaders(path)).toEqual([{ source: '/s/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] }]);
  });
  it('subdomain mode: tenant sites are indexable, nothing is added', () => {
    expect(buildTenantHeaders(sub)).toEqual([]);
  });
});

describe('resolveCustomHost (fail closed)', () => {
  const o = { supabaseUrl: 'https://abc.supabase.co/', publishableKey: 'k'.repeat(30) };
  const json = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })) as unknown as typeof fetch;

  it('returns the slug of an active domain and calls only the anonymous RPC', async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const f = (async (url: string, init: RequestInit) => { seen = { url, init }; return new Response(JSON.stringify([{ company_id: 'x', slug: 'company-a', status: 'active' }])); }) as unknown as typeof fetch;
    expect(await resolveCustomHost('www.shop-a.com', { ...o, fetchImpl: f })).toEqual({ ok: true, slug: 'company-a' });
    expect(seen!.url).toBe('https://abc.supabase.co/rest/v1/rpc/resolve_tenant');
    expect(JSON.parse(seen!.init.body as string)).toEqual({ p_hostname: 'www.shop-a.com' });
    expect((seen!.init.headers as Record<string, string>).apikey).toBe(o.publishableKey);
    expect(Object.keys(seen!.init.headers as object).map((k) => k.toLowerCase())).not.toContain('authorization');
  });
  it('unknown host is ok:true with null (a clean 404), not an error', async () => {
    expect(await resolveCustomHost('x.shop-a.com', { ...o, fetchImpl: json([]) })).toEqual({ ok: true, slug: null });
  });
  it('every failure mode is ok:false (the proxy answers 503, never a guess)', async () => {
    expect(await resolveCustomHost('h.com', { ...o, fetchImpl: json({ message: 'boom' }, 500) })).toEqual({ ok: false });
    expect(await resolveCustomHost('h.com', { ...o, fetchImpl: json({ not: 'an array' }) })).toEqual({ ok: false });
    expect(await resolveCustomHost('h.com', { ...o, fetchImpl: json([{ slug: 'Not A Slug' }]) })).toEqual({ ok: false });
    expect(await resolveCustomHost('h.com', { ...o, fetchImpl: json([{ company_id: 'x' }]) })).toEqual({ ok: false });
    expect(await resolveCustomHost('h.com', { ...o, fetchImpl: (async () => { throw new Error('network'); }) as unknown as typeof fetch })).toEqual({ ok: false });
    const hang = ((_: string, init: RequestInit) => new Promise((_res, rej) => init.signal!.addEventListener('abort', () => rej(new Error('aborted'))))) as unknown as typeof fetch;
    expect(await resolveCustomHost('h.com', { ...o, fetchImpl: hang, timeoutMs: 20 })).toEqual({ ok: false });
  });
});
