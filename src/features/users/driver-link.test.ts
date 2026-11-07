import { describe, expect, it } from 'vitest';
import { mapDbError } from '@/lib/db/map-error';
import { fakeDb, opsOf, tenantCtx } from '@/test/helpers';
import { makeUserService } from '@/features/users/service';
import { userRepository } from '@/features/users/repository';
import { genericErrorText } from '@/features/dashboard/messages';

const svc = makeUserService(userRepository);
const D = '00000000-0000-4000-8000-0000000000d1';
const M = '00000000-0000-4000-8000-0000000000e1';
const TOKEN = { data: [{ invite_id: M, token: 'x'.repeat(64), expires_at: '2030-01-01T00:00:00Z' }] };

describe('driver login (0026): invite_driver / link_driver_login', () => {
  it('inviteDriver needs users.write AND drivers.read; nothing is sent otherwise', async () => {
    const f = fakeDb(TOKEN);
    await expect(svc.inviteDriver(tenantCtx(['drivers.read'], { db: f.db }), { driverId: D, email: 'a@b.co' })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(svc.inviteDriver(tenantCtx(['users.write'], { db: f.db }), { driverId: D, email: 'a@b.co' })).rejects.toMatchObject({ code: 'forbidden' });
    expect(f.calls).toHaveLength(0);
  });
  it('inviteDriver sends only the driver and email (company comes from the session in SQL)', async () => {
    const f = fakeDb(TOKEN);
    const r = await svc.inviteDriver(tenantCtx(['users.write', 'drivers.read'], { db: f.db }), { driverId: D, email: 'a@b.co' });
    expect(r.token).toHaveLength(64);
    expect(f.calls[0]!.target).toBe('rpc:invite_driver');
    expect(opsOf(f.calls[0]!, 'args')[0]![0]).toEqual({ p_driver_id: D, p_email: 'a@b.co' });
  });
  it('linkDriverLogin needs users.write AND drivers.write', async () => {
    const f = fakeDb({ data: {} });
    await expect(svc.linkDriverLogin(tenantCtx(['users.write'], { db: f.db }), { driverId: D, memberId: M })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(svc.linkDriverLogin(tenantCtx(['drivers.write'], { db: f.db }), { driverId: D, memberId: M })).rejects.toMatchObject({ code: 'forbidden' });
    expect(f.calls).toHaveLength(0);
    await svc.linkDriverLogin(tenantCtx(['users.write', 'drivers.write'], { db: f.db }), { driverId: D, memberId: M });
    expect(opsOf(f.calls[0]!, 'args')[0]![0]).toEqual({ p_driver_id: D, p_member_id: M });
  });
  it('rejects malformed ids and smuggled company ids before the database', async () => {
    const f = fakeDb({ data: {} });
    const ctx = tenantCtx(['users.write', 'drivers.write', 'drivers.read'], { db: f.db });
    await expect(svc.linkDriverLogin(ctx, { driverId: 'x', memberId: M })).rejects.toMatchObject({ code: 'validation' });
    await expect(svc.linkDriverLogin(ctx, { driverId: D, memberId: M, company_id: M })).rejects.toMatchObject({ code: 'validation' });
    await expect(svc.inviteDriver(ctx, { driverId: D, email: 'nope' })).rejects.toMatchObject({ code: 'validation' });
    expect(f.calls).toHaveLength(0);
  });
  it('database refusals map to messages in both languages', () => {
    for (const [msg, detail] of [
      ['driver already has a login', 'driver_has_login'], ['member already linked to a driver', 'member_has_driver'],
      ['owner cannot be a driver login', 'owner_not_driver'], ['driver invite needs a driver record', 'driver_needs_record'], ['driver role needs a driver record', 'driver_needs_record'],
    ] as const) {
      const e = mapDbError({ code: '23514', message: msg });
      expect(e).toMatchObject({ code: 'business_rule', detail });
      for (const l of ['en', 'ar'] as const) expect(genericErrorText(l, e.code, e.detail)).not.toBe(genericErrorText(l, 'business_rule'));
    }
  });
});
