import { describe, expect, it } from 'vitest';
import { screenFromPath } from './screen';

describe('screenFromPath', () => {
  it('drops the area and ids', () => {
    expect(screenFromPath('/dashboard')).toBe('home');
    expect(screenFromPath('/dashboard/trips')).toBe('trips');
    expect(screenFromPath('/dashboard/trips/00000000-0000-4000-8000-0000000000a1/edit')).toBe('trips.edit');
    expect(screenFromPath('/dashboard/bookings/123456')).toBe('bookings');
    expect(screenFromPath('/driver/trips/00000000-0000-4000-8000-0000000000a1')).toBe('trips');
  });
  it('ignores query and hash, caps depth, and never returns a raw odd path', () => {
    expect(screenFromPath('/dashboard/website?tab=colors#x')).toBe('website');
    expect(screenFromPath('/dashboard/a/b/c/d/e')).toBe('a.b.c');
    expect(screenFromPath('/dashboard/ما-هذا')).toBe('other');
    expect(screenFromPath('/dashboard/' + 'x'.repeat(80))).toBe('other');
  });
});
