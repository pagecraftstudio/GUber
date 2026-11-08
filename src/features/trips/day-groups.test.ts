import { describe, expect, it } from 'vitest';
import { addDays, dayKey, dayStartInstant, groupTripsByDay, weekRange } from './day-groups';
import type { Trip } from './types';

const trip = (id: string, departureAt: string) => ({ id, departureAt }) as Trip;

describe('day helpers (company time zone)', () => {
  it('a 23:30 Cairo trip belongs to the Cairo day, not the UTC day', () => {
    expect(dayKey('2026-11-08T21:30:00Z', 'Africa/Cairo')).toBe('2026-11-08'); // 23:30 in Cairo (UTC+2 in November)
    expect(dayKey('2026-11-08T22:30:00Z', 'Africa/Cairo')).toBe('2026-11-09'); // 00:30 next day in Cairo
    expect(dayKey('2026-11-08T22:30:00Z', 'UTC')).toBe('2026-11-08');
  });
  it('day start instant is local midnight', () => {
    expect(dayStartInstant('2026-11-09', 'Africa/Cairo')).toBe('2026-11-08T22:00:00.000Z');
    expect(dayStartInstant('2026-11-09', 'UTC')).toBe('2026-11-09T00:00:00.000Z');
    expect(dayStartInstant('2026-07-01', 'Africa/Cairo')).toBe('2026-06-30T21:00:00.000Z'); // summer time UTC+3
  });
  it('groups consecutive trips by local day, keeping order', () => {
    const g = groupTripsByDay([trip('a', '2026-11-08T05:00:00Z'), trip('b', '2026-11-08T21:30:00Z'), trip('c', '2026-11-08T22:30:00Z')], 'Africa/Cairo');
    expect(g.map((x) => [x.day, x.trips.map((t) => t.id)])).toEqual([['2026-11-08', ['a', 'b']], ['2026-11-09', ['c']]]);
  });
  it('date arithmetic and Monday-based week', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(weekRange('2026-11-08')).toEqual({ from: '2026-11-02', to: '2026-11-08' }); // Sunday belongs to the week that started Monday 2
  });
});

import { tripListSchema } from './schema';
describe('trip list filter schema', () => {
  it('accepts source regular|manual only', () => {
    expect(tripListSchema.safeParse({ source: 'regular' }).success).toBe(true);
    expect(tripListSchema.safeParse({ source: 'x' }).success).toBe(false);
  });
});
