import { describe, expect, it } from 'vitest';
import { coarseNetwork, deviceFingerprint, deviceLabel } from './device';

const SECRET = 'x'.repeat(40);
const CHROME_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const CHROME_WIN_NEW = CHROME_WIN.replace('126', '131');
const SAFARI_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

describe('device fingerprint', () => {
  it('labels browser family and system', () => {
    expect(deviceLabel(CHROME_WIN)).toBe('Chrome on Windows');
    expect(deviceLabel(SAFARI_IOS)).toBe('Safari on iOS');
    expect(deviceLabel(null)).toBe('Unknown browser on Unknown system');
  });
  it('keeps only the network part of an address', () => {
    expect(coarseNetwork('203.0.113.77')).toBe('203.0.113');
    expect(coarseNetwork('203.0.113.9, 10.0.0.1')).toBe('203.0.113');
    expect(coarseNetwork('2001:db8:abcd:1234::1')).toBe('2001:db8:abcd');
    expect(coarseNetwork('garbage')).toBe('unknown');
    expect(coarseNetwork(null)).toBe('unknown');
  });
  it('is stable across a browser update and a host change inside the /24', () => {
    const a = deviceFingerprint({ ip: '203.0.113.5', userAgent: CHROME_WIN }, SECRET);
    const b = deviceFingerprint({ ip: '203.0.113.200', userAgent: CHROME_WIN_NEW }, SECRET);
    expect(a.hash).toBe(b.hash);
  });
  it('changes with another network, another browser or another secret', () => {
    const base = deviceFingerprint({ ip: '203.0.113.5', userAgent: CHROME_WIN }, SECRET).hash;
    expect(deviceFingerprint({ ip: '198.51.100.5', userAgent: CHROME_WIN }, SECRET).hash).not.toBe(base);
    expect(deviceFingerprint({ ip: '203.0.113.5', userAgent: SAFARI_IOS }, SECRET).hash).not.toBe(base);
    expect(deviceFingerprint({ ip: '203.0.113.5', userAgent: CHROME_WIN }, 'y'.repeat(40)).hash).not.toBe(base);
  });
  it('produces what the database accepts and never contains the address', () => {
    const f = deviceFingerprint({ ip: '203.0.113.5', userAgent: CHROME_WIN }, SECRET);
    expect(f.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(f)).not.toContain('203.0.113');
  });
  it('refuses a short secret', () => {
    expect(() => deviceFingerprint({ ip: '1.2.3.4', userAgent: CHROME_WIN }, 'short')).toThrow();
  });
});
