import { beforeAll, describe, expect, it } from 'vitest';
import { AppError } from '@/lib/errors';
import type { PlatformServiceContext } from '@/lib/service/context';
import { auditRepository } from '@/features/audit/repository';
import { auditListSchema } from '@/features/audit/schema';
import { auditService } from '@/features/audit/service';
import { IDS, U, URL_, clientFor, platformAs, rnd } from './harness';

// Phase 7.5 over real HTTP: real JWTs, RLS, RPCs, keyset paging, role redaction.
async function fails(p: Promise<unknown>): Promise<AppError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(AppError);
    return e as AppError;
  }
  throw new Error('expected the call to fail');
}

describe.skipIf(!URL_)('Super Admin audit log over HTTP', () => {
  let admin: PlatformServiceContext, support: PlatformServiceContext, billing: PlatformServiceContext;
  let noteEntryId = '';
  const marker = `it-audit-${rnd().toLowerCase()}`;

  beforeAll(async () => {
    [admin, support, billing] = await Promise.all([platformAs(U.superAdmin), platformAs(U.support), platformAs(U.billing)]);
    // produce real audit rows through the real, audited RPCs
    const sa = clientFor(U.superAdmin);
    for (let i = 0; i < 4; i++) {
      const r = await sa.rpc('admin_add_note', { p_company: IDS.companyB, p_body: `${marker} note ${i}` });
      expect(r.error, JSON.stringify(r.error)).toBeNull();
    }
    const s1 = await sa.rpc('admin_set_company_status', { p_company: IDS.companyB, p_status: 'suspended', p_reason: marker });
    expect(s1.error).toBeNull();
    const s2 = await sa.rpc('admin_set_company_status', { p_company: IDS.companyB, p_status: 'active' });
    expect(s2.error).toBeNull();
    const page = await auditService.list(admin, { company: IDS.companyB, namespace: 'company', limit: 10 });
    noteEntryId = page.items.find((i) => i.action === 'company.note_added')!.id;
  });

  it('lists newest first, with actor and company names, and no metadata in list rows', async () => {
    const page = await auditService.list(admin, { limit: 20 });
    expect(page.items.length).toBeGreaterThan(5);
    const times = page.items.map((i) => i.createdAt);
    expect([...times].sort().reverse()).toEqual(times);
    const mine = page.items.find((i) => i.action === 'company.suspended' || i.action === 'company.reactivated');
    expect(mine).toMatchObject({ actorType: 'platform_user', companyName: 'Company B', entityType: 'company' });
    expect(mine!.actorName).toBeTruthy();
    expect(JSON.stringify(page)).not.toContain(marker); // reasons live in metadata, which lists never carry
    for (const i of page.items) expect(Object.keys(i)).not.toContain('metadata');
  });

  it('walking the log 7 rows at a time equals one plain ORDER BY read: no gaps, no repeats (microsecond cursor over HTTP)', async () => {
    const seen: string[] = [];
    let cursor: { bat: string; bid: string } | null = null;
    for (let guard = 0; guard < 2000; guard++) {
      const page = await auditRepository.list(admin, auditListSchema.parse({ limit: 7, ...(cursor ?? {}) }));
      seen.push(...page.items.map((i) => i.id));
      if (!page.next) break;
      cursor = page.next;
    }
    const { data } = await clientFor(U.superAdmin).from('audit_logs').select('id').order('created_at', { ascending: false }).order('id', { ascending: false }).limit(5000);
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen).toEqual(data!.map((r) => r.id));
  });

  it('filters are exact and combine', async () => {
    const byCompany = await auditService.list(admin, { company: IDS.companyB, limit: 100 });
    expect(byCompany.items.length).toBeGreaterThanOrEqual(6);
    expect(byCompany.items.every((i) => i.companyId === IDS.companyB)).toBe(true);
    const ns = await auditService.list(admin, { company: IDS.companyB, namespace: 'company', actorType: 'platform_user', limit: 100 });
    expect(ns.items.every((i) => i.action.startsWith('company.') && i.actorType === 'platform_user')).toBe(true);
    const me = await auditService.list(admin, { actor: IDS.companyA.replace('101', '001'), limit: 100 }); // super admin = ...001
    expect(me.items.every((i) => i.actorId === IDS.companyA.replace('101', '001'))).toBe(true);
    const none = await auditService.list(admin, { to: '2000-01-01' });
    expect(none.items).toEqual([]);
  });

  it('detail: super_admin and support see metadata and the actor email; the note body is in the note, not the audit row', async () => {
    for (const ctx of [admin, support]) {
      const e = await auditService.get(ctx, noteEntryId);
      expect(e).toMatchObject({ action: 'company.note_added', metadataRedacted: false });
      expect(e.actorEmail).toContain('@');
      expect(e.metadata).not.toBeNull();
      expect(JSON.stringify(e.metadata)).not.toContain(marker);
    }
    const status = (await auditService.list(admin, { company: IDS.companyB, namespace: 'company' })).items.find((i) => i.action === 'company.suspended')!;
    const d = await auditService.get(admin, status.id);
    expect(JSON.stringify(d.metadata)).toContain(marker); // suspension reason is part of the status audit row
  });

  it('billing: lists headers, but company metadata is redacted and the actor email hidden', async () => {
    const list = await auditService.list(billing, { company: IDS.companyB, limit: 5 });
    expect(list.items.length).toBeGreaterThan(0);
    const e = await auditService.get(billing, noteEntryId);
    expect(e).toMatchObject({ metadataRedacted: true, metadata: null, actorEmail: null });
  });

  it('billing cannot read raw audit rows through the API; support and super_admin can; summary excludes billing', async () => {
    expect((await clientFor(U.billing).from('audit_logs').select('id', { count: 'exact', head: true })).count).toBe(0);
    expect((await clientFor(U.support).from('audit_logs').select('id', { count: 'exact', head: true })).count).toBeGreaterThan(0);
    expect((await fails(auditRepository.summary(billing, 7))).code).toBe('forbidden');
    expect((await auditService.summary(support, 7)).total).toBeGreaterThan(0);
    const s = await auditService.summary(admin, 30);
    expect(s.byNamespace.some((n) => n.namespace === 'company')).toBe(true);
    expect(s.platformActors.length).toBeGreaterThan(0);
  });

  it('tenant users and anon are refused by the database itself (bypassing the service)', async () => {
    for (const n of [U.ownerA, U.managerA, U.driverA, U.ownerB, null]) {
      const db = clientFor(n);
      expect((await db.rpc('admin_list_audit_logs')).error?.code, `list ${n}`).toBe('42501');
      expect((await db.rpc('admin_get_audit_log', { p_id: noteEntryId })).error?.code, `get ${n}`).toBe('42501');
      expect((await db.rpc('admin_audit_summary')).error?.code, `summary ${n}`).toBe('42501');
    }
  });

  it('tenant isolation: owner A reads only company A audit rows directly; none of company B', async () => {
    const a = clientFor(U.ownerA);
    const rows = (await a.from('audit_logs').select('company_id').limit(1000)).data ?? [];
    expect(rows.every((r) => r.company_id === IDS.companyA)).toBe(true);
    expect((await a.from('audit_logs').select('id', { count: 'exact', head: true }).eq('company_id', IDS.companyB)).count).toBe(0);
  });

  it('the log stays append-only: no client can change or add rows, and invalid input is a validation error', async () => {
    const sa = clientFor(U.superAdmin);
    expect((await sa.from('audit_logs').update({ action: 'x.y' }).eq('id', noteEntryId)).error?.code).toBe('42501');
    expect((await sa.from('audit_logs').delete().eq('id', noteEntryId)).error?.code).toBe('42501');
    expect((await sa.from('audit_logs').insert({ actor_type: 'system', action: 'x.y', entity_type: 'z' })).error?.code).toBe('42501');
    expect((await fails(auditService.list(admin, { namespace: 'nope' }))).code).toBe('validation');
    expect((await fails(auditService.list(admin, { bat: '2030-01-01T00:00:00Z' }))).code).toBe('validation');
    expect((await fails(auditService.get(admin, '00000000-0000-4000-8000-0000000fffff'))).code).toBe('not_found');
    const raw = await sa.rpc('admin_list_audit_logs', { p_namespace: "x'; drop table audit_logs; --" });
    expect(raw.error?.code).toBe('22023');
    expect((await sa.from('audit_logs').select('id', { count: 'exact', head: true })).count).toBeGreaterThan(0);
  });

  it('reading the log writes nothing', async () => {
    const before = (await clientFor(U.superAdmin).from('audit_logs').select('id', { count: 'exact', head: true })).count;
    await auditService.list(admin, { limit: 50 });
    await auditService.get(admin, noteEntryId);
    await auditService.summary(admin, 7);
    expect((await clientFor(U.superAdmin).from('audit_logs').select('id', { count: 'exact', head: true })).count).toBe(before);
  });
});

// Phase 8 follow-up: "not found" from the admin RPCs. PostgREST answers SQLSTATE P0002 with a 5xx on the Next -> Supabase hop;
// the service layer must turn exactly that (and nothing else) into AppError('not_found'), which the admin pages render as HTTP 404.
describe.skipIf(!URL_)('admin RPC "not found" over HTTP is a 404-class error, real failures are not', () => {
  const missing = '00000000-0000-4000-8000-0000000fffff';
  it('missing company: raw RPC answers P0002, service maps it to not_found', async () => {
    const raw = await clientFor(U.superAdmin).rpc('admin_company_detail', { p_company: missing });
    expect(raw.error?.code).toBe('P0002');
    expect(raw.status).toBeGreaterThanOrEqual(400); // PostgREST's own status for P0002 is a 5xx; the boundary below is what matters
    const { companyService } = await import('@/features/companies/service');
    const admin = await platformAs(U.superAdmin);
    const e = await fails(companyService.adminDetail(admin, missing));
    expect(e.code).toBe('not_found');
  });
  it('missing audit entry maps to not_found', async () => {
    const admin = await platformAs(U.superAdmin);
    const e = await fails(auditService.get(admin, missing));
    expect(e.code).toBe('not_found');
  });
  it('a malformed id is validation, not not_found', async () => {
    const raw = await clientFor(U.superAdmin).rpc('admin_company_detail', { p_company: 'not-a-uuid' });
    expect(raw.error?.code).toBe('22P02');
    const { mapDbError } = await import('@/lib/db/map-error');
    expect(mapDbError(raw.error!).code).toBe('validation');
  });
  it('a caller without platform access is forbidden, not "not found" (no existence oracle for the real id either)', async () => {
    const { companyService } = await import('@/features/companies/service');
    const raw = await clientFor(U.ownerA).rpc('admin_company_detail', { p_company: IDS.companyB });
    expect(raw.error?.code).toBe('42501');
    const { mapDbError } = await import('@/lib/db/map-error');
    expect(mapDbError(raw.error!).code).toBe('forbidden');
    void companyService;
  });
});
