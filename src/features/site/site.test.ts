import { describe, expect, it } from 'vitest';
import { mediaUrl, parseRichText, pick, safeHref } from './text';
import { parseSection } from './sections';
import { publicSiteSchema } from './schema';
import { distinctRoutes } from './trip-routes';

describe('safeHref', () => {
  it.each(['https://a.example/x', 'mailto:a@b.co', 'tel:+201000000000', '#faq', '/trips'])('allows %s', (u) => expect(safeHref(u)).toBe(u));
  it.each(['javascript:alert(1)', 'JaVaScRiPt:1', 'data:text/html,x', 'http://a.example', '//evil.example', '/\\evil', ' ', '', 'https://a b', 'vbscript:x', null, undefined])('refuses %s', (u) => expect(safeHref(u as string)).toBeNull());
});

describe('pick', () => {
  it('prefers the locale, falls back to the other, then empty', () => {
    expect(pick({ ar: 'أ', en: 'a' }, 'ar')).toBe('أ');
    expect(pick({ en: 'a' }, 'ar')).toBe('a');
    expect(pick({ ar: '  ', en: 'a' }, 'ar')).toBe('a');
    expect(pick(null, 'en')).toBe('');
  });
});

describe('mediaUrl', () => {
  const base = 'https://x.supabase.co/';
  it('builds a public-bucket URL', () => expect(mediaUrl(base, { path: 'c1/logo.png' })).toBe('https://x.supabase.co/storage/v1/object/public/company-public/c1/logo.png'));
  it('refuses traversal, odd characters, svg, missing', () => {
    expect(mediaUrl(base, { path: 'c1/../c2/a.png' })).toBeNull();
    expect(mediaUrl(base, { path: '../a.png' })).toBeNull();
    expect(mediaUrl(base, { path: 'c1/a b.png' })).toBeNull();
    expect(mediaUrl(base, { path: 'c1/a.svg', mime: 'image/svg+xml' })).toBeNull();
    expect(mediaUrl(base, undefined)).toBeNull();
  });
});

describe('parseRichText', () => {
  it('handles paragraphs, bold, lists and safe links', () => {
    const b = parseRichText('Hello **world**\n\n- a\n- b\n\n[ok](https://a.example) [bad](javascript:alert(1))');
    expect(b[0]).toEqual({ t: 'p', inline: [{ t: 'text', v: 'Hello ' }, { t: 'bold', v: 'world' }] });
    expect(b[1]).toEqual({ t: 'ul', items: [[{ t: 'text', v: 'a' }], [{ t: 'text', v: 'b' }]] });
    expect(b[2]).toMatchObject({ t: 'p' });
    const inl = (b[2] as { inline: unknown[] }).inline;
    expect(inl).toContainEqual({ t: 'link', v: 'ok', href: 'https://a.example' });
    expect(inl).toContainEqual({ t: 'text', v: 'bad' });                 // unsafe target degrades to plain label
    expect(JSON.stringify(b)).not.toContain('javascript');
  });
  it('never produces HTML-bearing nodes: tags stay literal text', () => {
    expect(parseRichText('<img src=x onerror=1>')).toEqual([{ t: 'p', inline: [{ t: 'text', v: '<img src=x onerror=1>' }] }]);
  });
});

describe('parseSection', () => {
  it('skips unknown types and invalid content, keeps valid ones', () => {
    expect(parseSection({ type: 'nope', content: {} })).toBeNull();
    expect(parseSection({ type: '__proto__', content: {} })).toBeNull();
    expect(parseSection({ type: 'trips', content: { limit: 9999 } })).toBeNull();
    expect(parseSection({ type: 'about', content: { title: { ar: 'س' } } })).toMatchObject({ type: 'about' });
    expect(parseSection({ type: 'faq', content: null })).toMatchObject({ type: 'faq' });
  });
});

describe('publicSiteSchema', () => {
  const ok = { company: { name: 'N', slug: 'abc' }, version: 3, published_at: '2026-11-20T00:00:00Z',
    site: { schema_version: 1, settings: { primary_color: '#14243A', social_links: { facebook: 'https://f.example' } }, pages: [{ slug: 'home', is_home: true, sections: [{ type: 'hero', content: {} }] }], media: {} } };
  it('accepts the 0046 shape', () => expect(publicSiteSchema.safeParse(ok).success).toBe(true));
  it('rejects a missing company / pages', () => {
    expect(publicSiteSchema.safeParse({ ...ok, company: undefined }).success).toBe(false);
    expect(publicSiteSchema.safeParse({ ...ok, site: { ...ok.site, pages: 'x' } }).success).toBe(false);
  });
});

describe('distinctRoutes', () => {
  it('dedupes by origin+destination, keeps first-departure order', () => {
    const t = (o: string, d: string) => ({ origin_name: o, destination_name: d });
    expect(distinctRoutes([t('A', 'B'), t('C', 'D'), t('A', 'B')])).toEqual([{ origin: 'A', destination: 'B' }, { origin: 'C', destination: 'D' }]);
  });
});
