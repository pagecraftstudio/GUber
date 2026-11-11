const fs = require('fs'), path = require('path');
const ROOT = process.argv[2], OUT = process.argv[3];
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) { if (!/node_modules|\.next/.test(p)) walk(p); } else if (/\.(ts|tsx)$/.test(f) && !/\.test\./.test(f)) files.push(p); } })(path.join(ROOT, 'src'));
const rows = new Map(); // key en||ar -> {en, ar, where:Set}
const area = (f) => { const r = path.relative(ROOT, f); return r; };
const add = (en, ar, where, tag) => {
  if (typeof en !== 'string' || !en.trim()) return;
  const k = en + '\u0001' + (ar ?? '');
  const r = rows.get(k) || { en, ar: ar ?? '', where: new Set(), tag };
  r.where.add(where); rows.set(k, r);
};
const isPair = (v) => v && typeof v === 'object' && typeof v.en === 'string' && (typeof v.ar === 'string' || v.ar === undefined) && Object.keys(v).every((k) => ['en', 'ar'].includes(k));
function flatten(en, ar, p, out) {
  if (typeof en === 'string') { out.push([p, en, typeof ar === 'string' ? ar : '']); return; }
  if (en && typeof en === 'object' && !Array.isArray(en)) for (const k of Object.keys(en)) flatten(en[k], ar && ar[k], p ? p + '.' + k : k, out);
}
function pairWalk(v, p, out, depth = 0) {
  if (depth > 5 || !v || typeof v !== 'object') return;
  if (isPair(v)) { out.push([p, v.en, v.ar ?? '']); return; }
  if (v.en && v.ar && typeof v.en === 'object') { flatten(v.en, v.ar, p, out); return; }
  for (const k of Object.keys(v)) pairWalk(v[k], p ? p + '.' + k : k, out, depth + 1);
}
let blocks = 0;
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  // 1. object literals declared as const NAME = { ... } (en/ar shaped)
  const re = /^(?:export )?const (\w+)(?:\s*:[^=\n]+)? ?= ?(\{[\s\S]*?\n\})(?: as const(?: satisfies [^\n]+)?)?;?$/gm;
  let m;
  while ((m = re.exec(src))) {
    let obj; try { obj = new Function('return (' + m[2] + ')')(); } catch { continue; }
    const out = []; pairWalk(obj, m[1], out);
    if (!out.length) continue; blocks++;
    for (const [key, en, ar] of out) add(en, ar, `${area(f)} › ${key}`);
  }
  // 2. status map style: label: { en: '', ar: '' }
  // 3. inline <Bi en="" ar="" />
  const bi = /<Bi\s+en=(?:"([^"]*)"|\{'([^']*)'\}|\{`([^`]*)`\})\s+ar=(?:"([^"]*)"|\{'([^']*)'\}|\{`([^`]*)`\})/g;
  while ((m = bi.exec(src))) add(m[1] ?? m[2] ?? m[3], m[4] ?? m[5] ?? m[6], `${area(f)} › <Bi>`);
}
// PAGE_AR: EN key -> AR value (dictionary)
{
  const f = path.join(ROOT, 'src/features/dashboard/messages.ts'); const src = fs.readFileSync(f, 'utf8');
  const i = src.indexOf('export const PAGE_AR'); const body = src.slice(i);
  const re = /^\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|(\w+)):\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"),?/gm; let m;
  while ((m = re.exec(body))) { const k = (m[1] ?? m[2] ?? m[3] ?? '').replace(/\\'/g, "'"), v = (m[4] ?? m[5] ?? '').replace(/\\'/g, "'"); add(k, v, 'features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)'); }
}
const cat = (r) => {
  const w = [...r.where][0];
  if (/status-map/.test(w)) return '1 Status labels';
  if (/DashboardShell|nav|shell|ROLES|labels/.test(w)) return '2 Navigation and shell';
  if (/ui\/lib\/i18n/.test(w)) return '5 Passenger marketplace';
  if (/^src\/ds\//.test(w)) return '3 Design-system chrome';
  if (/PAGE_AR|features\/dashboard/.test(w)) return '4 Company dashboard';
  return '6 Other';
};
const emptyRe = /^(no .+ (yet|match|found|here|available)|nothing|there (are|is) no|none |not found|try |you have no|no (trips|bookings|routes|buses|drivers|customers|results|companies|plans))/i;
const arr = [...rows.values()].map((r) => ({ ...r, cat: cat(r), flag: [!r.ar ? 'NO ARABIC' : '', r.ar && r.ar === r.en ? 'SAME AS EN' : '', emptyRe.test(r.en) ? 'empty/guidance' : ''].filter(Boolean).join('; ') }));
arr.sort((a, b) => a.cat.localeCompare(b.cat) || [...a.where][0].localeCompare([...b.where][0]));
const esc = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const csv = (s) => '"' + String(s).replace(/"/g, '""') + '"';
let md = `# MASAR copy and terminology sheet (Phase 0)\n\nGenerated from the code on 12 Nov 2026 by scanning every \`.ts/.tsx\` file under \`src\` (tests excluded) for English and Arabic pairs.\n\n**Status: NOT APPROVED.** Plan D10: this sheet needs the named Arabic reviewer's signature. The Arabic below is what the code contains today. Most of it is unreviewed.\n\n## How to review\n- Fill **Decision**: \`OK\` or \`Change\`. When \`Change\`, write the corrected Arabic in **Reviewed Arabic**.\n- A row flagged \`NO ARABIC\` shows English in Arabic mode today. A row flagged \`SAME AS EN\` may be a name or an identifier that should stay Latin; say which.\n- A value with \`{...}\` or a number is a template; the reviewer should check that the sentence still reads right with a count (for example one, two, eleven).\n- The Arabic UI uses Arabic-Indic digits for display (D6). Identifiers (references, plates, phone, email) stay Latin.\n\n## Totals\n`;
const byCat = {}; for (const r of arr) (byCat[r.cat] ||= []).push(r);
md += `| Group | Rows | No Arabic | Same as English |\n|---|---|---|---|\n`;
for (const [c, rs] of Object.entries(byCat)) md += `| ${c.slice(2)} | ${rs.length} | ${rs.filter((r) => !r.ar).length} | ${rs.filter((r) => r.ar && r.ar === r.en).length} |\n`;
md += `| **Total** | ${arr.length} | ${arr.filter((r) => !r.ar).length} | ${arr.filter((r) => r.ar && r.ar === r.en).length} |\n`;
md += `\n**Not covered:** the platform admin and driver screens are English only (no Arabic exists); strings built from several parts at run time; text inside images; email and error text that comes from the database or Supabase. Those need a separate pass.\n\n**Sign-off:** Reviewer name: ____________   Date: ____________   Signature: ____________\n`;
for (const [c, rs] of Object.entries(byCat)) {
  md += `\n## ${c.slice(2)}\n\n| # | English | Arabic (current) | Flag | Where | Decision | Reviewed Arabic |\n|---|---|---|---|---|---|---|\n`;
  rs.forEach((r, i) => { md += `| ${i + 1} | ${esc(r.en)} | ${esc(r.ar)} | ${r.flag} | \`${[...r.where][0].replace('src/', '')}\`${r.where.size > 1 ? ` +${r.where.size - 1}` : ''} | | |\n`; });
}
fs.writeFileSync(OUT + '.md', md);
fs.writeFileSync(OUT + '.csv', '﻿' + ['Group,English,Arabic current,Flag,Where,Decision,Reviewed Arabic', ...arr.map((r) => [r.cat.slice(2), r.en, r.ar, r.flag, [...r.where].join(' ; '), '', ''].map(csv).join(','))].join('\n'));
console.log(JSON.stringify({ blocks, rows: arr.length, byCat: Object.fromEntries(Object.entries(byCat).map(([k, v]) => [k, v.length])), noAr: arr.filter((r) => !r.ar).length }));
