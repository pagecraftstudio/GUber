import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

let sessionCalls = 0;
vi.mock('@/lib/supabase/proxy', () => ({
  updateSession: async () => { sessionCalls += 1; return { response: NextResponse.next(), user: null }; },
}));

const SUB_ENV = { TENANT_MODE: 'subdomain', PLATFORM_DOMAIN: 'malaky.app', NEXT_PUBLIC_SITE_URL: 'https://malaky.app', NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'k'.repeat(30) };

async function run(url: string, env: Record<string, string> = {}, headers: Record<string, string> = {}, rpc?: () => Response | Promise<Response>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  const fetchSpy = vi.fn(async () => (rpc ? rpc() : new Response('[]')));
  vi.stubGlobal('fetch', fetchSpy);
  const { proxy } = await import('./proxy');
  const res = await proxy(new NextRequest(url, { headers }));
  return { res, fetchSpy, rewrite: res.headers.get('x-middleware-rewrite'), location: res.headers.get('location') };
}

beforeEach(() => { sessionCalls = 0; });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('proxy: path mode (default) is untouched', () => {
  it('/s/<slug> is an ordinary public page: no redirect, no rewrite, session refresh as for any page', async () => {
    const r = await run('https://guber-six.vercel.app/s/company-a/trips');
    expect(r.res.status).toBe(200);
    expect(r.rewrite).toBeNull();
    expect(r.location).toBeNull();
    expect(sessionCalls).toBe(1);
    expect(r.fetchSpy).not.toHaveBeenCalled();
  });
  it('any Host is just the platform: nothing is resolved, nothing is rewritten', async () => {
    const r = await run('https://evil.com/', {}, { host: 'evil.com' });
    expect(r.rewrite).toBeNull();
    expect(r.fetchSpy).not.toHaveBeenCalled();
  });
  it('a broken subdomain configuration falls back to path mode instead of breaking the site', async () => {
    const r = await run('https://x.test/dashboard', { TENANT_MODE: 'subdomain' }, { host: 'x.test' });
    expect(r.location).toContain('/company/login');     // normal platform behaviour
  });
});

describe('proxy: forged tenant headers', () => {
  it('x-tenant-* request headers are removed before anything downstream can read them', async () => {
    vi.resetModules();
    const { proxy } = await import('./proxy');
    const req = new NextRequest('https://guber-six.vercel.app/', { headers: { 'x-tenant-slug': 'company-b', 'X-Tenant-Id': 'x', 'x-other': 'keep' } });
    await proxy(req);
    expect(req.headers.get('x-tenant-slug')).toBeNull();
    expect(req.headers.get('x-tenant-id')).toBeNull();
    expect(req.headers.get('x-other')).toBe('keep');
  });
  it('also on a tenant host that is rewritten', async () => {
    vi.resetModules();
    for (const [k, v] of Object.entries(SUB_ENV)) vi.stubEnv(k, v);
    const { proxy } = await import('./proxy');
    const req = new NextRequest('https://company-a.malaky.app/', { headers: { host: 'company-a.malaky.app', 'x-tenant-slug': 'company-b' } });
    await proxy(req);
    expect(req.headers.get('x-tenant-slug')).toBeNull();
  });
});

describe('proxy: subdomain mode', () => {
  const H = (host: string) => ({ host });

  it('<slug>.<domain>/trips is rewritten to /s/<slug>/trips with NO session refresh and NO database call', async () => {
    const r = await run('https://company-a.malaky.app/trips?x=1', SUB_ENV, H('company-a.malaky.app'));
    expect(new URL(r.rewrite!).pathname + new URL(r.rewrite!).search).toBe('/s/company-a/trips?x=1');
    expect(sessionCalls).toBe(0);
    expect(r.fetchSpy).not.toHaveBeenCalled();
    expect(r.res.headers.get('set-cookie')).toBeNull();
  });
  it('the platform host keeps the full platform behaviour (session refresh, login redirect)', async () => {
    const r = await run('https://malaky.app/dashboard', SUB_ENV, H('malaky.app'));
    expect(sessionCalls).toBe(1);
    expect(new URL(r.location!).pathname).toBe('/company/login');
  });
  it('a staff area on a tenant host goes to the platform host, never rendered on the tenant host', async () => {
    const r = await run('https://company-a.malaky.app/dashboard/trips?a=1', SUB_ENV, H('company-a.malaky.app'));
    expect(r.res.status).toBe(308);
    expect(r.location).toBe('https://malaky.app/dashboard/trips?a=1');
    expect(sessionCalls).toBe(0);
  });
  it('the retired /s/<slug> form on the platform host is a 308 to the tenant host', async () => {
    const r = await run('https://malaky.app/s/company-a/trips', SUB_ENV, H('malaky.app'));
    expect(r.res.status).toBe(308);
    expect(r.location).toBe('https://company-a.malaky.app/trips');
  });
  it('/s/<other> on a tenant host is a bare 404 (cannot read another tenant through your own host)', async () => {
    const r = await run('https://company-a.malaky.app/s/company-b', SUB_ENV, H('company-a.malaky.app'));
    expect(r.res.status).toBe(404);
    expect(await r.res.text()).toBe('Not found');
  });
  it('staff APIs are 404 on a tenant host; the anonymous public API passes through to the platform handler', async () => {
    expect((await run('https://company-a.malaky.app/api/telemetry', SUB_ENV, H('company-a.malaky.app'))).res.status).toBe(404);
    const ok = await run('https://company-a.malaky.app/api/public/trips', SUB_ENV, H('company-a.malaky.app'));
    expect(ok.res.status).toBe(200);
    expect(ok.rewrite).toBeNull();
    expect(ok.res.headers.get('set-cookie')).toBeNull();
  });
  it('an unusable Host (IP, nested label) is a 404', async () => {
    expect((await run('http://10.0.0.1/', SUB_ENV, H('10.0.0.1'))).res.status).toBe(404);
    expect((await run('https://a.b.malaky.app/', SUB_ENV, H('a.b.malaky.app'))).res.status).toBe(404);
  });
  it('X-Forwarded-Host cannot impersonate a tenant: only Host decides', async () => {
    const r = await run('https://malaky.app/', SUB_ENV, { host: 'malaky.app', 'x-forwarded-host': 'company-a.malaky.app' });
    expect(r.rewrite).toBeNull();
    expect(sessionCalls).toBe(1);
  });
});

describe('proxy: custom domains (subdomain mode)', () => {
  const H = { host: 'www.shop-a.com' };
  it('resolves through the anonymous RPC, then rewrites under the resolved slug', async () => {
    const r = await run('https://www.shop-a.com/trips', SUB_ENV, H, () => new Response(JSON.stringify([{ company_id: 'x', slug: 'company-a', status: 'active' }])));
    expect(r.fetchSpy).toHaveBeenCalledTimes(1);
    expect(new URL(r.rewrite!).pathname).toBe('/s/company-a/trips');
    expect(sessionCalls).toBe(0);
  });
  it('an unknown or not-yet-active hostname is a plain 404 that says nothing', async () => {
    const r = await run('https://www.shop-a.com/', SUB_ENV, H, () => new Response('[]'));
    expect(r.res.status).toBe(404);
    expect(await r.res.text()).toBe('Not found');
  });
  it('FAILS CLOSED: a database error or timeout is a 503, never a guess and never the platform app', async () => {
    const down = await run('https://www.shop-a.com/', SUB_ENV, H, () => new Response('boom', { status: 500 }));
    expect(down.res.status).toBe(503);
    expect(down.res.headers.get('cache-control')).toBe('no-store');
    const thrown = await run('https://www.shop-a.com/', SUB_ENV, H, () => { throw new Error('network'); });
    expect(thrown.res.status).toBe(503);
    expect(sessionCalls).toBe(0);
  });
  it('a staff path on a custom host redirects to the platform host', async () => {
    const r = await run('https://www.shop-a.com/dashboard', SUB_ENV, H, () => new Response(JSON.stringify([{ slug: 'company-a' }])));
    expect(r.location).toBe('https://malaky.app/dashboard');
  });
});
