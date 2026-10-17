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
