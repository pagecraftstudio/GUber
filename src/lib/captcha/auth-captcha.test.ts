import { afterEach, describe, expect, it, vi } from 'vitest';
import { authCaptchaConfig, captchaOptions } from './auth-captcha';
import { checkEnv } from '@/lib/env-check';

afterEach(() => vi.unstubAllEnvs());

describe('authCaptchaConfig', () => {
  it('off by default: no widget, nothing sent', () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_CAPTCHA', ''); vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', '1x00000000000000000000AA');
    expect(authCaptchaConfig()).toEqual({ on: false, siteKey: null });
  });
  it("on needs the site key; on WITHOUT one is flagged (siteKey null while on === true) so the UI fails closed", () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_CAPTCHA', 'on'); vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', '');
    expect(authCaptchaConfig()).toEqual({ on: true, siteKey: null });
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', ' 1x00000000000000000000AA ');
    expect(authCaptchaConfig()).toEqual({ on: true, siteKey: '1x00000000000000000000AA' });
  });
  it('only the exact value "on" switches it on', () => {
    for (const v of ['ON', 'true', '1', 'yes']) { vi.stubEnv('NEXT_PUBLIC_AUTH_CAPTCHA', v); expect(authCaptchaConfig().on).toBe(false); }
  });
});

describe('captchaOptions', () => {
  it('sends the token only when there is one', () => {
    expect(captchaOptions('tok')).toEqual({ captchaToken: 'tok' });
    for (const v of [null, undefined, '']) expect(captchaOptions(v)).toEqual({});
  });
});

describe('env check for NEXT_PUBLIC_AUTH_CAPTCHA', () => {
  const base = { NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_' + 'a'.repeat(24), NEXT_PUBLIC_SITE_URL: 'https://app.example.test' };
  it('rejects a value that is not on/off, and "on" without a site key', () => {
    expect(checkEnv({ ...base, NEXT_PUBLIC_AUTH_CAPTCHA: 'maybe' } as never).issues.map((i) => i.name)).toContain('NEXT_PUBLIC_AUTH_CAPTCHA');
    expect(checkEnv({ ...base, NEXT_PUBLIC_AUTH_CAPTCHA: 'on' } as never).issues.map((i) => i.name)).toContain('NEXT_PUBLIC_TURNSTILE_SITE_KEY');
    expect(checkEnv({ ...base, NEXT_PUBLIC_AUTH_CAPTCHA: 'on', NEXT_PUBLIC_TURNSTILE_SITE_KEY: '1x00000000000000000000AA' } as never).issues.map((i) => i.name)).not.toContain('NEXT_PUBLIC_AUTH_CAPTCHA');
  });
});
