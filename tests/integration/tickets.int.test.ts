import { describe, expect, it } from 'vitest';
import { clientFor, uid, URL_ } from './harness';

/**
 * Tickets + boarding (0014) over HTTP: real JWTs, RLS, parallel requests on separate pooled connections.
 * Needs seed-customer-web.sql + seed-tickets.sql (trip 981 driver user 91, 982 user 92, 983 user 93). Skips without PGRST_URL.
 */
const d = URL_ ? describe : describe.skip;
const T = { one: uid(981), two: uid(982), other: uid(983) };
type Res = { data: any; error: { code?: string; message?: string } | null };

const book = (n: number, trip: string, seats: number, key: string): Promise<Res> =>
  clientFor(n).rpc('create_my_booking', {
    p_trip_id: trip, p_seats: seats, p_full_name: `User ${n}`, p_phone: `+2010000${String(n).padStart(4, '0')}`, p_idempotency_key: key,
  }) as unknown as Promise<Res>;
const qr = (n: number, booking: string): Promise<Res> => clientFor(n).rpc('my_ticket_qr', { p_booking_id: booking }) as unknown as Promise<Res>;
const board = (n: number | null, trip: string, tok: string): Promise<Res> => clientFor(n).rpc('board_ticket', { p_trip_id: trip, p_token: tok }) as unknown as Promise<Res>;
const stats = async (n: number, trip: string) => (await clientFor(n).rpc('driver_trip_boarding', { p_trip_id: trip })).data as { expected: number; boarded: number; remaining: number };

d('tickets are issued with the booking', () => {
  it('6 parallel retries of one booking request -> one booking, exactly 2 tickets', async () => {
    const res = await Promise.all(Array.from({ length: 6 }, () => book(84, T.one, 2, 'tix-idem')));
    expect(res.every((r) => !r.error)).toBe(true);
    expect(new Set(res.map((r) => r.data.id)).size).toBe(1);
    const tickets = (await clientFor(84).rpc('my_tickets', { p_booking_id: res[0]!.data.id })).data as any[];
    expect(tickets).toHaveLength(2);
    expect(tickets.map((t) => t.ticket_index)).toEqual([1, 2]);
    expect(tickets.every((t) => t.status === 'valid' && t.trip_id === T.one)).toBe(true);
    expect(JSON.stringify(tickets)).not.toMatch(/hash|token/i);
    expect((await stats(91, T.one)).expected).toBe(2);
  });

  it("another customer sees none of them, cannot fetch QR codes, and cannot read the table", async () => {
    const id = ((await clientFor(84).rpc('my_booking_details')).data as any[]).find((b) => b.trip_id === T.one).id;
    expect((await clientFor(85).rpc('my_tickets', { p_booking_id: id })).data).toEqual([]);
    expect((await qr(85, id)).error?.code).toBe('P0002');
    const direct = await clientFor(85).from('tickets').select('*');
    expect(direct.error?.code).toBe('42501');
    expect((await clientFor(null).rpc('my_tickets')).error).toBeTruthy();
  });
});

d('driver boarding over HTTP', () => {
  const tokens: string[] = [];
  it('customer receives one opaque QR payload per ticket', async () => {
    const id = ((await clientFor(84).rpc('my_booking_details')).data as any[]).find((b) => b.trip_id === T.one).id;
    const r = await qr(84, id);
    expect(r.error).toBeNull();
    expect(r.data).toHaveLength(2);
    for (const row of r.data) { expect(row.qr_payload).toMatch(/^MALAKY:TICKET:[A-Za-z0-9_-]{64}$/); tokens.push(row.qr_payload); }
    expect(new Set(tokens).size).toBe(2);
  });

  it('only the assigned driver can board; everyone else gets the same "trip not found"', async () => {
    const other = await board(92, T.one, tokens[0]!);          // another driver of the same company (assigned to trip 982)
    const customer = await board(84, T.one, tokens[0]!);        // a customer
    const unknownTrip = await board(91, uid(999999), tokens[0]!);
    for (const r of [other, customer, unknownTrip]) { expect(r.error?.code).toBe('P0002'); expect(r.error?.message).toBe('trip not found'); }
    const anon = await board(null, T.one, tokens[0]!); expect(anon.error).toBeTruthy(); expect(anon.error?.code).not.toBe('P0002');
    expect((await stats(91, T.one)).boarded).toBe(0);
  });

  it('driver cannot use a ticket on another trip; invalid / forged tokens are rejected', async () => {
    const b2 = await book(85, T.two, 1, 'tix-two'); expect(b2.error).toBeNull();
    const t2 = (await qr(85, b2.data.id)).data[0].qr_payload as string;
    const wrong = await board(91, T.one, t2);
    expect(wrong.error?.code).toBe('23514'); expect(wrong.error?.message).toBe('ticket is for another trip');
    for (const bad of ['', 'x', 'MALAKY:TICKET:' + 'A'.repeat(64), "' or 1=1 --"]) {
      const r = await board(91, T.one, bad); expect(r.error?.code).toBe('P0002'); expect(r.error?.message).toBe('invalid ticket');
    }
  });

  it('8 parallel scans of ONE ticket -> one boarding, seven "already_boarded", one history row', async () => {
    const res = await Promise.all(Array.from({ length: 8 }, () => board(91, T.one, tokens[0]!)));
    expect(res.every((r) => !r.error)).toBe(true);
    expect(res.filter((r) => r.data.result === 'boarded')).toHaveLength(1);
    expect(res.filter((r) => r.data.result === 'already_boarded')).toHaveLength(7);
    expect(new Set(res.map((r) => r.data.boarded_at)).size).toBe(1);
    expect(await stats(91, T.one)).toMatchObject({ expected: 2, boarded: 1, remaining: 1 });
    const list = (await clientFor(91).rpc('driver_my_trips')).data as any[];
    expect(list.map((t) => t.trip_id)).toEqual([T.one]);      // never another driver's trip
    expect(list.find((t) => t.trip_id === T.one).status).toBe('boarding');          // first scan opened boarding
  });

  it('re-issuing the QR invalidates the old one; scanning the new one boards', async () => {
    const id = ((await clientFor(84).rpc('my_booking_details')).data as any[]).find((b) => b.trip_id === T.one).id;
    const fresh = await qr(84, id);
    expect(fresh.data.find((x: any) => x.ticket_index === 1).qr_payload).toBeNull();      // ticket 1 already boarded: no QR
    const t2new = fresh.data.find((x: any) => x.ticket_index === 2).qr_payload as string;
    expect(t2new).not.toBe(tokens[1]!);
    const old = await board(91, T.one, tokens[1]!); expect(old.error?.code).toBe('P0002'); expect(old.error?.message).toBe('invalid ticket');
    const ok = await board(91, T.one, t2new); expect(ok.data.result).toBe('boarded');
    expect(await stats(91, T.one)).toMatchObject({ expected: 2, boarded: 2, remaining: 0 });
  });

  it('race: customer re-issues the QR while the driver scans it -> never an inconsistent state', async () => {
    const b = await book(85, T.two, 1, 'tix-race'); expect(b.error).toBeNull();
    const tok = (await qr(85, b.data.id)).data[0].qr_payload as string;
    const before = (await stats(92, T.two)).boarded;
    const [scan, reissue] = await Promise.all([board(92, T.two, tok), qr(85, b.data.id)]);
    expect(reissue.error).toBeNull();
    if (scan.error) { expect(scan.error.message).toBe('invalid ticket'); expect((await stats(92, T.two)).boarded).toBe(before); }
    else { expect(scan.data.result).toBe('boarded'); expect((await stats(92, T.two)).boarded).toBe(before + 1); }
  });

  it('boarding history is invisible to customers and other drivers', async () => {
    expect((await clientFor(84).from('boarding_events').select('*')).data ?? []).toHaveLength(0);
    expect((await clientFor(92).from('boarding_events').select('*')).data ?? []).toHaveLength(0);
    expect((await clientFor(93).rpc('driver_my_trips')).data.map((t: any) => t.trip_id)).toEqual([T.other]);
  });
});
