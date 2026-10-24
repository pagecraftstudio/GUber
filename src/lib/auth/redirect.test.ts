import { describe, expect, it } from 'vitest';
import { loginPathFor, safeNextPath } from './redirect';

const FB = '/fallback';

describe('safeNextPath()', () => {
  it.each(['/dashboard', '/dashboard/trips?x=1', '/admin', '/admin/companies/5', '/reset-password', '/my-bookings', `/invite/${'a'.repeat(64)}`])(
    'accepts %s',
    (p) => expect(safeNextPath(p, FB)).toBe(p),
  );
  it.each([
    'https://evil.test',
    '//evil.test',
    '/\\evil.test',
    '/\\/evil.test',
    'javascript:alert(1)',
    'dashboard',
    '/dashboardevil',
    '/dashboard/../etc/passwd',
    '/login',
    '/company/login',
    '/my-bookingsevil',
    '/driver',
    '/dashboard\r\nSet-Cookie: x=1',
    '/dash\u0000board',
    '',
    '/' + 'a'.repeat(600),
  ])('rejects %j', (p) => expect(safeNextPath(p, FB)).toBe(FB));
  it('handles null/undefined', () => {
    expect(safeNextPath(null, FB)).toBe(FB);
    expect(safeNextPath(undefined, FB)).toBe(FB);
  });
});

describe('loginPathFor()', () => {
  it('customer areas go to the customer login', () => {
    expect(loginPathFor('/my-bookings')).toBe('/login');
    expect(loginPathFor('/my-bookings?x=1')).toBe('/login');
    expect(loginPathFor('/reset-password')).toBe('/login');
  });
  it('operator areas go to the company login', () => {
    for (const p of ['/dashboard', '/dashboard/trips', '/admin', '/driver', '/suspended', '/no-access', '/invite/abc', '/my-bookingsevil', '', null, undefined]) {
      expect(loginPathFor(p)).toBe('/company/login');
    }
  });
});

import { audienceFrom, confirmFailurePath, confirmLandingPath, loginPathForAudience } from './redirect';

describe('audience helpers', () => {
  it('only the literal "customer" selects the customer flow; everything else is operator', () => {
    expect(audienceFrom('customer')).toBe('customer');
    for (const v of ['operator', 'Customer', 'CUSTOMER', '', null, undefined, 'customer ', '../admin', 'https://evil.test']) expect(audienceFrom(v as string)).toBe('operator');
  });
  it('maps audience to the matching login page', () => {
    expect(loginPathForAudience('customer')).toBe('/login');
    expect(loginPathForAudience('operator')).toBe('/company/login');
  });
});

describe('confirmLandingPath() - where a VERIFIED email link lands', () => {
  it('an allow-listed next wins over everything', () => {
    expect(confirmLandingPath('/my-bookings', 'email', '/dashboard')).toBe('/my-bookings');
    expect(confirmLandingPath('/reset-password', 'recovery', '/my-bookings')).toBe('/reset-password');
    expect(confirmLandingPath('/invite/abc', 'email', '/my-bookings')).toBe('/invite/abc');
  });
  it('missing next: recovery -> password form; otherwise the SESSION-derived home; never a hard-coded /dashboard', () => {
    expect(confirmLandingPath(null, 'recovery', '/dashboard')).toBe('/reset-password');
    expect(confirmLandingPath(null, 'email', '/my-bookings')).toBe('/my-bookings');
    expect(confirmLandingPath(undefined, 'email', '/driver')).toBe('/driver');
    expect(confirmLandingPath('', 'email', null)).toBe('/my-bookings');
    expect(confirmLandingPath(null, null, undefined)).toBe('/my-bookings');
    expect(confirmLandingPath(null, 'email', '')).toBe('/my-bookings');
  });
  it.each(['https://evil.test', '//evil.test', '/\\evil.test', 'javascript:alert(1)', '/login', '/company/login', '/driver', '/dashboard/../x', '/dashboard\r\nSet-Cookie: a=b', '/' + 'a'.repeat(600)])(
    'invalid next %j falls back to the context-appropriate home, not to an attacker URL and not to /dashboard',
    (bad) => {
      expect(confirmLandingPath(bad, 'email', '/my-bookings')).toBe('/my-bookings');
      expect(confirmLandingPath(bad, 'recovery', '/my-bookings')).toBe('/reset-password');
    },
  );
});

describe('confirmFailurePath() - where a FAILED link goes', () => {
  it('recovery failures go to the reset-request form with the audience preserved', () => {
    expect(confirmFailurePath('/reset-password', 'recovery', 'customer')).toBe('/forgot-password?error=confirm_failed&from=customer');
    expect(confirmFailurePath(null, 'recovery', 'operator')).toBe('/forgot-password?error=confirm_failed&from=operator');
  });
  it('a customer target (or nothing usable) never lands on the operator login', () => {
    expect(confirmFailurePath('/my-bookings', 'email', 'operator')).toBe('/login?error=confirm_failed');
    expect(confirmFailurePath(null, 'email', 'operator')).toBe('/login?error=confirm_failed');
    expect(confirmFailurePath('https://evil.test', 'email', 'operator')).toBe('/login?error=confirm_failed');
    expect(confirmFailurePath(null, null, 'customer')).toBe('/login?error=confirm_failed');
  });
  it('an operator target still goes to the operator login', () => {
    expect(confirmFailurePath('/dashboard/trips', 'email', 'customer')).toBe('/company/login?error=confirm_failed');
    expect(confirmFailurePath('/admin', 'email', 'customer')).toBe('/company/login?error=confirm_failed');
  });
  it('never produces an absolute or protocol-relative URL', () => {
    for (const next of ['https://evil.test', '//evil.test', '/dashboard', null]) for (const type of ['email', 'recovery', null])
      expect(confirmFailurePath(next, type, 'operator')).toMatch(/^\/[a-z]/);
  });
});
