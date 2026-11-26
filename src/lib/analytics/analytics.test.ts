import { describe, expect, it } from 'vitest';
import { ANALYTICS_COPY } from './copy';
import { ANALYTICS_NOTICE_VERSION, clientIp, dailyIpHash, deviceClass, edgeCountry, referrerHost } from './ctx';
import { PRIVACY_NOTICE } from './privacy-notice';

const SECRET = 'x'.repeat(32);

describe('dailyIpHash', () => {
  it('is null without a long-enough secret or without an ip', () => {
    expect(dailyIpHash('1.2.3.4', undefined)).toBeNull();
    expect(dailyIpHash('1.2.3.4', 'short')).toBeNull();
    expect(dailyIpHash(null, SECRET)).toBeNull();
  });
  it('is 64 hex, never contains the raw ip, stable within a day, different across days and ips', () => {
    const d1 = new Date('2026-11-25T10:00:00Z');
    const a = dailyIpHash('1.2.3.4', SECRET, d1)!;
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toContain('1.2.3.4');
    expect(dailyIpHash('1.2.3.4', SECRET, new Date('2026-11-25T23:59:00Z'))).toBe(a);
    expect(dailyIpHash('1.2.3.4', SECRET, new Date('2026-11-26T00:01:00Z'))).not.toBe(a);
    expect(dailyIpHash('1.2.3.5', SECRET, d1)).not.toBe(a);
  });
});

describe('request helpers', () => {
  it('classifies devices and bots', () => {
    expect(deviceClass('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Mobile')).toBe('mobile');
    expect(deviceClass('Mozilla/5.0 (iPad; CPU OS 17_0)')).toBe('tablet');
    expect(deviceClass('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('desktop');
    expect(deviceClass('Googlebot/2.1')).toBe('bot');
    expect(deviceClass(null)).toBe('desktop');
  });
  it('reads first forwarded ip, valid country only, referrer host only', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': '9.9.9.9, 10.0.0.1' }))).toBe('9.9.9.9');
    expect(edgeCountry(new Headers({ 'x-vercel-ip-country': 'EG' }))).toBe('EG');
    expect(edgeCountry(new Headers({ 'x-vercel-ip-country': 'egypt' }))).toBeNull();
    expect(referrerHost('https://Example.com/a?b=1')).toBe('example.com');
    expect(referrerHost('not a url')).toBeNull();
  });
});

describe('copy parity (AR/EN)', () => {
  it('has identical keys and no empty strings', () => {
    expect(Object.keys(ANALYTICS_COPY.ar).sort()).toEqual(Object.keys(ANALYTICS_COPY.en).sort());
    for (const l of ['ar', 'en'] as const) for (const v of Object.values(ANALYTICS_COPY[l])) expect(v.trim()).not.toBe('');
  });
  it('privacy notice has same section count and list shape in both languages', () => {
    const shape = (l: 'ar' | 'en') => PRIVACY_NOTICE[l].sections.map((s) => [s.p.length, s.li?.length ?? 0]);
    expect(shape('ar')).toEqual(shape('en'));
  });
  it('notice version constant is a short non-empty string', () => {
    expect(ANALYTICS_NOTICE_VERSION).toMatch(/^[A-Za-z0-9._-]{1,20}$/);
  });
});
