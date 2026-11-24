import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '@/lib/errors';
import { mapDbError } from '@/lib/db/map-error';
import { readCaptchaConfig } from './config';
import { ensureCaptchaPass } from './pass';
import { PROOF_TTL_SECONDS, signProof } from './proof';
import { createFakeVerifier, createTurnstileVerifier } from './verify';

const SECRET = 'unit-test-captcha-secret-0123456789abcdef';
const USER = '11111111-1111-4111-8111-111111111111';

/** Fake Supabase client: `enforced` answers captcha_enforced, redeem results are scripted, every rpc call is recorded. */
function fakeDb(enforced: boolean, redeem: { error: { code?: string; message?: string } | null } = { error: null }) {
  const calls: { fn: string; args: unknown }[] = [];
  const db = { rpc: vi.fn(async (fn: string, args?: unknown) => { calls.push({ fn, args }); return fn === 'captcha_enforced' ? { data: enforced, error: null } : { data: null, error: redeem.error }; }) } as unknown as SupabaseClient;
  return { db, calls };
}
const cfg = { turnstileSecret: 'ts-secret-ts-secret-ts', passSecret: SECRET };

describe('signProof', () => {
  it('signs exactly the string the database recomputes (v1|purpose|user|exp|nonce, HMAC-SHA256 hex)', () => {
    const p = signProof(SECRET, 'booking', USER, 1_700_000_000_000, 'abcdefghijklmnop');
    expect(p.exp).toBe(1_700_000_000 + PROOF_TTL_SECONDS);
    expect(p.sig).toBe(createHmac('sha256', SECRET).update(`v1|booking|${USER}|${p.exp}|abcdefghijklmnop`).digest('hex'));
  });
  it('expiry stays inside the 600 s the database accepts, nonce matches its pattern, nonces never repeat', () => {
    const a = signProof(SECRET, 'subscription', USER), b = signProof(SECRET, 'subscription', USER);
    expect(PROOF_TTL_SECONDS).toBeLessThanOrEqual(600);
    expect(a.nonce).toMatch(/^[A-Za-z0-9_-]{16,64}$/);
    expect(a.nonce).not.toBe(b.nonce);
  });
  it('refuses a short secret and binds purpose and user into the signature', () => {
    expect(() => signProof('short', 'booking', USER)).toThrow();
    const base = signProof(SECRET, 'booking', USER, 1, 'abcdefghijklmnop');
    expect(signProof(SECRET, 'subscription', USER, 1, 'abcdefghijklmnop').sig).not.toBe(base.sig);
    expect(signProof(SECRET, 'booking', '22222222-2222-4222-8222-222222222222', 1, 'abcdefghijklmnop').sig).not.toBe(base.sig);
  });
});

describe('createTurnstileVerifier', () => {
  const ok = (body: unknown) => vi.fn(async () => ({ ok: true, json: async () => body }));
  it('accepts a successful verification for the same action and sends secret + token', async () => {
    const f = ok({ success: true, action: 'booking' });
    expect(await createTurnstileVerifier('sk', f as never).verifyCaptcha('tok', 'booking')).toEqual({ ok: true });
    const init = (f.mock.calls[0] as unknown as [string, { body: string }])[1];
    expect(init.body).toContain('secret=sk'); expect(init.body).toContain('response=tok');
  });
  it('rejects a token minted for another action (no replay of a login token on a booking)', async () => {
    expect(await createTurnstileVerifier('sk', ok({ success: true, action: 'login' }) as never).verifyCaptcha('tok', 'booking')).toEqual({ ok: false, reason: 'action_mismatch' });
  });
  it('rejects failures, missing and oversized tokens without a network call', async () => {
    expect(await createTurnstileVerifier('sk', ok({ success: false }) as never).verifyCaptcha('tok', 'booking')).toEqual({ ok: false, reason: 'rejected' });
    const f = ok({ success: true, action: 'booking' });
    expect(await createTurnstileVerifier('sk', f as never).verifyCaptcha('', 'booking')).toEqual({ ok: false, reason: 'missing_token' });
    expect(await createTurnstileVerifier('sk', f as never).verifyCaptcha('x'.repeat(2049), 'booking')).toEqual({ ok: false, reason: 'missing_token' });
    expect(f).not.toHaveBeenCalled();
  });
  it('fails closed on network errors and non-2xx answers', async () => {
    expect(await createTurnstileVerifier('sk', (async () => { throw new Error('down'); }) as never).verifyCaptcha('tok', 'booking')).toEqual({ ok: false, reason: 'unavailable' });
    expect(await createTurnstileVerifier('sk', (async () => ({ ok: false, json: async () => ({}) })) as never).verifyCaptcha('tok', 'booking')).toEqual({ ok: false, reason: 'unavailable' });
  });
});

describe('ensureCaptchaPass', () => {
  it('enforcement off: asks the database once, verifies nothing, redeems nothing', async () => {
    const { db, calls } = fakeDb(false); const v = createFakeVerifier();
    await ensureCaptchaPass(db, USER, 'booking', undefined, { verifier: v, config: cfg });
    expect(calls.map((c) => c.fn)).toEqual(['captcha_enforced']); expect(v.calls).toHaveLength(0);
  });
  it('enforcement on, valid token: verifies for the purpose, then redeems a proof signed for this user', async () => {
    const { db, calls } = fakeDb(true); const v = createFakeVerifier(['good']);
    await ensureCaptchaPass(db, USER, 'subscription', 'good', { verifier: v, config: cfg, now: () => 1_700_000_000_000 });
    expect(v.calls).toEqual([{ token: 'good', action: 'subscription' }]);
    const redeem = calls.find((c) => c.fn === 'redeem_captcha_proof')!.args as { p_purpose: string; p_exp: number; p_nonce: string; p_sig: string };
    expect(redeem.p_purpose).toBe('subscription');
    expect(redeem.p_sig).toBe(createHmac('sha256', SECRET).update(`v1|subscription|${USER}|${redeem.p_exp}|${redeem.p_nonce}`).digest('hex'));
  });
  it('enforcement on, no token: captcha_required, nothing verified or redeemed', async () => {
    const { db, calls } = fakeDb(true); const v = createFakeVerifier();
    await expect(ensureCaptchaPass(db, USER, 'booking', null, { verifier: v, config: cfg })).rejects.toMatchObject({ code: 'forbidden', detail: 'captcha_required' });
    expect(calls.some((c) => c.fn === 'redeem_captcha_proof')).toBe(false); expect(v.calls).toHaveLength(0);
  });
  it('enforcement on, bad token: captcha_invalid and no proof is ever signed', async () => {
    const { db, calls } = fakeDb(true);
    await expect(ensureCaptchaPass(db, USER, 'booking', 'bad', { verifier: createFakeVerifier(['good']), config: cfg })).rejects.toMatchObject({ detail: 'captcha_invalid' });
    expect(calls.some((c) => c.fn === 'redeem_captcha_proof')).toBe(false);
  });
  it('FAILS CLOSED: enforcement on and secrets missing -> refused, never waved through', async () => {
    const { db, calls } = fakeDb(true);
    await expect(ensureCaptchaPass(db, USER, 'booking', 'good', { verifier: createFakeVerifier(['good']), config: null })).rejects.toMatchObject({ code: 'internal', detail: 'captcha_unavailable' });
    expect(calls.some((c) => c.fn === 'redeem_captcha_proof')).toBe(false);
  });
  it('FAILS CLOSED: provider outage is "unavailable", not a pass', async () => {
    const { db } = fakeDb(true);
    const down = { verifyCaptcha: async () => ({ ok: false as const, reason: 'unavailable' as const }) };
    await expect(ensureCaptchaPass(db, USER, 'booking', 'tok', { verifier: down, config: cfg })).rejects.toMatchObject({ detail: 'captcha_unavailable' });
  });
  it('cannot read the enforcement flag -> refuses instead of assuming off', async () => {
    const db = { rpc: async () => ({ data: null, error: { code: 'XX000', message: 'boom' } }) } as unknown as SupabaseClient;
    await expect(ensureCaptchaPass(db, USER, 'booking', 'tok', { verifier: createFakeVerifier(['tok']), config: cfg })).rejects.toBeInstanceOf(AppError);
  });
  it('database refusal of the proof surfaces as captcha_invalid', async () => {
    const { db } = fakeDb(true, { error: { code: '42501', message: 'captcha proof invalid' } });
    await expect(ensureCaptchaPass(db, USER, 'booking', 'good', { verifier: createFakeVerifier(['good']), config: cfg })).rejects.toMatchObject({ detail: 'captcha_invalid' });
  });
});

describe('mapDbError for captcha', () => {
  it('maps both database messages to stable details, and leaves other 42501 as forbidden', () => {
    expect(mapDbError({ code: '42501', message: 'captcha required' })).toMatchObject({ code: 'forbidden', detail: 'captcha_required' });
    expect(mapDbError({ code: '42501', message: 'captcha proof invalid' })).toMatchObject({ code: 'forbidden', detail: 'captcha_invalid' });
    expect(mapDbError({ code: '42501', message: 'permission denied' }).detail).toBeUndefined();
  });
});

describe('readCaptchaConfig', () => {
  it('needs both secrets and a 32+ char pass secret, else null (fail closed)', () => {
    expect(readCaptchaConfig({ TURNSTILE_SECRET_KEY: 'a'.repeat(20), CAPTCHA_PASS_SECRET: SECRET })).toEqual({ turnstileSecret: 'a'.repeat(20), passSecret: SECRET });
    expect(readCaptchaConfig({ CAPTCHA_PASS_SECRET: SECRET })).toBeNull();
    expect(readCaptchaConfig({ TURNSTILE_SECRET_KEY: 'a'.repeat(20), CAPTCHA_PASS_SECRET: 'short' })).toBeNull();
    expect(readCaptchaConfig({})).toBeNull();
  });
});
