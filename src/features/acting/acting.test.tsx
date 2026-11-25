// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rawContextSchema, toAuthContext, type AuthContext } from '@/lib/auth/types';

class Redirect extends Error { constructor(readonly to: string) { super(`REDIRECT:${to}`); } }
class NotFound extends Error { constructor() { super('NOT_FOUND'); } }
vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({ redirect: (to: string) => { throw new Redirect(to); }, notFound: () => { throw new NotFound(); } }));
let current: AuthContext | null = null;
vi.mock('@/lib/auth/context', () => ({ getAuthContext: async () => current }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc: rpcMock }) }));
const rpcMock = vi.fn();

const { requireTenant, requirePlatform } = await import('@/lib/auth/guards');
const { activeMembership, can, isActing, accessState } = await import('@/lib/auth/permissions');
const { enterActingAction, confirmActingWriteAction, exitActingAction } = await import('./actions');
const { actingService } = await import('./service');
const { ActingBanner } = await import('@/components/dashboard/ActingBanner');

const CO = '00000000-0000-4000-8000-000000000101';
const raw = (over: Record<string, unknown> = {}) => ({
  user_id: '00000000-0000-4000-8000-000000000001', email: 's@m.test', full_name: 'S', locale: 'en', is_active: true, platform_role: 'super_admin',
  membership: { company_id: CO, company_name: 'Delta', company_slug: 'delta', company_status: 'active', member_status: 'active', role_key: 'platform_acting', permissions: ['trips.read'] },
  acting: { mode: 'read', started_at: '2026-11-25T10:00:00Z', expires_at: '2026-11-25T10:30:00Z' }, ...over,
});
const acting = (over: Record<string, unknown> = {}): AuthContext => toAuthContext(rawContextSchema.parse(raw(over)));

async function dest(fn: () => Promise<unknown>): Promise<string> {
  try { await fn(); return 'ALLOWED'; } catch (e) { if (e instanceof Redirect) return e.to; if (e instanceof NotFound) return '404'; throw e; }
}
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
beforeEach(() => { current = null; rpcMock.mockReset(); });
afterEach(cleanup);

describe('context parsing', () => {
  it('maps acting from my_context, and its absence to null', () => {
    expect(acting().acting).toEqual({ mode: 'read', startedAt: '2026-11-25T10:00:00Z', expiresAt: '2026-11-25T10:30:00Z' });
    expect(toAuthContext(rawContextSchema.parse(raw({ acting: null }))).acting).toBeNull();
    const old = raw(); delete (old as Record<string, unknown>).acting;
    expect(toAuthContext(rawContextSchema.parse(old)).acting).toBeNull();
  });
  it('rejects a malformed acting block (the context is dropped, not half trusted)', () => {
    expect(rawContextSchema.safeParse(raw({ acting: { mode: 'root', started_at: 'x', expires_at: 'y' } })).success).toBe(false);
  });
});

describe('permissions while acting', () => {
  it('uses exactly the permission list the database returned', () => {
    const c = acting();
    expect(isActing(c)).toBe(true);
    expect(can(c, 'trips.read')).toBe(true);
    expect(can(c, 'trips.write')).toBe(false);
  });
  it('a suspended company is still readable while acting, but never for a normal member', () => {
    expect(activeMembership(acting({ membership: { ...raw().membership, company_status: 'suspended' } }))).not.toBeNull();
    const member = toAuthContext(rawContextSchema.parse(raw({ platform_role: null, acting: null, membership: { ...raw().membership, company_status: 'suspended', role_key: 'owner' } })));
    expect(activeMembership(member)).toBeNull();
  });
  it('an acting block without a platform role grants nothing special (a member is not "acting")', () => {
    const c = acting({ platform_role: null, membership: { ...raw().membership, company_status: 'suspended' } });
    expect(isActing(c)).toBe(false);
    expect(activeMembership(c)).toBeNull();
  });
  it('a deactivated profile is never acting', () => {
    expect(isActing({ ...acting(), isActive: false })).toBe(false);
  });
  it('staff stay "platform" for routing', () => { expect(accessState(acting())).toBe('platform'); });
});

describe('guards', () => {
  it('requireTenant lets acting staff into the dashboard and gives the acting membership', async () => {
    current = acting();
    const t = await requireTenant();
    expect(t.membership.companyId).toBe(CO);
  });
  it('requireTenant still checks the permission list (read mode has no trips.write)', async () => {
    current = acting();
    expect(await dest(() => requireTenant('trips.write'))).toBe('/dashboard?error=forbidden');
    expect(await dest(() => requireTenant('trips.read'))).toBe('ALLOWED');
  });
  it('platform staff WITHOUT a session still go to /admin, not the dashboard', async () => {
    current = { ...acting(), acting: null, membership: null };
    expect(await dest(() => requireTenant())).toBe('/admin');
  });
  it('/admin stays reachable while acting (so the session can be left)', async () => {
    current = acting();
    expect(await dest(() => requirePlatform(['super_admin']))).toBe('ALLOWED');
  });
});

describe('service', () => {
  it('needs a company id and a reason of 3 to 300 characters before any call', async () => {
    const db = { rpc: rpcMock } as never;
    await expect(actingService.enter({ db }, { companyId: 'nope', reason: 'ticket 1' })).rejects.toBeTruthy();
    await expect(actingService.enter({ db }, { companyId: CO, reason: ' a ' })).rejects.toBeTruthy();
    await expect(actingService.enter({ db }, { companyId: CO, reason: 'x'.repeat(301) })).rejects.toBeTruthy();
    expect(rpcMock).not.toHaveBeenCalled();
  });
  it('sends only the company and the trimmed reason', async () => {
    rpcMock.mockResolvedValue({ data: '2026-11-25T10:30:00Z', error: null });
    await actingService.enter({ db: { rpc: rpcMock } as never }, { companyId: CO, reason: '  ticket 4411  ' });
    expect(rpcMock).toHaveBeenCalledWith('platform_enter_acting', { p_company_id: CO, p_reason: 'ticket 4411' });
  });
});

describe('actions', () => {
  it('enter: guard first (a company owner gets 404, no RPC)', async () => {
    current = { ...acting(), platformRole: null, acting: null };
    expect(await dest(() => enterActingAction({ status: 'idle' }, fd({ companyId: CO, reason: 'ticket 1' })))).toBe('404');
    expect(rpcMock).not.toHaveBeenCalled();
  });
  it('enter: billing is refused by the role set', async () => {
    current = { ...acting(), platformRole: 'billing', acting: null };
    expect(await dest(() => enterActingAction({ status: 'idle' }, fd({ companyId: CO, reason: 'ticket 1' })))).toBe('404');
  });
  it('enter: success redirects to the dashboard', async () => {
    current = { ...acting(), acting: null, membership: null };
    rpcMock.mockResolvedValue({ data: '2026-11-25T10:30:00Z', error: null });
    expect(await dest(() => enterActingAction({ status: 'idle' }, fd({ companyId: CO, reason: 'ticket 4411' })))).toBe('/dashboard');
  });
  it('enter: a missing reason is a plain message, not a crash', async () => {
    current = { ...acting(), acting: null, membership: null };
    const r = await enterActingAction({ status: 'idle' }, fd({ companyId: CO, reason: ' ' }));
    expect(r.status).toBe('error');
    expect(r.message).toMatch(/reason/i);
  });
  it('enter: a database refusal comes back as an error state', async () => {
    current = { ...acting(), acting: null, membership: null };
    rpcMock.mockResolvedValue({ data: null, error: { code: '42501', message: 'not allowed' } });
    expect((await enterActingAction({ status: 'idle' }, fd({ companyId: CO, reason: 'ticket 4411' }))).status).toBe('error');
  });
  it('confirm write: success and refusal', async () => {
    current = acting();
    rpcMock.mockResolvedValue({ data: null, error: null });
    expect(await dest(() => confirmActingWriteAction())).toBe('/dashboard');
    rpcMock.mockResolvedValue({ data: null, error: { code: '42501', message: 'not allowed' } });
    expect(await dest(() => confirmActingWriteAction())).toBe('/dashboard?error=forbidden');
  });
  it('exit goes back to the company the DATABASE said you were acting on, and survives an already-ended session', async () => {
    current = acting();
    rpcMock.mockResolvedValue({ data: null, error: { code: 'XX000', message: 'boom' } });
    expect(await dest(() => exitActingAction())).toBe(`/admin/companies/${CO}`);
  });
});

describe('banner', () => {
  const p = { companyName: 'Delta', companyStatus: 'active', expiresAt: '2026-11-25T10:30:00Z' };
  it('read mode (super admin): names the company, the end time and offers editing behind a confirmation', () => {
    render(<ActingBanner {...p} mode="read" canWrite />);
    expect(screen.getByText(/You are acting as/)).toBeTruthy();
    expect(screen.getByText(/Ends at 10:30 UTC/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Exit' })).toBeTruthy();
    expect(screen.getByText('Turn on editing')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Confirm editing' })).toBeTruthy();
  });
  it('support never sees the editing option', () => {
    render(<ActingBanner {...p} mode="read" canWrite={false} />);
    expect(screen.queryByText('Turn on editing')).toBeNull();
  });
  it('write mode says so and offers no second switch', () => {
    render(<ActingBanner {...p} mode="write" canWrite />);
    expect(screen.getByText(/Editing is on/)).toBeTruthy();
    expect(screen.queryByText('Turn on editing')).toBeNull();
  });
  it('a suspended company is look-only, with no editing option', () => {
    render(<ActingBanner {...p} companyStatus="suspended" mode="read" canWrite />);
    expect(screen.getByText(/suspended or cancelled/)).toBeTruthy();
    expect(screen.queryByText('Turn on editing')).toBeNull();
  });
});
