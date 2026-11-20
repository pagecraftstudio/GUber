import { describe, expect, it, vi } from 'vitest';
import { tenantCtx } from '@/test/helpers';
import { computeWizardState, WIZARD_STEPS, type WizardInput } from './wizard-state';
import { makeWizardService, type WizardDeps } from './wizard-service';

const ID = '00000000-0000-4000-8000-000000000301';
const home = { id: ID, slug: '', title: { en: 'Home' }, isHome: true, isPublished: true, seoTitle: null, seoDescription: null, updatedAt: '' };
const hero = (o = {}) => ({ id: ID, pageId: ID, type: 'hero' as const, sortOrder: 1, isEnabled: true, content: { title: { en: 'Acme Bus' } }, updatedAt: '', ...o });
const site = { company: { name: 'A', slug: 'a' }, version: 0, published_at: '', site: { schema_version: 1, settings: {}, pages: [], media: {} } };
const full = (o: Partial<WizardInput> = {}): WizardInput => ({
  settings: { siteTitle: { en: 'Acme' }, contactEmail: 'a@b.co', contactPhone: null, contactWhatsapp: null, logoMediaId: null },
  home, homeSections: [hero()], draft: { ok: true, data: site as never }, isPublished: false, ...o,
});
const cur = (o: Partial<WizardInput>) => computeWizardState(full(o)).current;

describe('computeWizardState', () => {
  it('lists the five steps in order', () => expect(computeWizardState(full()).steps.map((s) => s.key)).toEqual([...WIZARD_STEPS]));
  it('a complete unpublished draft rests on preview and is ready', () => {
    const s = computeWizardState(full());
    expect(s).toMatchObject({ current: 'preview', readyToPublish: true, isPublished: false });
    expect(s.steps.map((x) => x.complete)).toEqual([true, true, true, true, false]);
  });
  it('resumes at the FIRST open step, not the last one touched', () => {
    expect(cur({ settings: { ...full().settings, siteTitle: null } })).toBe('identity');
    expect(cur({ settings: { ...full().settings, siteTitle: { en: '  ', ar: '' } } })).toBe('identity');
    expect(cur({ homeSections: [] })).toBe('content');
    expect(cur({ homeSections: [hero({ content: {} })] })).toBe('content');
    expect(cur({ homeSections: [hero({ isEnabled: false })] })).toBe('content');
    expect(cur({ home: { ...home, isPublished: false } })).toBe('content');
    expect(cur({ home: null, homeSections: [] })).toBe('content');
    expect(cur({ settings: { ...full().settings, contactEmail: null } })).toBe('contact');
    expect(cur({ settings: { ...full().settings, contactEmail: ' ', contactWhatsapp: '+20100' } })).toBe('preview');
  });
  it('identity outranks content outranks contact', () => {
    expect(cur({ settings: { ...full().settings, siteTitle: null, contactEmail: null }, homeSections: [] })).toBe('identity');
    expect(cur({ settings: { ...full().settings, contactEmail: null }, homeSections: [] })).toBe('content');
  });
  it('a draft the database refuses is not ready, and preview stays open', () => {
    const s = computeWizardState(full({ draft: { ok: false, issue: 'too_large' } }));
    expect(s.readyToPublish).toBe(false);
    expect(s.steps.find((x) => x.key === 'preview')?.complete).toBe(false);
    expect(s.current).toBe('preview');
  });
  it('published sites reopen at publish, but an open earlier step still wins', () => {
    expect(cur({ isPublished: true })).toBe('publish');
    expect(cur({ isPublished: true, homeSections: [] })).toBe('content');
  });
  it('the logo is a tip, never a blocker', () => {
    expect(computeWizardState(full()).tips).toEqual(['no_logo']);
    expect(computeWizardState(full({ settings: { ...full().settings, logoMediaId: ID } })).tips).toEqual([]);
    expect(cur({})).toBe('preview');
  });
});

function deps(over: Partial<Record<keyof WizardDeps, unknown>> = {}) {
  const d = {
    ensureStarter: vi.fn().mockResolvedValue({ created_home: true, seeded_sections: 5, created_settings: true }),
    settings: { getSettings: vi.fn().mockResolvedValue(full().settings) },
    pages: { listPages: vi.fn().mockResolvedValue([home]), getPageWithSections: vi.fn().mockResolvedValue({ page: home, sections: [hero()] }) },
    preview: { getDraft: vi.fn().mockResolvedValue({ ok: true, data: site }) },
    publish: { getState: vi.fn().mockResolvedValue({ isPublished: false, versions: [] }) },
    ...over,
  } as unknown as WizardDeps;
  return { d, svc: makeWizardService(d) };
}

describe('wizard service', () => {
  it('open() needs website.write and does not call the database without it', async () => {
    const { d, svc } = deps();
    await expect(svc.open(tenantCtx(['website.read']))).rejects.toMatchObject({ code: 'forbidden' });
    expect(d.ensureStarter).not.toHaveBeenCalled();
  });
  it('state() needs website.read and nothing is created by it', async () => {
    const { d, svc } = deps();
    await expect(svc.state(tenantCtx([]))).rejects.toMatchObject({ code: 'forbidden' });
    expect((await svc.state(tenantCtx(['website.read']))).current).toBe('preview');
    expect(d.ensureStarter).not.toHaveBeenCalled();
  });
  it('open() creates the starter first, then reports the state', async () => {
    const { d, svc } = deps();
    const r = await svc.open(tenantCtx(['website.read', 'website.write']));
    expect(r.starter).toEqual({ createdHome: true, seededSections: 5, createdSettings: true });
    expect(r.state.current).toBe('preview');
    expect((d.ensureStarter as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]).toBeLessThan((d.settings.getSettings as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]!);
  });
  it('a site without a home page reads sections as empty (no second query)', async () => {
    const { d, svc } = deps({ pages: { listPages: vi.fn().mockResolvedValue([]), getPageWithSections: vi.fn() } });
    expect((await svc.state(tenantCtx(['website.read']))).current).toBe('content');
    expect(d.pages.getPageWithSections).not.toHaveBeenCalled();
  });
  it('an unexpected starter answer is an internal error, not a guess', async () => {
    await expect(deps({ ensureStarter: vi.fn().mockResolvedValue({ nope: 1 }) }).svc.open(tenantCtx(['website.read', 'website.write']))).rejects.toMatchObject({ code: 'internal' });
  });
  it('a database refusal from the starter is mapped, not leaked', async () => {
    const e = await deps({ ensureStarter: vi.fn().mockRejectedValue(Object.assign(new Error('x'), { code: 'forbidden' })) }).svc.open(tenantCtx(['website.read', 'website.write'])).catch((x) => x);
    expect(e).toMatchObject({ code: 'forbidden' });
  });
});
