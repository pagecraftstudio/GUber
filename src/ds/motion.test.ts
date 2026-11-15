// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyThemeFade, THEME_FADE_MS } from './theme/fade';

const css = readFileSync('src/styles/motion.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

describe('motion.css', () => {
  it('everything sits inside prefers-reduced-motion: no-preference (no motion at all otherwise)', () => {
    const start = css.indexOf('@media (prefers-reduced-motion: no-preference)');
    expect(start).toBeGreaterThanOrEqual(0);
    expect(css.slice(0, start).trim()).toBe('');
    // the media block is the whole file: balanced braces and nothing after it
    let depth = 0, end = -1;
    for (let i = start; i < css.length; i++) { if (css[i] === '{') depth++; if (css[i] === '}' && --depth === 0) { end = i; break; } }
    expect(css.slice(end + 1).trim()).toBe('');
  });
  it('durations and easing come from tokens, never literals', () => {
    expect(css).not.toMatch(/\b\d+(?:\.\d+)?m?s\b(?![^{]*\{)/); // no bare times outside delays
    const uses = [...css.matchAll(/animation:\s*([^;]+);/g)].map((m) => m[1]!);
    for (const u of uses) { expect(u).toMatch(/var\(--(?:duration-ds-(?:enter|large|feedback)|write)\)/); expect(u).toMatch(/var\(--ease-ds(?:-write)?\)/); }
  });
  it('no section entrances or card hover motion', () => {
    expect(css).not.toMatch(/:hover/);
    expect(css).not.toMatch(/\bsection\b|\barticle\b/);
  });
});

describe('route-draw confirmation', () => {
  const rule = (sel: string) => new RegExp(`${sel.replace(/[.[\]()*+?^$|]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
  it('the line moves with transform only (no width, left or layout properties)', () => {
    const kf = /@keyframes ds-route-draw\s*\{([\s\S]*?\})\s*\}/.exec(css)?.[1] ?? '';
    expect(kf).toMatch(/transform:\s*scaleX\(0\)/);
    expect(kf).not.toMatch(/\b(?:width|height|left|right|top|bottom|margin|padding|stroke)/);
  });
  it('draws in the reading direction: starts at the left in LTR and at the right in RTL', () => {
    expect(rule('.ds-route-line')).toMatch(/transform-origin:\s*left/);
    expect(rule("[dir='rtl'] .ds-route-line")).toMatch(/transform-origin:\s*right/);
  });
  it('the check waits for the line, and the copy waits for the check (one ordered sequence)', () => {
    expect(rule('.ds-route-confirm .ds-check circle')).toMatch(/animation-delay:\s*calc\(/);
    expect(rule('.ds-route-confirm + .ds-confirm-copy > *')).toMatch(/animation-delay:\s*calc\(/);
  });
  it('line duration is built from the large token, not a literal', () => {
    expect(rule('.ds-route-line')).toMatch(/calc\(var\(--duration-ds-large\) \* 2\)/);
  });
});

describe('live numbers', () => {
  const rule = (sel: string) => new RegExp(`${sel.replace(/[.[\]()*+?^$|]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
  it('digit roll moves with transform only, in both directions', () => {
    for (const k of ['ds-roll-up', 'ds-roll-down']) {
      const kf = new RegExp(`@keyframes ${k}\\s*\\{([\\s\\S]*?\\})\\s*\\}`).exec(css)?.[1] ?? '';
      expect(kf).toMatch(/translateY/);
      expect(kf).not.toMatch(/\b(?:width|height|top|bottom|margin|padding)/);
    }
  });
  it('roll and bar use the large token and the shared easing', () => {
    expect(rule('.ds-roll-col')).toMatch(/var\(--duration-ds-large\) var\(--ease-ds\)/);
    expect(rule('.ds-fill')).toMatch(/transition:\s*transform var\(--duration-ds-large\) var\(--ease-ds\)/);
  });
  it('bar grows in from empty on mount, without a fill mode that would freeze later updates', () => {
    expect(css).toMatch(/@keyframes ds-fill-in\s*\{\s*from\s*\{\s*transform:\s*scaleX\(0\)/);
    expect(rule('.ds-fill')).toMatch(/animation:\s*ds-fill-in var\(--duration-ds-large\) var\(--ease-ds\);/);
  });
  it('the outgoing digit is drawn from data-d, never from text', () => {
    expect(rule('.ds-roll-old::before')).toMatch(/content:\s*attr\(data-d\)/);
  });
});

describe('logo reveal', () => {
  const rule = (sel: string) => new RegExp(`${sel.replace(/[.[\]()*+?^$|]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
  it('letters move with transform only and use the large token and shared easing', () => {
    const kf = /@keyframes ds-logo-rise\s*\{([\s\S]*?\})\s*\}/.exec(css)?.[1] ?? '';
    expect(kf).toMatch(/translateY/);
    expect(kf).not.toMatch(/\b(?:width|height|left|right|top|bottom|margin|padding|letter-spacing)/);
    expect(rule('.ds-logo-letter')).toMatch(/var\(--duration-ds-large\) var\(--ease-ds\)/);
  });
  it('letters start in reading order with a per-letter delay', () => {
    expect(rule('.ds-logo-letter')).toMatch(/animation-delay:\s*calc\(var\(--i\) \* 50ms\)/);
  });
});

describe('applyThemeFade', () => {
  afterEach(() => vi.useRealTimers());
  it('adds the class for one cross-fade, then removes it', () => {
    vi.useFakeTimers();
    applyThemeFade();
    expect(document.documentElement.classList.contains('ds-theme-fade')).toBe(true);
    vi.advanceTimersByTime(THEME_FADE_MS + 1);
    expect(document.documentElement.classList.contains('ds-theme-fade')).toBe(false);
  });
});
