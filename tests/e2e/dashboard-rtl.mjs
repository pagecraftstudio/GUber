// Arabic / RTL company dashboard in a real browser: direction, mirrored layout, Arabic page chrome, LTR islands (phones, plates),
// persistence without a left-to-right flash (cookie), 320 px reflow in RTL, and an axe sweep in Arabic.
// Production build (next start), real local PostgreSQL + PostgREST, GoTrue-compatible STUB (NOT live Supabase Auth).
// Run: SKIP_BUILD=1 bash tests/e2e/run-e2e.sh dashboard-rtl.mjs 1
import * as L from './lib.mjs';
import { readFileSync, existsSync } from 'node:fs';
const { check, sleep, typeInto, sql } = L;
const PW = 'Passw0rd!x';
const A = L.T(101);
const base = L.BASE;
const AR = /[؀-ۿ]/;

await fetch(L.STUB + '/auth/v1/signup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'rtl-owner-a@e2e.test', password: PW, data: { full_name: 'RTL Owner', phone: '01090000001' } }) });
await L.confirmEmail('rtl-owner-a@e2e.test');
const uid = sql(`select id from auth.users where email = 'rtl-owner-a@e2e.test'`);
sql(`insert into company_users (company_id, user_id, role_id) select '${A}', '${uid}', r.id from roles r where r.key = 'owner'`);
sql(`insert into customers (company_id, full_name, phone) values ('${A}', 'RTL Customer', '+201090000555')`);
sql(`insert into buses (company_id, plate_number, capacity, status) values ('${A}', 'RTL-123', 30, 'active')`);
sql(`insert into drivers (company_id, full_name, phone) values ('${A}', 'RTL Driver', '+201090000556')`);

const browser = await L.launch();
async function login(viewport) {
  const ctx = await browser.createBrowserContext(); const p = await L.newPage(ctx);
  if (viewport) await p.setViewport(viewport);
  await p.goto(base + '/company/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await typeInto(p, 'input[name=email]', 'rtl-owner-a@e2e.test'); await typeInto(p, 'input[name=password]', PW);
  await L.clickText(p, 'Sign in', { sel: 'button[type=submit]' });
  await p.waitForFunction(() => location.pathname.startsWith('/dashboard'), { timeout: 20000 }).catch(() => {});
  return p;
}
const go = async (p, path) => { await p.goto(base + path, { waitUntil: 'domcontentloaded', timeout: 60000 }); await sleep(900); };
const axePath = [`${process.env.NODE_PATH || ''}/axe-core/axe.min.js`].find((f) => existsSync(f));
async function axeScan(p, name) {
  if (!axePath) { console.log(`SKIP  axe ${name}: axe-core not installed in E2E_TOOLS`); return; }
  await p.evaluate(readFileSync(axePath, 'utf8'));
  const res = await p.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } }).then((r) => r.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length }))));
  check(`a11y axe (Arabic, ${name}): no WCAG 2.2 A/AA violations`, res.length === 0, JSON.stringify(res));
}
const geometry = (p) => p.evaluate(() => {
  const r = (e) => e.getBoundingClientRect(); const aside = document.querySelector('aside'); const th = document.querySelector('main th');
  return { vw: innerWidth, asideLeft: Math.round(r(aside).left), asideRight: Math.round(r(aside).right), dir: document.querySelector('.dashboard-root').dir, htmlDir: document.documentElement.dir, thAlign: th ? getComputedStyle(th).textAlign : null, h1: document.querySelector('h1')?.textContent ?? '', over: document.documentElement.scrollWidth > innerWidth + 1 };
});

const p = await login();
await go(p, '/dashboard/buses');
let g = await geometry(p);
check('English: LTR, sidebar on the left, table headers start-aligned', g.dir === 'ltr' && g.asideLeft === 0 && g.thAlign === 'start', JSON.stringify(g));
await L.clickText(p, 'العربية', { sel: 'button' }); await sleep(600);
g = await geometry(p);
check('Arabic: html and dashboard are rtl, sidebar sits on the right edge, content is not under it', g.dir === 'rtl' && g.htmlDir === 'rtl' && g.asideRight === g.vw, JSON.stringify(g));
check('Arabic: page title and table headers are Arabic, headers start-aligned (right)', AR.test(g.h1) && g.thAlign === 'start', JSON.stringify(g));

// reload: the server must already render rtl (cookie), not flip after hydration
await p.goto(base + '/dashboard/drivers', { waitUntil: 'domcontentloaded' });
const early = await p.evaluate(() => document.querySelector('.dashboard-root')?.dir);
check('Arabic persists across reload and the first server-rendered paint is already rtl (no flash)', early === 'rtl', String(early));

const PAGES = ['/dashboard', '/dashboard/routes', '/dashboard/buses', '/dashboard/drivers', '/dashboard/trips', '/dashboard/trips/new', '/dashboard/bookings', '/dashboard/customers', '/dashboard/users', '/dashboard/settings', '/dashboard/website'];
for (const path of PAGES) {
  await go(p, path);
  const x = await p.evaluate(() => ({ h1: document.querySelector('h1')?.textContent ?? '', eyebrow: document.querySelector('main p')?.textContent ?? '', over: document.documentElement.scrollWidth > innerWidth + 1, dir: document.querySelector('.dashboard-root').dir }));
  check(`Arabic ${path}: rtl, Arabic heading, no horizontal page scroll`, x.dir === 'rtl' && AR.test(x.h1) && !x.over, JSON.stringify(x));
}
await go(p, '/dashboard/customers');
check('Arabic customers: phone numbers are isolated as left-to-right', await p.evaluate(() => [...document.querySelectorAll('main td span[dir=ltr]')].some((e) => e.textContent.includes('+2010900005'))));
await go(p, '/dashboard/buses');
check('Arabic buses: plate number is isolated as left-to-right', await p.evaluate(() => [...document.querySelectorAll('main td span[dir=ltr]')].some((e) => e.textContent === 'RTL-123')));
await go(p, '/dashboard/drivers');
check('Arabic drivers: phone is isolated as left-to-right', await p.evaluate(() => [...document.querySelectorAll('main td span[dir=ltr]')].some((e) => e.textContent.includes('+2010900005'))));
for (const [path, name] of [['/dashboard/routes/new', 'route form'], ['/dashboard/customers', 'customers'], ['/dashboard/users', 'users'], ['/dashboard/settings', 'settings'], ['/dashboard/buses', 'buses'], ['/dashboard/trips/new', 'trip form']]) { await go(p, path); await axeScan(p, name); }

// 320 px in RTL: drawer off-canvas on the right, opens, no page scroll
const mob = await login({ width: 320, height: 800 });
await go(mob, '/dashboard/buses');
await L.clickText(mob, 'العربية', { sel: 'button' }); await sleep(600);
const closed = await mob.evaluate(() => { const a = document.querySelector('aside'); const s = getComputedStyle(a); return { right: Math.round(a.getBoundingClientRect().right), vis: s.visibility, vw: innerWidth }; });
check('RTL 320px: sidebar drawer is off-canvas to the right and hidden', closed.right > closed.vw && closed.vis === 'hidden', JSON.stringify(closed));
await mob.click('button[aria-label="فتح التنقل"]'); await sleep(500);
const open = await mob.evaluate(() => ({ right: Math.round(document.querySelector('aside').getBoundingClientRect().right), vw: innerWidth }));
check('RTL 320px: opening the menu slides the drawer in from the right edge', open.right === open.vw, JSON.stringify(open));
for (const path of ['/dashboard/buses', '/dashboard/customers', '/dashboard/users', '/dashboard/settings', '/dashboard/routes/new']) {
  await go(mob, path);
  check(`RTL 320px ${path}: no page-level horizontal scroll`, !(await geometry(mob)).over);
}
// back to English
await go(p, '/dashboard/buses'); await L.clickText(p, 'English', { sel: 'button' }); await sleep(500);
g = await geometry(p);
check('Switching back to English restores LTR and the left sidebar', g.dir === 'ltr' && g.asideLeft === 0, JSON.stringify(g));
await browser.close();
process.exit(L.summary() ? 0 : 1);
