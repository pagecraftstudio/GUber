import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { browserStore, clearManifest, loadManifest, MANIFEST_CACHE_KEY, MANIFEST_CACHE_MAX_AGE_MS, saveManifest, type CacheStore } from './manifest-cache';
import type { ManifestPassenger } from './driverScreensApi';

const root = path.resolve(__dirname, '../../..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');
const ARABIC = /[\u0600-\u06FF]/;

describe('driver web manifest', () => {
  const m = JSON.parse(read('public/driver.webmanifest'));
  it('is installable: standalone, start_url inside scope, Arabic RTL, theme colours', () => {
    expect(m.display).toBe('standalone');
    expect(m.scope).toBe('/driver');
    expect(m.start_url).toBe('/driver');
    expect(m.start_url === m.scope || m.start_url.startsWith(`${m.scope}/`)).toBe(true);
    expect(m.lang).toBe('ar'); expect(m.dir).toBe('rtl');
    expect(m.name).toMatch(ARABIC); expect(m.short_name).toMatch(ARABIC);
    expect(m.short_name.length).toBeLessThanOrEqual(12);
    expect(m.theme_color).toMatch(/^#[0-9A-Fa-f]{6}$/); expect(m.background_color).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });
  it('has 192 and 512 icons, plus maskable ones, and every icon file exists', () => {
    const sizes = (p: string) => m.icons.filter((i: { purpose: string }) => i.purpose === p).map((i: { sizes: string }) => i.sizes).sort();
    expect(sizes('any')).toEqual(['192x192', '512x512']);
    expect(sizes('maskable')).toEqual(['192x192', '512x512']);
    for (const i of m.icons) expect(fs.existsSync(path.join(root, 'public', i.src)), i.src).toBe(true);
  });
  it('every shortcut stays inside the driver scope; nothing points off-site', () => {
    for (const s of m.shortcuts) expect(s.url === '/driver' || s.url.startsWith('/driver/'), s.url).toBe(true);
    expect(JSON.stringify(m)).not.toMatch(/https?:\/\//);
  });
});

describe('offline page', () => {
  const html = read('public/driver-offline.html');
  it('is static, shows both languages, runs no script and loads nothing from the network', () => {
    expect(html).toContain('lang="ar"'); expect(html).toContain('lang="en"');
    expect(html).toMatch(ARABIC);
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/(src|href)="https?:/i);
    expect(html).toContain('href="/driver"');
  });
});

// ---- the service worker, run in a sandbox with fake caches and a fake network ----
type Handler = (e: Record<string, unknown>) => void;
function boot(opts: { network?: 'ok' | 'down'; existingCaches?: string[] } = {}) {
  const handlers: Record<string, Handler> = {};
  const store = new Map<string, Map<string, unknown>>();
  for (const n of opts.existingCaches ?? []) store.set(n, new Map());
  const puts: string[] = []; const deleted: string[] = []; let claimed = false;
  const mkCache = (name: string) => {
    if (!store.has(name)) store.set(name, new Map());
    const c = store.get(name)!;
    return {
      addAll: async (urls: string[]) => { for (const u of urls) c.set(u, { fromPrecache: u }); },
      match: async (req: string | { url: string }) => c.get(typeof req === 'string' ? req : new URL(req.url).pathname),
      put: async (req: { url: string }, res: unknown) => { const k = new URL(req.url).pathname; puts.push(k); c.set(k, res); },
    };
  };
  const caches = {
    open: async (n: string) => mkCache(n),
    keys: async () => [...store.keys()],
    delete: async (n: string) => { deleted.push(n); return store.delete(n); },
    match: async (req: string) => { for (const c of store.values()) { const h = c.get(req); if (h) return h; } return undefined; },
  };
  const fetched: string[] = [];
  const fetchFn = async (req: { url: string }) => {
    fetched.push(new URL(req.url).pathname);
    if (opts.network === 'down') throw new TypeError('Failed to fetch');
    return { status: 200, type: 'basic', ok: true, clone() { return this; }, body: 'network:' + req.url };
  };
  const self = { location: { origin: 'https://app.test' }, addEventListener: (t: string, h: Handler) => { handlers[t] = h; }, clients: { claim: async () => { claimed = true; } } };
  vm.runInNewContext(read('public/driver-sw.js'), { self, caches, fetch: fetchFn, URL, TypeError, Promise });
  const waits: Promise<unknown>[] = [];
  const lifecycle = async (type: 'install' | 'activate') => { handlers[type]!({ waitUntil: (p: Promise<unknown>) => waits.push(p) }); await Promise.all(waits); };
  const request = (url: string, init: { method?: string; mode?: string } = {}) => ({ url, method: init.method ?? 'GET', mode: init.mode ?? 'cors' });
  /** returns undefined when the worker did NOT take the request (the browser handles it itself) */
  const fire = async (req: ReturnType<typeof request>) => {
    let answer: Promise<unknown> | undefined;
    handlers.fetch!({ request: req, respondWith: (p: Promise<unknown>) => { answer = p; } });
    return answer === undefined ? undefined : await answer;
  };
  return { lifecycle, fire, request, store, puts, deleted, fetched, claimed: () => claimed };
}

describe('driver service worker', () => {
  it('install precaches the offline page and the app icons only', async () => {
    const w = boot(); await w.lifecycle('install');
    expect([...w.store.get('driver-static-v1')!.keys()].sort()).toEqual(['/brand/icons/icon-192.png', '/brand/icons/icon-512.png', '/driver-offline.html']);
  });
  it('activate deletes older driver caches, keeps the current one and other apps\' caches, and claims clients', async () => {
    const w = boot({ existingCaches: ['driver-static-v0', 'driver-old-thing', 'other-app-cache'] });
    await w.lifecycle('install'); await w.lifecycle('activate');
    expect(w.deleted.sort()).toEqual(['driver-old-thing', 'driver-static-v0']);
    expect(w.store.has('driver-static-v1')).toBe(true); expect(w.store.has('other-app-cache')).toBe(true);
    expect(w.claimed()).toBe(true);
  });
  it('a navigation inside /driver goes to the network and is NEVER stored', async () => {
    const w = boot(); await w.lifecycle('install');
    const res = await w.fire(w.request('https://app.test/driver/trips/abc', { mode: 'navigate' })) as { body: string };
    expect(res.body).toContain('network:'); expect(w.puts).toEqual([]);
  });
  it('a navigation inside /driver with no network gets the offline page', async () => {
    const w = boot({ network: 'down' }); await w.lifecycle('install');
    expect(await w.fire(w.request('https://app.test/driver', { mode: 'navigate' }))).toEqual({ fromPrecache: '/driver-offline.html' });
  });
  it('a server error page is shown as it is: only "no network" becomes the offline page', async () => {
    const w = boot(); await w.lifecycle('install');
    expect(((await w.fire(w.request('https://app.test/driver', { mode: 'navigate' }))) as { status: number }).status).toBe(200);
  });
  it('hashed build files are served cache-first and stored once', async () => {
    const w = boot(); await w.lifecycle('install');
    const url = 'https://app.test/_next/static/chunks/app-123.js';
    await w.fire(w.request(url)); await w.fire(w.request(url));
    expect(w.fetched.filter((p) => p.includes('app-123'))).toHaveLength(1);
    expect(w.puts).toEqual(['/_next/static/chunks/app-123.js']);
  });
  it('never stores a partial, an error or a non-basic response', async () => {
    for (const bad of [{ status: 206, type: 'basic' }, { status: 500, type: 'basic' }, { status: 200, type: 'opaque' }]) {
      const handlers: Record<string, Handler> = {}; const puts: string[] = [];
      const cache = { match: async () => undefined, put: async (r: { url: string }) => { puts.push(r.url); }, addAll: async () => undefined };
      const self = { location: { origin: 'https://app.test' }, addEventListener: (t: string, h: Handler) => { handlers[t] = h; }, clients: { claim: async () => undefined } };
      vm.runInNewContext(read('public/driver-sw.js'), { self, caches: { open: async () => cache, keys: async () => [], delete: async () => true, match: async () => undefined }, fetch: async () => ({ ...bad, clone() { return this; } }), URL, Promise });
      let p: Promise<unknown> | undefined;
      handlers.fetch!({ request: { url: 'https://app.test/_next/static/x.js', method: 'GET', mode: 'cors' }, respondWith: (a: Promise<unknown>) => { p = a; } });
      await p; expect(puts, JSON.stringify(bad)).toEqual([]);
    }
  });
  it('does NOT handle: non-GET, cross-origin (Supabase), the app\'s API, RSC data, other pages, or pages outside /driver', async () => {
    const w = boot(); await w.lifecycle('install');
    const untouched = [
      w.request('https://app.test/driver/trips/abc', { method: 'POST', mode: 'cors' }),
      w.request('https://abc.supabase.co/rest/v1/rpc/driver_trip_manifest'),
      w.request('https://app.test/api/anything'),
      w.request('https://app.test/driver/trips/abc?_rsc=1x2y'),
      w.request('https://app.test/dashboard', { mode: 'navigate' }),
      w.request('https://app.test/driver-sw.js'),
      w.request('https://app.test/driverx', { mode: 'navigate' }),
    ];
    for (const r of untouched) expect(await w.fire(r), r.url).toBeUndefined();
    expect(w.fetched).toEqual([]);
  });
});

// ---- the offline passenger list ----
const mem = (): CacheStore & { raw: Map<string, string> } => {
  const raw = new Map<string, string>();
  return { raw, getItem: (k) => raw.get(k) ?? null, setItem: (k, v) => { raw.set(k, v); }, removeItem: (k) => { raw.delete(k); } };
};
const row = (over: Partial<ManifestPassenger> = {}): ManifestPassenger => ({ booking_id: 'b1', reference: 'BK-1', passenger_name: 'Karim', seats: 2, seats_boarded: 1, is_subscriber: false, pickup_stop: 'Maadi', dropoff_stop: null, ...over });
const header = { origin_name: 'Cairo', destination_name: 'Alexandria', departure_at: '2026-11-09T06:00:00Z', arrival_at: '2026-11-09T09:00:00Z', status: 'in_progress' };
const NOW = Date.parse('2026-11-09T07:00:00Z');

describe('offline passenger list (manifest-cache)', () => {
  it('round-trips for the same user and trip', () => {
    const s = mem(); saveManifest(s, { tripId: 't1', userId: 'u1', trip: header, rows: [row()] }, NOW);
    expect(loadManifest(s, 't1', 'u1', NOW + 60_000)).toMatchObject({ tripId: 't1', rows: [row()], trip: header, savedAt: new Date(NOW).toISOString() });
  });
  it('another user, or another trip, never reads it (and it is not deleted for them)', () => {
    const s = mem(); saveManifest(s, { tripId: 't1', userId: 'u1', trip: header, rows: [row()] }, NOW);
    expect(loadManifest(s, 't1', 'u2', NOW)).toBeNull();
    expect(loadManifest(s, 't2', 'u1', NOW)).toBeNull();
    expect(loadManifest(s, 't1', 'u1', NOW)).not.toBeNull();
  });
  it('expires after 12 hours and the entry is removed; a clock in the future is rejected', () => {
    const s = mem(); saveManifest(s, { tripId: 't1', userId: 'u1', trip: header, rows: [row()] }, NOW);
    expect(loadManifest(s, 't1', 'u1', NOW + MANIFEST_CACHE_MAX_AGE_MS - 1)).not.toBeNull();
    expect(loadManifest(s, 't1', 'u1', NOW + MANIFEST_CACHE_MAX_AGE_MS + 1)).toBeNull();
    expect(s.raw.has(MANIFEST_CACHE_KEY)).toBe(false);
    saveManifest(s, { tripId: 't1', userId: 'u1', trip: header, rows: [row()] }, NOW + 3 * 60 * 60 * 1000);
    expect(loadManifest(s, 't1', 'u1', NOW)).toBeNull();
  });
  it('keeps ONE entry: saving another trip replaces the first', () => {
    const s = mem();
    saveManifest(s, { tripId: 't1', userId: 'u1', trip: header, rows: [row()] }, NOW);
    saveManifest(s, { tripId: 't2', userId: 'u1', trip: header, rows: [row({ booking_id: 'b9' })] }, NOW);
    expect(loadManifest(s, 't1', 'u1', NOW)).toBeNull();
    expect(loadManifest(s, 't2', 'u1', NOW)!.rows[0]!.booking_id).toBe('b9');
  });
  it('stores only the fields the screen draws (an unexpected phone/email field is dropped)', () => {
    const s = mem();
    saveManifest(s, { tripId: 't1', userId: 'u1', trip: { ...header, secret: 'x' } as never, rows: [{ ...row(), phone: '+201000000000', email: 'a@b.co' } as never] }, NOW);
    expect(s.raw.get(MANIFEST_CACHE_KEY)).not.toMatch(/phone|email|\+2010|a@b\.co|secret/);
  });
  it('corrupt JSON, wrong shapes and bad rows mean "no copy" and never throw', () => {
    const s = mem();
    s.raw.set(MANIFEST_CACHE_KEY, '{not json'); expect(loadManifest(s, 't1', 'u1', NOW)).toBeNull();
    s.raw.set(MANIFEST_CACHE_KEY, JSON.stringify({ tripId: 't1', userId: 'u1', savedAt: new Date(NOW).toISOString(), rows: 'x' })); expect(loadManifest(s, 't1', 'u1', NOW)).toBeNull();
    s.raw.set(MANIFEST_CACHE_KEY, JSON.stringify({ tripId: 't1', userId: 'u1', savedAt: new Date(NOW).toISOString(), rows: [{ booking_id: 1 }, row()] }));
    expect(loadManifest(s, 't1', 'u1', NOW)!.rows).toEqual([row()]);
  });
  it('a storage that throws (private mode, quota) is harmless', () => {
    const boom: CacheStore = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); }, removeItem: () => { throw new Error('x'); } };
    expect(() => saveManifest(boom, { tripId: 't1', userId: 'u1', trip: header, rows: [row()] })).not.toThrow();
    expect(loadManifest(boom, 't1', 'u1')).toBeNull();
    expect(() => clearManifest(boom)).not.toThrow();
    expect(() => saveManifest(null, { tripId: 't1', userId: 'u1', trip: null, rows: [] })).not.toThrow();
    expect(loadManifest(null, 't1', 'u1')).toBeNull();
    expect(browserStore()).toBeNull();   // node env: no window
  });
  it('clearManifest removes it; no user id or trip id means nothing is stored', () => {
    const s = mem(); saveManifest(s, { tripId: 't1', userId: 'u1', trip: header, rows: [row()] }, NOW); clearManifest(s);
    expect(loadManifest(s, 't1', 'u1', NOW)).toBeNull();
    saveManifest(s, { tripId: '', userId: 'u1', trip: header, rows: [] }); saveManifest(s, { tripId: 't1', userId: '', trip: header, rows: [] });
    expect(s.raw.size).toBe(0);
  });
});
