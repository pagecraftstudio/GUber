import { describe, expect, it } from 'vitest';
import { authUrlError } from './auth-url-error';

describe('authUrlError', () => {
  it('maps the three allow-listed codes in both languages', () => {
    for (const code of ['google_failed', 'google_not_allowed', 'confirm_failed']) {
      expect(authUrlError(`?error=${code}`, 'en')).toBeTruthy();
      expect(authUrlError(`?error=${code}`, 'ar')).toMatch(/[\u0600-\u06FF]/);
    }
  });
  it('ignores unknown codes and never echoes URL text', () => {
    expect(authUrlError('?error=<script>alert(1)</script>', 'en')).toBeNull();
    expect(authUrlError('?error=__proto__', 'en')).toBeNull();
    expect(authUrlError('?error=toString', 'en')).toBeNull();
    expect(authUrlError('', 'en')).toBeNull();
    expect(authUrlError('?next=/my-bookings', 'ar')).toBeNull();
  });
});
