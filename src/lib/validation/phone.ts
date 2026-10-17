import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/max';

/**
 * Phone policy (migration 0009 is the unbypassable DB layer; this is the country-aware server layer).
 *  - International numbers are accepted and validated against their own country rules.
 *  - A number typed WITHOUT a country code is read as belonging to DEFAULT_PHONE_COUNTRY (Egypt).
 *  - The stored form is always E.164 ("+" country code national number), WhatsApp-compatible.
 *  - A valid phone proves nothing about who owns it. It never replaces OTP or any authentication check.
 */
export const DEFAULT_PHONE_COUNTRY: CountryCode = 'EG';

const DIGIT_MAP: Record<string, string> = {
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
};

/** Returns E.164 or null. Never throws. */
export function normalizePhone(input: unknown, defaultCountry: CountryCode = DEFAULT_PHONE_COUNTRY): string | null {
  if (typeof input !== 'string') return null;
  let s = input.trim();
  if (s.length === 0 || s.length > 40) return null;
  s = s.replace(/[٠-٩۰-۹]/g, (d) => DIGIT_MAP[d] ?? d);
  s = s.replace(/[\s().\-\u200e\u200f\u202a-\u202e]/g, '');
  if (s.startsWith('00')) s = `+${s.slice(2)}`;
  if (!/^\+?[0-9]+$/.test(s)) return null;
  const parsed = parsePhoneNumberFromString(s, s.startsWith('+') ? undefined : defaultCountry);
  if (!parsed || !parsed.isValid()) return null;
  return parsed.number; // E.164
}
