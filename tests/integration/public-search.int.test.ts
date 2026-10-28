import { describe, expect, it } from 'vitest';
import { clientFor, uid, URL_ } from './harness';
import { publicFetch } from './public-routes';

/** Phase 8 follow-up: the anonymous public trip endpoints over real Postgres + PostgREST. Needs seed-customer-web.sql. */
const d = URL_ ? describe : describe.skip;
const TRIP = uid(801);

d('/api/public/trips over HTTP (real DB)', () => {
  it('returns exactly what the anonymous RPC returns (the route adds no privilege and drops nothing legitimate)', async () => {
    const direct = await clientFor(null).rpc('public_search_trips', { p_limit: 100 });
    expect(direct.error).toBeNull();
    const res = await publicFetch('/api/public/trips?limit=100');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<{ trip_id: string }> };
    expect(body.data.map((r) => r.trip_id)).toEqual((direct.data as Array<{ trip_id: string }>).map((r) => r.trip_id));
    expect(body.data.some((r) => r.trip_id === TRIP)).toBe(true);
  });
  it('is cacheable, cookie-free and leaks no private column or other tenant data', async () => {
    const res = await publicFetch('/api/public/trips');
    expect(res.headers.get('cache-control')).toMatch(/^public, .*s-maxage=30/);
    expect(res.headers.get('set-cookie')).toBeNull();
    const text = await res.text();
    expect(text).not.toMatch(/plate|driver|bus_id|license|seats_booked|created_by|notes/i);
    const rows = (JSON.parse(text) as { data: Array<{ company_id: string }> }).data;
    expect(rows.every((r) => r.company_id === uid(101))).toBe(true); // unpublished company B never appears
  });
  it('filters are applied by the database (company filter, impossible date)', async () => {
    const other = await publicFetch(`/api/public/trips?companyId=${uid(102)}`);
    expect(((await other.json()) as { data: unknown[] }).data).toEqual([]);
    expect((await publicFetch('/api/public/trips?date=2026-02-30')).status).toBe(400);
  });
  it('stops: returns stops of a public trip, [] for an unknown trip (same answer as a hidden one)', async () => {
    const ok = await publicFetch(`/api/public/trips/${TRIP}/stops`);
    expect(ok.status).toBe(200);
    const none = await publicFetch(`/api/public/trips/${uid(999999)}/stops`);
    expect(none.status).toBe(200);
    expect(await none.json()).toEqual({ data: [] });
    expect((await publicFetch('/api/public/trips/not-a-uuid/stops')).status).toBe(400);
  });
  it('rejects injection-shaped and oversized input without a database round trip failing open', async () => {
    for (const qs of ["?origin=%27%3B%20drop%20table%20trips%3B--&limit=1000", '?origin=' + 'a'.repeat(200), '?foo=bar']) {
      expect((await publicFetch('/api/public/trips' + qs)).status, qs).toBe(400);
    }
    // the quote itself is plain data to the parameterised RPC: no rows, no error
    const quoted = await publicFetch("/api/public/trips?origin=O'Brien");
    expect(quoted.status).toBe(200);
    expect(((await quoted.json()) as { data: unknown[] }).data).toEqual([]);
  });
});
