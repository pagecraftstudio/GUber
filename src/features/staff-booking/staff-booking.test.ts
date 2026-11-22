import { describe, expect, it, vi } from 'vitest';
import { AppError } from '@/lib/errors';
import { tenantCtx } from '@/test/helpers';
import type { BookingService } from '@/features/bookings/service';
import { makeStaffBookingService } from './service';
import { staffBookingSchema, toE164Eg } from './schema';

const TRIP = '00000000-0000-4000-8000-0000000000a1';
const BASE = { tripId: TRIP, customerName: 'Mona', customerPhone: '+201001234567', seats: 2, idempotencyKey: 'attempt-0001' };
const created = (over: Record<string, unknown> = {}) => ({ id: 'b1', reference: 'R1', status: 'confirmed', tripId: TRIP, customerId: 'c1', seatsCount: 2, unitPrice: 50, totalAmount: 100, currency: 'EGP', idempotentReplay: false, ...over });
type Fn = (...a: unknown[]) => Promise<unknown>;
const fake = (over: { create?: Fn; setAmountPaid?: Fn } = {}) => {
  const create = vi.fn(over.create ?? (async () => created()));
  const setAmountPaid = vi.fn(over.setAmountPaid ?? (async () => ({})));
  return { svc: makeStaffBookingService({ create, setAmountPaid } as unknown as BookingService), create, setAmountPaid };
};

describe('toE164Eg', () => {
  it('turns local mobile numbers into E.164 and leaves the rest', () => {
    expect(toE164Eg('01001234567')).toBe('+201001234567');
    expect(toE164Eg('010 0123-4567')).toBe('+201001234567');
    expect(toE164Eg('+201001234567')).toBe('+201001234567');
    expect(toE164Eg('0100')).toBe('0100');
  });
});

describe('staffBookingSchema', () => {
  it('refuses company id, source and a third-decimal amount', () => {
    expect(staffBookingSchema.safeParse({ ...BASE, companyId: 'x' }).success).toBe(false);
    expect(staffBookingSchema.safeParse({ ...BASE, source: 'web' }).success).toBe(false);
    expect(staffBookingSchema.safeParse({ ...BASE, amountReceived: 10.123 }).success).toBe(false);
    expect(staffBookingSchema.safeParse({ ...BASE, amountReceived: 10.5 }).success).toBe(true);
  });
});

describe('staffBookingService', () => {
  it('needs bookings.write (the operations role cannot, the booking role can)', async () => {
    const { svc, create } = fake();
    await expect(svc.create(tenantCtx(['bookings.read', 'trips.write']), BASE)).rejects.toBeInstanceOf(AppError);
    expect(create).not.toHaveBeenCalled();
    await expect(svc.create(tenantCtx(['bookings.write']), BASE)).resolves.toMatchObject({ booking: { reference: 'R1' } });
  });
  it('creates a confirmed booking with the idempotency key and no amount field', async () => {
    const { svc, create } = fake();
    await svc.create(tenantCtx(['bookings.write']), BASE);
    const arg = create.mock.calls[0]![1] as Record<string, unknown>;
    expect(arg.status).toBe('confirmed');
    expect(arg.idempotencyKey).toBe('attempt-0001');
    expect('amountReceived' in arg).toBe(false);
  });
  it('records the amount after creating', async () => {
    const { svc, setAmountPaid } = fake();
    const r = await svc.create(tenantCtx(['bookings.write']), { ...BASE, amountReceived: 100 });
    expect(setAmountPaid).toHaveBeenCalledWith(expect.anything(), { bookingId: 'b1', amount: 100 });
    expect(r.amountRecorded).toBe(100);
  });
  it('keeps the booking when the amount is rejected and reports it', async () => {
    const { svc } = fake({ setAmountPaid: async () => { throw new AppError('business_rule', { detail: 'amount_exceeds_total' }); } });
    const r = await svc.create(tenantCtx(['bookings.write']), { ...BASE, amountReceived: 999 });
    expect(r.booking.id).toBe('b1');
    expect(r.amountError).toBe('amount_exceeds_total');
  });
  it('does not record the amount twice on an idempotent replay', async () => {
    const { svc, setAmountPaid } = fake({ create: async () => created({ idempotentReplay: true }) });
    await svc.create(tenantCtx(['bookings.write']), { ...BASE, amountReceived: 100 });
    expect(setAmountPaid).not.toHaveBeenCalled();
  });
  it('passes database refusals (full trip, other company) through untouched', async () => {
    const { svc, setAmountPaid } = fake({ create: async () => { throw new AppError('business_rule', { detail: 'not_enough_seats' }); } });
    await expect(svc.create(tenantCtx(['bookings.write']), BASE)).rejects.toMatchObject({ detail: 'not_enough_seats' });
    expect(setAmountPaid).not.toHaveBeenCalled();
  });
});
