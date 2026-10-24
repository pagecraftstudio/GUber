import { describe, expect, it, vi } from 'vitest';
import { assertEnv, checkEnv, formatEnvIssues, shouldEnforce } from './env-check';

const SERVICE_JWT = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.sig_sig_sig_sig`;
const ANON_JWT = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url')}.sig_sig_sig_sig`;
const good = { NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: ANON_JWT, NEXT_PUBLIC_SITE_URL: 'https://bus.example.com' };
const names = (e: Record<string, string | undefined>) => checkEnv(e).issues.map((i) => i.name);

describe('checkEnv', () => {
  it('accepts a correct configuration (also new-style publishable keys and local http)', () => {
    expect(checkEnv(good).ok).toBe(true);
    expect(checkEnv({ ...good, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abcdefghijklmnop' }).ok).toBe(true);
    expect(checkEnv({ NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:3100', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: ANON_JWT, NEXT_PUBLIC_SITE_URL: 'http://localhost:3000' }).ok).toBe(true);
  });
  it('reports every missing variable', () => expect(names({})).toEqual(['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SITE_URL']));
  it('treats blank as missing', () => expect(names({ ...good, NEXT_PUBLIC_SITE_URL: '  ' })).toEqual(['NEXT_PUBLIC_SITE_URL']));
  it('rejects malformed and non-https Supabase URLs (except loopback)', () => {
    expect(names({ ...good, NEXT_PUBLIC_SUPABASE_URL: 'not a url' })).toContain('NEXT_PUBLIC_SUPABASE_URL');
    expect(names({ ...good, NEXT_PUBLIC_SUPABASE_URL: 'http://abc.supabase.co' })).toContain('NEXT_PUBLIC_SUPABASE_URL');
    expect(names({ ...good, NEXT_PUBLIC_SUPABASE_URL: 'https://u:p@abc.supabase.co' })).toContain('NEXT_PUBLIC_SUPABASE_URL');
  });
  it('rejects a service-role JWT or sb_secret_ key used as the public key', () => {
    expect(names({ ...good, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: SERVICE_JWT })).toContain('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
    expect(names({ ...good, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_abcdefghijklmnop' })).toContain('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
    expect(names({ ...good, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'short' })).toContain('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  });
  it('SITE_URL must be an origin', () => {
    for (const v of ['https://bus.example.com/app', 'https://bus.example.com/?x=1', 'ftp://x.test', 'bus.example.com']) expect(names({ ...good, NEXT_PUBLIC_SITE_URL: v }), v).toContain('NEXT_PUBLIC_SITE_URL');
    expect(checkEnv({ ...good, NEXT_PUBLIC_SITE_URL: 'https://bus.example.com/' }).ok).toBe(true);
  });
  it('hosted deployments (VERCEL_ENV) require https and forbid localhost', () => {
    expect(names({ ...good, VERCEL_ENV: 'production', NEXT_PUBLIC_SITE_URL: 'http://bus.example.com' })).toContain('NEXT_PUBLIC_SITE_URL');
    expect(names({ ...good, VERCEL_ENV: 'preview', NEXT_PUBLIC_SITE_URL: 'https://localhost:3000' })).toContain('NEXT_PUBLIC_SITE_URL');
    expect(names({ ...good, VERCEL_ENV: 'production', NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321' })).toContain('NEXT_PUBLIC_SUPABASE_URL');
  });
  it('flags secret-looking NEXT_PUBLIC_ variables by name and by value', () => {
    expect(names({ ...good, NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY: 'x' })).toContain('NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY');
    expect(names({ ...good, NEXT_PUBLIC_STRIPE_SECRET: 'x' })).toContain('NEXT_PUBLIC_STRIPE_SECRET');
    expect(names({ ...good, NEXT_PUBLIC_ANYTHING: SERVICE_JWT })).toContain('NEXT_PUBLIC_ANYTHING');
    expect(names({ ...good, NEXT_PUBLIC_FEATURE_FLAG: 'on' })).toEqual([]);
    expect(names({ ...good, SUPABASE_SERVICE_ROLE_KEY: SERVICE_JWT })).toEqual([]);          // server-only names are legitimate
  });
  it('mock mode is rejected in production and on hosts; garbage modes always', () => {
    expect(names({ ...good, NODE_ENV: 'production', NEXT_PUBLIC_UI_DATA_MODE: 'mock' })).toContain('NEXT_PUBLIC_UI_DATA_MODE');
    expect(names({ ...good, VERCEL_ENV: 'preview', NEXT_PUBLIC_UI_DATA_MODE: 'mock' })).toContain('NEXT_PUBLIC_UI_DATA_MODE');
    expect(names({ ...good, NEXT_PUBLIC_UI_DATA_MODE: 'demo' })).toContain('NEXT_PUBLIC_UI_DATA_MODE');
    expect(checkEnv({ ...good, NODE_ENV: 'development', NEXT_PUBLIC_UI_DATA_MODE: 'mock' }).ok).toBe(true);
  });
  it('NEVER echoes a value, not even a fragment', () => {
    const secretish = { NEXT_PUBLIC_SUPABASE_URL: 'http://user:hunter2@evil.example', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: SERVICE_JWT, NEXT_PUBLIC_SITE_URL: 'https://bus.example.com/path?token=abc123', NEXT_PUBLIC_X_SECRET: 'topsecretvalue' };
    const msg = formatEnvIssues(checkEnv(secretish).issues);
    for (const frag of ['hunter2', 'evil.example', 'eyJhbGci', 'sig_sig', 'abc123', 'topsecretvalue', '/path']) expect(msg).not.toContain(frag);
    expect(msg).toContain('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  });
});

describe('assertEnv / shouldEnforce', () => {
  it('throws a clear error at build and server start', () => {
    expect(() => assertEnv({}, 'build')).toThrow(/NEXT_PUBLIC_SUPABASE_URL: is missing/);
    expect(() => assertEnv({}, 'server')).toThrow(/Invalid environment configuration \(3 problems\)/);
  });
  it('passes silently when valid', () => expect(() => assertEnv(good, 'build')).not.toThrow());
  it('dev only warns; mock-mode dev needs nothing', () => {
    const warn = vi.fn();
    expect(() => assertEnv({}, 'dev', warn)).not.toThrow();
    expect(warn).toHaveBeenCalledOnce();
    const warn2 = vi.fn();
    assertEnv({ NEXT_PUBLIC_UI_DATA_MODE: 'mock' }, 'dev', warn2);
    expect(warn2).not.toHaveBeenCalled();
  });
  it('SKIP_ENV_VALIDATION=1 downgrades to a loud warning, but never on Vercel production', () => {
    const warn = vi.fn();
    expect(() => assertEnv({ SKIP_ENV_VALIDATION: '1' }, 'build', warn)).not.toThrow();
    expect(warn.mock.calls[0]![0]).toMatch(/SKIPPED/);
    expect(() => assertEnv({ SKIP_ENV_VALIDATION: '1', VERCEL_ENV: 'production' }, 'build')).toThrow();
    expect(shouldEnforce({ SKIP_ENV_VALIDATION: 'true' }, 'build').enforce).toBe(true);
  });
});

describe('Phase 8D: SKIP_ENV_VALIDATION on hosted deployments', () => {
  it('is ignored on Vercel preview (staging often runs as a preview) as well as production', () => {
    for (const VERCEL_ENV of ['preview', 'production', 'development']) {
      expect(shouldEnforce({ SKIP_ENV_VALIDATION: '1', VERCEL_ENV }, 'build').enforce).toBe(true);
      expect(shouldEnforce({ SKIP_ENV_VALIDATION: '1', VERCEL_ENV }, 'server').enforce).toBe(true);
      expect(() => assertEnv({ SKIP_ENV_VALIDATION: '1', VERCEL_ENV }, 'build')).toThrow();
    }
    expect(shouldEnforce({ SKIP_ENV_VALIDATION: '1', VERCEL: '1' }, 'build').enforce).toBe(true);
  });
  it('still works for a plain local/CI compile', () => {
    expect(shouldEnforce({ SKIP_ENV_VALIDATION: '1' }, 'build')).toEqual({ enforce: false, skippedBy: 'SKIP_ENV_VALIDATION=1' });
  });
});
