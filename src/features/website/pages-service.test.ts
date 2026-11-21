import { describe, expect, it, vi } from 'vitest';
import { tenantCtx } from '@/test/helpers';
import { makePagesService } from './pages-service';
import type { PagesRepository } from './pages-repository';
import { parseSectionContent, sectionWriteSchemas } from './content-schema';
import { sectionSchemas } from '@/features/site/sections';
import { CANVAS_SECTIONS, SECTION_DEFAULTS } from './section-fields';

const ID = '00000000-0000-4000-8000-000000000301';
const ID2 = '00000000-0000-4000-8000-000000000302';
const MEDIA = '00000000-0000-4000-8000-000000000401';
const page = (o = {}) => ({ id: ID, slug: 'about', title: { en: 'About' }, isHome: false, isPublished: true, seoTitle: null, seoDescription: null, updatedAt: '', ...o });
const section = (o = {}) => ({ id: ID, pageId: ID, type: 'hero' as const, sortOrder: 0, isEnabled: true, content: {}, updatedAt: '', ...o });

function repo(over: Partial<Record<keyof PagesRepository, unknown>> = {}): PagesRepository {
  const names = ['listPages', 'getPage', 'createPage', 'createHomePage', 'updatePage', 'deletePage', 'listSections', 'addSection', 'getSection', 'updateSection', 'deleteSection', 'setSectionOrder'];
  return Object.fromEntries(names.map((n) => [n, over[n as keyof PagesRepository] ?? vi.fn()])) as unknown as PagesRepository;
}

describe('write/read contract', () => {
  it('every section type has both a read and a write schema', () => {
    expect(Object.keys(sectionWriteSchemas).sort()).toEqual(Object.keys(sectionSchemas).sort());
  });
  it('rejects unknown keys, bad URL schemes and non-uuid media', () => {
    expect(parseSectionContent('hero', { evil: 1 }).success).toBe(false);
    for (const href of ['javascript:alert(1)', 'data:text/html,x', 'http://x.com', '//evil.com', 'ftp://x.com'])
      expect(parseSectionContent('hero', { cta_href: href }).success, href).toBe(false);
    expect(parseSectionContent('hero', { image_media_id: '../../x' }).success).toBe(false);
  });
  it('accepts https, mailto, tel, anchors, paths and valid media', () => {
    for (const href of ['https://a.com/x', 'mailto:a@b.com', 'tel:+971500000000', '#faq', '/s/acme/about'])
      expect(parseSectionContent('hero', { cta_href: href }).success, href).toBe(true);
    expect(parseSectionContent('hero', { image_media_id: MEDIA }).success).toBe(true);
  });
  it('caps list sizes', () => {
    expect(parseSectionContent('faq', { items: Array.from({ length: 41 }, () => ({})) }).success).toBe(false);
  });
});

describe('pages service: authorize -> validate -> repository', () => {
  it('read-only role cannot write', async () => {
    const r = repo();
    await expect(makePagesService(r).addSection(tenantCtx(['website.read']), ID, { type: 'about' })).rejects.toMatchObject({ code: 'forbidden' });
    expect(r.addSection).not.toHaveBeenCalled();
  });
  it('no permission cannot read', async () => {
    await expect(makePagesService(repo()).listPages(tenantCtx([]))).rejects.toMatchObject({ code: 'forbidden' });
  });
  it('invalid content never reaches the repository', async () => {
    const r = repo({ getPage: vi.fn().mockResolvedValue(page()) });
    await expect(makePagesService(r).addSection(tenantCtx(['website.write']), ID, { type: 'hero', content: { cta_href: 'javascript:x' } })).rejects.toMatchObject({ code: 'validation' });
    expect(r.addSection).not.toHaveBeenCalled();
  });
  it('unknown section type refused', async () => {
    const r = repo();
    await expect(makePagesService(r).addSection(tenantCtx(['website.write']), ID, { type: 'script' })).rejects.toMatchObject({ code: 'validation' });
  });
  it('payload company_id is refused (strict) and never forwarded', async () => {
    const r = repo();
    await expect(makePagesService(r).createPage(tenantCtx(['website.write']), { slug: 'x', title: { en: 'X' }, company_id: 'other' })).rejects.toMatchObject({ code: 'validation' });
    expect(r.createPage).not.toHaveBeenCalled();
  });
  it('update validates against the STORED section type', async () => {
    const r = repo({ getSection: vi.fn().mockResolvedValue(section({ type: 'trips' })), updateSection: vi.fn() });
    await expect(makePagesService(r).updateSection(tenantCtx(['website.write']), ID, { content: { cta_href: 'https://a.com' } })).rejects.toMatchObject({ code: 'validation' });
    expect(r.updateSection).not.toHaveBeenCalled();
  });
  it('missing (or other-tenant) section is not_found', async () => {
    const r = repo({ getSection: vi.fn().mockResolvedValue(null) });
    await expect(makePagesService(r).updateSection(tenantCtx(['website.write']), ID, { content: {} })).rejects.toMatchObject({ code: 'not_found' });
  });
  it('home page cannot be deleted or unpublished', async () => {
    const r = repo({ getPage: vi.fn().mockResolvedValue(page({ isHome: true, slug: '' })) });
    const svc = makePagesService(r);
    await expect(svc.deletePage(tenantCtx(['website.write']), ID)).rejects.toMatchObject({ code: 'business_rule' });
    await expect(svc.updatePage(tenantCtx(['website.write']), ID, { isPublished: false })).rejects.toMatchObject({ code: 'validation' });
    expect(r.deletePage).not.toHaveBeenCalled();
  });
  it('reorder must be exactly the page sections', async () => {
    const r = repo({ listSections: vi.fn().mockResolvedValue([section({ id: ID }), section({ id: ID2 })]) });
    const svc = makePagesService(r);
    await expect(svc.reorderSections(tenantCtx(['website.write']), ID, { orderedIds: [ID] })).rejects.toMatchObject({ code: 'validation' });
    await expect(svc.reorderSections(tenantCtx(['website.write']), ID, { orderedIds: [ID, ID] })).rejects.toMatchObject({ code: 'validation' });
    await svc.reorderSections(tenantCtx(['website.write']), ID, { orderedIds: [ID2, ID] });
    expect(r.setSectionOrder).toHaveBeenCalledWith(expect.anything(), ID, [ID2, ID]);
  });
});

describe('ensureHomePage', () => {
  it('creates home only when missing, and needs write', async () => {
    const home = page({ isHome: true, slug: '' });
    const r1 = repo({ listPages: vi.fn().mockResolvedValue([page()]), createHomePage: vi.fn().mockResolvedValue(home) });
    expect((await makePagesService(r1).ensureHomePage(tenantCtx(['website.write']))).map((p) => p.isHome)).toEqual([true, false]);
    const r2 = repo({ listPages: vi.fn().mockResolvedValue([home]) });
    await makePagesService(r2).ensureHomePage(tenantCtx(['website.write']));
    expect(r2.createHomePage).not.toHaveBeenCalled();
    await expect(makePagesService(repo()).ensureHomePage(tenantCtx(['website.read']))).rejects.toMatchObject({ code: 'forbidden' });
  });
});

describe('visual editor: insertSection', () => {
  const S = (n: number) => `00000000-0000-4000-8000-00000000050${n}`;
  const secs = [section({ id: S(1) }), section({ id: S(2) }), section({ id: S(3) })];
  const ctx = tenantCtx(['website.write']);
  const make = () => repo({ getPage: vi.fn().mockResolvedValue(page()), listSections: vi.fn().mockResolvedValue(secs), addSection: vi.fn().mockResolvedValue(section({ id: S(9), type: 'about' })), setSectionOrder: vi.fn() });

  it('every offered section starts from defaults that satisfy the strict write schema', () => {
    for (const t of CANVAS_SECTIONS) expect(parseSectionContent(t, SECTION_DEFAULTS[t] ?? {}).success, t).toBe(true);
  });
  it('inserts in the middle: appended, then moved to the index', async () => {
    const r = make();
    await makePagesService(r).insertSection(ctx, ID, { type: 'about', index: 1 });
    expect(r.addSection).toHaveBeenCalledWith(ctx, ID, 'about', { title: { en: 'About us', ar: 'من نحن' } });
    expect(r.setSectionOrder).toHaveBeenCalledWith(ctx, ID, [S(1), S(9), S(2), S(3)]);
  });
  it('index 0 puts it first; an index past the end (or the end) is just an append with no reorder', async () => {
    const a = make(); await makePagesService(a).insertSection(ctx, ID, { type: 'about', index: 0 });
    expect(a.setSectionOrder).toHaveBeenCalledWith(ctx, ID, [S(9), S(1), S(2), S(3)]);
    const b = make(); await makePagesService(b).insertSection(ctx, ID, { type: 'about', index: 3 });
    await makePagesService(b).insertSection(ctx, ID, { type: 'about', index: 50 });
    expect(b.setSectionOrder).not.toHaveBeenCalled();
  });
  it('read-only, unknown type, bad index, missing page and a full page are all refused before any write', async () => {
    const r = make();
    await expect(makePagesService(r).insertSection(tenantCtx(['website.read']), ID, { type: 'about', index: 0 })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(makePagesService(r).insertSection(ctx, ID, { type: 'script', index: 0 })).rejects.toMatchObject({ code: 'validation' });
    await expect(makePagesService(r).insertSection(ctx, ID, { type: 'about', index: -1 })).rejects.toMatchObject({ code: 'validation' });
    await expect(makePagesService(r).insertSection(ctx, ID, { type: 'about', index: 0, pageId: 'x' })).rejects.toMatchObject({ code: 'validation' });
    const none = repo({ getPage: vi.fn().mockResolvedValue(null) });
    await expect(makePagesService(none).insertSection(ctx, ID, { type: 'about', index: 0 })).rejects.toMatchObject({ code: 'not_found' });
    const full = repo({ getPage: vi.fn().mockResolvedValue(page()), listSections: vi.fn().mockResolvedValue(Array.from({ length: 40 }, () => section())), addSection: vi.fn() });
    await expect(makePagesService(full).insertSection(ctx, ID, { type: 'about', index: 0 })).rejects.toMatchObject({ detail: 'too_many_sections' });
    expect(full.addSection).not.toHaveBeenCalled(); expect(r.addSection).not.toHaveBeenCalled();
  });
});
