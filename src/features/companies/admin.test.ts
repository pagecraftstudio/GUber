import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AppError } from '@/lib/errors';
import { fakeDb, opsOf, platformCtx } from '@/test/helpers';
import { adminCompanyDetailRawSchema, adminCompanyListRawSchema, toAdminCompanyDetail } from './admin-output';
import { companyRepository, type CompanyRepository } from './repository';
import { addCompanyNoteSchema, createCompanySchema, setCompanyStatusSchema, updateCompanySchema } from './schema';
import { makeCompanyService } from './service';

const ID = '00000000-0000-4000-8000-000000000101';
const INV = '00000000-0000-4000-8000-000000000301';
const TOKEN = 'tok_0123456789abcdef0123456789abcdef0123456789';

const CREATE = { name: ' Acme Bus ', slug: 'Acme-Bus', planCode: 'starter', ownerEmail: ' Owner@Acme.TEST ' };

describe('createCompanySchema', () => {
  it('normalises and accepts a minimal payload', () => {
    const v = createCompanySchema.parse(CREATE);
    expect(v).toMatchObject({ name: 'Acme Bus', slug: 'acme-bus', ownerEmail: 'owner@acme.test' });
    expect(v.trialDays).toBeUndefined();
  });
  it('blank optional form fields mean "no value"', () => {
    const v = createCompanySchema.parse({ ...CREATE, contactName: '', contactEmail: '', contactPhone: '', legalName: '', country: '', trialDays: '' });
    expect(v).toMatchObject({ contactName: null, contactEmail: null, contactPhone: null, legalName: null, country: null });
    expect(v.trialDays).toBeUndefined();
  });
  it('upper-cases the country, reads trial days from a string, E.164-normalises the phone', () => {
    const v = createCompanySchema.parse({ ...CREATE, country: 'eg', trialDays: '30', contactPhone: '+201012345678' });
    expect(v).toMatchObject({ country: 'EG', trialDays: 30, contactPhone: '+201012345678' });
  });
  it.each([
    ['slug too short', { slug: 'ab' }, 'slug'],
    ['slug with underscore', { slug: 'bad_slug' }, 'slug'],
    ['reserved slug', { slug: 'admin' }, 'slug'],
    ['hyphen at the edge', { slug: '-abc' }, 'slug'],
    ['empty name', { name: '   ' }, 'name'],
    ['bad owner email', { ownerEmail: 'nope' }, 'ownerEmail'],
    ['bad country', { country: 'EGY' }, 'country'],
    ['bad phone', { contactPhone: 'abc' }, 'contactPhone'],
    ['trial days 0', { trialDays: '0' }, 'trialDays'],
    ['trial days 366', { trialDays: '366' }, 'trialDays'],
  ])('rejects %s', (_n, over, key) => {
    const r = createCompanySchema.safeParse({ ...CREATE, ...over });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.some((i) => i.path[0] === key)).toBe(true);
  });
  it('is strict: no company_id, status, role or created_by can be smuggled in', () => {
    for (const k of ['companyId', 'company_id', 'status', 'role', 'createdBy', 'planId']) {
      expect(createCompanySchema.safeParse({ ...CREATE, [k]: 'x' }).success).toBe(false);
    }
  });
});

describe('updateCompanySchema', () => {
  it('needs at least one field; null or blank clears', () => {
    expect(updateCompanySchema.safeParse({}).success).toBe(false);
    expect(updateCompanySchema.parse({ contactName: '' })).toEqual({ contactName: null });
    expect(updateCompanySchema.parse({ name: ' New ', country: 'eg' })).toEqual({ name: 'New', country: 'EG' });
  });
  it('slug, status and every protected column are rejected', () => {
    for (const k of ['slug', 'status', 'suspendedAt', 'id', 'createdBy', 'deletedAt']) {
      expect(updateCompanySchema.safeParse({ name: 'x', [k]: 'y' }).success).toBe(false);
    }
  });
  it('the name cannot be blank', () => expect(updateCompanySchema.safeParse({ name: '  ' }).success).toBe(false));
});

describe('setCompanyStatusSchema', () => {
  it('suspend and cancel need a reason of 3+ characters', () => {
    for (const status of ['suspended', 'cancelled']) {
      expect(setCompanyStatusSchema.safeParse({ status }).success).toBe(false);
      expect(setCompanyStatusSchema.safeParse({ status, reason: 'ab' }).success).toBe(false);
      expect(setCompanyStatusSchema.safeParse({ status, reason: '' }).success).toBe(false);
      expect(setCompanyStatusSchema.parse({ status, reason: ' because ' }).reason).toBe('because');
    }
  });
  it('trial and active need no reason; unknown statuses fail', () => {
    expect(setCompanyStatusSchema.parse({ status: 'active', reason: '' })).toEqual({ status: 'active', reason: null });
    expect(setCompanyStatusSchema.safeParse({ status: 'deleted' }).success).toBe(false);
    expect(setCompanyStatusSchema.safeParse({ status: 'suspended', reason: 'x'.repeat(501) }).success).toBe(false);
  });
});

describe('addCompanyNoteSchema', () => {
  it('1..2000 trimmed characters', () => {
    expect(addCompanyNoteSchema.safeParse({ body: '   ' }).success).toBe(false);
    expect(addCompanyNoteSchema.safeParse({ body: 'x'.repeat(2001) }).success).toBe(false);
    expect(addCompanyNoteSchema.parse({ body: ' hi ' }).body).toBe('hi');
  });
});

const LIST_RAW = {
  items: [{ id: ID, name: 'A', slug: 'a', status: 'active', contact_name: null, contact_email: null, created_at: '2030-01-01T00:00:00Z', plan_code: 'starter', plan_name: 'Starter', subscription_status: 'active', period_end: '2030-02-01T00:00:00Z' }],
  total: 1,
  page: 1,
  page_size: 25,
};
const DETAIL_RAW = {
  company: { id: ID, name: 'A', slug: 'a', status: 'suspended', legal_name: null, tax_number: null, contact_name: null, contact_email: null, contact_phone: null, country: null, suspended_at: '2030-01-01T00:00:00Z', suspension_reason: 'r', created_at: '2030-01-01T00:00:00Z', updated_at: '2030-01-01T00:00:00Z' },
  settings: { timezone: 'Africa/Cairo', currency: 'EGP', default_locale: 'ar', booking_enabled: true },
  subscription: null,
  counts: { users: 1, buses: 2, drivers: 3, routes: 4, trips: 5, bookings: 6 },
  owners: [{ user_id: ID, full_name: 'O', email: 'o@x.test', status: 'active' }],
  pending_invites: [{ id: INV, email: 'n@x.test', role_key: 'owner', expires_at: '2030-01-08T00:00:00Z', created_at: '2030-01-01T00:00:00Z' }],
  notes: [],
  resume_status: 'trial',
};

describe('admin output parsers', () => {
  it('map snake_case to camelCase', () => {
    const d = toAdminCompanyDetail(adminCompanyDetailRawSchema.parse(DETAIL_RAW));
    expect(d.company.suspensionReason).toBe('r');
    expect(d.resumeStatus).toBe('trial');
    expect(d.pendingInvites[0]).toMatchObject({ roleKey: 'owner' });
    expect(d.subscription).toBeNull();
  });
  it('fail on drift: unknown status, negative count, bad resume status, more than 50 notes', () => {
    expect(adminCompanyListRawSchema.safeParse({ ...LIST_RAW, items: [{ ...LIST_RAW.items[0], status: 'deleted' }] }).success).toBe(false);
    expect(adminCompanyDetailRawSchema.safeParse({ ...DETAIL_RAW, counts: { ...DETAIL_RAW.counts, trips: -1 } }).success).toBe(false);
    expect(adminCompanyDetailRawSchema.safeParse({ ...DETAIL_RAW, resume_status: 'suspended' }).success).toBe(false);
    const note = { id: 'n', body: 'b', created_at: 'x', author_name: null };
    expect(adminCompanyDetailRawSchema.safeParse({ ...DETAIL_RAW, notes: Array(51).fill(note) }).success).toBe(false);
  });
});

describe('company admin repository', () => {
  it('adminList sends only whitelisted p_* arguments', async () => {
    const { db, calls } = fakeDb({ data: LIST_RAW });
    const page = await companyRepository.adminList(platformCtx('support', db), { q: 'acme', status: 'active', sort: 'name', dir: 'asc', page: 2, pageSize: 10 });
    expect(calls[0]!.target).toBe('rpc:admin_list_companies');
    expect(opsOf(calls[0]!, 'args')[0]![0]).toEqual({ p_q: 'acme', p_status: 'active', p_sort: 'name', p_dir: 'asc', p_page: 2, p_page_size: 10 });
    expect(page.items[0]).toMatchObject({ planCode: 'starter', subscriptionStatus: 'active' });
  });
  it('adminDetail sends the id as a target only', async () => {
    const { db, calls } = fakeDb({ data: DETAIL_RAW });
    await companyRepository.adminDetail(platformCtx('billing', db), ID);
    expect(opsOf(calls[0]!, 'args')[0]![0]).toEqual({ p_company: ID });
  });
  it('adminUpdate maps to snake_case keys and drops anything not whitelisted', async () => {
    const { db, calls } = fakeDb({ data: { changed: true } });
    const r = await companyRepository.adminUpdate(platformCtx('super_admin', db), ID, { legalName: 'L', contactName: null, slug: 'evil', status: 'active' } as never);
    expect(r).toEqual({ changed: true });
    expect(opsOf(calls[0]!, 'args')[0]![0]).toEqual({ p_company: ID, p_patch: { legal_name: 'L', contact_name: null } });
  });
  it('adminCreate sends no role, status, actor or company id', async () => {
    const { db, calls } = fakeDb({ data: { company_id: ID, invite_id: INV, token: TOKEN, expires_at: 'x' } });
    const parsed = createCompanySchema.parse(CREATE);
    const out = await companyRepository.adminCreate(platformCtx('super_admin', db), parsed);
    expect(out).toMatchObject({ companyId: ID, token: TOKEN });
    const args = opsOf(calls[0]!, 'args')[0]![0] as Record<string, unknown>;
    expect(Object.keys(args).sort()).toEqual(['p_contact_email', 'p_contact_name', 'p_contact_phone', 'p_country', 'p_legal_name', 'p_name', 'p_owner_email', 'p_plan_code', 'p_slug', 'p_trial_days']);
  });
  it('a malformed create payload fails closed WITHOUT leaking the invite token', async () => {
    const { db } = fakeDb({ data: { company_id: 'not-a-uuid', token: TOKEN } });
    const err = await companyRepository.adminCreate(platformCtx('super_admin', db), createCompanySchema.parse(CREATE)).catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe('internal');
    expect(JSON.stringify(err) + String(err.message) + String(err.cause ?? '')).not.toContain(TOKEN);
  });
  it('adminSetStatus sends the status and a null reason when blank', async () => {
    const { db, calls } = fakeDb({ data: { status: 'active', previous_status: 'suspended' } });
    const r = await companyRepository.adminSetStatus(platformCtx('super_admin', db), ID, { status: 'active' });
    expect(r).toEqual({ status: 'active', previousStatus: 'suspended' });
    expect(opsOf(calls[0]!, 'args')[0]![0]).toEqual({ p_company: ID, p_status: 'active', p_reason: null });
  });
  it('adminInviteOwner pins the role to owner', async () => {
    const { db, calls } = fakeDb({ data: [{ invite_id: INV, token: TOKEN, expires_at: 'x' }] });
    const r = await companyRepository.adminInviteOwner(platformCtx('super_admin', db), ID, 'o@x.test');
    expect(r.inviteId).toBe(INV);
    expect(opsOf(calls[0]!, 'args')[0]![0]).toEqual({ p_email: 'o@x.test', p_role_key: 'owner', p_company_id: ID });
  });
  it.each([
    ['42501', 'forbidden'],
    ['P0002', 'not_found'],
    ['23514', 'business_rule'],
    ['22023', 'validation'],
  ])('maps %s to %s', async (code, want) => {
    const { db } = fakeDb({ error: { code, message: 'x' } });
    await expect(companyRepository.adminDetail(platformCtx('super_admin', db), ID)).rejects.toMatchObject({ code: want });
  });
});

function spyRepo() {
  return {
    adminList: vi.fn().mockResolvedValue('list'),
    adminDetail: vi.fn().mockResolvedValue('detail'),
    adminCreate: vi.fn().mockResolvedValue('created'),
    adminUpdate: vi.fn().mockResolvedValue({ changed: true }),
    adminSetStatus: vi.fn().mockResolvedValue({}),
    adminAddNote: vi.fn().mockResolvedValue(undefined),
    adminInviteOwner: vi.fn().mockResolvedValue('inv'),
    adminRevokeInvite: vi.fn().mockResolvedValue(undefined),
  };
}

describe('company admin service: authorize -> validate -> repository', () => {
  const calls = {
    create: (s: ReturnType<typeof makeCompanyService>, c: ReturnType<typeof platformCtx>) => s.createCompany(c, CREATE),
    update: (s: ReturnType<typeof makeCompanyService>, c: ReturnType<typeof platformCtx>) => s.updateCompany(c, ID, { name: 'x' }),
    status: (s: ReturnType<typeof makeCompanyService>, c: ReturnType<typeof platformCtx>) => s.setCompanyStatus(c, ID, { status: 'active' }),
    invite: (s: ReturnType<typeof makeCompanyService>, c: ReturnType<typeof platformCtx>) => s.inviteOwner(c, ID, { email: 'o@x.test' }),
    revoke: (s: ReturnType<typeof makeCompanyService>, c: ReturnType<typeof platformCtx>) => s.revokeInvite(c, INV),
  };
  const writers = Object.entries(calls);

  it.each(writers)('%s: super_admin only; support, billing and non-staff never reach the repository', async (_n, run) => {
    for (const role of ['support', 'billing', null] as const) {
      const repo = spyRepo();
      await expect(run(makeCompanyService(repo as unknown as CompanyRepository), platformCtx(role))).rejects.toMatchObject({ code: 'forbidden' });
      for (const fn of Object.values(repo)) expect(fn).not.toHaveBeenCalled();
    }
    const repo = spyRepo();
    await run(makeCompanyService(repo as unknown as CompanyRepository), platformCtx('super_admin'));
    expect(Object.values(repo).some((f) => f.mock.calls.length === 1)).toBe(true);
  });
  it('a forbidden caller is refused BEFORE validation (garbage input still gives forbidden)', async () => {
    const svc = makeCompanyService(spyRepo() as unknown as CompanyRepository);
    await expect(svc.createCompany(platformCtx('support'), { garbage: true })).rejects.toMatchObject({ code: 'forbidden' });
  });
  it('an allowed caller with bad input gets validation, and the repository is not called', async () => {
    const repo = spyRepo();
    const svc = makeCompanyService(repo as unknown as CompanyRepository);
    await expect(svc.createCompany(platformCtx('super_admin'), { ...CREATE, slug: 'admin' })).rejects.toMatchObject({ code: 'validation' });
    await expect(svc.setCompanyStatus(platformCtx('super_admin'), ID, { status: 'suspended' })).rejects.toMatchObject({ code: 'validation' });
    await expect(svc.updateCompany(platformCtx('super_admin'), 'not-a-uuid', { name: 'x' })).rejects.toMatchObject({ code: 'validation' });
    expect(repo.adminCreate).not.toHaveBeenCalled();
    expect(repo.adminSetStatus).not.toHaveBeenCalled();
    expect(repo.adminUpdate).not.toHaveBeenCalled();
  });
  it('notes: super_admin and support may write, billing may not', async () => {
    for (const role of ['super_admin', 'support'] as const) {
      const repo = spyRepo();
      await makeCompanyService(repo as unknown as CompanyRepository).addCompanyNote(platformCtx(role), ID, { body: 'hello' });
      expect(repo.adminAddNote).toHaveBeenCalledWith(expect.anything(), ID, 'hello');
    }
    const repo = spyRepo();
    await expect(makeCompanyService(repo as unknown as CompanyRepository).addCompanyNote(platformCtx('billing'), ID, { body: 'hello' })).rejects.toMatchObject({ code: 'forbidden' });
    expect(repo.adminAddNote).not.toHaveBeenCalled();
  });
  it.each(['super_admin', 'support', 'billing'] as const)('%s may list and read detail; non-staff may not', async (role) => {
    const repo = spyRepo();
    const svc = makeCompanyService(repo as unknown as CompanyRepository);
    await expect(svc.adminList(platformCtx(role), {})).resolves.toBe('list');
    await expect(svc.adminDetail(platformCtx(role), ID)).resolves.toBe('detail');
    await expect(svc.adminList(platformCtx(null), {})).rejects.toMatchObject({ code: 'forbidden' });
  });
  it('inviteOwner accepts no role from the caller', async () => {
    const repo = spyRepo();
    const svc = makeCompanyService(repo as unknown as CompanyRepository);
    await expect(svc.inviteOwner(platformCtx('super_admin'), ID, { email: 'o@x.test', roleKey: 'manager' })).rejects.toMatchObject({ code: 'validation' });
    expect(repo.adminInviteOwner).not.toHaveBeenCalled();
  });
});

describe('admin server actions (structural guard)', () => {
  const src = readFileSync(join(__dirname, '../admin/actions.ts'), 'utf8');
  const actions = [...src.matchAll(/export async function (\w+Action)\(/g)].map((m) => m[1]!);
  it('finds all six actions', () => {
    expect(actions).toEqual(['createCompanyAction', 'updateCompanyAction', 'setCompanyStatusAction', 'addCompanyNoteAction', 'inviteOwnerAction', 'revokeInviteAction']);
  });
  it.each(actions)('%s runs the platform guard before its try block', (name) => {
    const body = src.slice(src.indexOf(`function ${name}(`)).split(/\nexport async function /)[0]!;
    const guard = body.indexOf('getPlatformServiceContext(');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(body.indexOf('try {'));
  });
  it('never logs, never imports a privileged client, never reads a role or actor from the form', () => {
    expect(src).not.toMatch(/console\./);
    expect(src).not.toMatch(/service_role|SERVICE_ROLE|createBrowserClient|supabase-js/i);
    expect(src).not.toMatch(/field\(fd, '(role|roleKey|actor|actorId|userId|platformRole)'\)/);
  });
  it('only write actions for super_admin use the super_admin guard; notes also allow support', () => {
    expect(src).toMatch(/NOTE_WRITERS = \['super_admin', 'support'\]/);
    const noteBody = src.slice(src.indexOf('function addCompanyNoteAction(')).split(/\nexport async function /)[0]!;
    expect(noteBody).toContain('getPlatformServiceContext(NOTE_WRITERS)');
  });
});
