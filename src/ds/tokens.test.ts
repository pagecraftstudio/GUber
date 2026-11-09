import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PRIMITIVES, STATUS } from './tokens';

const css = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8').toLowerCase();
const bridge = readFileSync(new URL('../styles/bridge.css', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../ui/ui.css', import.meta.url), 'utf8');

describe('tokens.css stays in sync with tokens.ts', () => {
  for (const [k, v] of Object.entries(PRIMITIVES)) it(`primitive ${k}`, () => expect(css).toContain(v.toLowerCase()));
  for (const [k, v] of Object.entries(STATUS)) it(`status ${k}`, () => { expect(css).toContain(v.fg.toLowerCase()); expect(css).toContain(v.bg.toLowerCase()); });
});

describe('no collision with legacy marketplace variables', () => {
  const legacy = [...ui.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map((m) => m[1]);
  it('tokens.css declares none of the names ui.css already defines', () => {
    const declared = [...css.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map((m) => m[1]);
    const clash = declared.filter((d) => legacy.includes(d));
    expect(clash).toEqual([]);
  });
});

describe('bridge is scoped', () => {
  it('only the :root default block and @theme sit outside [data-ds="masar"]; overrides live inside it', () => {
    const stripped = bridge.replace(/\/\*[\s\S]*?\*\//g, '');
    const scoped = /\[data-ds="masar"\]\s*\{([^}]*)\}/.exec(stripped)?.[1] ?? '';
    expect(scoped).toContain('--bridge-slate-600: #555555');
    expect(scoped).toContain('--bridge-blue-600: #0b3d2e');
    const outside = stripped.replace(/\[data-ds="masar"\]\s*\{[^}]*\}/, '');
    // outside the scope every colour is either a var() reference or Tailwind's own original oklch value
    const hexOutside = outside.match(/#[0-9a-f]{3,8}\b/gi) ?? [];
    expect(hexOutside).toEqual([]);
  });
  it('is not touching any variable name that ui.css defines', () => {
    expect(bridge).not.toMatch(/--(surface|text|border)-/);
  });
});
