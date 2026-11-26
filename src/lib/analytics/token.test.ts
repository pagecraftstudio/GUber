import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { INGEST_TTL_SECONDS, signIngest } from './token';

const SECRET = 'k'.repeat(40);
const S = 'sess_abcdefghijklmnop';
const U = '00000000-0000-4000-8000-000000000001';
const NOW = Date.UTC(2026, 10, 26, 10, 0, 0);

describe('signIngest', () => {
  it('signs the exact string the database recomputes', () => {
    const t = signIngest(SECRET, 'events', { session: S, userId: U, companyId: null }, NOW);
    const exp = Math.floor(NOW / 1000) + INGEST_TTL_SECONDS;
    expect(t.exp).toBe(exp);
    expect(t.sig).toBe(createHmac('sha256', SECRET).update(`v1|events|${S}|${U}||${exp}`).digest('hex'));
    expect(t.sig).toMatch(/^[0-9a-f]{64}$/);
  });
  it('binds call, session, user and secret', () => {
    const base = signIngest(SECRET, 'events', { session: S, userId: null }, NOW).sig;
    expect(signIngest(SECRET, 'search', { session: S, userId: null }, NOW).sig).not.toBe(base);
    expect(signIngest(SECRET, 'events', { session: S + 'x', userId: null }, NOW).sig).not.toBe(base);
    expect(signIngest(SECRET, 'events', { session: S, userId: U }, NOW).sig).not.toBe(base);
    expect(signIngest('j'.repeat(40), 'events', { session: S, userId: null }, NOW).sig).not.toBe(base);
    expect(signIngest(SECRET, 'consent:true', { session: S, userId: null }, NOW).sig).not.toBe(signIngest(SECRET, 'consent:false', { session: S, userId: null }, NOW).sig);
  });
  it('lifetime stays inside the 120 s the database accepts, and a short secret is refused', () => {
    expect(INGEST_TTL_SECONDS).toBeLessThanOrEqual(120);
    expect(() => signIngest('short', 'events', { session: S, userId: null })).toThrow();
  });
});
