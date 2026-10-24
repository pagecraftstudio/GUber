import { describe, expect, it } from 'vitest';
import { siteIsHttps, withSecure } from './cookie-options';

describe('auth cookie Secure flag', () => {
  it('adds secure on https sites and preserves the other options', () => {
    expect(withSecure({ path: '/', sameSite: 'lax' as const, maxAge: 10, httpOnly: false }, 'https://bus.example.com')).toEqual({ path: '/', sameSite: 'lax', maxAge: 10, httpOnly: false, secure: true });
  });
  it('overrides an explicit secure:false on https (never downgrade)', () => {
    expect(withSecure({ secure: false }, 'https://bus.example.com').secure).toBe(true);
  });
  it('leaves http://localhost untouched', () => {
    expect(withSecure({ path: '/' }, 'http://localhost:3000')).toEqual({ path: '/' });
    expect(withSecure(undefined, 'http://localhost:3000')).toEqual({});
  });
  it('is robust to odd input', () => {
    expect(siteIsHttps(' HTTPS://x.example')).toBe(true);
    for (const v of ['', 'http://x', 'ftp://x', 'x.example']) expect(siteIsHttps(v)).toBe(false);
  });
});
