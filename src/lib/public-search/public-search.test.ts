import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { setLogSink } from '@/lib/log';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/env', () => ({ getEnv: () => ({ NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.test', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'k'.repeat(30), NEXT_PUBLIC_SITE_URL: 'https://app.example.test' }) }));

const rpc = vi.fn();
const createClient = vi.fn((..._a: unknown[]) => ({ rpc }));
vi.mock('@supabase/supabase-js', () => ({ createClient: (...a: unknown[]) => createClient(...a) }));

const { GET: searchGET } = await import('@/app/api/public/trips/route');
const { GET: stopsGET } = await import('@/app/api/public/trips/[tripId]/stops/route');
const { resetAnonClientForTests, TRIPS_CACHE, STOPS_CACHE, TRIPS_CDN_CACHE, STOPS_CDN_CACHE } = await import('./handler');
const { searchQuerySchema, queryObject, MAX_LIMIT } = await import('./schema');

const T = '00000000-0000-4000-8000-000000000a01';
const C = '00000000-0000-4000-8000-000000000b01';
const row = (extra: Record<string, unknown> = {}) => ({
  trip_id: T, company_id: C, company_name: 'Fayoum Bus', company_slug: 'fayoum', route_id: T,
  origin_name: 'Fayoum', destination_name: 'Cairo', departure_at: '2026-12-01T06:00:00Z', arrival_at: '2026-12-01T08:00:00Z',
  price: '40.00', currency: 'EGP', capacity: 10, seats_available: 4, max_seats_per_booking: 5, timezone: 'Africa/Cairo', ...extra,
});
const get = (qs = '') => searchGET(new NextRequest(`https://app.example.test/api/public/trips${qs}`));
const stops = (id: string, qs = '') => stopsGET(new NextRequest(`https://app.example.test/api/public/trips/${id}/stops${qs}`), { params: Promise.resolve({ tripId: id }) });
let logs: string[] = [];
beforeEach(() => { rpc.mockReset(); createClient.mockClear(); resetAnonClientForTests(); logs = []; setLogSink((l) => logs.push(l)); });

describe('input validation (strict)', () => {
  const ok = (o: Record<string, string>) => searchQuerySchema.safeParse(o).success;
  it('accepts the documented parameters', () => {
    expect(ok({})).toBe(true);
    expect(ok({ origin: 'Fayoum', destination: 'Cairo', date: '2026-12-01', companyId: C, limit: '100', offset: '500' })).toBe(true);
    expect(ok({ origin: 'القاهرة' })).toBe(true);
  });
  it.each([
    ['unknown parameter (cache-busting / widening)', { x: '1' }],
    ['empty value', { origin: '' }],
    ['whitespace only', { origin: '   ' }],
    ['too long', { origin: 'a'.repeat(61) }],
    ['control character', { origin: 'a\u0000b' }],
    ['html angle bracket', { origin: '<script>' }],
    ['impossible date', { date: '2026-02-30' }],
    ['wrong date format', { date: '01/12/2026' }],
    ['not a uuid', { companyId: 'abc' }],
    ['limit 0', { limit: '0' }],
    ['limit over the cap', { limit: String(MAX_LIMIT + 1) }],
    ['negative offset', { offset: '-1' }],
    ['offset over the cap', { offset: '501' }],
    ['non numeric limit', { limit: '10; drop table trips' }],
  ])('rejects %s', (_n, o) => { expect(ok(o as Record<string, string>)).toBe(false); });
  it('rejects a repeated parameter', () => { expect(queryObject(new URLSearchParams('origin=a&origin=b'))).toBeNull(); });
});

describe('GET /api/public/trips', () => {
  it('calls the RPC with the validated, parameterised arguments and no identity', async () => {
    rpc.mockResolvedValue({ data: [row()], error: null, status: 200 });
    const res = await get(`?origin=Fayoum&destination=Cairo&date=2026-12-01&companyId=${C}&limit=20&offset=5`);
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('public_search_trips', { p_origin: 'Fayoum', p_destination: 'Cairo', p_date: '2026-12-01', p_company_id: C, p_limit: 20, p_offset: 5 });
  });
  it('uses the publishable key with no session persistence (never a service-role client)', async () => {
    rpc.mockResolvedValue({ data: [], error: null, status: 200 });
    await get();
    const [url, key, opts] = createClient.mock.calls[0] as [string, string, { auth: Record<string, boolean> }];
    expect(url).toBe('https://x.supabase.test');
    expect(key).toBe('k'.repeat(30));
    expect(opts.auth).toMatchObject({ persistSession: false, autoRefreshToken: false });
  });
  it('is cacheable only on success, carries no cookie, and never varies by caller', async () => {
    rpc.mockResolvedValue({ data: [row()], error: null, status: 200 });
    const res = await get();
    expect(res.headers.get('cache-control')).toBe(TRIPS_CACHE);
    expect(TRIPS_CACHE).toMatch(/^public, .*s-maxage=\d+/);
    // regression: browsers honour stale-while-revalidate, so it may only appear in the CDN-targeted header
    expect(res.headers.get('cache-control')).not.toMatch(/stale-while-revalidate/);
    expect(res.headers.get('cache-control')).toMatch(/max-age=0/);
    expect(res.headers.get('vercel-cdn-cache-control')).toBe(TRIPS_CDN_CACHE);
    expect(res.headers.get('set-cookie')).toBeNull();
    expect(res.headers.get('vary') ?? '').not.toMatch(/cookie|authorization/i);
  });
  it('publishes an allow-list of columns: an extra column from the RPC is dropped', async () => {
    rpc.mockResolvedValue({ data: [row({ bus_plate: 'ABC 123', driver_name: 'X', notes: 'internal', seats_booked: 6 })], error: null, status: 200 });
    const body = await (await get()).json();
    expect(Object.keys(body.data[0]).sort()).toEqual(Object.keys(row()).sort());
    expect(JSON.stringify(body)).not.toMatch(/ABC 123|internal|driver_name/);
  });
  it.each([['?x=1'], ['?origin='], ['?limit=1000'], ['?date=nope'], ['?origin=a&origin=b']])('invalid request %s -> 400, no upstream call, no-store', async (qs) => {
    const res = await get(qs);
    expect(res.status).toBe(400);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ error: { code: 'invalid_request' } });
    expect(rpc).not.toHaveBeenCalled();
  });
  it('an upstream database error becomes a generic 502 with nothing internal in the body or the cache', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42P01', message: 'relation "app_private.secret" does not exist', details: 'x', hint: 'y' }, status: 500 });
    const res = await get();
    const text = await res.text();
    expect(res.status).toBe(502);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(text).not.toMatch(/app_private|42P01|relation|secret|hint/);
    expect(logs.join('')).toContain('public_search.trips.failed');
    expect(logs.join('')).not.toContain('app_private');
  });
  it('an upstream rate limit is passed on as 429, not cached', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PT429', message: 'rate limit exceeded', details: null, hint: '30' }, status: 429 });
    const res = await get();
    expect(res.status).toBe(429);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
  it('a malformed upstream answer is a 502, not a partial publish', async () => {
    rpc.mockResolvedValue({ data: [{ trip_id: 'not-a-uuid' }], error: null, status: 200 });
    expect((await get()).status).toBe(502);
  });
  it('a thrown fetch error (timeout, network) is a 502 and logs only a scrubbed summary', async () => {
    rpc.mockRejectedValue(new Error('timeout talking to https://x.supabase.test with apikey eyJhbGciOi.eyJzdWIiOi.sigsigsig'));
    const res = await get();
    expect(res.status).toBe(502);
    expect(logs.join('')).not.toContain('eyJhbGciOi');
  });
  it('does not export methods other than GET/HEAD', async () => {
    const mod = await import('@/app/api/public/trips/route');
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) expect((mod as Record<string, unknown>)[m]).toBeUndefined();
  });
});

describe('GET /api/public/trips/:tripId/stops', () => {
  const stop = { stop_id: T, name: 'Central', address: null, stop_order: 1, stop_type: 'pickup', offset_minutes: 0 };
  it('returns allow-listed stop columns with a stops cache policy', async () => {
    rpc.mockResolvedValue({ data: [{ ...stop, internal_note: 'hide me' }], error: null, status: 200 });
    const res = await stops(T);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe(STOPS_CACHE);
    expect(res.headers.get('cache-control')).not.toMatch(/stale-while-revalidate/);
    expect(res.headers.get('vercel-cdn-cache-control')).toBe(STOPS_CDN_CACHE);
    expect(JSON.stringify(await res.json())).not.toContain('hide me');
    expect(rpc).toHaveBeenCalledWith('public_trip_stops', { p_trip_id: T });
  });
  it('rejects a non-uuid id and any query parameter before touching the database', async () => {
    expect((await stops('abc')).status).toBe(400);
    expect((await stops(T, '?x=1')).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('a hidden/unknown trip is an empty list, the same answer as an unknown id (no existence oracle)', async () => {
    rpc.mockResolvedValue({ data: [], error: null, status: 200 });
    const res = await stops(T);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: [] });
  });
});
