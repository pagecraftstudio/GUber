import { describe, expect, it, vi } from 'vitest';
import { tenantCtx } from '@/test/helpers';
import { mapDbError } from '@/lib/db/map-error';
import { makeBookingService } from './service';
import type { BookingRepository } from './repository';
import { createBookingSchema } from './schema';

const TRIP = '00000000-0000-4000-8000-000000000501';
const BOOKING = '00000000-0000-4000-8000-000000000261';
const valid = { tripId: TRIP, customerName: 'Sara', customerPhone: '010 1234 5678', seats: 2 };
const repo = () =>
  ({ list: vi.fn(), get: vi.fn(), create: vi.fn().mockResolvedValue({}), cancel: vi.fn().mockResolvedValue({}), setStatus: vi.fn(), setPaymentStatus: vi.fn() }) as unknown as BookingRepository;

describe('booking service: authorize -> validate -> repository', () => {
  it('readers cannot write: forbidden before validation, nothing reaches the repository', async () => {
    const r = repo(); const svc = makeBookingService(r); const ctx = tenantCtx(['bookings.read']);
    await expect(svc.create(ctx, { garbage: 1 })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(svc.cancel(ctx, { bookingId: BOOKING })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(svc.setStatus(ctx, { bookingId: BOOKING, status: 'confirmed' })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(svc.setPaymentStatus(ctx, { bookingId: BOOKING, paymentStatus: 'paid' })).rejects.toMatchObject({ code: 'forbidden' });
    expect(r.create).not.toHaveBeenCalled(); expect(r.cancel).not.toHaveBeenCalled();
  });
  it('invalid input never reaches the repository', async () => {
    const r = repo(); const svc = makeBookingService(r); const ctx = tenantCtx(['bookings.write']);
    await expect(svc.create(ctx, { ...valid, seats: 0 })).rejects.toMatchObject({ code: 'validation' });
    await expect(svc.create(ctx, { ...valid, customerPhone: '123' })).rejects.toMatchObject({ code: 'validation', fields: { customerPhone: 'invalid_phone' } });
    await expect(svc.create(ctx, { ...valid, tripId: 'x' })).rejects.toMatchObject({ code: 'validation' });
    expect(r.create).not.toHaveBeenCalled();
  });
  it('phone reaches the repository as E.164 (Egypt default for local numbers)', async () => {
    const r = repo();
    await makeBookingService(r).create(tenantCtx(['bookings.write']), valid);
    expect((r.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[1]).toMatchObject({ customerPhone: '+201012345678', status: 'confirmed' });
  });
  it('international numbers are kept', async () => {
    const r = repo();
    await makeBookingService(r).create(tenantCtx(['bookings.write']), { ...valid, customerPhone: '+44 20 7946 0958' });
    expect((r.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[1]).toMatchObject({ customerPhone: '+442079460958' });
  });
});

describe('booking input is strict: nothing server-owned can be supplied', () => {
  for (const field of ['companyId', 'company_id', 'unitPrice', 'totalAmount', 'price', 'seatsBooked', 'source', 'createdBy', 'reference']) {
    it(`rejects ${field}`, () => expect(createBookingSchema.safeParse({ ...valid, [field]: 'x' }).success).toBe(false));
  }
  it('initial status can only be pending or confirmed', () => {
    expect(createBookingSchema.safeParse({ ...valid, status: 'completed' }).success).toBe(false);
    expect(createBookingSchema.safeParse({ ...valid, status: 'cancelled' }).success).toBe(false);
  });
});

describe('database errors of the booking RPCs map to stable application errors', () => {
  const cases: Array<[string, string, string, string]> = [
    ['23514', 'not enough seats available', 'business_rule', 'trip_full'],
    ['23514', 'trip is not open for booking', 'business_rule', 'trip_not_bookable'],
    ['23514', 'trip already departed', 'business_rule', 'trip_departed'],
    ['23514', 'seats per booking exceeded', 'business_rule', 'seats_per_booking_exceeded'],
    ['23514', 'booking cannot be cancelled in its current state', 'business_rule', 'booking_not_cancellable'],
    ['23514', 'trip is closed', 'business_rule', 'trip_closed'],
    ['23514', 'invalid booking status transition: cancelled -> confirmed', 'business_rule', 'booking_transition_invalid'],
    ['23505', 'idempotency key reused with a different request', 'conflict', 'idempotency_conflict'],
    ['22023', 'invalid phone number: must be international format (E.164)', 'validation', 'invalid_phone'],
    ['53400', 'plan limit reached: max_bookings_per_month (2000)', 'plan_limit', 'max_bookings_per_month'],
  ];
  for (const [code, message, appCode, detail] of cases) {
    it(`${message}`, () => expect(mapDbError({ code, message })).toMatchObject({ code: appCode, detail }));
  }
  it('trip/booking not found (also used for "not yours") is not_found', () => {
    expect(mapDbError({ code: 'P0002', message: 'trip not found' })).toMatchObject({ code: 'not_found' });
    expect(mapDbError({ code: 'P0002', message: 'booking not found' })).toMatchObject({ code: 'not_found' });
  });
});

describe('trip transition mapping and service', () => {
  it('maps the state machine errors', () => {
    expect(mapDbError({ code: '23514', message: 'invalid trip status transition: completed -> scheduled' })).toMatchObject({ code: 'business_rule', detail: 'trip_transition_invalid' });
    expect(mapDbError({ code: '23514', message: 'trip has bookings' })).toMatchObject({ detail: 'trip_has_bookings' });
    expect(mapDbError({ code: '23514', message: 'trip is not a draft' })).toMatchObject({ detail: 'trip_not_draft' });
    expect(mapDbError({ code: '23P01', message: 'conflicting key value violates exclusion constraint "trips_bus_no_overlap"' })).toMatchObject({ code: 'conflict', detail: 'bus_conflict' });
  });
});
