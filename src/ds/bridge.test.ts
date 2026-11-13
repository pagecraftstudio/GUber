import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../styles/bridge.css', import.meta.url), 'utf8');
const scoped = css.slice(css.indexOf('[data-ds="masar"] {'));

describe('scoped bridge', () => {
  it('re-declares the --color-* aliases inside the MASAR scope (a var() alias resolves where it is declared, so the --bridge-* override alone never reaches descendants)', () => {
    for (const f of ['slate', 'blue']) for (const s of [50, 200, 300, 600, 800, 900, 950]) {
      expect(scoped).toContain(`--bridge-${f}-${s}:`);
      expect(scoped).toContain(`--color-${f}-${s}: var(--bridge-${f}-${s});`);
    }
  });
  it('MASAR dark surfaces are neutral, not navy', () => {
    expect(scoped).toMatch(/--bridge-slate-900: #171717;/);
    expect(scoped).toMatch(/--bridge-slate-800: #2b2b2b;/);
  });
});
