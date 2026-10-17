import { describe, expect, it } from 'vitest';
import { clientFor, uid, URL_ } from './harness';

/**
 * create_my_booking idempotency (0013b) and cancel_my_booking semantics, over HTTP (PostgREST + real JWTs + RLS).
 * Real parallel requests: PostgREST serves them on separate pooled connections, so the row/advisory locks really contend.
 * Needs seed-customer-web.sql + seed-customer-idempotency.sql (trips 811-816, users 84-89). Skips without PGRST_URL.
 */
const d = URL_ ? describe : describe.skip;
const T = { many: uid(811), tight: uid(812), cancelOk: uid(813), inWindow: uid(814), mix: uid(815), stops: uid(816) };
const STOP = uid(211);

type Res = { data: any; error: { code?: string; message?: string } | null };
const create = (n: number, trip: string, seats: number, key: string | null, extra: Record<string, unknown> = {}): Promise<Res> =>
  clientFor(n).rpc('create_my_booking', {
    p_trip_id: trip, p_seats: seats, p_full_name: `User ${n}`, p_phone: `+2010000${String(n).padStart(4, '0')}`,
    ...(key ? { p_idempotency_key: key } : {}), ...extra,
  }) as unknown as Promise<Res>;
const cancel = (n: number | null, id: string): Promise<Res> => clientFor(n).rpc('cancel_my_booking', { p_booking_id: id }) as unknown as Promise<Res>;
const seatsLeft = async (trip: string) => {
  const { data } = await clientFor(null).rpc('public_search_trips', { p_company_id: uid(101), p_limit: 100 });
  return (data as any[]).find((r) => r.trip_id === trip)?.seats_available as number | undefined;
};
const mine = async (n: number) => ((await clientFor(n).rpc('my_booking_details')) as unknown as { data: any[] }).data;

d('create_my_booking idempotency under real concurrency', () => {
  it('10 parallel identical retries -> one booking, nine replays, seats consumed once', async () => {
    const before = await seatsLeft(T.many);
    const res = await Promise.all(Array.from({ length: 10 }, () => create(84, T.many, 2, 'par-1')));
    expect(res.every((r) => !r.error)).toBe(true);
    expect(new Set(res.map((r) => r.data.id)).size).toBe(1);
    expect(new Set(res.map((r) => r.data.reference)).size).toBe(1);
    expect(res.filter((r) => r.data.idempotent_replay === false)).toHaveLength(1);
    expect(res.filter((r) => r.data.idempotent_replay === true)).toHaveLength(9);
    expect(await seatsLeft(T.many)).toBe(before! - 2);
    expect((await mine(84)).filter((b) => b.trip_id === T.many)).toHaveLength(1);
  });

  it('parallel retries on a trip with exactly enough seats never see "not enough seats"', async () => {
    // capacity 2, request 2: a retry that re-checked capacity after the first commit would fail with 23514
    const res = await Promise.all(Array.from({ length: 8 }, () => create(85, T.tight, 2, 'par-tight')));
    expect(res.map((r) => r.error?.code ?? null)).toEqual(Array(8).fill(null));
    expect(new Set(res.map((r) => r.data.id)).size).toBe(1);
    expect(await seatsLeft(T.tight)).toBe(0);
  });

  it('replay on a now-full trip still returns the original booking', async () => {
    const again = await create(85, T.tight, 2, 'par-tight');
    expect(again.error).toBeNull(); expect(again.data.idempotent_replay).toBe(true);
    const other = await create(86, T.tight, 1, 'someone-else');
    expect(other.error?.message).toMatch(/not enough seats/);
  });

  it('parallel requests with one key but different seats: one wins, the rest get the neutral 23505, no extra seats taken', async () => {
    const before = await seatsLeft(T.mix);
    const res = await Promise.all([1, 2, 3, 1, 2, 3].map((s) => create(86, T.mix, s, 'par-mix')));
    const ok = res.filter((r) => !r.error); const bad = res.filter((r) => r.error);
    expect(new Set(ok.map((r) => r.data.id)).size).toBe(1);
    const seats = ok[0]!.data.seats_count as number;
    expect(ok.every((r) => r.data.seats_count === seats)).toBe(true);
    expect(bad.length).toBeGreaterThan(0);
    for (const r of bad) { expect(r.error!.code).toBe('23505'); expect(r.error!.message).toBe('idempotency key reused with a different request'); }
    expect(await seatsLeft(T.mix)).toBe(before! - seats);
    expect((await mine(86)).filter((b) => b.trip_id === T.mix)).toHaveLength(1);
  });

  it('parallel same key on two different trips: one booking total', async () => {
    const res = await Promise.all([create(87, T.many, 1, 'par-xtrip'), create(87, T.mix, 1, 'par-xtrip'), create(87, T.many, 1, 'par-xtrip')]);
    const ok = res.filter((r) => !r.error);
    expect(new Set(ok.map((r) => r.data.id)).size).toBe(1);
    for (const r of res.filter((x) => x.error)) expect(r.error!.code).toBe('23505');
    expect((await mine(87)).length).toBe(1);
  });
});

d('create_my_booking replay and payload rules over HTTP', () => {
  it('sequential replay returns the original result', async () => {
    const a = await create(88, T.stops, 1, 'seq-1', { p_pickup_stop_id: STOP, p_dropoff_stop_id: STOP, p_notes: 'window seat' });
    const b = await create(88, T.stops, 1, 'seq-1', { p_pickup_stop_id: STOP, p_dropoff_stop_id: STOP, p_notes: ' window seat ' });
    expect(a.error).toBeNull(); expect(b.error).toBeNull();
    expect(b.data).toMatchObject({ id: a.data.id, reference: a.data.reference, total_amount: a.data.total_amount, idempotent_replay: true });
  });

  it.each([
    ['seats', { seats: 2 }], ['pickup stop', { extra: { p_dropoff_stop_id: STOP, p_notes: 'window seat' } }],
    ['dropoff stop', { extra: { p_pickup_stop_id: STOP, p_notes: 'window seat' } }], ['notes', { extra: { p_pickup_stop_id: STOP, p_dropoff_stop_id: STOP, p_notes: 'aisle' } }],
    ['trip', { trip: T.many, extra: { p_pickup_stop_id: STOP, p_dropoff_stop_id: STOP, p_notes: 'window seat' } }],
  ] as const)('same key, changed %s -> 23505, nothing booked', async (_n, ch: any) => {
    const before = await seatsLeft(T.stops);
    const r = await create(88, ch.trip ?? T.stops, ch.seats ?? 1, 'seq-1', ch.extra ?? { p_pickup_stop_id: STOP, p_dropoff_stop_id: STOP, p_notes: 'window seat' });
    expect(r.error?.code).toBe('23505'); expect(r.error?.message).toBe('idempotency key reused with a different request');
    expect(await seatsLeft(T.stops)).toBe(before);
  });

  it("another customer cannot replay or probe my key; error is the same neutral 23505", async () => {
    const r = await create(89, T.stops, 1, 'seq-1', { p_pickup_stop_id: STOP, p_dropoff_stop_id: STOP, p_notes: 'window seat' });
    expect(r.error?.code).toBe('23505'); expect(r.error?.message).toBe('idempotency key reused with a different request');
    expect(r.data).toBeNull();
    expect(await mine(89)).toEqual([]);
  });
});

d('cancel_my_booking over HTTP: authorization, window, exactly-once release', () => {
  it('stranger / anon / unknown id cannot cancel; nothing is released', async () => {
    const b = await create(84, T.cancelOk, 2, 'can-1'); expect(b.error).toBeNull();
    const before = await seatsLeft(T.cancelOk);
    const stranger = await cancel(85, b.data.id); expect(stranger.error?.code).toBe('P0002');
    const unknown = await cancel(84, uid(999999)); expect(unknown.error?.code).toBe('P0002');
    expect(unknown.error?.message).toBe(stranger.error?.message); // not mine and not existing look identical
    const anon = await cancel(null, b.data.id); expect(anon.error).toBeTruthy(); expect(anon.error?.code).not.toBe('P0002');
    expect(await seatsLeft(T.cancelOk)).toBe(before);
    expect((await mine(84)).find((x) => x.id === b.data.id)).toMatchObject({ status: 'confirmed', can_cancel: true });
  });

  it('6 parallel cancels by the owner release the seats exactly once', async () => {
    const id = (await mine(84)).find((x) => x.trip_id === T.cancelOk).id as string;
    const before = await seatsLeft(T.cancelOk);
    const res = await Promise.all(Array.from({ length: 6 }, () => cancel(84, id)));
    expect(res.every((r) => !r.error)).toBe(true);
    expect(res.filter((r) => r.data.seats_released === 2)).toHaveLength(1);
    expect(res.filter((r) => r.data.seats_released === 0 && r.data.already_cancelled === true)).toHaveLength(5);
    expect(await seatsLeft(T.cancelOk)).toBe(before! + 2);
    await cancel(84, id);
    expect(await seatsLeft(T.cancelOk)).toBe(before! + 2); // repeat later: still exactly once
    expect((await mine(84)).find((x) => x.id === id)).toMatchObject({ status: 'cancelled', can_cancel: false });
  });

  it('released seats are bookable by someone else; replaying the cancelled booking does not re-take them', async () => {
    const before = await seatsLeft(T.cancelOk);
    const replay = await create(84, T.cancelOk, 2, 'can-1');
    expect(replay.data).toMatchObject({ status: 'cancelled', idempotent_replay: true });
    expect(await seatsLeft(T.cancelOk)).toBe(before);
    const other = await create(85, T.cancelOk, 4, 'can-other'); expect(other.error).toBeNull();
    expect(await seatsLeft(T.cancelOk)).toBe(1);
  });

  it('inside the cancellation window: booking allowed, can_cancel false, cancel rejected, seats stay taken', async () => {
    const b = await create(86, T.inWindow, 3, 'win-1'); expect(b.error).toBeNull();
    const before = await seatsLeft(T.inWindow);
    expect((await mine(86)).find((x) => x.id === b.data.id)?.can_cancel).toBe(false);
    const r = await cancel(86, b.data.id);
    expect(r.error?.code).toBe('23514'); expect(r.error?.message).toBe('cancellation window closed');
    expect(await seatsLeft(T.inWindow)).toBe(before);
    expect((await mine(86)).find((x) => x.id === b.data.id)?.status).toBe('confirmed');
  });
});
