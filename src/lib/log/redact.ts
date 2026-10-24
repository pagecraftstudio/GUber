/**
 * Redaction for structured logs. Two independent layers, because either alone is easy to defeat:
 *   1. KEY layer   - any field whose NAME looks sensitive is replaced wholesale (password, token, authorization, qr, email ...).
 *   2. VALUE layer - any remaining string is scrubbed for secret-shaped content (JWTs, ticket QR payloads, bearer
 *                    tokens, Supabase keys, e-mail addresses, phone numbers, long opaque tokens), whatever its field name.
 * Output is bounded (depth, keys, string length) so a hostile or accidental huge payload cannot flood the log pipeline.
 * This module is pure (no I/O, no env) so it is trivially unit-testable.
 */
export const REDACTED = '[REDACTED]';

const SENSITIVE_KEY =
  /pass(word|wd|phrase)?|pwd|secret|token|authorization|auth[-_]?header|cookie|session|api[-_]?key|apikey|bearer|jwt|credential|signature|private|qr|payload|e[-_]?mail|phone|mobile|msisdn|whatsapp|full[-_]?name|first[-_]?name|last[-_]?name|student|national[-_]?id|passport|iban|card|cvv|otp|code[-_]?verifier|service[-_]?role/i;

// Keys that LOOK sensitive but are operational identifiers we deliberately keep (matched exactly, case-insensitive).
const KEY_ALLOWLIST = new Set(['errorcode', 'pgcode', 'sqlstate', 'httpstatus', 'outcome', 'tokencount', 'tickettoken_present']);

const VALUE_PATTERNS: Array<[RegExp, string]> = [
  [/MALAKY:TICKET:[A-Za-z0-9_-]+/g, 'MALAKY:TICKET:[REDACTED]'],                                  // customer QR payload (a bearer credential)
  [/eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g, '[REDACTED_JWT]'],                    // any JWT (user session, anon key, service role)
  [/\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, '$1 [REDACTED]'],
  [/\bsb_(?:secret|publishable)_[A-Za-z0-9_-]{8,}/g, '[REDACTED_KEY]'],                            // Supabase new-style keys
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[REDACTED_EMAIL]'],
  [/(?<![A-Za-z0-9])\+?\d[\d\s().-]{8,}\d(?![A-Za-z0-9])/g, '[REDACTED_PHONE]'],                     // 10+ digit runs incl. +20 100 000 0000
  [/\b[A-Za-z0-9_-]{32,}\b/g, '[REDACTED_TOKEN]'],                                                  // long opaque strings (hashes, tokens). UUIDs have hyphens at fixed spots and are handled below
];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_DEPTH = 5;
const MAX_KEYS = 40;
const MAX_ARRAY = 20;
const MAX_STRING = 300;

export function scrubString(input: string): string {
  if (UUID.test(input)) return input;                      // ids are pseudonymous and needed for diagnostics
  let out = input;
  for (const [re, repl] of VALUE_PATTERNS) out = out.replace(re, repl);
  // a UUID embedded in text must survive the long-token rule (36 chars incl. hyphens would not match [A-Za-z0-9_-]{32,}\b only if hyphens...) -> they DO match; restore them
  return out.length > MAX_STRING ? `${out.slice(0, MAX_STRING)}…[truncated]` : out;
}

export function redact(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) return value;
  switch (typeof value) {
    case 'string': return scrubString(value);
    case 'number': return Number.isFinite(value) ? value : String(value);
    case 'boolean': return value;
    case 'bigint': return value.toString();
    case 'function': case 'symbol': return undefined;
  }
  const obj = value as object;
  if (seen.has(obj)) return '[Circular]';
  if (depth >= MAX_DEPTH) return '[MaxDepth]';
  seen.add(obj);

  if (value instanceof Error) {
    const e = value as Error & { code?: unknown; status?: unknown };
    // name + scrubbed message + a short code only. NEVER the stack (paths/args) and never `cause` verbatim.
    return {
      name: e.name,
      message: scrubString(String(e.message ?? '')),
      ...(typeof e.code === 'string' ? { code: scrubString(e.code) } : {}),
      ...(typeof e.status === 'number' ? { status: e.status } : {}),
    };
  }
  if (Array.isArray(value)) {
    const arr = value.slice(0, MAX_ARRAY).map((v) => redact(v, depth + 1, seen));
    return value.length > MAX_ARRAY ? [...arr, `[+${value.length - MAX_ARRAY} more]`] : arr;
  }
  if (value instanceof Date) return value.toISOString();

  const out: Record<string, unknown> = {};
  let n = 0;
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (n++ >= MAX_KEYS) { out['[truncated]'] = true; break; }
    const safeKey = k.slice(0, 64);
    if (SENSITIVE_KEY.test(k) && !KEY_ALLOWLIST.has(k.toLowerCase())) { out[safeKey] = REDACTED; continue; }
    out[safeKey] = redact(v, depth + 1, seen);
  }
  return out;
}
