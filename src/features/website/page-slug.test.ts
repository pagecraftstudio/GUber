import { describe, expect, it } from 'vitest';
import { pageSlugFrom } from './page-slug';

describe('pageSlugFrom', () => {
  const re = /^[a-z0-9]+(-[a-z0-9]+)*$/;
  it('makes a clean address from the English title', () => { expect(pageSlugFrom('Contact us!', [])).toBe('contact-us'); expect(pageSlugFrom('  Café  Menu ', [])).toBe('cafe-menu'); });
  it('falls back to "page" for Arabic-only or empty titles', () => { expect(pageSlugFrom('اتصل بنا', [])).toBe('page'); expect(pageSlugFrom('', [])).toBe('page'); });
  it('avoids taken addresses', () => { expect(pageSlugFrom('About', ['about'])).toBe('about-2'); expect(pageSlugFrom('About', ['about', 'about-2'])).toBe('about-3'); });
  it('always fits the database format and length', () => {
    for (const t of ['a'.repeat(200), '---', '../../x', 'A&B  C', '1 2 3']) { const s = pageSlugFrom(t, []); expect(s, t).toMatch(re); expect(s.length).toBeLessThanOrEqual(60); }
  });
});
