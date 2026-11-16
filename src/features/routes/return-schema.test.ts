import { describe, expect, it } from 'vitest';
import { routeReturnSchema } from './schema';

const stops = [{ name: 'B1', offsetMinutes: 0 }, { name: 'B2', offsetMinutes: 40 }];

describe('routeReturnSchema (the return route is obligatory)', () => {
  it('accepts "the same as the go, reversed"', () => {
    expect(routeReturnSchema.safeParse({ sameAsReverse: true }).success).toBe(true);
  });
  it('accepts an own return route with stops', () => {
    expect(routeReturnSchema.safeParse({ sameAsReverse: false, name: 'Back', stops }).success).toBe(true);
  });
  it('refuses a missing return, an empty object and a non-boolean choice', () => {
    expect(routeReturnSchema.safeParse(undefined).success).toBe(false);
    expect(routeReturnSchema.safeParse({}).success).toBe(false);
    expect(routeReturnSchema.safeParse({ sameAsReverse: 'yes' }).success).toBe(false);
  });
  it('refuses an own return without stops, or with fewer than two', () => {
    expect(routeReturnSchema.safeParse({ sameAsReverse: false }).success).toBe(false);
    expect(routeReturnSchema.safeParse({ sameAsReverse: false, stops: [stops[0]] }).success).toBe(false);
  });
  it('refuses stops on a reversed return (they come from the go route) and any company id', () => {
    expect(routeReturnSchema.safeParse({ sameAsReverse: true, stops }).success).toBe(false);
    expect(routeReturnSchema.safeParse({ sameAsReverse: true, companyId: 'x' }).success).toBe(false);
  });
});
