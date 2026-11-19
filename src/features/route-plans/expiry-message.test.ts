import { describe, expect, it } from 'vitest';
import { expiryMessage, whatsappLink } from './expiry-message';

const base = { memberName: 'Rana', planName: 'Monthly', routeName: 'Cairo → Galala', companyName: 'Nile Bus', validTo: '2026-11-25' };

describe('expiry message', () => {
  it('is written in the member language and names plan, company, route and date', () => {
    const en = expiryMessage({ ...base, memberLocale: 'en' });
    expect(en).toContain('Hello Rana');
    for (const part of ['Monthly', 'Nile Bus', 'Cairo → Galala', '2026-11-25', 'Renew now']) expect(en).toContain(part);
    const ar = expiryMessage({ ...base, memberLocale: 'ar' });
    expect(ar).toContain('مرحباً Rana');
    for (const part of ['Monthly', 'Nile Bus', '2026-11-25', 'جدّد الآن']) expect(ar).toContain(part);
  });
});

describe('whatsappLink', () => {
  it('uses digits only and URL-encodes the text', () => {
    const l = whatsappLink('+20 100 123 4567', 'a b&c=d');
    expect(l).toBe('https://wa.me/201001234567?text=a%20b%26c%3Dd');
  });
  it('refuses a phone without usable digits', () => {
    expect(whatsappLink('abc', 'x')).toBeNull();
    expect(whatsappLink('12345', 'x')).toBeNull();
    expect(whatsappLink('1'.repeat(16), 'x')).toBeNull();
  });
});
