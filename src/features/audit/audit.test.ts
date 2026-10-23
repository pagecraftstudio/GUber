import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { PlatformRole } from '@/lib/auth/types';
import { mapDbError } from '@/lib/db/map-error';
import { AppError } from '@/lib/errors';
import { fakeDb, platformCtx } from '@/test/helpers';
import { AUDIT_NAMESPACES, actionLabel, isKnownNamespace } from './catalog';
import { buildMetadataView, show } from './diff';
import { auditHref, entityHref } from './links';
import { auditRepository, type AuditRepository } from './repository';
import { auditEntryRawSchema, auditListRawSchema, auditListSchema, auditSummaryDaysSchema } from './schema';
import { makeAuditService } from './service';

const ID = '00000000-0000-4000-8000-000000000101';
const ROW = {
  id: ID, created_at: '2030-01-01T10:00:00.123456+00:00', action: 'company.updated', entity_type: 'company', entity_id: ID,
  actor_type: 'platform_user', actor_id: ID, actor_name: 'Admin', company_id: ID, company_name: 'A', changed_keys: ['name'],
};

describe('list query schema', () => {
  it('defaults to a 50-row page and accepts no filters', () => {
    expect(auditListSchema.parse({})).toMatchObject({ limit: 50 });
  });
  it('keeps microseconds in the cursor time (a Date would drop them and skip or repeat rows)', () => {
    const v = auditListSchema.parse({ bat: '2030-01-01T10:00:00.123456+00:00', bid: ID });
    expect(v.bat).toBe('2030-01-01T10:00:00.123456+00:00');
  });
  it.each([
    ['half a cursor (time)', { bat: '2030-01-01T10:00:00Z' }],
    ['half a cursor (id)', { bid: ID }],
    ['from after to', { from: '2030-02-01', to: '2030-01-01' }],
    ['unknown namespace', { namespace: 'nope' }],
    ['sql in namespace', { namespace: "x'; drop table audit_logs; --" }],
    ['unknown actor type', { actorType: 'root' }],
    ['bad company id', { company: 'not-a-uuid' }],
    ['bad date', { from: '2030-13-45' }],
    ['limit 0', { limit: '0' }],
    ['limit 101', { limit: '101' }],
  ])('rejects %s', (_n, input) => {
    expect(auditListSchema.safeParse(input).success).toBe(false);
  });
  it('summary days: 1..90, default 7', () => {
    expect(auditSummaryDaysSchema.parse(undefined)).toBe(7);
    expect(auditSummaryDaysSchema.safeParse(0).success).toBe(false);
    expect(auditSummaryDaysSchema.safeParse(91).success).toBe(false);
  });
});

describe('raw payload schemas fail closed on drift', () => {
  it('accepts the documented list shape and rejects more than 100 rows or a missing flag', () => {
    expect(auditListRawSchema.safeParse({ items: [ROW], has_more: false, next_before_at: null, next_before_id: null }).success).toBe(true);
    expect(auditListRawSchema.safeParse({ items: Array(101).fill(ROW), has_more: false, next_before_at: null, next_before_id: null }).success).toBe(false);
    expect(auditListRawSchema.safeParse({ items: [ROW] }).success).toBe(false);
  });
  it('entry: metadata may be null (redacted) and must be an object otherwise', () => {
    const { changed_keys: _k, ...base } = ROW;
    const e = { ...base, actor_email: null, metadata: null, metadata_redacted: true };
    expect(auditEntryRawSchema.safeParse(e).success).toBe(true);
    expect(auditEntryRawSchema.safeParse({ ...e, metadata: 'x' }).success).toBe(false);
  });
});

describe('repository: what goes to the database', () => {
  it('list sends whole-day UTC bounds, typed filters, the cursor as given, and no role', async () => {
    const { db, calls } = fakeDb({ data: { items: [ROW], has_more: true, next_before_at: '2030-01-01T10:00:00.123456+00:00', next_before_id: ID } });
    const q = auditListSchema.parse({ company: ID, namespace: 'company', actorType: 'platform_user', actor: ID, from: '2030-01-01', to: '2030-01-31', bat: '2030-02-01T00:00:00.000001+00:00', bid: ID });
    const page = await auditRepository.list(platformCtx('support', db), q);
    expect(calls[0]!.target).toBe('rpc:admin_list_audit_logs');
    const args = calls[0]!.ops.find(([n]) => n === 'args')![1][0] as Record<string, unknown>;
    expect(args).toEqual({
      p_company: ID, p_namespace: 'company', p_action: null, p_entity_type: null, p_actor_type: 'platform_user', p_actor: ID,
      p_from: '2030-01-01T00:00:00Z', p_to: '2030-01-31T23:59:59.999999Z',
      p_before_at: '2030-02-01T00:00:00.000001+00:00', p_before_id: ID, p_limit: 50,
    });
    expect(Object.keys(args).join()).not.toMatch(/role/);
    expect(page.next).toEqual({ bat: '2030-01-01T10:00:00.123456+00:00', bid: ID });
    expect(page.items[0]).toMatchObject({ actorName: 'Admin', changedKeys: ['name'] });
  });
  it('no next cursor when there is nothing older', async () => {
    const { db } = fakeDb({ data: { items: [ROW], has_more: false, next_before_at: null, next_before_id: null } });
    expect((await auditRepository.list(platformCtx('support', db), auditListSchema.parse({}))).next).toBeNull();
  });
  it('get and summary call their RPCs', async () => {
    const a = fakeDb({ data: { ...{ ...ROW, changed_keys: undefined }, actor_email: 'a@b.test', metadata: { after: { x: 1 } }, metadata_redacted: false } });
    const e = await auditRepository.get(platformCtx('support', a.db), ID);
    expect(a.calls[0]!.target).toBe('rpc:admin_get_audit_log');
    expect(e).toMatchObject({ actorEmail: 'a@b.test', metadataRedacted: false });
    const b = fakeDb({ data: { days: 7, since: '2030-01-01T00:00:00Z', total: 3, by_namespace: [{ namespace: 'company', count: 3 }], platform_actors: [{ actor_id: ID, actor_name: 'A', count: 3 }] } });
    expect(await auditRepository.summary(platformCtx('support', b.db), 7)).toMatchObject({ total: 3, platformActors: [{ actorName: 'A' }] });
    expect(b.calls[0]!.ops.find(([n]) => n === 'args')![1][0]).toEqual({ p_days: 7 });
  });
  it('a malformed payload is internal and does not echo the payload', async () => {
    const { db } = fakeDb({ data: { items: 'leaky-secret' } });
    const err = await auditRepository.list(platformCtx('support', db), auditListSchema.parse({})).catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({ code: 'internal' });
    expect(err.message).not.toContain('leaky-secret');
  });
  it('database errors map to the right classes', () => {
    expect(mapDbError({ code: '42501', message: 'forbidden' })).toMatchObject({ code: 'forbidden' });
    expect(mapDbError({ code: '22023', message: 'invalid filter' })).toMatchObject({ code: 'validation', detail: 'invalid_filter' });
    expect(mapDbError({ code: '22023', message: 'invalid cursor' })).toMatchObject({ code: 'validation' });
    expect(mapDbError({ code: 'P0002', message: 'audit entry not found' })).toMatchObject({ code: 'not_found' });
  });
});

describe('service authorization', () => {
  const spy = () => ({ list: vi.fn().mockResolvedValue('L'), get: vi.fn().mockResolvedValue('G'), summary: vi.fn().mockResolvedValue('S') }) as unknown as AuditRepository & Record<string, ReturnType<typeof vi.fn>>;
  const roles: (PlatformRole | null)[] = ['super_admin', 'support', 'billing', null];
  for (const role of roles) {
    it(`${role ?? 'no platform role'}: list and get ${role ? 'allowed' : 'forbidden'}`, async () => {
      const repo = spy();
      const svc = makeAuditService(repo);
      if (role) {
        await expect(svc.list(platformCtx(role), {})).resolves.toBe('L');
        await expect(svc.get(platformCtx(role), ID)).resolves.toBe('G');
      } else {
        await expect(svc.list(platformCtx(role), {})).rejects.toMatchObject({ code: 'forbidden' });
        await expect(svc.get(platformCtx(role), ID)).rejects.toMatchObject({ code: 'forbidden' });
        expect(repo.list).not.toHaveBeenCalled();
      }
    });
    const ok = role === 'super_admin' || role === 'support';
    it(`${role ?? 'no platform role'}: summary ${ok ? 'allowed' : 'forbidden'}`, async () => {
      const repo = spy();
      const run = makeAuditService(repo).summary(platformCtx(role), 7);
      if (ok) await expect(run).resolves.toBe('S');
      else {
        await expect(run).rejects.toMatchObject({ code: 'forbidden' });
        expect(repo.summary).not.toHaveBeenCalled();
      }
    });
  }
  it('forbidden callers are refused before validation', async () => {
    await expect(makeAuditService(spy()).list(platformCtx(null), { limit: 'bogus' })).rejects.toMatchObject({ code: 'forbidden' });
  });
  it('invalid input is a validation error that never reaches the repository', async () => {
    const repo = spy();
    await expect(makeAuditService(repo).list(platformCtx('support'), { namespace: 'zzz' })).rejects.toMatchObject({ code: 'validation' });
    await expect(makeAuditService(repo).get(platformCtx('support'), 'nope')).rejects.toMatchObject({ code: 'validation' });
    expect(repo.list).not.toHaveBeenCalled();
    expect(repo.get).not.toHaveBeenCalled();
  });
  it('the service exposes no write method', () => {
    expect(Object.keys(makeAuditService(spy())).sort()).toEqual(['get', 'list', 'summary']);
  });
});

describe('metadata view', () => {
  it('diffs before/after and marks only changed fields', () => {
    const v = buildMetadataView({ before: { name: 'A', phone: '1' }, after: { name: 'B', phone: '1', country: 'EG' } });
    expect(v.rows).toEqual([
      { key: 'country', before: '—', after: 'EG', changed: true },
      { key: 'name', before: 'A', after: 'B', changed: true },
      { key: 'phone', before: '1', after: '1', changed: false },
    ]);
  });
  it('a creation (before null) shows every after field as new', () => {
    const v = buildMetadataView({ before: null, after: { status: 'trial' } });
    expect(v.rows).toEqual([{ key: 'status', before: null, after: 'trial', changed: true }]);
  });
  it('keeps non-diff keys as extra rows and survives garbage', () => {
    expect(buildMetadataView({ role: 'owner' }).extra).toEqual([{ key: 'role', value: 'owner' }]);
    expect(buildMetadataView({ before: 'x', after: [1] })).toEqual({ rows: [], extra: [] });
    expect(buildMetadataView(null)).toEqual({ rows: [], extra: [] });
  });
  it('renders values as text only, truncated, never as markup', () => {
    expect(show('<script>alert(1)</script>')).toBe('<script>alert(1)</script>'); // a string; React escapes it on render
    expect(show('x'.repeat(1000)).length).toBe(401);
    expect(show({ a: 1 })).toBe('{"a":1}');
    expect(show(null)).toBe('—');
  });
});

describe('links and catalogue', () => {
  it('builds only known keys and drops empty values', () => {
    expect(auditHref()).toBe('/admin/audit-logs');
    expect(auditHref({ company: ID, namespace: '', from: '2030-01-01' })).toBe(`/admin/audit-logs?company=${ID}&from=2030-01-01`);
  });
  it('entity links go to real pages only', () => {
    expect(entityHref('company', ID, ID)).toBe(`/admin/companies/${ID}`);
    expect(entityHref('subscription', 'x', ID)).toBe(`/admin/companies/${ID}`);
    expect(entityHref('booking', 'x', ID)).toBeNull();
    expect(entityHref('company', null, null)).toBeNull();
  });
  it('unknown actions are shown raw, known ones get a label', () => {
    expect(actionLabel('company.created')).toBe('Company created');
    expect(actionLabel('brand.new_thing')).toBe('brand.new_thing');
    expect(isKnownNamespace('trip')).toBe(true);
    expect(isKnownNamespace('nope')).toBe(false);
  });
  it('every audit writer in the migrations uses a namespace the catalogue knows', () => {
    const dir = join(__dirname, '../../../supabase/migrations');
    const found = new Set<string>();
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.sql'))) {
      const sql = readFileSync(join(dir, f), 'utf8');
      for (const call of sql.matchAll(/(?:write_audit|audit_platform)\s*\(([\s\S]*?)\)\s*;/g)) {
        for (const m of call[1]!.matchAll(/'([a-z_]+)\.(?:[a-z_%]+)'/g)) found.add(m[1]!);
        for (const m of call[1]!.matchAll(/'([a-z_]+)\.%/g)) found.add(m[1]!);
      }
    }
    expect(found.size).toBeGreaterThan(3);
    for (const ns of found) expect(AUDIT_NAMESPACES as readonly string[], `namespace ${ns}`).toContain(ns);
  });
});
