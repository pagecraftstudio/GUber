import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Logo, WORDMARK } from './Logo';

const html = (props = {}) => renderToStaticMarkup(createElement(Logo, props));

describe('interim Logo', () => {
  it('renders the Latin wordmark with an accessible name', () => {
    const out = html();
    expect(out).toContain('aria-label="MASAR"');
    expect(out).toContain('>MASAR<');
  });
  it('never renders Arabic (needs approved vector paths, plan 2.1)', () => {
    expect(html({ size: 'lg', tone: 'onDark' })).not.toMatch(/[\u0600-\u06FF]/);
  });
  it('stays LTR inside RTL pages', () => {
    expect(html()).toContain('direction:ltr');
  });
  it('uses only approved brand colours', () => {
    expect(html({ tone: 'onLight' })).toContain('#0B3D2E');
    expect(html({ tone: 'onDark' })).toContain('#FFFFFF');
  });
  it('uses medium weight and no glow or shadow', () => {
    const out = html();
    expect(out).toContain(`font-weight:${WORDMARK.weight}`);
    expect(out).not.toMatch(/shadow|gradient|filter/);
  });
});
