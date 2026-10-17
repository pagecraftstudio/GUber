import { describe, expect, it } from 'vitest';
import { normalizePhone } from './phone';
import { phoneSchema } from './common';

describe('normalizePhone', () => {
  it('reads a local Egyptian number with the EG default', () => {
    expect(normalizePhone('01012345678')).toBe('+201012345678');
    expect(normalizePhone('010 1234 5678')).toBe('+201012345678');
    expect(normalizePhone('(010) 1234-5678')).toBe('+201012345678');
  });
  it('keeps international numbers and normalises them to E.164', () => {
    expect(normalizePhone('+20 101 234 5678')).toBe('+201012345678');
    expect(normalizePhone('0020 101 234 5678')).toBe('+201012345678');
    expect(normalizePhone('+44 20 7946 0958')).toBe('+442079460958');
    expect(normalizePhone('+1 (415) 555-2671')).toBe('+14155552671');
    expect(normalizePhone('+971 50 123 4567')).toBe('+971501234567');
  });
  it('does not apply the EG default to numbers that already carry a country code', () => {
    expect(normalizePhone('+442079460958')).toBe('+442079460958');
  });
  it('accepts Arabic-Indic and Persian digits', () => {
    expect(normalizePhone('٠١٠١٢٣٤٥٦٧٨')).toBe('+201012345678');
    expect(normalizePhone('+۲۰۱۰۱۲۳۴۵۶۷۸')).toBe('+201012345678');
  });
  it('rejects invalid input', () => {
    for (const bad of ['', '   ', '123', '0101234', '+20 0101234', 'abc', '+999999999999', '+201012345678x', '010-1234-5678-99', '+2', null, undefined, 12345678901, {}]) {
      expect(normalizePhone(bad as unknown), String(bad)).toBeNull();
    }
  });
  it('a valid number is not proof of ownership: normalisation never mentions verification', () => {
    expect(Object.keys({ phone: normalizePhone('01012345678') })).toEqual(['phone']);
  });
});

describe('phoneSchema', () => {
  it('outputs E.164', () => expect(phoneSchema.parse('01112345678')).toBe('+201112345678'));
  it('reports invalid_phone', () => {
    const r = phoneSchema.safeParse('12');
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe('invalid_phone');
  });
});
