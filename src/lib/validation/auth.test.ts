import { describe, expect, it } from 'vitest';
import { inviteSignupSchema, inviteTokenSchema, loginSchema, resetPasswordSchema } from './auth';

describe('auth validation', () => {
  it('normalises login email', () => {
    expect(loginSchema.parse({ email: '  User@Example.COM ', password: 'x' }).email).toBe('user@example.com');
  });
  it('rejects bad emails and empty passwords', () => {
    expect(loginSchema.safeParse({ email: 'nope', password: 'x' }).success).toBe(false);
    expect(loginSchema.safeParse({ email: 'a@b.co', password: '' }).success).toBe(false);
  });
  it('invite token must be 64 lowercase hex chars', () => {
    expect(inviteTokenSchema.safeParse('a'.repeat(64)).success).toBe(true);
    expect(inviteTokenSchema.safeParse('A'.repeat(64)).success).toBe(false);
    expect(inviteTokenSchema.safeParse('a'.repeat(63)).success).toBe(false);
    expect(inviteTokenSchema.safeParse("a'; drop table--").success).toBe(false);
  });
  it('password length bounds 10..72', () => {
    const t = 'a'.repeat(64);
    expect(inviteSignupSchema.safeParse({ token: t, fullName: 'Al', password: 'a'.repeat(9) }).success).toBe(false);
    expect(inviteSignupSchema.safeParse({ token: t, fullName: 'Al', password: 'a'.repeat(10) }).success).toBe(true);
    expect(inviteSignupSchema.safeParse({ token: t, fullName: 'Al', password: 'a'.repeat(73) }).success).toBe(false);
  });
  it('reset requires matching confirmation', () => {
    expect(resetPasswordSchema.safeParse({ password: 'a'.repeat(10), confirm: 'a'.repeat(10) }).success).toBe(true);
    expect(resetPasswordSchema.safeParse({ password: 'a'.repeat(10), confirm: 'b'.repeat(10) }).success).toBe(false);
  });
});
