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
    for (const u of uses) { expect(u).toMatch(/var\(--duration-ds-(?:enter|large|feedback)\)/); expect(u).toMatch(/var\(--ease-ds\)/); }
  });
  it('no section entrances or card hover motion', () => {
    expect(css).not.toMatch(/:hover/);
    expect(css).not.toMatch(/\bsection\b|\barticle\b/);
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
