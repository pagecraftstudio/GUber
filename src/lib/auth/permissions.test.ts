import { describe, expect, it } from 'vitest';
import { accessState, can, canAny, hasPlatformRole, homePathFor } from './permissions';
import type { AuthContext } from './types';

const base: AuthContext = {
  userId: '00000000-0000-4000-8000-000000000001',
  email: 'a@b.test',
  fullName: 'A',
  locale: 'en',
  isActive: true,
  platformRole: null,
  membership: null,
};
const tenant = (over: Partial<NonNullable<AuthContext['membership']>> = {}): AuthContext => ({
  ...base,
  membership: {
    companyId: '00000000-0000-4000-8000-000000000101',
    companyName: 'A',
    companySlug: 'a',
    companyStatus: 'active',
    memberStatus: 'active',
    roleKey: 'operations',
    permissions: ['trips.read', 'trips.write'],
    ...over,
  },
});

describe('can()', () => {
  it('grants only permissions present in the DB-derived list', () => {
    expect(can(tenant(), 'trips.write')).toBe(true);
    expect(can(tenant(), 'users.write')).toBe(false);
  });
  it('denies everything for anonymous', () => expect(can(null, 'trips.read')).toBe(false));
  it('denies when company is suspended even if permissions leaked into the list', () => {
    expect(can(tenant({ companyStatus: 'suspended' }), 'trips.read')).toBe(false);
    expect(can(tenant({ companyStatus: 'cancelled' }), 'trips.read')).toBe(false);
    expect(can(tenant({ companyStatus: 'deleted' }), 'trips.read')).toBe(false);
  });
  it('denies when membership is suspended or profile deactivated', () => {
    expect(can(tenant({ memberStatus: 'suspended' }), 'trips.read')).toBe(false);
    expect(can({ ...tenant(), isActive: false }, 'trips.read')).toBe(false);
  });
  it('allows trial companies', () => expect(can(tenant({ companyStatus: 'trial' }), 'trips.read')).toBe(true));
  it('canAny works', () => {
    expect(canAny(tenant(), ['users.write', 'trips.read'])).toBe(true);
    expect(canAny(tenant(), ['users.write', 'billing.read'])).toBe(false);
  });
});

describe('hasPlatformRole()', () => {
  it('requires an active platform role', () => {
    expect(hasPlatformRole({ ...base, platformRole: 'support' })).toBe(true);
    expect(hasPlatformRole({ ...base, platformRole: 'support' }, ['super_admin'])).toBe(false);
    expect(hasPlatformRole({ ...base, platformRole: 'super_admin' }, ['super_admin'])).toBe(true);
    expect(hasPlatformRole({ ...base, platformRole: 'super_admin', isActive: false })).toBe(false);
    expect(hasPlatformRole(base)).toBe(false);
    expect(hasPlatformRole(null)).toBe(false);
  });
});

describe('accessState() / homePathFor()', () => {
  it('routes each kind of user to the right home', () => {
    expect(homePathFor(null)).toBe('/login');
    expect(homePathFor({ ...base, platformRole: 'super_admin' })).toBe('/admin');
    expect(homePathFor(tenant())).toBe('/dashboard');
    expect(homePathFor(tenant({ companyStatus: 'suspended' }))).toBe('/suspended');
    expect(homePathFor(tenant({ memberStatus: 'suspended' }))).toBe('/suspended');
    expect(homePathFor(base)).toBe('/no-access');
    expect(homePathFor({ ...base, isActive: false })).toBe('/no-access');
  });
  it('a member with only assigned-trip access is a driver and lands on /driver; staff with trips.read stay on /dashboard', () => {
    expect(homePathFor(tenant({ roleKey: 'driver', permissions: ['trips.read_assigned'] }))).toBe('/driver');
    expect(homePathFor(tenant({ permissions: ['trips.read', 'trips.read_assigned'] }))).toBe('/dashboard');
    expect(homePathFor(tenant({ roleKey: 'driver', permissions: ['trips.read_assigned'], companyStatus: 'suspended' }))).toBe('/suspended');
  });
  it('platform role wins over tenant membership', () => {
    expect(accessState({ ...tenant(), platformRole: 'billing' })).toBe('platform');
  });
  it('deactivated beats everything', () => {
    expect(accessState({ ...tenant(), platformRole: 'super_admin', isActive: false })).toBe('deactivated');
  });
});
