import { describe, expect, it, vi } from 'vitest';
import type { TenantConfig } from '@/lib/tenant/config';
import { makeCompanyResolver, tenantRefFor } from './tenant';

const PATH: TenantConfig = { mode: 'path', platformDomain: null, siteUrl: 'https://app.test', platformHosts: new Set() };
const SUB: TenantConfig = { mode: 'subdomain', platformDomain: 'malaky.app', siteUrl: 'https://malaky.app', platformHosts: new Set(['malaky.app', 'www.malaky.app']) };

describe('tenantRefFor', () => {
  it('path mode: the tenant is the /s/<slug> segment; platform pages have none', () => {
    expect(tenantRefFor('app.test', '/s/nile-bus', PATH)).toEqual({ slug: 'nile-bus' });
    expect(tenantRefFor('app.test', '/s/nile-bus/about', PATH)).toEqual({ slug: 'nile-bus' });
    expect(tenantRefFor('app.test', '/', PATH)).toBeNull();
    expect(tenantRefFor('app.test', '/my-bookings/book/x', PATH)).toBeNull();
  });
  it('path mode: a malformed slug is not a tenant', () => {
    expect(tenantRefFor('app.test', '/s/A_B', PATH)).toBeNull();
    expect(tenantRefFor('app.test', '/s/ab', PATH)).toBeNull();
    expect(tenantRefFor('app.test', '/sx/nile-bus', PATH)).toBeNull();
  });
  it('subdomain mode: the HOST decides, the path is ignored', () => {
    expect(tenantRefFor('nile-bus.malaky.app', '/', SUB)).toEqual({ slug: 'nile-bus' });
    expect(tenantRefFor('nile-bus.malaky.app', '/s/other-co', SUB)).toEqual({ slug: 'nile-bus' });   // a forged path cannot pick another tenant
    expect(tenantRefFor('malaky.app', '/s/nile-bus', SUB)).toBeNull();                                // platform host has no tenant
    expect(tenantRefFor('www.nile.com', '/', SUB)).toEqual({ hostname: 'www.nile.com' });             // custom domain: needs a lookup
    expect(tenantRefFor(null, '/', SUB)).toBeNull();
  });
});

describe('makeCompanyResolver', () => {
  const live = () => ({ bySlug: vi.fn(async (s: string) => (s === 'nile-bus' ? { companyId: 'c-1' } : null)), byHost: vi.fn(async (h: string) => (h === 'www.nile.com' ? { ok: true as const, slug: 'nile-bus' } : { ok: true as const, slug: null })) });
  it('no tenant: records without a company and asks nothing', async () => {
    const d = live();
    expect(await makeCompanyResolver(d)(null)).toEqual({ ok: true, companyId: null });
    expect(d.bySlug).not.toHaveBeenCalled();
  });
  it('slug and custom host both end at the same company', async () => {
    const r = makeCompanyResolver(live());
    expect(await r({ slug: 'nile-bus' })).toEqual({ ok: true, companyId: 'c-1' });
    expect(await r({ hostname: 'www.nile.com' })).toEqual({ ok: true, companyId: 'c-1' });
  });
  it('an unknown or suspended tenant drops the event instead of recording it as platform-level', async () => {
    const r = makeCompanyResolver(live());
    expect(await r({ slug: 'ghost-co' })).toEqual({ ok: false });
    expect(await r({ hostname: 'www.unknown.com' })).toEqual({ ok: false });
  });
  it('fails closed on an outage and caches nothing, so the next call tries again', async () => {
    const d = live();
    d.bySlug.mockRejectedValueOnce(new Error('db down'));
    const r = makeCompanyResolver(d);
    expect(await r({ slug: 'nile-bus' })).toEqual({ ok: false });
    expect(await r({ slug: 'nile-bus' })).toEqual({ ok: true, companyId: 'c-1' });
    const e = live();
    e.byHost.mockResolvedValueOnce({ ok: false } as never);
    const r2 = makeCompanyResolver(e);
    expect(await r2({ hostname: 'www.nile.com' })).toEqual({ ok: false });
    expect(await r2({ hostname: 'www.nile.com' })).toEqual({ ok: true, companyId: 'c-1' });
  });
  it('keeps answers for the TTL (hits and misses), then asks again', async () => {
    let t = 0;
    const d = { ...live(), now: () => t };
    const r = makeCompanyResolver(d, { ttlMs: 1000 });
    await r({ slug: 'nile-bus' }); await r({ slug: 'nile-bus' }); await r({ slug: 'ghost-co' }); await r({ slug: 'ghost-co' });
    expect(d.bySlug).toHaveBeenCalledTimes(2);
    t = 1001;
    await r({ slug: 'nile-bus' });
    expect(d.bySlug).toHaveBeenCalledTimes(3);
  });
  it('is bounded: the cache never grows past its limit', async () => {
    const d = { bySlug: vi.fn(async () => ({ companyId: 'c' })), byHost: vi.fn() };
    const r = makeCompanyResolver(d as never, { max: 2 });
    for (const s of ['aaa', 'bbb', 'ccc']) await r({ slug: s });
    await r({ slug: 'aaa' });                                   // evicted, so it is looked up again
    expect(d.bySlug).toHaveBeenCalledTimes(4);
  });
});
