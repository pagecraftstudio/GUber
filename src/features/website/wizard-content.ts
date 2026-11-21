import type { SectionType } from '@/features/site/sections';
import type { DraftSection } from './pages-types';

/**
 * The home page as the wizard sees it: a handful of fixed blocks instead of a free-form section list. Pure: `readHomeContent`
 * turns the stored sections into form values, `planContentWrite` turns form values into the minimal list of section operations.
 * The service executes the plan through the page service, so every write is still validated by the strict section schemas
 * (and the 0046 triggers) exactly like any other draft edit.
 */
export type L = { en: string; ar: string };
export type FaqItem = { question: L; answer: L };
export type HomeContent = {
  hero: { title: L; subtitle: L; ctaLabel: L; ctaHref: string };
  about: { title: L; body: L };
  faq: { items: FaqItem[] };
  showRoutes: boolean;
  showTrips: boolean;
};

const s = (v: unknown): string => (typeof v === 'string' ? v : '');
const loc = (v: unknown): L => {
  const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  return { en: s(o.en), ar: s(o.ar) };
};
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const first = (sections: DraftSection[], type: SectionType) => sections.find((x) => x.type === type);

export function readHomeContent(sections: DraftSection[]): HomeContent {
  const hero = obj(first(sections, 'hero')?.content);
  const about = obj(first(sections, 'about')?.content);
  const faq = obj(first(sections, 'faq')?.content);
  const items = (Array.isArray(faq.items) ? faq.items : []).map((i) => ({ question: loc(obj(i).question), answer: loc(obj(i).answer) }));
  const routes = first(sections, 'routes'), trips = first(sections, 'trips');
  return {
    hero: { title: loc(hero.title), subtitle: loc(hero.subtitle), ctaLabel: loc(hero.cta_label), ctaHref: s(hero.cta_href) },
    about: { title: loc(about.title), body: loc(about.body) },
    faq: { items },
    showRoutes: !!routes?.isEnabled,
    showTrips: !!trips?.isEnabled,
  };
}

export type Op =
  | { op: 'add'; type: SectionType; content: Record<string, unknown> }
  | { op: 'update'; id: string; content?: Record<string, unknown>; isEnabled?: boolean }
  | { op: 'delete'; id: string };

/** Section order the wizard keeps; anything else (legacy sections) stays after these in its old relative order. */
export const CANONICAL_ORDER: SectionType[] = ['hero', 'routes', 'trips', 'about', 'faq', 'contact', 'features', 'rich_text', 'image', 'footer'];
export const canonicalSort = <T extends { type: SectionType }>(items: T[]): T[] =>
  [...items].sort((a, b) => CANONICAL_ORDER.indexOf(a.type) - CANONICAL_ORDER.indexOf(b.type));

const blank = (l: L) => l.en.trim() === '' && l.ar.trim() === '';
/** Localized value for storage: drop empty languages; undefined when both are empty. */
const sl = (l: L): { en?: string; ar?: string } | undefined => {
  const o: { en?: string; ar?: string } = {};
  if (l.en.trim()) o.en = l.en.trim();
  if (l.ar.trim()) o.ar = l.ar.trim();
  return o.en || o.ar ? o : undefined;
};
const put = (base: Record<string, unknown>, patch: Record<string, unknown | undefined>): Record<string, unknown> => {
  const out = { ...base };
  for (const [k, v] of Object.entries(patch)) { if (v === undefined) delete out[k]; else out[k] = v; }
  return out;
};
/** Key order differs between what Postgres returns (jsonb sorts keys) and what we build, so compare canonically. */
const canon = (v: unknown): string => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x));
const same = (a: unknown, b: unknown) => canon(a) === canon(b);

/**
 * Minimal operations to make the stored sections equal `want`. Unknown keys of an existing section (e.g. a hero image id) are kept.
 * Unchanged sections produce no operation, so saving twice writes nothing the second time.
 */
export function planContentWrite(sections: DraftSection[], want: HomeContent): Op[] {
  const ops: Op[] = [];

  const hero = first(sections, 'hero');
  const heroPatch = { title: sl(want.hero.title), subtitle: sl(want.hero.subtitle), cta_label: sl(want.hero.ctaLabel), cta_href: want.hero.ctaHref.trim() || undefined };
  if (hero) { const next = put(obj(hero.content), heroPatch); if (!same(next, hero.content)) ops.push({ op: 'update', id: hero.id, content: next }); }
  else ops.push({ op: 'add', type: 'hero', content: put({}, heroPatch) });

  const about = first(sections, 'about');
  const aboutPatch = { title: sl(want.about.title), body: sl(want.about.body) };
  if (about) { const next = put(obj(about.content), aboutPatch); if (!same(next, about.content)) ops.push({ op: 'update', id: about.id, content: next }); }
  else if (aboutPatch.title || aboutPatch.body) ops.push({ op: 'add', type: 'about', content: put({}, aboutPatch) });

  const faq = first(sections, 'faq');
  const items = want.faq.items
    .filter((i) => !blank(i.question) || !blank(i.answer))
    .map((i) => put({}, { question: sl(i.question), answer: sl(i.answer) }));
  if (items.length === 0) { if (faq) ops.push({ op: 'delete', id: faq.id }); }
  else if (faq) { const next = put(obj(faq.content), { items }); if (!same(next, faq.content)) ops.push({ op: 'update', id: faq.id, content: next }); }
  else ops.push({ op: 'add', type: 'faq', content: { title: { en: 'Questions', ar: 'الأسئلة الشائعة' }, items } });

  const toggle = (type: 'routes' | 'trips', show: boolean, title: L) => {
    const sec = first(sections, type);
    if (sec) { if (sec.isEnabled !== show) ops.push({ op: 'update', id: sec.id, isEnabled: show }); }
    else if (show) ops.push({ op: 'add', type, content: { title: sl(title) } });
  };
  toggle('routes', want.showRoutes, { en: 'Our routes', ar: 'خطوطنا' });
  toggle('trips', want.showTrips, { en: 'Upcoming trips', ar: 'الرحلات القادمة' });
  return ops;
}

// ---- section-shaped (snake_case, what the editor field table and the database use) <-> HomeContent -------------------------------
export type SectionShape = { hero: Record<string, unknown>; about: Record<string, unknown>; faq: Record<string, unknown>; showRoutes: boolean; showTrips: boolean };

export function toSectionShape(c: HomeContent): SectionShape {
  const l = (v: L) => ({ ...(v.en ? { en: v.en } : {}), ...(v.ar ? { ar: v.ar } : {}) });
  return {
    hero: { title: l(c.hero.title), subtitle: l(c.hero.subtitle), cta_label: l(c.hero.ctaLabel), cta_href: c.hero.ctaHref },
    about: { title: l(c.about.title), body: l(c.about.body) },
    faq: { items: c.faq.items.map((i) => ({ question: l(i.question), answer: l(i.answer) })) },
    showRoutes: c.showRoutes, showTrips: c.showTrips,
  };
}

/** Browser JSON -> HomeContent. Defensive: anything that is not the expected shape becomes empty text, never an exception. */
export function fromSectionShape(raw: unknown): HomeContent {
  const o = obj(raw);
  const mk = (type: SectionType, content: unknown): DraftSection => ({ id: '', pageId: '', type, sortOrder: 0, isEnabled: true, content: obj(content), updatedAt: '' });
  const c = readHomeContent([mk('hero', o.hero), mk('about', o.about), mk('faq', o.faq)]);
  return { ...c, showRoutes: o.showRoutes === true, showTrips: o.showTrips === true };
}
