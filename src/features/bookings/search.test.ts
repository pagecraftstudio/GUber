import { describe, expect, it } from 'vitest';
import { bookingSearchFilter } from './search';
import { safeBookingsReturn, withFlash } from './filter-url';
import { setAmountPaidSchema, bookingListSchema } from './schema';

const ID = '00000000-0000-4000-8000-000000000261';

describe('bookingSearchFilter', () => {
  it('empty or symbol-only input = no filter', () => {
    expect(bookingSearchFilter('')).toBeNull();
    expect(bookingSearchFilter('   ')).toBeNull();
    expect(bookingSearchFilter('(),"\\*')).toBeNull();
  });
  it('searches reference, passenger, e-mail, student id, university, route and notes', () => {
    const f = bookingSearchFilter('Sara')!;
    for (const c of ['reference', 'customer_name', 'customer_email', 'customer_student_id', 'customer_university', 'route_name', 'notes']) expect(f).toContain(`${c}.ilike.%Sara%`);
  });
  it('filter syntax cannot be injected', () => {
    const f = bookingSearchFilter('x),company_id.neq.0,(y')!;
    expect(f).not.toMatch(/company_id\.neq/);
    expect(f.split(',').every((c) => /^[a-z_]+\.ilike\.%[^,()]*%$/.test(c))).toBe(true);
  });
  it('ticket number: the dash is optional', () => {
    expect(bookingSearchFilter('MBABC234')).toContain('reference.ilike.%MB-ABC234%');
    expect(bookingSearchFilter('mb-abc234')).toContain('reference.ilike.%MB-abc234%');
  });
  it('phone: spaces and a local leading zero still match the stored E.164 number', () => {
    const f = bookingSearchFilter('+20 100 000 1111')!;
    expect(f).toContain('customer_phone.ilike.%+201000001111%');
    const local = bookingSearchFilter('0100 000 1111')!;
    expect(local).toContain('customer_phone.ilike.%01000001111%');
    expect(local).toContain('customer_phone.ilike.%1000001111%');
  });
  it('a plain name adds no phone clause', () => {
    expect(bookingSearchFilter('Ahmed')).not.toContain('customer_phone');
  });
});

describe('safeBookingsReturn / withFlash', () => {
  it('accepts only the bookings page', () => {
    expect(safeBookingsReturn('/dashboard/bookings?view=all&q=sara')).toBe('/dashboard/bookings?view=all&q=sara');
    expect(safeBookingsReturn('/dashboard/bookings')).toBe('/dashboard/bookings');
  });
  it.each(['https://evil.example', '//evil.example', '/dashboard/users', '/dashboard/bookings/../users', '/dashboard/bookings?x=<script>', '/dashboard/bookings#a', undefined, 42])('rejects %s', (v) => {
    expect(safeBookingsReturn(v)).toBe('/dashboard/bookings');
  });
  it('flash replaces an older flash and keeps filters', () => {
    expect(withFlash('/dashboard/bookings?q=a&error=amount_invalid', 'notice', 'updated')).toBe('/dashboard/bookings?q=a&notice=updated');
    expect(withFlash('/dashboard/bookings', 'error', 'amount_invalid')).toBe('/dashboard/bookings?error=amount_invalid');
  });
});

describe('schemas', () => {
  it('amount: 0 and 2-decimal values are valid', () => {
    for (const amount of [0, 10, 10.5, 10.55, 0.01]) expect(setAmountPaidSchema.safeParse({ bookingId: ID, amount }).success).toBe(true);
  });
  it.each([-1, 10.123, NaN, Infinity, 1e12])('amount %s is invalid', (amount) => {
    expect(setAmountPaidSchema.safeParse({ bookingId: ID, amount }).success).toBe(false);
  });
  it('amount: unknown keys are refused (no company id smuggling)', () => {
    expect(setAmountPaidSchema.safeParse({ bookingId: ID, amount: 1, companyId: ID }).success).toBe(false);
  });
  it('list: sort and boarding are whitelisted, default sort keeps newest-first', () => {
    expect(bookingListSchema.parse({}).sort).toBe('newest');
    expect(bookingListSchema.safeParse({ sort: 'created_at; drop table' }).success).toBe(false);
    expect(bookingListSchema.safeParse({ boarding: 'maybe' }).success).toBe(false);
    expect(bookingListSchema.safeParse({ boarding: 'partial', sort: 'trip_asc' }).success).toBe(true);
  });
});
