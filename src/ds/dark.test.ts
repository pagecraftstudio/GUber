import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrast } from './contrast';

/** Phase 7: the dark column of tokens.css is checked against WCAG 2.2 AA the same way the light column is. */
const css = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const block = (sel: string) => new RegExp(`${sel.replace(/[.:]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
const vars = (b: string) => Object.fromEntries([...b.matchAll(/(--ds-[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1]!, m[2]!]));
const light = vars(block(':root'));
const dark = { ...light, ...vars(block(':root.dark')) };
const v = (n: string) => dark[`--ds-${n}`]!;

const TEXT: Array<[string, string]> = [];
for (const fg of ['text-primary', 'text-secondary', 'text-muted', 'text-link']) for (const bg of ['surface-page', 'surface-card', 'surface-sunken']) TEXT.push([fg, bg]);
TEXT.push(['action-on-primary', 'action-primary'], ['action-on-primary', 'action-primary-hover'], ['action-on-destructive', 'action-destructive'], ['action-on-destructive', 'action-destructive-hover'], ['text-primary', 'selection']);
for (const s of ['success', 'warning', 'error', 'info', 'neutral']) TEXT.push([`status-${s}-fg`, `status-${s}-bg`], [`status-${s}-fg`, 'surface-card'], [`status-${s}-fg`, 'surface-page']);
const NON_TEXT: Array<[string, string]> = [['border-strong', 'surface-card'], ['border-strong', 'surface-page'], ['focus-ring', 'surface-card'], ['focus-ring', 'surface-page'], ['action-primary', 'surface-card'], ['action-primary', 'surface-page']];

describe('dark tokens', () => {
  it('the dark block overrides every colour the light block defines', () => {
    const missing = Object.keys(light).filter((k) => !/tenant/.test(k) && !(k in vars(block(':root.dark'))));
    expect(missing).toEqual(['--ds-accent']); // the accent is already the dark-surface value
  });
  for (const [fg, bg] of TEXT) it(`text ${fg} on ${bg} ≥ 4.5:1`, () => expect(contrast(v(fg), v(bg))).toBeGreaterThanOrEqual(4.5));
  for (const [fg, bg] of NON_TEXT) it(`non-text ${fg} on ${bg} ≥ 3:1`, () => expect(contrast(v(fg), v(bg))).toBeGreaterThanOrEqual(3));
});
