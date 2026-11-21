import { describe, expect, it } from 'vitest';
import { compactStyle, readStyle, sectionStyleWrite, sectionWrap } from './section-style';

describe('section style', () => {
  it('no style, or an unreadable one, means the old look (no wrapper)', () => {
    for (const raw of [undefined, null, 'x', {}, { background: 'plain', align: 'start', spacing: 'normal' }, { background: 'javascript:1' }]) expect(sectionWrap('about', raw), JSON.stringify(raw)).toBeNull();
  });
  it('unknown values fall back per field and never reach a class name', () => {
    expect(readStyle({ background: 'red;}', align: 'left', spacing: 'huge' })).toEqual({ background: 'plain', align: 'start', spacing: 'normal' });
    const w = sectionWrap('about', { background: 'tint', align: 'evil' })!;
    expect(w.className).toBe('bg-surface-sunken');
  });
  it('maps the choices', () => {
    expect(sectionWrap('faq', { background: 'brand', align: 'center', spacing: 'roomy' })!.className).toMatch(/site-accent.*text-center/);
    expect(sectionWrap('faq', { spacing: 'compact' })!.vars['--sec-py']).toBe('1.5rem');
    expect(sectionWrap('faq', { background: 'tint' })!.vars).toEqual({});
  });
  it('the hero ignores a background but keeps spacing and alignment', () => {
    expect(sectionWrap('hero', { background: 'tint' })).toBeNull();
    expect(sectionWrap('hero', { background: 'tint', align: 'center' })!.className).toBe('text-center');
  });
  it('compactStyle stores only what differs from the default', () => {
    expect(compactStyle({ background: 'plain', align: 'start', spacing: 'normal' })).toEqual({});
    expect(compactStyle({ background: 'tint', spacing: 'normal' })).toEqual({ background: 'tint' });
  });
  it('the write schema is strict', () => {
    expect(sectionStyleWrite.safeParse({ background: 'tint' }).success).toBe(true);
    for (const bad of [{ background: 'blue' }, { align: 'left' }, { color: 'red' }, { spacing: 'x' }]) expect(sectionStyleWrite.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
  });
});
