import { describe, expect, it } from 'vitest';
import { mapColumns } from './columns';

describe('mapColumns', () => {
  const cols = { fullName: 'full_name', phone: 'phone' } as const;
  it('maps camelCase to columns and skips undefined', () => {
    expect(mapColumns({ fullName: 'A', phone: undefined }, cols)).toEqual({ full_name: 'A' });
  });
  it('keeps explicit null (clears a value)', () => expect(mapColumns({ phone: null }, cols)).toEqual({ phone: null }));
  it('drops anything not whitelisted, even if it reaches this layer', () => {
    const out = mapColumns({ fullName: 'A', company_id: 'other', companyId: 'other', seats_booked: 99, status: 'x' }, cols);
    expect(out).toEqual({ full_name: 'A' });
  });
});
