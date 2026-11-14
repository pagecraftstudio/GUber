// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { THEME_SCRIPT } from './themeScript';

const run = (path: string, store: Record<string, string>, systemDark = false) => {
  document.documentElement.className = ''; document.documentElement.removeAttribute('data-theme');
  vi.stubGlobal('location', { pathname: path });
  vi.stubGlobal('localStorage', { getItem: (k: string) => store[k] ?? null });
  vi.stubGlobal('matchMedia', () => ({ matches: systemDark }));
  new Function(THEME_SCRIPT)();
  return document.documentElement.classList.contains('dark');
};
afterEach(() => vi.unstubAllGlobals());

describe('theme script (no flash)', () => {
  it('dark preference applies before paint', () => expect(run('/', { malaky_theme_mode: 'dark' })).toBe(true));
  it('light or nothing stays light', () => { expect(run('/', { malaky_theme_mode: 'light' })).toBe(false); expect(run('/', {})).toBe(false); });
  it('system follows the OS', () => { expect(run('/', { malaky_theme_mode: 'system' }, true)).toBe(true); expect(run('/', { malaky_theme_mode: 'system' }, false)).toBe(false); });
  it('the dashboard reads its own key', () => {
    expect(run('/dashboard/routes', { 'malaky-dashboard-theme': 'dark' })).toBe(true);
    expect(run('/dashboard', { malaky_theme_mode: 'dark' })).toBe(false);
    expect(run('/admin', { 'malaky-dashboard-theme': 'dark' })).toBe(false);
  });
  it('blocked storage leaves the page light and does not throw', () => {
    vi.stubGlobal('location', { pathname: '/' });
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); } });
    document.documentElement.className = '';
    expect(() => new Function(THEME_SCRIPT)()).not.toThrow();
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
