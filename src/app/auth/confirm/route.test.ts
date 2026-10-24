import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const verifyOtp = vi.fn();
const ctxHolder: { ctx: unknown } = { ctx: null };
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { verifyOtp } }) }));
vi.mock('@/lib/auth/context', () => ({ getAuthContext: async () => ctxHolder.ctx }));
vi.mock('@/lib/auth/permissions', () => ({ homePathFor: (c: { home: string } | null) => (c ? c.home : '/') }));
vi.mock('@/lib/env', () => ({ getEnv: () => ({ NEXT_PUBLIC_SITE_URL: 'https://app.example.test' }) }));

import { GET } from './route';

const call = async (qs: string) => {
  const res = await GET(new NextRequest(`https://app.example.test/auth/confirm?${qs}`));
  return { status: res.status, location: res.headers.get('location') };
};

beforeEach(() => { verifyOtp.mockReset(); verifyOtp.mockResolvedValue({ error: null }); ctxHolder.ctx = null; });

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
