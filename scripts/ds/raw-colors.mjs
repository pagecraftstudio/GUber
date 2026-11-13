// Counts raw colour utilities and hex literals per file. Phase 6d ratchet: the count may only go down, and the new system must stay at zero.
// Usage: node scripts/ds/raw-colors.mjs --write   (rewrites the baseline after you have removed some)
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SRC = join(ROOT, 'src');
export const BASELINE = join(ROOT, 'scripts/ds/raw-colors.baseline.json');
/** Token definitions, the generated bridge and the dev-only bar are allowed to name colours. */
const ALLOWED = [/^src\/styles\/(tokens|bridge)\.css$/, /^src\/ds\/(tokens|contrast)\.ts$/, /^src\/ds\/brand\//, /^src\/ui\/components\/dev\//, /^src\/app\/dev\//, /\.test\.tsx?$/, /^src\/ds\/gallery\//];
const PALETTE = '(?:slate|gray|zinc|neutral|stone|blue|indigo|sky|cyan|teal|emerald|green|amber|yellow|orange|red|rose|pink|purple|violet)';
const RAW = new RegExp(`\\b(?:bg|text|border|ring|divide|from|to|via|fill|stroke|outline|placeholder|shadow|accent|decoration)-(?:${PALETTE}-\\d{2,3}|white|black)(?:/\\d+)?\\b|#[0-9a-fA-F]{6}\\b|#[0-9a-fA-F]{3}\\b(?![\\w-])`, 'g');
const strip = (s) => s.replace(/\bbackdrop:bg-black\/\d+/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function walk(d) { return readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? (n === 'node_modules' ? [] : walk(p)) : /\.(tsx?|css)$/.test(n) ? [p] : []; }); }

export function scan() {
  const out = {};
  for (const p of walk(SRC)) {
    const rel = relative(ROOT, p);
    if (ALLOWED.some((r) => r.test(rel))) continue;
    const n = (strip(readFileSync(p, 'utf8')).match(RAW) ?? []).length;
    if (n > 0) out[rel] = n;
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv.includes('--write')) {
  const s = scan();
  writeFileSync(BASELINE, JSON.stringify(s, null, 2) + '\n');
  console.log(`wrote ${Object.keys(s).length} files, ${Object.values(s).reduce((a, b) => a + b, 0)} raw colours`);
}
