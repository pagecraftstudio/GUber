import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/lib/errors';
import { log, logger, logOperationFailure, outcomeFromPgCode, setLogSink } from './index';
import { redact, scrubString, REDACTED } from './redact';
import { withFailureLog } from './service-failure';

let lines: string[] = [];
beforeEach(() => { lines = []; setLogSink((l) => lines.push(l)); });
afterEach(() => setLogSink(null));
const out = () => lines.join('\n');

const JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSJ9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
const QR = 'MALAKY:TICKET:dYItdHeqSiAbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcdefghijklmnop';

describe('redaction: KEY layer', () => {
  it.each(['password', 'newPassword', 'Authorization', 'authorization', 'cookie', 'Set-Cookie', 'access_token', 'refresh_token', 'token', 'qr_payload', 'qrPayload', 'apiKey', 'api_key',
    'service_role_key', 'secret', 'clientSecret', 'email', 'customer_email', 'phone', 'phoneE164', 'full_name', 'fullName', 'studentId', 'student_id', 'jwt', 'session', 'otp'])(
    'field %s is replaced wholesale', (k) => {
      const r = redact({ [k]: 'whatever-value-123' }) as Record<string, unknown>;
      expect(r[k]).toBe(REDACTED);
    });
  it('keeps the operational identifiers it is meant to keep', () => {
    expect(redact({ errorCode: 'x', pgCode: 'PT429', sqlstate: '23514', httpStatus: 429, outcome: 'rate_limited' })).toEqual({ errorCode: 'x', pgCode: 'PT429', sqlstate: '23514', httpStatus: 429, outcome: 'rate_limited' });
  });
  it('redacts nested and array-held sensitive fields', () => {
    const r = redact({ a: { b: [{ password: 'p', ok: 1 }] }, headers: { authorization: 'Bearer abc.def.ghi-jklmnop', 'x-request-id': 'r1' } }) as any;
    expect(r.a.b[0].password).toBe(REDACTED);
    expect(r.a.b[0].ok).toBe(1);
    expect(r.headers.authorization).toBe(REDACTED);
    expect(r.headers['x-request-id']).toBe('r1');
  });
});

describe('redaction: VALUE layer (secret-shaped content under an innocent field name)', () => {
  it('QR payloads', () => expect(scrubString(`scan failed for ${QR} on bus`)).not.toContain('dYItdHeqSi'));
  it('JWTs', () => { const s = scrubString(`got ${JWT}`); expect(s).not.toContain('eyJhbGci'); expect(s).toContain('[REDACTED_JWT]'); });
  it('bearer tokens', () => expect(scrubString('Authorization: Bearer abcdefghijklmnop123456')).not.toContain('abcdefghijklmnop'));
  it('Supabase new-style keys', () => { expect(scrubString('key sb_secret_abcdefghijklmnop1234')).not.toContain('abcdefghijklmnop'); expect(scrubString('sb_publishable_abcdefghijkl')).toContain('REDACTED'); });
  it('e-mail addresses and phone numbers', () => {
    expect(scrubString('user jane.doe+x@uni.edu.eg failed')).toBe('user [REDACTED_EMAIL] failed');
    expect(scrubString('call +20 100 000 8484 now')).not.toMatch(/8484/);
    expect(scrubString('phone 01000008484')).not.toMatch(/8484/);
  });
  it('long opaque tokens', () => expect(scrubString('hash 0123456789abcdef0123456789abcdef0123abcd end')).toContain('[REDACTED_TOKEN]'));
  it('keeps UUIDs (pseudonymous ids needed for diagnostics)', () => {
    const id = '00000000-0000-4000-8000-000000000981';
    expect(scrubString(id)).toBe(id);
    expect(redact({ tripId: id })).toEqual({ tripId: id });
  });
  it('does not mangle ordinary short messages', () => expect(scrubString('not enough seats available')).toBe('not enough seats available'));
});

describe('redaction: bounds and safety', () => {
  it('truncates huge strings, long arrays, wide objects and deep nesting', () => {
    expect((redact('x'.repeat(5000)) as string).length).toBeLessThan(400);
    expect((redact(Array.from({ length: 500 }, (_, i) => i)) as unknown[]).length).toBe(21);
    expect(Object.keys(redact(Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`k${i}`, i]))) as object).length).toBeLessThanOrEqual(41);
    let deep: any = { v: 1 }; for (let i = 0; i < 20; i++) deep = { n: deep };
    expect(JSON.stringify(redact(deep))).toContain('[MaxDepth]');
  });
  it('handles circular references, errors (no stack, scrubbed message), dates, bigint', () => {
    const a: any = { x: 1 }; a.self = a;
    expect((redact(a) as any).self).toBe('[Circular]');
    const err = new Error(`bad token ${JWT}`); (err as any).code = 'PT429';
    const r = redact({ err }) as any;
    expect(r.err.stack).toBeUndefined();
    expect(JSON.stringify(r)).not.toContain('eyJhbGci');
    expect(r.err.code).toBe('PT429');
    expect(redact(new Date(0))).toBe('1970-01-01T00:00:00.000Z');
    expect(redact(10n)).toBe('10');
  });
});

describe('log(): output contract', () => {
  it('emits ONE JSON line with ts, level, event and scrubbed fields', () => {
    log('warn', 'operation.failed', { op: 'ticket.board', token: QR, note: `scanned ${QR}`, email: 'a@b.co' });
    expect(lines).toHaveLength(1);
    const rec = JSON.parse(lines[0]!);
    expect(rec).toMatchObject({ level: 'warn', event: 'operation.failed', op: 'ticket.board', token: REDACTED });
    expect(typeof rec.ts).toBe('string');
    expect(out()).not.toContain('dYItdHeqSi');
    expect(out()).not.toContain('a@b.co');
  });
  it('never throws, even for hostile input; falls back to a data-free line', () => {
    const hostile: any = { get boom() { throw new Error('getter'); } };
    expect(() => logger.error('x', hostile)).not.toThrow();
    expect(lines.length).toBeGreaterThan(0);
  });
  it('a failing sink never propagates', () => { setLogSink(() => { throw new Error('disk full'); }); expect(() => logger.info('x')).not.toThrow(); });
});

describe('logOperationFailure / outcome classification', () => {
  it('maps SQLSTATEs', () => {
    expect(outcomeFromPgCode('PT429')).toBe('rate_limited');
    expect(outcomeFromPgCode('28000')).toBe('unauthenticated');
    expect(outcomeFromPgCode('PGRST301')).toBe('unauthenticated');
    expect(outcomeFromPgCode('42501')).toBe('forbidden');
    expect(outcomeFromPgCode('P0002')).toBe('not_found');
    expect(outcomeFromPgCode('23505')).toBe('conflict');
    expect(outcomeFromPgCode('23514')).toBe('business_rule');
    expect(outcomeFromPgCode('53400')).toBe('plan_limit');
    expect(outcomeFromPgCode(undefined)).toBe('unknown');
    expect(outcomeFromPgCode('XX000')).toBe('internal');
  });
  it('writes a diagnostic record with ids and classification only', () => {
    logOperationFailure({ op: 'booking.create', outcome: 'rate_limited', pgCode: 'PT429', httpStatus: 429, tripId: '00000000-0000-4000-8000-000000000981', userId: '00000000-0000-4000-8000-000000000085', source: 'client_report' });
    expect(JSON.parse(lines[0]!)).toMatchObject({ level: 'warn', event: 'operation.failed', op: 'booking.create', outcome: 'rate_limited', pgCode: 'PT429', httpStatus: 429, source: 'client_report' });
  });
  it('internal/network failures log at error level', () => {
    logOperationFailure({ op: 'ticket.board', outcome: 'internal', source: 'server' });
    expect(JSON.parse(lines[0]!).level).toBe('error');
  });
});

describe('withFailureLog (server-side staff operations)', () => {
  const ctx = { companyId: '00000000-0000-4000-8000-000000000101', userId: '00000000-0000-4000-8000-000000000002' };
  it('returns the value untouched and logs nothing on success', async () => {
    expect(await withFailureLog('booking.create', ctx, {}, async () => 42)).toBe(42);
    expect(lines).toHaveLength(0);
  });
  it('logs one record for an AppError and rethrows the SAME error', async () => {
    const e = new AppError('business_rule', { detail: 'trip_full' });
    await expect(withFailureLog('booking.create', ctx, { tripId: '00000000-0000-4000-8000-000000000981', seats: 2 }, async () => { throw e; })).rejects.toBe(e);
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({ op: 'booking.create', outcome: 'business_rule', detail: 'trip_full', companyId: ctx.companyId, userId: ctx.userId, seats: 2, source: 'server' });
  });
  it('rate limiting is classified as rate_limited', async () => {
    await expect(withFailureLog('booking.cancel', ctx, {}, async () => { throw new AppError('rate_limited'); })).rejects.toBeInstanceOf(AppError);
    expect(JSON.parse(lines[0]!).outcome).toBe('rate_limited');
  });
  it('unexpected errors are logged as internal with a scrubbed summary (no stack, no secrets)', async () => {
    await expect(withFailureLog('booking.cancel', ctx, {}, async () => { throw new Error(`boom ${JWT}`); })).rejects.toThrow('boom');
    expect(lines.length).toBe(2);
    expect(out()).not.toContain('eyJhbGci');
    expect(out()).not.toContain('"stack"');
  });
});
