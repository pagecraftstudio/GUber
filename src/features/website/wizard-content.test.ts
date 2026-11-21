import { describe, expect, it, vi } from 'vitest';
import { tenantCtx } from '@/test/helpers';
import type { DraftSection } from './pages-types';
import { canonicalSort, planContentWrite, readHomeContent, type HomeContent } from './wizard-content';
import { makeWizardService, type WizardDeps } from './wizard-service';
import { parseSectionContent } from './content-schema';

const U = (n: number) => `00000000-0000-4000-8000-0000000007${String(n).padStart(2, '0')}`;
const sec = (n: number, type: DraftSection['type'], content: Record<string, unknown> = {}, isEnabled = true): DraftSection =>
  ({ id: U(n), pageId: U(99), type, sortOrder: n, isEnabled, content, updatedAt: '' });
const L = (en = '', ar = '') => ({ en, ar });
const base = (o: Partial<HomeContent> = {}): HomeContent => ({
  hero: { title: L('Acme'), subtitle: L(), ctaLabel: L(), ctaHref: '' }, about: { title: L(), body: L() }, faq: { items: [] }, showRoutes: false, showTrips: false, ...o,
});
const starter = () => [
  sec(1, 'hero', { title: { en: 'Acme', ar: 'أكمي' }, subtitle: { en: 'Hi' }, cta_label: { en: 'Go' }, cta_href: '#trips', image_media_id: U(50) }),
  sec(2, 'routes', { title: { en: 'Our routes' } }), sec(3, 'trips', { title: { en: 'Trips' }, limit: 10 }),
  sec(4, 'about', { title: { en: 'About us' }, body: { en: 'Text' } }), sec(5, 'contact', { title: { en: 'Contact us' } }),
];

describe('readHomeContent', () => {
  it('reads the starter into form values', () => {
    const c = readHomeContent(starter());
    expect(c.hero).toEqual({ title: L('Acme', 'أكمي'), subtitle: L('Hi'), ctaLabel: L('Go'), ctaHref: '#trips' });
    expect(c.about.body).toEqual(L('Text'));
    expect([c.showRoutes, c.showTrips, c.faq.items.length]).toEqual([true, true, 0]);
  });
  it('missing sections and hostile content never throw', () => {
    expect(readHomeContent([])).toEqual(base({ hero: { title: L(), subtitle: L(), ctaLabel: L(), ctaHref: '' } }));
    const c = readHomeContent([sec(1, 'faq', { items: ['x', null, { question: 5, answer: { en: 'a' } }] })]);
    expect(c.faq.items).toHaveLength(3);
    expect(c.faq.items[2]!.answer.en).toBe('a');
  });
  it('a disabled routes section reads as hidden', () => expect(readHomeContent([sec(2, 'routes', {}, false)]).showRoutes).toBe(false));
});

describe('planContentWrite', () => {
  const cur = readHomeContent(starter());
  it('writing back what was read changes nothing (idempotent, key order irrelevant)', () => expect(planContentWrite(starter(), cur)).toEqual([]));
  it('keeps keys the form does not know (the hero image)', () => {
    const ops = planContentWrite(starter(), { ...cur, hero: { ...cur.hero, title: L('New') } });
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ op: 'update', id: U(1), content: { title: { en: 'New' }, image_media_id: U(50), cta_href: '#trips' } });
  });
  it('blank languages and blank fields are dropped from storage', () => {
    const ops = planContentWrite(starter(), { ...cur, hero: { title: L('A', '  '), subtitle: L(), ctaLabel: L(), ctaHref: ' ' } });
    expect(ops[0]).toMatchObject({ op: 'update', content: { title: { en: 'A' } } });
    expect((ops[0] as { content: Record<string, unknown> }).content).not.toHaveProperty('subtitle');
    expect((ops[0] as { content: Record<string, unknown> }).content).not.toHaveProperty('cta_href');
  });
  it('adds a FAQ section when the first question is written, deletes it when emptied', () => {
    const withFaq = planContentWrite(starter(), { ...cur, faq: { items: [{ question: L('Why?'), answer: L('Because') }, { question: L(), answer: L() }] } });
    expect(withFaq).toEqual([{ op: 'add', type: 'faq', content: { title: { en: 'Questions', ar: 'الأسئلة الشائعة' }, items: [{ question: { en: 'Why?' }, answer: { en: 'Because' } }] } }]);
    const stored = [...starter(), sec(6, 'faq', { items: [{ question: { en: 'Why?' } }] })];
    expect(planContentWrite(stored, cur)).toEqual([{ op: 'delete', id: U(6) }]);
  });
  it('routes/trips toggles update isEnabled only when it changes; showing a missing one adds it', () => {
    expect(planContentWrite(starter(), { ...cur, showRoutes: false })).toEqual([{ op: 'update', id: U(2), isEnabled: false }]);
    const noTrips = starter().filter((s) => s.type !== 'trips');
    expect(planContentWrite(noTrips, cur)).toEqual([{ op: 'add', type: 'trips', content: { title: { en: 'Upcoming trips', ar: 'الرحلات القادمة' } } }]);
    expect(planContentWrite(noTrips, { ...cur, showTrips: false })).toEqual([]);
  });
  it('a missing hero is re-created; a missing about only when something is written', () => {
    const ops = planContentWrite([], base());
    expect(ops).toEqual([{ op: 'add', type: 'hero', content: { title: { en: 'Acme' } } }]);
  });
  it('every operation produced passes the strict WRITE schema the page service uses', () => {
    const want: HomeContent = { hero: { title: L('A', 'ب'), subtitle: L('s'), ctaLabel: L('Go'), ctaHref: 'https://x.co/a' }, about: { title: L('T'), body: L('**b**') },
      faq: { items: [{ question: L('Q'), answer: L('A') }] }, showRoutes: true, showTrips: true };
    for (const o of planContentWrite([], want)) if (o.op === 'add') expect(parseSectionContent(o.type, o.content).success, o.type).toBe(true);
  });
});

describe('canonicalSort', () => {
  it('orders hero, routes, trips, about, faq, contact and keeps legacy types after them', () => {
    const t = (type: DraftSection['type']) => ({ type });
    expect(canonicalSort([t('contact'), t('faq'), t('hero'), t('about'), t('trips'), t('routes')]).map((x) => x.type)).toEqual(['hero', 'routes', 'trips', 'about', 'faq', 'contact']);
  });
});

function deps(over: Partial<Record<keyof WizardDeps, unknown>> = {}) {
  const home = { id: U(99), slug: '', title: {}, isHome: true, isPublished: true, seoTitle: null, seoDescription: null, updatedAt: '' };
  const d = {
    ensureStarter: vi.fn(),
    settings: { getSettings: vi.fn().mockResolvedValue({ logoMediaId: U(60) }), updateSettings: vi.fn().mockResolvedValue({}) },
    pages: { listPages: vi.fn().mockResolvedValue([home]), getPageWithSections: vi.fn().mockResolvedValue({ page: home, sections: starter() }),
      addSection: vi.fn().mockResolvedValue({}), updateSection: vi.fn().mockResolvedValue({}), deleteSection: vi.fn().mockResolvedValue(undefined), reorderSections: vi.fn().mockResolvedValue(undefined) },
    preview: { getDraft: vi.fn() }, publish: { getState: vi.fn() },
    media: { uploadImage: vi.fn().mockResolvedValue({ mediaId: U(61), path: 'p' }), removeImage: vi.fn().mockResolvedValue(undefined), imagePath: vi.fn().mockResolvedValue('c/logo/x.png') },
    ...over,
  } as unknown as WizardDeps;
  return { d, svc: makeWizardService(d) };
}
const w = tenantCtx(['website.read', 'website.write', 'media.read', 'media.write']);
const want = () => ({ hero: { title: L('Acme'), subtitle: L(), ctaLabel: L(), ctaHref: '' }, about: { title: L(), body: L() }, faq: { items: [] }, showRoutes: true, showTrips: true });

describe('wizard step saves', () => {
  it('every write needs website.write and reaches nothing without it', async () => {
    const { d, svc } = deps();
    const ro = tenantCtx(['website.read', 'media.read']);
    await expect(svc.saveIdentity(ro, { titleEn: 'A', titleAr: '', primaryColor: '#112233', secondaryColor: '#112233' })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(svc.saveContact(ro, {})).rejects.toMatchObject({ code: 'forbidden' });
    await expect(svc.saveContent(ro, want())).rejects.toMatchObject({ code: 'forbidden' });
    await expect(svc.setLogo(ro, { filename: 'a' }, new Uint8Array(1))).rejects.toMatchObject({ code: 'forbidden' });
    await expect(svc.removeLogo(ro)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(svc.read(tenantCtx([]))).rejects.toMatchObject({ code: 'forbidden' });
    expect(d.settings.updateSettings).not.toHaveBeenCalled();
    expect(d.pages.updateSection).not.toHaveBeenCalled();
  });
  it('identity needs a title in some language; colours are passed on to the validated settings service', async () => {
    const { d, svc } = deps();
    await expect(svc.saveIdentity(w, { titleEn: ' ', titleAr: '', primaryColor: '#112233', secondaryColor: '#445566' })).rejects.toMatchObject({ code: 'validation', detail: 'title_required' });
    await svc.saveIdentity(w, { titleEn: '', titleAr: 'أكمي', primaryColor: '#112233', secondaryColor: '#445566' });
    expect(d.settings.updateSettings).toHaveBeenCalledWith(expect.anything(), { siteTitle: { en: '', ar: 'أكمي' }, primaryColor: '#112233', secondaryColor: '#445566' });
  });
  it('contact needs one way to be reached and sends blanks as null', async () => {
    const { d, svc } = deps();
    const none = { email: '', phone: ' ', whatsapp: '', addressEn: '', addressAr: '', footerEn: '', footerAr: '' };
    await expect(svc.saveContact(w, none)).rejects.toMatchObject({ detail: 'contact_required' });
    await svc.saveContact(w, { ...none, phone: '+20100', footerEn: 'Bye' });
    expect(d.settings.updateSettings).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ contactEmail: null, contactPhone: '+20100', contactWhatsapp: null }));
  });
  it('unknown keys (company_id) are refused everywhere', async () => {
    const { svc } = deps();
    await expect(svc.saveContent(w, { ...want(), company_id: 'x' })).rejects.toMatchObject({ code: 'validation' });
    await expect(svc.saveIdentity(w, { titleEn: 'A', titleAr: '', primaryColor: '#112233', secondaryColor: '#112233', logoMediaId: U(1) })).rejects.toMatchObject({ code: 'validation' });
  });
  it('content: the hero needs a title; an unchanged form writes nothing', async () => {
    const { d, svc } = deps();
    await expect(svc.saveContent(w, { ...want(), hero: { ...want().hero, title: L() } })).rejects.toMatchObject({ detail: 'hero_title_required' });
    await svc.saveContent(w, { ...readHomeContent(starter()) });
    expect(d.pages.updateSection).not.toHaveBeenCalled();
    expect(d.pages.addSection).not.toHaveBeenCalled();
  });
  it('content: deletes first, then updates, then adds, then restores the canonical order', async () => {
    const stored = [...starter(), sec(6, 'faq', { items: [{ question: { en: 'Q' } }] })].filter((s) => s.type !== 'about');
    const afterAdd = [...stored.filter((s) => s.type !== 'faq'), sec(7, 'about', { title: { en: 'T' } })]; // what the database holds after the delete and the add
    const get = vi.fn().mockResolvedValueOnce({ sections: stored }).mockResolvedValueOnce({ sections: afterAdd });
    const { d, svc } = deps({ pages: { listPages: vi.fn().mockResolvedValue([{ id: U(99), isHome: true }]), getPageWithSections: get, addSection: vi.fn().mockResolvedValue({}), updateSection: vi.fn(), deleteSection: vi.fn(), reorderSections: vi.fn() } });
    await svc.saveContent(w, { ...readHomeContent(stored), about: { title: L('T'), body: L() }, faq: { items: [] } });
    expect(d.pages.deleteSection).toHaveBeenCalledWith(expect.anything(), U(6));
    expect(d.pages.addSection).toHaveBeenCalledWith(expect.anything(), U(99), { type: 'about', content: { title: { en: 'T' } } });
    expect(d.pages.reorderSections).toHaveBeenCalledWith(expect.anything(), U(99), { orderedIds: [U(1), U(2), U(3), U(7), U(5)] });
  });
  it('content without a home page is a business rule, not a crash', async () => {
    const { svc } = deps({ pages: { listPages: vi.fn().mockResolvedValue([]), getPageWithSections: vi.fn(), addSection: vi.fn(), updateSection: vi.fn(), deleteSection: vi.fn(), reorderSections: vi.fn() } });
    await expect(svc.saveContent(w, want())).rejects.toMatchObject({ code: 'business_rule', detail: 'home_page_missing' });
  });
});

describe('logo', () => {
  it('needs media.write as well as website.write', async () => {
    const { d, svc } = deps();
    await expect(svc.setLogo(tenantCtx(['website.read', 'website.write']), { filename: 'a.png' }, new Uint8Array(1))).rejects.toMatchObject({ code: 'forbidden' });
    expect(d.media.uploadImage).not.toHaveBeenCalled();
  });
  it('uploads, points the settings at it, then retires the previous logo', async () => {
    const { d, svc } = deps();
    await svc.setLogo(w, { filename: 'a.png' }, new Uint8Array(1));
    expect(d.settings.updateSettings).toHaveBeenCalledWith(expect.anything(), { logoMediaId: U(61) });
    expect(d.media.removeImage).toHaveBeenCalledWith(expect.anything(), U(60));
  });
  it('if pointing the settings at the new image fails, the new image is discarded and the old one stays', async () => {
    const { d, svc } = deps({ settings: { getSettings: vi.fn().mockResolvedValue({ logoMediaId: U(60) }), updateSettings: vi.fn().mockRejectedValue(Object.assign(new Error('x'), { code: 'conflict' })) } });
    await expect(svc.setLogo(w, { filename: 'a.png' }, new Uint8Array(1))).rejects.toMatchObject({ code: 'conflict' });
    expect(d.media.removeImage).toHaveBeenCalledTimes(1);
    expect(d.media.removeImage).toHaveBeenCalledWith(expect.anything(), U(61));
  });
  it('a failed upload changes nothing', async () => {
    const { d, svc } = deps({ media: { uploadImage: vi.fn().mockRejectedValue(Object.assign(new Error('x'), { code: 'plan_limit' })), removeImage: vi.fn(), imagePath: vi.fn() } });
    await expect(svc.setLogo(w, { filename: 'a.png' }, new Uint8Array(1))).rejects.toMatchObject({ code: 'plan_limit' });
    expect(d.settings.updateSettings).not.toHaveBeenCalled();
  });
  it('removeLogo clears the reference first, then retires the image', async () => {
    const { d, svc } = deps();
    await svc.removeLogo(w);
    expect(d.settings.updateSettings).toHaveBeenCalledWith(expect.anything(), { logoMediaId: null });
    expect(d.media.removeImage).toHaveBeenCalledWith(expect.anything(), U(60));
  });
  it('read() looks up the logo path only with media.read', async () => {
    const { d, svc } = deps();
    expect((await svc.read(w)).logoPath).toBe('c/logo/x.png');
    expect((await svc.read(tenantCtx(['website.read']))).logoPath).toBeNull();
    expect(d.media.imagePath).toHaveBeenCalledTimes(1);
  });
});

import { fromSectionShape, toSectionShape } from './wizard-content';
describe('section shape round trip', () => {
  it('survives to/from and tolerates garbage', () => {
    const c = fromSectionShape({ hero: { title: { en: 'Hi', ar: 'اهلا' }, cta_href: '/x' }, about: {}, faq: { items: [{ question: { en: 'Q' }, answer: { en: 'A' } }] }, showRoutes: true, showTrips: false });
    expect(fromSectionShape(toSectionShape(c))).toEqual(c);
    expect(c.showRoutes).toBe(true);
    expect(() => fromSectionShape(null)).not.toThrow();
    expect(() => fromSectionShape('x')).not.toThrow();
  });
});
