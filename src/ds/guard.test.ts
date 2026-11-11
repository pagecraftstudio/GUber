import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Plan 5.3 Step C, applied to src/ds from day one: the new system uses tokens, logical properties and the format module only. */
const ROOT = new URL('.', import.meta.url).pathname;
const SKIP = new Set(['tokens.ts', 'contrast.ts', 'scope.ts']);
const SKIP_DIR = new Set(['fonts', 'brand']);
function walk(d: string): string[] {
  return readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? (SKIP_DIR.has(n) ? [] : walk(p)) : /\.(tsx?|css)$/.test(n) && !/\.test\./.test(n) && !SKIP.has(n) ? [p] : []; });
}
const files = walk(ROOT).map((p) => ({ rel: relative(ROOT, p), src: readFileSync(p, 'utf8') }));
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const TENANT_OK = new Set(['gallery/Gallery.tsx']); // sample tenant colours for the gallery only

describe('src/ds guard', () => {
  it('finds files', () => expect(files.length).toBeGreaterThan(20));
  for (const { rel, src } of files) {
    const c = code(src);
    it(`${rel}: no raw hex colours`, () => { if (!TENANT_OK.has(rel)) expect(c.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]); });
    it(`${rel}: no slate-/blue- classes, no large radii, no weights above 600`, () => {
      expect(c).not.toMatch(/\b(?:bg|text|border|ring|from|to|divide|outline)-(?:slate|blue)-\d/);
      expect(c).not.toMatch(/\brounded-(?:2xl|3xl)\b/);
      expect(c).not.toMatch(/\bfont-(?:bold|extrabold|black)\b/);
    });
    it(`${rel}: no tracked uppercase labels`, () => { expect(c).not.toMatch(/\buppercase\b/); expect(c).not.toMatch(/tracking-\[/); });
    it(`${rel}: logical properties only`, () => {
      expect(c).not.toMatch(/(?<![\w-])(?:ml|mr|pl|pr|left|right)-(?:\d|\[|auto|px)/);
      expect(c).not.toMatch(/\btext-(?:left|right)\b/);
      expect(c).not.toMatch(/\brounded-(?:l|r|tl|tr|bl|br)(?:-|\b)/);
      expect(c).not.toMatch(/\bborder-(?:l|r)(?:-|\b)/);
    });
    it(`${rel}: formatting only through src/ds/format`, () => {
      if (rel.startsWith('format/') && !rel.endsWith('Identifier.tsx')) return;
      expect(c).not.toMatch(/toLocale(?:String|DateString|TimeString)|\bIntl\./);
    });
  }
});

/** A helper exported from a 'use client' file cannot be called by a server component (it crashed the admin pages in a real browser). Style helpers live in plain modules. */
describe('server-safe helpers', () => {
  const SRC = new URL('..', import.meta.url).pathname;
  const walkAll = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? (n === 'node_modules' ? [] : walkAll(p)) : /\.tsx?$/.test(n) && !/\.test\./.test(n) ? [p] : []; });
  it('nobody imports buttonClass from the client Button module', () => {
    const bad = walkAll(SRC).filter((p) => /import\s*\{[^}]*\bbuttonClass\b[^}]*\}\s*from\s*'[^']*\/Button'/.test(readFileSync(p, 'utf8'))).map((p) => relative(SRC, p));
    expect(bad).toEqual([]);
  });
});

/** An absolutely positioned child (sr-only live regions, icons) escapes an overflow container that is not positioned and widens the whole page on phones. */
describe('scroll containers', () => {
  it('every overflow-x-auto container in the new system is positioned', () => {
    const SRC = new URL('..', import.meta.url).pathname;
    const all = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? (n === 'node_modules' || n === 'ui' ? [] : all(p)) : /\.tsx$/.test(n) && !/\.test\./.test(n) ? [p] : []; });
    // new-system files only: the old screens are replaced, not repaired
    const bad = all(SRC).filter((p) => /\/(ds|masar)\//.test(p)).flatMap((p) => readFileSync(p, 'utf8').split('\n').map((l, i) => ({ l, i, p }))).filter(({ l }) => /className="[^"]*\boverflow-x-auto\b/.test(l) && !/\b(relative|absolute|fixed|sticky)\b/.test(l.match(/className="[^"]*"/)?.[0] ?? '')).map(({ p, i }) => `${relative(SRC, p)}:${i + 1}`);
    expect(bad).toEqual([]);
  });
});
