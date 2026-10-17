import { describe, expect, it } from 'vitest';
import { safeNextPath } from './redirect';

const FB = '/fallback';

describe('safeNextPath()', () => {
  it.each(['/dashboard', '/dashboard/trips?x=1', '/admin', '/admin/companies/5', '/reset-password', `/invite/${'a'.repeat(64)}`])(
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
