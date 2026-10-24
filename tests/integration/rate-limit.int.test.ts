import { describe, expect, it } from 'vitest';
import { clientFor, uid, URL_ } from './harness';

/**
 * Rate limiting (0020) over HTTP: real JWTs, real parallel requests on pooled connections, REAL policy values
 * (booking.create 20/10min, booking.cancel 20/10min, ticket.qr 30/10min, ticket.board 180/min).
 * Needs seed-customer-web.sql + seed-tickets.sql (trip 981: cap 20, driver user 91; users 84/85 are customers).
 * Skips without PGRST_URL. Fixed windows: each flood first waits until it cannot straddle a window boundary,
 * otherwise "exactly N succeed" would be flaky for a legitimate reason.
 */
const d = URL_ ? describe : describe.skip;
const TRIP = uid(981);
const TRIP2 = uid(801);   // far-future trip (cancellation window is 24h; the 90-minute seed trips are already inside it)
type Res = { data: any; error: { code?: string; message?: string; hint?: string } | null; status: number };

const book = (n: number, trip: string, key: string): Promise<Res> =>
  clientFor(n).rpc('create_my_booking', {
    p_trip_id: trip, p_seats: 1, p_full_name: `User ${n}`, p_phone: `+2010000${String(n).padStart(4, '0')}`, p_idempotency_key: key,
  }) as unknown as Promise<Res>;
const cancel = (n: number, id: string): Promise<Res> => clientFor(n).rpc('cancel_my_booking', { p_booking_id: id }) as unknown as Promise<Res>;
const qr = (n: number, id: string): Promise<Res> => clientFor(n).rpc('my_ticket_qr', { p_booking_id: id }) as unknown as Promise<Res>;
const board = (n: number, token: string): Promise<Res> => clientFor(n).rpc('board_ticket', { p_trip_id: TRIP, p_token: token }) as unknown as Promise<Res>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Wait until the next fixed window of every given length is at least `margin` seconds away from rolling over. */
async function avoidBoundary(windows: number[], margin: number) {
  for (;;) {
    const now = Date.now() / 1000;
    const wait = windows.map((w) => (w - (now % w) < margin ? w - (now % w) + 1 : 0)).reduce((a, b) => Math.max(a, b), 0);
    if (wait <= 0) return;
    await sleep(Math.ceil(wait * 1000));
  }
}
const limited = (r: Res) => r.error?.code === 'PT429';

d('rate limiting over HTTP (real policy values, parallel requests)', () => {
  it('create_my_booking: 40 parallel requests from one user -> exactly 20 committed, 20 get HTTP 429, no seat over-allocation', async () => {
    await avoidBoundary([600, 86400], 45);
    const res = await Promise.all(Array.from({ length: 40 }, (_, i) => book(85, TRIP, `rl-book-${i}`)));
    const ok = res.filter((r) => !r.error);
    const throttled = res.filter(limited);
    expect(ok).toHaveLength(20);
    expect(throttled).toHaveLength(20);
    expect(res.every((r) => !r.error || limited(r))).toBe(true);              // nothing else went wrong (no "not enough seats")
    expect(throttled.every((r) => r.status === 429)).toBe(true);              // PostgREST maps PT429 -> HTTP 429
    expect(throttled.every((r) => Number(r.error?.hint) > 0 && Number(r.error?.hint) <= 600)).toBe(true);
    expect(throttled.every((r) => r.error?.message === 'rate limit exceeded')).toBe(true);
    const stats = (await clientFor(91).rpc('driver_trip_boarding', { p_trip_id: TRIP })).data as { expected: number };
    expect(stats.expected).toBe(20);                                           // exactly the committed bookings, never more than capacity
  }, 60_000);

  it('the next request from the same user is still refused; another user has an independent budget', async () => {
    expect(limited(await book(85, TRIP, 'rl-book-after'))).toBe(true);
    const other = await book(84, TRIP2, 'rl-user84-booking');
    expect(other.error).toBeNull();
  });

  it('my_ticket_qr: 60 parallel requests -> exactly 30 succeed, 30 get 429', async () => {
    const mine = ((await clientFor(84).rpc('my_booking_details')).data as any[]).find((b) => b.trip_id === TRIP2);
    await avoidBoundary([600], 45);
    const res = await Promise.all(Array.from({ length: 60 }, () => qr(84, mine.id)));
    expect(res.filter((r) => !r.error)).toHaveLength(30);
    expect(res.filter(limited)).toHaveLength(30);
    expect(res.every((r) => !r.error || limited(r))).toBe(true);
  }, 60_000);

  it('cancel_my_booking: 40 parallel requests for one booking -> 20 committed (1 real cancel, 19 no-ops), 20 get 429, seats released once', async () => {
    const mine = ((await clientFor(84).rpc('my_booking_details')).data as any[]).find((b) => b.trip_id === TRIP2);
    await avoidBoundary([600], 45);
    const res = await Promise.all(Array.from({ length: 40 }, () => cancel(84, mine.id)));
    const ok = res.filter((r) => !r.error);
    expect(ok).toHaveLength(20);
    expect(res.filter(limited)).toHaveLength(20);
    expect(ok.filter((r) => r.data.already_cancelled === false)).toHaveLength(1);
    expect(ok.reduce((n, r) => n + (r.data.seats_released ?? 0), 0)).toBe(1);
  }, 60_000);

  it('board_ticket: 240 parallel scans by one driver -> exactly 180 processed, 60 get 429; nothing boarded twice', async () => {
    const bookings = ((await clientFor(85).rpc('my_booking_details')).data as any[]).filter((b) => b.trip_id === TRIP && b.status === 'confirmed');
    expect(bookings).toHaveLength(20);
    const tokens: string[] = [];
    for (const b of bookings) {                                                // 20 sequential QR calls = 20 of user 85's 30-call budget
      const r = await qr(85, b.id);
      expect(r.error).toBeNull();
      for (const row of r.data) if (row.qr_payload) tokens.push(row.qr_payload);
    }
    expect(tokens).toHaveLength(20);
    await avoidBoundary([60], 25);
    const res = await Promise.all(Array.from({ length: 240 }, (_, i) => board(91, tokens[i % tokens.length]!)));
    const processed = res.filter((r) => !r.error);
    expect(processed).toHaveLength(180);
    expect(res.filter(limited)).toHaveLength(60);
    expect(res.every((r) => !r.error || limited(r))).toBe(true);
    const boardedNow = processed.filter((r) => r.data.result === 'boarded').length;
    const stats = (await clientFor(91).rpc('driver_trip_boarding', { p_trip_id: TRIP })).data as { expected: number; boarded: number };
    expect(stats.boarded).toBe(boardedNow);                                    // every ticket boarded at most once, counters consistent
    expect(stats.boarded).toBeLessThanOrEqual(20);
  }, 120_000);
});

d('rate limiting cannot be bypassed through the API surface', () => {
  const args = { p_trip_id: TRIP, p_seats: 1, p_full_name: 'x', p_phone: '+201000008484' };
  it('the raw implementations and the limiter are not callable (not exposed, no EXECUTE)', async () => {
    for (const [fn, a] of [
      ['create_my_booking_impl', args], ['cancel_my_booking_impl', { p_booking_id: TRIP }], ['my_ticket_qr_impl', { p_booking_id: TRIP }],
      ['board_ticket_impl', { p_trip_id: TRIP, p_token: 'x' }], ['rate_limit_hit', { p_bucket: 'ticket.qr' }], ['rate_limit_purge', {}],
    ] as const) {
      const r = (await clientFor(84).rpc(fn, a as any)) as unknown as Res;
      expect(r.error, fn).toBeTruthy();
      expect(['PGRST202', '42883', '42501'], `${fn}: ${r.error?.code}`).toContain(r.error?.code);
      const anon = (await clientFor(null).rpc(fn, a as any)) as unknown as Res;
      expect(anon.error, `${fn} anon`).toBeTruthy();
    }
  });

  it('counters and policies are unreachable as tables (no API schema, no grants)', async () => {
    for (const table of ['rate_limit_counters', 'rate_limit_policies']) {
      const sel = await clientFor(84).from(table).select('*');
      expect(sel.error, table).toBeTruthy();
      const del = await clientFor(84).from(table).delete().neq('bucket', 'x');
      expect(del.error, `${table} delete`).toBeTruthy();
    }
  });

  it('anonymous callers of the throttled RPCs are refused before any work', async () => {
    for (const [fn, a] of [['create_my_booking', args], ['cancel_my_booking', { p_booking_id: TRIP }], ['my_ticket_qr', { p_booking_id: TRIP }], ['board_ticket', { p_trip_id: TRIP, p_token: 'x' }]] as const) {
      const r = (await clientFor(null).rpc(fn, a as any)) as unknown as Res;
      expect(r.error, fn).toBeTruthy();
      expect(limited(r), fn).toBe(false);
    }
  });
});
