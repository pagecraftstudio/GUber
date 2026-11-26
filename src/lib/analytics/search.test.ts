import { describe, expect, it } from 'vitest';
import { buildSearchEvent } from './search';

const names: Record<string, string> = { 'loc:Cairo': 'Cairo', 'loc:Fayoum': 'Fayoum' };
const nameOf = (id?: string) => (id ? names[id] : undefined);
const base = { sortBy: 'time_asc' as const, timeOfDay: 'all' as const };

describe('buildSearchEvent', () => {
  it('uses canonical names, the date and the result count', () => {
    expect(buildSearchEvent({ originId: 'loc:Cairo', destId: 'loc:Fayoum', date: '2026-12-01' }, base, 0, nameOf))
      .toEqual({ origin: 'Cairo', destination: 'Fayoum', travelDate: '2026-12-01', filters: {}, resultsCount: 0 });
  });
  it('leaves out an unset side and an invalid date instead of sending something the server would reject', () => {
    const e = buildSearchEvent({ originId: '', destId: undefined, date: '01/12/2026' }, base, 3, nameOf);
    expect(e.origin).toBeUndefined();
    expect(e.destination).toBeUndefined();
    expect(e.travelDate).toBeUndefined();
  });
  it('includes only non-default filters', () => {
    const e = buildSearchEvent({}, { sortBy: 'price_asc', timeOfDay: 'morning', maxPrice: 150, minAvailableSeats: 3, companyId: 'c1' }, 5, nameOf);
    expect(e.filters).toEqual({ sort: 'price_asc', time_of_day: 'morning', max_price: 150, min_seats: 3, company: 'c1' });
    expect(buildSearchEvent({}, { sortBy: 'time_asc', timeOfDay: 'all', maxPrice: 300, minAvailableSeats: 1 }, 5, nameOf).filters).toEqual({});
  });
  it('clamps the result count to what the database accepts', () => {
    expect(buildSearchEvent({}, base, -4, nameOf).resultsCount).toBe(0);
    expect(buildSearchEvent({}, base, 99999, nameOf).resultsCount).toBe(10000);
    expect(buildSearchEvent({}, base, 2.9, nameOf).resultsCount).toBe(2);
  });
  it('truncates over-long names to the 80 characters the database accepts', () => {
    expect(buildSearchEvent({ originId: 'x' }, base, 1, () => 'a'.repeat(200)).origin).toHaveLength(80);
  });
});
