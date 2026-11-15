// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Splash } from './Splash';
import { SPLASH_KEY, SPLASH_SCRIPT } from './splashScript';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); document.documentElement.className = ''; });

const run = (path: string, store: Record<string, string> = {}, blocked = false) => {
  const set = vi.fn((k: string, v: string) => { store[k] = v; });
  vi.stubGlobal('location', { pathname: path });
  vi.stubGlobal('sessionStorage', blocked ? { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } } : { getItem: (k: string) => store[k] ?? null, setItem: set });
  document.documentElement.className = '';
  new Function(SPLASH_SCRIPT)();
  return { off: document.documentElement.classList.contains('ds-splash-off'), store };
};

describe('splash script', () => {
  it('plays on the first visit of a session, then never again', () => {
    const store: Record<string, string> = {};
    expect(run('/', store).off).toBe(false);
    expect(store[SPLASH_KEY]).toBe('1');
    expect(run('/', store).off).toBe(true);
  });
  it('never plays on the staff and driver surfaces, and does not use up the session flag there', () => {
    for (const p of ['/dashboard', '/dashboard/routes', '/admin', '/admin/plans', '/driver']) {
      const store: Record<string, string> = {};
      expect(run(p, store).off).toBe(true);
      expect(store[SPLASH_KEY]).toBeUndefined();
    }
  });
  it('a path that only starts with those words still plays (/driverless)', () => expect(run('/driverless').off).toBe(false));
  it('blocked storage means it cannot remember, so it stays off', () => expect(run('/', {}, true).off).toBe(true));
});

describe('Splash', () => {
  it('is decoration: hidden from assistive tech, ignores the pointer, starts hidden (CSS shows it only without reduced motion)', () => {
    const { container } = render(<Splash />);
    const el = container.firstElementChild!;
    expect(el.getAttribute('aria-hidden')).toBe('true');
    expect(el.className).toMatch(/\bhidden\b/);
    expect(el.className).toContain('pointer-events-none');
    expect(container.querySelector('path.ds-splash-mark')?.getAttribute('d')?.length).toBeGreaterThan(500);
  });
  it('uses theme tokens only, so it matches light and dark', () => {
    const { container } = render(<Splash />);
    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(/);
    expect(container.innerHTML).toContain('bg-surface-page');
  });
});

describe('splash motion', () => {
  const css = readFileSync('src/styles/motion.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  it('draws with stroke-dashoffset, fills, then fades out; all from tokens', () => {
    expect(css).toMatch(/@keyframes ds-splash-draw\s*\{[^}]*stroke-dashoffset[^}]*\}[^}]*stroke-dashoffset/);
    expect(css).toMatch(/@keyframes ds-splash-out\s*\{\s*to\s*\{[^}]*opacity:\s*0[^}]*visibility:\s*hidden/);
    expect(css).toMatch(/\.ds-splash\.hidden\s*\{\s*display:\s*flex;/);
  });
  it('is off when the script says so', () => expect(css).toMatch(/html\.ds-splash-off \.ds-splash\.hidden\s*\{\s*display:\s*none/));
});
