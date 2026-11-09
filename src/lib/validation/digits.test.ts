import { describe, expect, it } from 'vitest';
import { normalizePhone } from './phone';
import { phoneSchema } from './common';
import { createBookingSchema } from '@/features/bookings/schema';
import { customerCreateSchema, customerUpdateSchema } from '@/features/customers/schema';
import { busCreateSchema } from '@/features/buses/schema';
import { bookingSearchFilter } from '@/features/bookings/search';

/** Plan 5.7 rule 5 / 10.3: Arabic-Indic input must be accepted as the same value as its Latin twin, on the server. */
const TRIP = '3f2c9b1e-8d4a-4c1e-9a55-0a6f1b2c3d4e';
const base = { tripId: TRIP, customerName: 'Omar Hassan', customerPhone: '01012345678', seats: 2 };

describe('phone', () => {
  it('Arabic-Indic and Persian twins are the same number', () => {
    expect(normalizePhone('٠١٠١٢٣٤٥٦٧٨')).toBe('+201012345678');
    expect(normalizePhone('۰۱۰۱۲۳۴۵۶۷۸')).toBe('+201012345678');
    expect(normalizePhone('+٢٠ ١٠١ ٢٣٤ ٥٦٧٨')).toBe('+201012345678');
    expect(phoneSchema.parse('٠١٠١٢٣٤٥٦٧٨')).toBe(phoneSchema.parse('01012345678'));
  });
  it('still rejects nonsense', () => { expect(normalizePhone('٠٠٠')).toBeNull(); expect(normalizePhone('abc')).toBeNull(); });
});

describe('booking seats', () => {
  it('accepts a number, a Latin digit string and an Arabic-Indic digit string', () => {
    for (const seats of [2, '2', '٢']) expect(createBookingSchema.parse({ ...base, seats }).seats).toBe(2);
  });
  it('rejects zero, decimals, text, and too many', () => {
    for (const seats of [0, '٠', '1.5', 'two', 101, '', null]) expect(createBookingSchema.safeParse({ ...base, seats }).success, String(seats)).toBe(false);
  });
});

describe('student ID', () => {
  it('is stored with Latin digits in bookings and customers', () => {
    expect(createBookingSchema.parse({ ...base, studentId: '٢٠٢٤٠١٢٣' }).studentId).toBe('20240123');
    expect(customerCreateSchema.parse({ fullName: 'Omar Hassan', phone: '01012345678', studentId: '٢٠٢٤٠١٢٣' }).studentId).toBe('20240123');
    expect(customerUpdateSchema.parse({ studentId: '۲۰۲۴۰۱۲۳' }).studentId).toBe('20240123');
  });
  it('empty still clears, absent stays absent', () => {
    expect(createBookingSchema.parse({ ...base, studentId: '' }).studentId).toBeNull();
    expect(createBookingSchema.parse(base).studentId).toBeUndefined();
  });
});

describe('bus plate', () => {
  it('digits are stored as Latin so the unique plate cannot be dodged', () => {
    const a = busCreateSchema.parse({ plateNumber: 'abc ١٢٣٤', capacity: 50 });
    const b = busCreateSchema.parse({ plateNumber: 'ABC 1234', capacity: 50 });
    expect(a.plateNumber).toBe(b.plateNumber);
  });
});

describe('booking search', () => {
  it('an Arabic-Indic student id or phone searches like its Latin twin', () => {
    expect(bookingSearchFilter('٢٠٢٤٠١٢٣')).toBe(bookingSearchFilter('20240123'));
    expect(bookingSearchFilter('٠١٠١٢٣٤٥٦٧٨')).toBe(bookingSearchFilter('01012345678'));
    expect(bookingSearchFilter('mb-٧k3q9x')).toBe(bookingSearchFilter('mb-7k3q9x'));
  });
  it('empty stays null', () => { expect(bookingSearchFilter('')).toBeNull(); expect(bookingSearchFilter(undefined)).toBeNull(); });
});
