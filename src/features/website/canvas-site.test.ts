import { describe, expect, it } from 'vitest';
import { DEFAULT_WEBSITE_SETTINGS } from './types';
import type { DraftPage, DraftSection } from './pages-types';
import { buildCanvasSite } from './canvas-site';

const pg = (id: string, o: Partial<DraftPage> = {}): DraftPage => ({ id, slug: id, title: { en: id }, isHome: false, isPublished: true, seoTitle: null, seoDescription: null, updatedAt: '', ...o });
const sec = (id: string, sortOrder: number, o: Partial<DraftSection> = {}): DraftSection => ({ id, pageId: 'p', type: 'about', sortOrder, isEnabled: true, content: {}, updatedAt: '', ...o });
const base = { companyName: 'Nile', companySlug: 'nile', settings: { ...DEFAULT_WEBSITE_SETTINGS, siteTitle: { en: 'Nile' } }, logoPath: null };

describe('buildCanvasSite', () => {
  it('keeps hidden sections (flagged) in sort order, blocks aligned with the page sections', () => {
    const home = pg('home', { isHome: true, slug: '' });
    const r = buildCanvasSite({ ...base, pages: [home], selected: home, sections: [sec('b', 20, { isEnabled: false, type: 'faq' }), sec('a', 10, { type: 'hero' })] });
    expect(r.blocks.map((b) => [b.id, b.type, b.enabled])).toEqual([['a', 'hero', true], ['b', 'faq', false]]);
    expect(r.page.sections.map((s) => s.type)).toEqual(['hero', 'faq']);
    expect(r.blocks[0]!.label).toContain('Hero banner');
  });
  it('nav lists published non-home pages only; the selected page appears once with its sections', () => {
    const home = pg('home', { isHome: true, slug: '' }), a = pg('a'), draft = pg('d', { isPublished: false });
    const r = buildCanvasSite({ ...base, pages: [home, a, draft], selected: a, sections: [sec('x', 1)] });
    expect(r.data.site.pages.map((p) => p.slug)).toEqual(['a']);                    // no home row is needed for nav; draft page hidden
    const onHome = buildCanvasSite({ ...base, pages: [home, a, draft], selected: home, sections: [sec('x', 1)] });
    expect(onHome.data.site.pages.map((p) => p.slug)).toEqual(['', 'a']);
    expect(onHome.data.site.pages.find((p) => p.is_home)!.sections).toHaveLength(1);
  });
  it('never fails on an unfinished draft (no title, no sections)', () => {
    const home = pg('home', { isHome: true, slug: '' });
    const r = buildCanvasSite({ ...base, settings: { ...DEFAULT_WEBSITE_SETTINGS }, pages: [home], selected: home, sections: [] });
    expect(r.blocks).toEqual([]); expect(r.page.sections).toEqual([]);
  });
  it('logo becomes a media entry only when there is one', () => {
    const home = pg('home', { isHome: true });
    expect(buildCanvasSite({ ...base, pages: [home], selected: home, sections: [] }).data.site.media).toEqual({});
    const w = buildCanvasSite({ ...base, logoPath: 'c/logo/x.png', pages: [home], selected: home, sections: [] });
    expect(w.data.site.settings.logo_media_id).toBe('logo'); expect(w.data.site.media.logo?.path).toBe('c/logo/x.png');
  });
});
