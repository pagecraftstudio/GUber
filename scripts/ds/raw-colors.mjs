// Counts raw colour utilities and hex literals per file. Phase 6d: the whole app is at zero, and it must stay there.
// Usage: node scripts/ds/raw-colors.mjs   (lists offenders, exits 1 if any)
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SRC = join(ROOT, 'src');
/** Token definitions, the dev-only bar, tenant default brand colours (data) and the QR image's white backing are allowed to name colours. */
const ALLOWED = [/^src\/styles\/tokens\.css$/, /^src\/ds\/(tokens|contrast)\.ts$/, /^src\/ds\/brand\//, /^src\/ui\/components\/dev\//, /^src\/app\/dev\//, /\.test\.tsx?$/, /^src\/ds\/gallery\//, /^src\/features\/website\/types\.ts$/, /^src\/ui\/context\/TenantContext\.tsx$/, /^src\/ui\/lib\/(mockData|real\/adapters)\.ts$/, /^src\/ui\/components\/public\/TicketQrImage\.tsx$/];
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const s = scan();
  for (const [f, n] of Object.entries(s)) console.log(`${n} ${f}`);
  if (Object.keys(s).length) process.exit(1);
  console.log('no raw colours');
}
