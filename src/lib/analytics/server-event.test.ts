import { describe, expect, it } from 'vitest';
import { isFreshAccount } from './server-event';

describe('isFreshAccount', () => {
  it('a first sign-in right after creation is a sign-up', () => expect(isFreshAccount('2026-11-26T10:00:00Z', '2026-11-26T10:00:02Z')).toBe(true));
  it('a returning account is a sign-in', () => expect(isFreshAccount('2026-10-01T10:00:00Z', '2026-11-26T10:00:00Z')).toBe(false));
  it('missing or unparsable timestamps are a sign-in, never a guess', () => {
    expect(isFreshAccount(undefined, '2026-11-26T10:00:00Z')).toBe(false);
    expect(isFreshAccount('x', 'y')).toBe(false);
  });
});
