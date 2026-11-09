/**
 * Digit normalisation (plan 5.7 rule 5). People type on Arabic phone keyboards and produce Arabic-Indic (U+0660..0669)
 * or Persian (U+06F0..06F9) digits. Every parser in the product works on ASCII, so input is converted FIRST.
 * The client does it for feedback, the server is the authority. Pure, no dependencies, safe in any runtime.
 *
 * Arabic decimal separator U+066B becomes "." and Arabic thousands separator U+066C becomes ",".
 * Nothing else is touched, so a value that is already ASCII comes back identical.
 */
const ARABIC_INDIC_ZERO = 0x0660;
const PERSIAN_ZERO = 0x06f0;

export function normalizeDigits(input: string): string {
  let out = '';
  for (const ch of input) {
    const c = ch.codePointAt(0)!;
    if (c >= ARABIC_INDIC_ZERO && c <= ARABIC_INDIC_ZERO + 9) out += String(c - ARABIC_INDIC_ZERO);
    else if (c >= PERSIAN_ZERO && c <= PERSIAN_ZERO + 9) out += String(c - PERSIAN_ZERO);
    else if (c === 0x066b) out += '.';
    else if (c === 0x066c) out += ',';
    else out += ch;
  }
  return out;
}

/** Same as normalizeDigits but passes non-strings through, for use inside zod preprocess steps. */
export function normalizeDigitsUnknown(v: unknown): unknown {
  return typeof v === 'string' ? normalizeDigits(v) : v;
}

/**
 * Money typed by staff: "50", "50.5", "50,5" and the Arabic-Indic forms. At most two decimals, no thousands separators.
 * Returns a number or null. This reproduces the rule setAmountPaidAction had before the redesign; only the digit step moved here.
 */
export function parseAmountInput(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  const s = normalizeDigits(raw.trim()).replace(',', '.');
  return /^\d+(\.\d{1,2})?$/.test(s) ? Number(s) : null;
}

/** A whole number typed by a person (seat count, page number). Returns a safe integer or null. */
export function parseIntegerInput(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  const s = normalizeDigits(raw.trim());
  if (!/^\d{1,9}$/.test(s)) return null;
  return Number(s);
}

/**
 * zod preprocess helper for fields the client may send as typed text: a digit string becomes a number,
 * anything else is left alone so the schema's own number check rejects it. Numbers pass through unchanged.
 */
export function integerFromInput(v: unknown): unknown {
  if (typeof v !== 'string') return v;
  const n = parseIntegerInput(v);
  return n === null ? v : n;
}
