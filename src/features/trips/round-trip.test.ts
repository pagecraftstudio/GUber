import { describe, expect, it } from 'vitest';
import { tripWithReturnsSchema } from './schema';
import { templateCreateSchema } from '../trip-templates/schema';

const ID = '00000000-0000-4000-8000-000000000201';
const R = '00000000-0000-4000-8000-000000000202';
const base = { routeId: ID, departureAt: '2026-12-01T08:00:00Z', arrivalAt: '2026-12-01T10:00:00Z', price: 50, roundTripPrice: 90, capacity: 30, returns: [{ routeId: R, departureAt: '2026-12-01T14:00:00Z', arrivalAt: '2026-12-01T16:00:00Z', price: 45 }] };

describe('go-and-return trip schema', () => {
  it('accepts outbound + return options', () => expect(tripWithReturnsSchema.safeParse(base).success).toBe(true));
  it('needs 1..10 return options and a round trip price', () => {
    expect(tripWithReturnsSchema.safeParse({ ...base, returns: [] }).success).toBe(false);
    expect(tripWithReturnsSchema.safeParse({ ...base, returns: Array(11).fill(base.returns[0]) }).success).toBe(false);
    const { roundTripPrice: _x, ...noPrice } = base;
    expect(tripWithReturnsSchema.safeParse(noPrice).success).toBe(false);
  });
  it('a return cannot depart before the outbound arrives', () => {
    const early = { ...base, returns: [{ ...base.returns[0]!, departureAt: '2026-12-01T09:00:00Z', arrivalAt: '2026-12-01T11:00:00Z' }] };
    expect(tripWithReturnsSchema.safeParse(early).success).toBe(false);
  });
  it('never accepts status, outbound id or company id', () => {
    for (const extra of [{ status: 'scheduled' }, { outboundTripId: ID }, { companyId: ID }]) expect(tripWithReturnsSchema.safeParse({ ...base, ...extra }).success).toBe(false);
  });
});

describe('regular trip with returns', () => {
  const t = { name: 'M', routeId: ID, departureTime: '05:00', durationMinutes: 120, daysOfWeek: [1], startDate: '2026-12-01', price: 50, capacity: 30 };
  it('return times need route + both prices; prices without times are refused', () => {
    const full = { ...t, returnRouteId: R, returnPrice: 45, roundTripPrice: 90, returnTimes: ['18:00', '09:00', '09:00'] };
    const ok = templateCreateSchema.safeParse(full);
    expect(ok.success && ok.data.returnTimes).toEqual(['09:00', '18:00']);
    expect(templateCreateSchema.safeParse({ ...full, roundTripPrice: null }).success).toBe(false);
    expect(templateCreateSchema.safeParse({ ...t, returnPrice: 45 }).success).toBe(false);
    expect(templateCreateSchema.safeParse(t).success).toBe(true);
  });
});
