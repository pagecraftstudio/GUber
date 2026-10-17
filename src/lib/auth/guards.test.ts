import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContext } from './types';

// next/navigation redirect()/notFound() throw in real Next; model that so a guard that "falls through" fails the test.
class Redirect extends Error { constructor(readonly to: string) { super(`REDIRECT:${to}`); } }
class NotFound extends Error { constructor() { super('NOT_FOUND'); } }
vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  redirect: (to: string) => { throw new Redirect(to); },
  notFound: () => { throw new NotFound(); },
}));
let current: AuthContext | null = null;
vi.mock('./context', () => ({ getAuthContext: async () => current }));

const { requireCustomer, requireDriver, requirePlatform, requireTenant, requireUser } = await import('./guards');

const base: AuthContext = {
  userId: '00000000-0000-4000-8000-000000000001', email: 'x@y.test', fullName: 'X', locale: 'en',
  isActive: true, platformRole: null, membership: null,
};
const member = (permissions: string[], over: Partial<NonNullable<AuthContext['membership']>> = {}): AuthContext => ({
  ...base,
  membership: {
    companyId: '00000000-0000-4000-8000-000000000101', companyName: 'A', companySlug: 'a',
    companyStatus: 'active', memberStatus: 'active', roleKey: 'r', permissions, ...over,
  },
});
const customer = base;
const staff = member(['trips.read', 'trips.write']);
const driver = member(['trips.read_assigned'], { roleKey: 'driver' });
const admin: AuthContext = { ...base, platformRole: 'super_admin' };

async function dest(fn: () => Promise<unknown>): Promise<string> {
  try { await fn(); return 'ALLOWED'; } catch (e) {
    if (e instanceof Redirect) return e.to;
    if (e instanceof NotFound) return '404';
    throw e;
  }
}
beforeEach(() => { current = null; });

describe('anonymous visitor', () => {
  it('operator areas -> company login; customer portal -> customer login', async () => {
    expect(await dest(() => requireTenant())).toBe('/company/login');
    expect(await dest(() => requireDriver())).toBe('/company/login');
    expect(await dest(() => requireUser())).toBe('/company/login');
    expect(await dest(() => requirePlatform())).toBe('/company/login?next=/admin');
    expect(await dest(() => requireCustomer())).toBe('/login?next=%2Fmy-bookings');
  });
});

describe('customer (signed in, no membership, no platform role)', () => {
  it('may open the customer portal', async () => {
    current = customer;
    expect(await dest(() => requireCustomer())).toBe('ALLOWED');
  });
  it('cannot open company-only routes: dashboard/driver bounce to the portal, /admin is a 404', async () => {
    current = customer;
    expect(await dest(() => requireTenant())).toBe('/my-bookings');
    expect(await dest(() => requireTenant('trips.write'))).toBe('/my-bookings');
    expect(await dest(() => requireDriver())).toBe('/my-bookings');
    expect(await dest(() => requirePlatform())).toBe('404');
  });
});

describe('company staff', () => {
  it('reach the dashboard, not the customer portal, not /admin', async () => {
    current = staff;
    expect(await dest(() => requireTenant())).toBe('ALLOWED');
    expect(await dest(() => requireCustomer())).toBe('/dashboard');
    expect(await dest(() => requirePlatform())).toBe('404');
  });
  it('missing permission is refused even inside their own company', async () => {
    current = staff;
    expect(await dest(() => requireTenant('billing.write'))).toBe('/dashboard?error=forbidden');
  });
  it('staff of a suspended company are locked out, not downgraded to customers', async () => {
    current = member(['trips.read'], { companyStatus: 'suspended' });
    expect(await dest(() => requireTenant())).toBe('/suspended');
    expect(await dest(() => requireCustomer())).toBe('/suspended');
  });
});

describe('driver', () => {
  it('reaches /driver, is sent back to /driver from customer portal, and cannot use staff-only pages as a staff user', async () => {
    current = driver;
    expect(await dest(() => requireDriver())).toBe('ALLOWED');
    expect(await dest(() => requireCustomer())).toBe('/driver');
  });
  it('plain staff without trips.read_assigned cannot enter /driver', async () => {
    current = staff;
    expect(await dest(() => requireDriver())).toBe('/dashboard');
  });
});

describe('platform admin', () => {
  it('reaches /admin and is kept out of the customer portal', async () => {
    current = admin;
    expect(await dest(() => requirePlatform())).toBe('ALLOWED');
    expect(await dest(() => requireCustomer())).toBe('/admin');
  });
  it('deactivated super admin gets nothing', async () => {
    current = { ...admin, isActive: false };
    expect(await dest(() => requirePlatform())).toBe('404');
    expect(await dest(() => requireCustomer())).toBe('/no-access');
  });
});
