import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/max';
import { normalizeDigits } from '@/ds/format/normalize-digits';

/**
 * Phone policy (migration 0009 is the unbypassable DB layer; this is the country-aware server layer).
 *  - International numbers are accepted and validated against their own country rules.
 *  - A number typed WITHOUT a country code is read as belonging to DEFAULT_PHONE_COUNTRY (Egypt).
 *  - The stored form is always E.164 ("+" country code national number), WhatsApp-compatible.
 *  - A valid phone proves nothing about who owns it. It never replaces OTP or any authentication check.
 */
export const DEFAULT_PHONE_COUNTRY: CountryCode = 'EG';

/** Returns E.164 or null. Never throws. */
export function normalizePhone(input: unknown, defaultCountry: CountryCode = DEFAULT_PHONE_COUNTRY): string | null {
  if (typeof input !== 'string') return null;
  let s = input.trim();
  if (s.length === 0 || s.length > 40) return null;
  s = normalizeDigits(s);
  s = s.replace(/[\s().\-\u200e\u200f\u202a-\u202e]/g, '');
  if (s.startsWith('00')) s = `+${s.slice(2)}`;
  if (!/^\+?[0-9]+$/.test(s)) return null;
  const parsed = parsePhoneNumberFromString(s, s.startsWith('+') ? undefined : defaultCountry);
  if (!parsed || !parsed.isValid()) return null;
  return parsed.number; // E.164
}
