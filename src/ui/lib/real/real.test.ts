import { describe, expect, it, vi } from 'vitest';
import { resolveDataMode } from '../runtime';
import { applyClientFilters, bookingFromDetail, locationIdFromName, locationNameFromId, marketplaceItemFromRow, toE164Egypt } from './adapters';
import { BackendError, classifyError, createCustomerBackend, describeBackendError } from './customerBackend';
import type { BookingDetailRow, PublicTripRow } from './customerBackend';
import { RealTransportService } from './transportService.real';
import { AuthServiceError, RealAuthService } from './authService.real';

const row = (o: Partial<PublicTripRow> = {}): PublicTripRow => ({
  trip_id: 't1', company_id: 'c1', company_name: 'Fayoum Bus', company_slug: 'fayoum', route_id: 'r1',
  origin_name: 'Fayoum', destination_name: 'Cairo', departure_at: '2026-11-01T06:00:00Z', arrival_at: '2026-11-01T08:00:00Z',
  price: '40.00', currency: 'EGP', capacity: 10, seats_available: 4, max_seats_per_booking: 5, timezone: 'Africa/Cairo', ...o,
});

describe('runtime mode guard', () => {
  it('defaults to real', () => { expect(resolveDataMode('development', undefined)).toBe('real'); expect(resolveDataMode('production', '')).toBe('real'); });
  it('allows mock only outside production', () => { expect(resolveDataMode('development', 'mock')).toBe('mock'); });
  it('throws on mock in production', () => { expect(() => resolveDataMode('production', 'mock')).toThrow(/not allowed/); });
  it('rejects unknown values', () => { expect(() => resolveDataMode('development', 'fake')).toThrow(); });
});

describe('adapters', () => {
  it('normalizes Egyptian phones', () => {
    expect(toE164Egypt('01012345678')).toBe('+201012345678');
    expect(toE164Egypt('+20 101 234 5678')).toBe('+201012345678');
    expect(toE164Egypt('201012345678')).toBe('+201012345678');
    expect(toE164Egypt('12')).toBe('12');
  });
  it('round-trips location ids', () => { expect(locationNameFromId(locationIdFromName(' Fayoum '))).toBe('fayoum'); expect(locationNameFromId('loc_x')).toBeUndefined(); });
  it('maps a public row using company timezone and server seats', () => {
    const i = marketplaceItemFromRow(row());
    expect(i.departureTime).toBe('08:00'); expect(i.departureDate).toBe('2026-11-01');
    expect(i.availableSeats).toBe(4); expect(i.bookedSeats).toBe(6); expect(i.priceEgp).toBe(40); expect(i.isFullyBooked).toBe(false);
    expect(i.durationMinutes).toBe(120);
  });
  it('filters and sorts client-side', () => {
    const a = marketplaceItemFromRow(row({ trip_id: 'a', price: 50 }));
    const b = marketplaceItemFromRow(row({ trip_id: 'b', price: 30, seats_available: 1 }));
    expect(applyClientFilters([a, b], { sortBy: 'price_asc' }).map((x) => x.id)).toEqual(['b', 'a']);
    expect(applyClientFilters([a, b], { minAvailableSeats: 2 }).map((x) => x.id)).toEqual(['a']);
    expect(applyClientFilters([a, b], { maxPrice: 40 }).map((x) => x.id)).toEqual(['b']);
  });
  it('carries the server-computed can_cancel and never invents a pending-cancellation status', () => {
    const base = { id: 'b1', company_id: 'c1', reference: 'MB-1', trip_id: 't1', seats_count: 1, total_amount: '40', created_at: 'x' };
    expect(bookingFromDetail({ ...base, status: 'confirmed', can_cancel: true } as BookingDetailRow, 'u').canCancel).toBe(true);
    expect(bookingFromDetail({ ...base, status: 'confirmed', can_cancel: false } as BookingDetailRow, 'u').canCancel).toBe(false);
    expect(bookingFromDetail({ ...base, status: 'cancellation_requested', can_cancel: false } as BookingDetailRow, 'u').status).not.toBe('cancellation_requested');
  });
  it('never invents a QR token or passengers', () => {
    const d = { id: 'b1', company_id: 'c1', reference: 'MB-1', trip_id: 't1', seats_count: 2, total_amount: '80', status: 'completed', created_at: 'x' } as BookingDetailRow;
    const b = bookingFromDetail(d, 'u1');
    expect(b.qrTicketToken).toBe(''); expect(b.passengers).toEqual([]); expect(b.status).toBe('completed'); expect(b.fareEgp).toBe(80);
  });
});

describe('error classification', () => {
  it.each([
    ['23514', 'not enough seats available', 'seats_unavailable'],
    ['23514', 'seats per booking exceeded', 'seats_per_booking'],
    ['23514', 'cancellation window closed', 'cancel_window_closed'],
    ['23505', 'phone already registered for this company: verify', 'phone_registered'],
    ['23505', 'idempotency key reused', 'idempotency_conflict'],
    ['23514', 'tickets are not available for this booking', 'tickets_unavailable'],
    ['P0002', 'trip not found', 'trip_unavailable'],
    ['P0002', 'booking not found', 'booking_not_found'],
    ['28000', 'not authenticated', 'auth_required'],
    ['42501', 'permission denied for function', 'auth_required'],
    ['22023', 'invalid phone number', 'invalid_phone'],
  ])('%s %s -> %s', (pg, msg, code) => { expect(classifyError(pg, msg)).toBe(code); });
  it('localizes', () => { expect(describeBackendError(new BackendError('seats_unavailable', 'x'), 'ar')).toMatch(/مقاعد/); });
});

describe('customer backend sends no tenant or identity', () => {
  it('create_my_booking args carry only trip + passenger data', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { id: 'b' }, error: null });
    await createCustomerBackend({ rpc } as never).createBooking({ tripId: 't', seats: 1, fullName: 'A', phoneE164: '+201000000000', idempotencyKey: 'k' });
    const [fn, args] = rpc.mock.calls[0]!;
    expect(fn).toBe('create_my_booking');
    expect(Object.keys(args)).not.toContain('p_company_id'); expect(Object.keys(args)).not.toContain('p_customer_id');
  });
  it('wraps RPC errors', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: '23514', message: 'not enough seats available' } });
    await expect(createCustomerBackend({ rpc } as never).createBooking({ tripId: 't', seats: 9, fullName: 'A', phoneE164: '+2', idempotencyKey: 'k' })).rejects.toMatchObject({ code: 'seats_unavailable' });
  });
});

describe('RealTransportService', () => {
  it('ignores client-supplied company, customer and fare', async () => {
    const createBooking = vi.fn().mockResolvedValue({ id: 'b', reference: 'MB-1', status: 'confirmed', trip_id: 't1', seats_count: 2, unit_price: 40, total_amount: '80', currency: 'EGP', idempotent_replay: false });
    const svc = new RealTransportService({ createBooking } as never, toE164Egypt);
    const b = await svc.createBooking({ tripId: 't1', passengerName: 'A', passengerPhone: '01012345678', passengerCount: 2, companyId: 'EVIL', customerId: 'EVIL', fareEgp: 1 });
    expect(createBooking.mock.calls[0]![0]).toMatchObject({ tripId: 't1', seats: 2, phoneE164: '+201012345678' });
    expect(JSON.stringify(createBooking.mock.calls[0]![0])).not.toContain('EVIL');
    expect(b.fareEgp).toBe(80);
  });
  it('maps server tickets without inventing tokens, names or cancelled tickets', async () => {
    const ticketQr = vi.fn().mockResolvedValue([
      { ticket_id: 'k1', ticket_index: 1, status: 'valid', qr_payload: 'MALAKY:TICKET:abc' },
      { ticket_id: 'k2', ticket_index: 2, status: 'boarded', qr_payload: null },
    ]);
    const tickets = await new RealTransportService({ ticketQr } as never, toE164Egypt).getBookingTickets('b1');
    expect(ticketQr).toHaveBeenCalledWith('b1');
    expect(tickets).toEqual([
      expect.objectContaining({ id: 'k1', ticketIndex: 1, status: 'valid', qrOpaqueToken: 'MALAKY:TICKET:abc', passengerName: '' }),
      expect.objectContaining({ id: 'k2', ticketIndex: 2, status: 'boarded', qrOpaqueToken: '' }),
    ]);
  });
  it('exposes no buses to customers', async () => { expect(await new RealTransportService({} as never, toE164Egypt).getBuses()).toEqual([]); });
});

describe('rate limiting (0020) surfaces as a friendly, translated error', () => {
  it('PT429 -> rate_limited, in both locales, with no database text', () => {
    expect(classifyError('PT429', 'rate limit exceeded')).toBe('rate_limited');
    const err = new BackendError('rate_limited', 'x', 'PT429', '42');
    expect(describeBackendError(err, 'en')).toMatch(/too many requests/i);
    expect(describeBackendError(err, 'ar')).toMatch(/[\u0600-\u06FF]/);
    expect(describeBackendError(err, 'en')).not.toMatch(/PT429|rate limit exceeded/);
  });
});

describe('customer sign-out scope', () => {
  const make = (result: { error: unknown }) => {
    const signOut = vi.fn(async () => result);
    return { signOut, svc: new RealAuthService({ auth: { signOut } } as never, 'https://app.example.test') };
  };
  it("revokes only the current session ('local'), never every device ('global' is the library default)", async () => {
    const { signOut, svc } = make({ error: null });
    await svc.signOut();
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
  });
  it('surfaces a failed sign-out as an AuthServiceError', async () => {
    const { svc } = make({ error: new Error('network') });
    await expect(svc.signOut()).rejects.toBeInstanceOf(AuthServiceError);
  });
});

describe('public catalogue goes through the same-origin server routes', () => {
  const json = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers });
  const backendWith = (f: (u: string, i?: RequestInit) => Promise<Response>) => createCustomerBackend({ rpc: vi.fn() } as never, f);
  it('searchTrips: GET /api/public/trips with only the given filters, credentials omitted, no RPC call', async () => {
    const f = vi.fn(async () => json(200, { data: [row()] }));
    const rpc = vi.fn();
    const rows = await createCustomerBackend({ rpc } as never, f).searchTrips({ origin: 'Fayoum', destination: '', date: '2026-12-01' });
    expect(rows).toHaveLength(1);
    expect(rpc).not.toHaveBeenCalled();
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/public/trips?origin=Fayoum&date=2026-12-01&limit=100');
    expect(init).toMatchObject({ method: 'GET', credentials: 'omit' });
  });
  it('searchTrips with no filters asks for the catalogue', async () => {
    const f = vi.fn(async () => json(200, { data: [] }));
    await backendWith(f).searchTrips({});
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe('/api/public/trips?limit=100');
  });
  it('tripStops: GET /api/public/trips/:id/stops with the id encoded', async () => {
    const f = vi.fn(async () => json(200, { data: [] }));
    await backendWith(f).tripStops('a/b');
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe('/api/public/trips/a%2Fb/stops');
  });
  it.each([
    [429, 'rate_limited'], [400, 'invalid_input'], [502, 'unknown'], [500, 'unknown'],
  ])('HTTP %s -> BackendError %s', async (status, code) => {
    await expect(backendWith(async () => json(status, { error: { code: 'x' } })).searchTrips({})).rejects.toMatchObject({ code });
  });
  it('a network failure or a malformed body is a generic BackendError', async () => {
    await expect(backendWith(async () => { throw new TypeError('Failed to fetch'); }).searchTrips({})).rejects.toBeInstanceOf(BackendError);
    await expect(backendWith(async () => json(200, { nope: 1 })).searchTrips({})).rejects.toBeInstanceOf(BackendError);
    await expect(backendWith(async () => new Response('<html>', { status: 200 })).searchTrips({})).rejects.toBeInstanceOf(BackendError);
  });
});
