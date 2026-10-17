import { describe, expect, it } from 'vitest';
import { rawContextSchema, toAuthContext } from './types';

const uuid = '00000000-0000-4000-8000-000000000101';
const good = {
  user_id: uuid, email: 'a@b.test', full_name: 'A', locale: 'ar', is_active: true, platform_role: null,
  membership: { company_id: uuid, company_name: 'A', company_slug: 'a', company_status: 'active', member_status: 'active', role_key: 'owner', permissions: ['users.write'] },
};

describe('my_context() parsing', () => {
  it('maps snake_case to AuthContext', () => {
    const ctx = toAuthContext(rawContextSchema.parse(good));
    expect(ctx.membership?.companyId).toBe(uuid);
    expect(ctx.membership?.permissions).toEqual(['users.write']);
    expect(ctx.platformRole).toBeNull();
  });
  it('accepts a null membership', () => {
    expect(toAuthContext(rawContextSchema.parse({ ...good, membership: null })).membership).toBeNull();
  });
  it('rejects malformed payloads (unknown platform role, bad status, missing fields)', () => {
    expect(rawContextSchema.safeParse({ ...good, platform_role: 'root' }).success).toBe(false);
    expect(rawContextSchema.safeParse({ ...good, membership: { ...good.membership, company_status: 'weird' } }).success).toBe(false);
    expect(rawContextSchema.safeParse({ user_id: uuid }).success).toBe(false);
  });
});
