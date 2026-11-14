import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PRIMITIVES, STATUS } from './tokens';

const css = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8').toLowerCase();

describe('tokens.css stays in sync with tokens.ts', () => {
  for (const [k, v] of Object.entries(PRIMITIVES)) it(`primitive ${k}`, () => expect(css).toContain(v.toLowerCase()));
  for (const [k, v] of Object.entries(STATUS)) it(`status ${k}`, () => { expect(css).toContain(v.fg.toLowerCase()); expect(css).toContain(v.bg.toLowerCase()); });
});
