import { beforeEach, describe, expect, it, vi } from 'vitest';

const signInWithPassword = vi.fn();
const resetPasswordForEmail = vi.fn();
const signUp = vi.fn();
const redirectSpy = vi.fn((to: string) => { throw Object.assign(new Error('NEXT_REDIRECT'), { to }); });
vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({ redirect: (to: string) => redirectSpy(to) }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { signInWithPassword, resetPasswordForEmail, signUp, signOut: vi.fn() }, rpc: vi.fn(async () => ({ data: [{ email: 'a@b.test' }] })) }) }));
vi.mock('@/lib/auth/context', () => ({ loadContext: async () => ({ home: '/dashboard' }) }));
vi.mock('@/lib/auth/permissions', () => ({ homePathFor: () => '/dashboard' }));
vi.mock('@/lib/auth/guards', () => ({ requireUser: async () => ({}) }));
vi.mock('@/lib/env', () => ({ getEnv: () => ({ NEXT_PUBLIC_SITE_URL: 'https://app.example.test' }) }));
import { forgotPasswordAction, loginAction } from './actions';

const form = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
const dest = async (fn: () => Promise<void>) => { try { await fn(); } catch (e) { return (e as { to?: string }).to ?? String(e); } return 'no redirect'; };

beforeEach(() => { signInWithPassword.mockReset(); resetPasswordForEmail.mockReset(); redirectSpy.mockClear(); });

describe('operator sign-in forwards the captcha token to Supabase Auth', () => {
  it('sends captchaToken when the form carries one', async () => {
    signInWithPassword.mockResolvedValue({ error: null });
    await dest(() => loginAction(form({ email: 'staff@x.test', password: 'a-long-password-1', captchaToken: 'tok-123' })));
    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'staff@x.test', password: 'a-long-password-1', options: { captchaToken: 'tok-123' } });
  });
  it('sends no token key at all when absent (captcha off)', async () => {
    signInWithPassword.mockResolvedValue({ error: null });
    await dest(() => loginAction(form({ email: 'staff@x.test', password: 'a-long-password-1' })));
    expect(signInWithPassword.mock.calls[0]![0].options).toEqual({});
  });
  it('a captcha refusal from Supabase becomes the captcha_failed message, not "wrong password"', async () => {
    signInWithPassword.mockResolvedValue({ error: { status: 400, code: 'captcha_failed' } });
    expect(await dest(() => loginAction(form({ email: 'staff@x.test', password: 'a-long-password-1' })))).toContain('error=captcha_failed');
  });
});

describe('password reset', () => {
  it('forwards the token and reports a captcha refusal', async () => {
    resetPasswordForEmail.mockResolvedValue({ error: { status: 400, code: 'captcha_failed' } });
    const to = await dest(() => forgotPasswordAction(form({ email: 'a@b.test', from: 'operator', captchaToken: 'tok' })));
    expect(resetPasswordForEmail.mock.calls[0]![1]).toMatchObject({ captchaToken: 'tok' });
    expect(to).toContain('error=captcha_failed');
  });
});
