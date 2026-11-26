import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const verifyOtp = vi.fn();
const exchangeCodeForSession = vi.fn();
const getUserIdentities = vi.fn();
const unlinkIdentity = vi.fn();
const signOut = vi.fn();
const ctxHolder: { ctx: unknown } = { ctx: null };
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { verifyOtp, exchangeCodeForSession, getUserIdentities, unlinkIdentity, signOut } }),
}));
vi.mock('@/lib/auth/context', () => ({ getAuthContext: async () => ctxHolder.ctx }));
vi.mock('@/lib/auth/permissions', () => ({
  homePathFor: (c: { home: string } | null) => (c ? c.home : '/'),
  accessState: (c: { state?: string }) => c.state ?? 'customer',
}));
const recordServerEvent = vi.fn(async () => undefined);
vi.mock('@/lib/analytics/server-event', async (orig) => ({ ...(await orig<typeof import('@/lib/analytics/server-event')>()), recordServerEvent: (...a: unknown[]) => (recordServerEvent as (...x: unknown[]) => Promise<void>)(...a) }));
vi.mock('@/lib/env', () => ({ getEnv: () => ({ NEXT_PUBLIC_SITE_URL: 'https://app.example.test' }) }));

import { GET } from './route';

const call = async (qs: string) => {
  const res = await GET(new NextRequest(`https://app.example.test/auth/confirm?${qs}`));
  return { status: res.status, location: res.headers.get('location') };
};

beforeEach(() => {
  verifyOtp.mockReset(); verifyOtp.mockResolvedValue({ error: null });
  exchangeCodeForSession.mockReset(); exchangeCodeForSession.mockResolvedValue({ error: null });
  getUserIdentities.mockReset(); getUserIdentities.mockResolvedValue({ data: { identities: [] }, error: null });
  unlinkIdentity.mockReset(); unlinkIdentity.mockResolvedValue({ error: null });
  signOut.mockReset(); signOut.mockResolvedValue({ error: null });
  recordServerEvent.mockClear();
  ctxHolder.ctx = null;
});

describe('GET /auth/confirm', () => {
  it('valid link + allow-listed next -> that page', async () => {
    expect((await call('token_hash=h&type=email&next=%2Fmy-bookings')).location).toBe('https://app.example.test/my-bookings');
  });
  it('MISSING next for a customer session -> customer home, NOT /dashboard', async () => {
    ctxHolder.ctx = { home: '/my-bookings' };
    expect((await call('token_hash=h&type=email')).location).toBe('https://app.example.test/my-bookings');
  });
  it('INVALID next for a customer session -> customer home, NOT /dashboard', async () => {
    ctxHolder.ctx = { home: '/my-bookings' };
    for (const bad of ['https%3A%2F%2Fevil.test', '%2F%2Fevil.test', '%2Fcompany%2Flogin', 'dashboard']) {
      const r = await call(`token_hash=h&type=email&next=${bad}`);
      expect(r.location, bad).toBe('https://app.example.test/my-bookings');
    }
  });
  it('operator session with no next -> the operator home resolved from the session', async () => {
    ctxHolder.ctx = { home: '/driver' };
    expect((await call('token_hash=h&type=email')).location).toBe('https://app.example.test/driver');
  });
  it('recovery link lands on the password form even without next', async () => {
    expect((await call('token_hash=h&type=recovery')).location).toBe('https://app.example.test/reset-password');
  });
  it('verification failure for a customer target -> customer login, never the operator login', async () => {
    verifyOtp.mockResolvedValue({ error: { message: 'expired' } });
    expect((await call('token_hash=h&type=email&next=%2Fmy-bookings')).location).toBe('https://app.example.test/login?error=confirm_failed');
    expect((await call('token_hash=h&type=email')).location).toBe('https://app.example.test/login?error=confirm_failed');
  });
  it('recovery failure -> reset-request form, audience preserved', async () => {
    verifyOtp.mockResolvedValue({ error: { message: 'expired' } });
    expect((await call('token_hash=h&type=recovery&next=%2Freset-password&from=customer')).location).toBe('https://app.example.test/forgot-password?error=confirm_failed&from=customer');
    expect((await call('token_hash=h&type=recovery')).location).toBe('https://app.example.test/forgot-password?error=confirm_failed&from=operator');
  });
  it('missing hash / unsupported type never calls verifyOtp and fails safely', async () => {
    expect((await call('type=email')).location).toBe('https://app.example.test/login?error=confirm_failed');
    expect((await call('token_hash=h&type=magiclink')).location).toBe('https://app.example.test/login?error=confirm_failed');
    expect((await call('token_hash=h&type=invite&next=%2Fdashboard')).location).toBe('https://app.example.test/company/login?error=confirm_failed');
    expect(verifyOtp).not.toHaveBeenCalled();
  });
  it('the redirect always stays on the configured origin', async () => {
    for (const q of ['token_hash=h&type=email&next=https%3A%2F%2Fevil.test', 'type=recovery&next=%2F%2Fevil.test', 'token_hash=h&type=email&from=https%3A%2F%2Fevil.test']) {
      const r = await call(q);
      expect(new URL(r.location!).origin, q).toBe('https://app.example.test');
    }
  });
});

describe('GET /auth/confirm: Google sign-in (customers only)', () => {
  it('customer + allow-listed next -> that page', async () => {
    ctxHolder.ctx = { home: '/my-bookings', state: 'customer' };
    const r = await call('code=abc&from=customer&next=%2Fmy-subscriptions');
    expect(exchangeCodeForSession).toHaveBeenCalledWith('abc');
    expect(r.location).toBe('https://app.example.test/my-subscriptions');
  });
  it('records a Google sign_in (returning account) or sign_up (new account), method only', async () => {
    ctxHolder.ctx = { home: '/my-bookings', state: 'customer' };
    exchangeCodeForSession.mockResolvedValue({ data: { user: { id: 'u1', created_at: '2026-01-01T00:00:00Z', last_sign_in_at: '2026-11-26T10:00:00Z' } }, error: null });
    await call('code=abc&from=customer');
    expect(recordServerEvent).toHaveBeenLastCalledWith(expect.anything(), 'u1', 'sign_in', { method: 'google' }, '/auth/confirm');
    exchangeCodeForSession.mockResolvedValue({ data: { user: { id: 'u2', created_at: '2026-11-26T10:00:00Z', last_sign_in_at: '2026-11-26T10:00:01Z' } }, error: null });
    await call('code=abc&from=customer');
    expect(recordServerEvent).toHaveBeenLastCalledWith(expect.anything(), 'u2', 'sign_up', { method: 'google' }, '/auth/confirm');
  });
  it('records nothing for a refused (non-customer) Google sign-in or a failed exchange', async () => {
    ctxHolder.ctx = { home: '/dashboard', state: 'operator' };
    exchangeCodeForSession.mockResolvedValue({ data: { user: { id: 'u3' } }, error: null });
    await call('code=abc&from=customer');
    exchangeCodeForSession.mockResolvedValue({ error: { message: 'bad' } });
    await call('code=abc&from=customer');
    expect(recordServerEvent).not.toHaveBeenCalled();
  });
  it('customer + missing or unsafe next -> customer home, never an open redirect', async () => {
    ctxHolder.ctx = { home: '/my-bookings', state: 'customer' };
    for (const bad of ['', '&next=https%3A%2F%2Fevil.test', '&next=%2F%2Fevil.test', '&next=%2Fdashboard%2Fusers%2F..%2F..%2Fx']) {
      const r = await call(`code=abc&from=customer${bad}`);
      expect(r.location, bad).toBe('https://app.example.test/my-bookings');
    }
  });
  it('a code without from=customer is refused BEFORE the exchange (operator login never offers Google)', async () => {
    for (const q of ['code=abc', 'code=abc&from=operator', 'code=abc&from=https%3A%2F%2Fevil.test']) {
      expect((await call(q)).location, q).toBe('https://app.example.test/login?error=google_not_allowed');
    }
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });
  it('a STAFF account is rejected: Google identity removed, session ended, no landing on an operator page', async () => {
    ctxHolder.ctx = { home: '/dashboard', state: 'tenant' };
    const google = { provider: 'google', identity_id: 'g1' };
    getUserIdentities.mockResolvedValue({ data: { identities: [{ provider: 'email', identity_id: 'e1' }, google] }, error: null });
    const r = await call('code=abc&from=customer&next=%2Fdashboard');
    expect(r.location).toBe('https://app.example.test/login?error=google_not_allowed');
    expect(unlinkIdentity).toHaveBeenCalledWith(google);
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
  });
  it('never unlinks the only identity an account has', async () => {
    ctxHolder.ctx = { home: '/admin', state: 'platform' };
    getUserIdentities.mockResolvedValue({ data: { identities: [{ provider: 'google', identity_id: 'g1' }] }, error: null });
    await call('code=abc&from=customer');
    expect(unlinkIdentity).not.toHaveBeenCalled();
    expect(signOut).toHaveBeenCalled();
  });
  it('no resolvable context after the exchange fails closed', async () => {
    ctxHolder.ctx = null;
    expect((await call('code=abc&from=customer')).location).toBe('https://app.example.test/login?error=google_not_allowed');
    expect(signOut).toHaveBeenCalled();
  });
  it('exchange failure -> customer login with google_failed', async () => {
    exchangeCodeForSession.mockResolvedValue({ error: { message: 'bad verifier' } });
    expect((await call('code=abc&from=customer')).location).toBe('https://app.example.test/login?error=google_failed');
  });
  it('user cancelled on Google (error param, no code) -> customer login, no exchange', async () => {
    expect((await call('error=access_denied&error_description=cancelled')).location).toBe('https://app.example.test/login?error=google_failed');
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });
});
