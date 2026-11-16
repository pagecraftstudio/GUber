// Route + obligatory return route in a real browser (/dashboard/routes/new): "same as the go, reversed", an own return, and the refusals.
// Production build (next start), real local PostgreSQL + PostgREST, GoTrue-compatible STUB (NOT live Supabase Auth).
// Run: SKIP_BUILD=1 bash tests/e2e/run-e2e.sh dashboard-return-routes.mjs
import * as L from './lib.mjs';
const { check, sleep, text, typeInto, sql } = L;
const PW = 'Passw0rd!x';
const A = L.T(101);
const base = L.BASE;
const email = 'rr-owner-a@e2e.test';
await fetch(L.STUB + '/auth/v1/signup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: PW, data: { full_name: 'RR Owner', phone: '01070000099' } }) });
await L.confirmEmail(email);
const uid = sql(`select id from auth.users where email = '${email}'`);
sql(`insert into company_users (company_id, user_id, role_id) select '${A}', '${uid}', r.id from roles r where r.key = 'owner'`);
sql(`update plan_entitlements set int_value = null where key = 'max_routes' and plan_id = (select id from plans where code = 'professional')`);

const browser = await L.launch();
const ctx = await browser.createBrowserContext(); const p = await L.newPage(ctx);
await p.setViewport({ width: 1100, height: 1400 });
await p.goto(base + '/company/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
await typeInto(p, 'input[name=email]', email); await typeInto(p, 'input[name=password]', PW);
await L.clickText(p, 'Sign in', { sel: 'button[type=submit]' });
await p.waitForFunction(() => location.pathname.startsWith('/dashboard'), { timeout: 20000 }).catch(() => {});

const go = async (path) => { await p.goto(base + path, { waitUntil: 'domcontentloaded', timeout: 60000 }); await sleep(900); };
const fillStop = (scopeSel, n, m) => p.evaluate((scopeSel, n, m) => {
  const scope = document.querySelectorAll(scopeSel);
  const ol = scope[scope.length - 1];
  const li = ol.querySelectorAll(':scope > li'); const row = li[li.length - 1];
  const set = (el, v) => { const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value'); d.set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
  const ins = row.querySelectorAll('input:not([type=checkbox])'); set(ins[0], n); set(ins[1], m);
}, scopeSel, n, m);
const addStop = async () => { const btns = await p.$$('button'); const adds = []; for (const b of btns) if ((await b.evaluate((e) => e.textContent.trim())) === 'Add stop') adds.push(b); await adds[adds.length - 1].click(); await sleep(300); };
const fields = async (name) => { await typeInto(p, 'input[name=name]', name); await typeInto(p, 'input[name=originName]', 'Cairo'); await typeInto(p, 'input[name=destinationName]', 'Galala'); };
const goStops = async () => { for (const [n, m] of [['RR Cairo Gate', '0'], ['RR Suez Rest', '60'], ['RR Galala Gate', '150']]) { await addStop(); await fillStop('ol[aria-label="Route stops"]', n, m); } };
const routesBefore = () => Number(sql(`select count(*) from routes where company_id = '${A}'`));

// 1. the default: the return is the same as the go, reversed
await go('/dashboard/routes/new');
let t = await text(p);
check('form shows a Return route section with the reversed option on by default', /Return route/.test(t) && /same as the go, reversed/.test(t) && await p.evaluate(() => document.querySelector('input[name=returnSameAsReverse]').value === 'true'));
await p.screenshot({ path: '/tmp/e2e/shots/rr-form.png', fullPage: true });
await fields('RR Reversed'); await goStops();
await L.clickText(p, 'Create route', { sel: 'button[type=submit]' });
await p.waitForFunction(() => /\/dashboard\/routes\/[0-9a-f-]{36}/.test(location.pathname), { timeout: 15000 }).catch(() => {});
const go1 = sql(`select id from routes where name = 'RR Reversed'`), ret1 = sql(`select id from routes where name = 'RR Reversed (return)'`);
check('reversed: both routes exist and point at each other', !!go1 && !!ret1 && sql(`select return_route_id from routes where id = '${go1}'`) === ret1 && sql(`select return_route_id from routes where id = '${ret1}'`) === go1);
check('reversed: the return has the stops in reverse order with offsets from the other end', sql(`select string_agg(name || ':' || offset_minutes, ',' order by stop_order) from route_stops where route_id = '${ret1}'`) === 'RR Galala Gate:0,RR Suez Rest:90,RR Cairo Gate:150');
check('reversed: lands on the go route page, which links to its return route', /\/dashboard\/routes\//.test(p.url()) && await p.evaluate(() => !![...document.querySelectorAll('a')].find((a) => /RR Reversed \(return\)/.test(a.textContent))));
await p.screenshot({ path: '/tmp/e2e/shots/rr-created.png', fullPage: true });

// 2. an own return route with its own stops
await go('/dashboard/routes/new');
await fields('RR Own'); await goStops();
await p.evaluate(() => [...document.querySelectorAll('fieldset')].find((f) => /^Return route$/.test(f.querySelector('legend').textContent.trim())).querySelector('input[type=checkbox]').click()); await sleep(400);
check('unchecking shows the return stops editor', /Return stops/.test(await text(p)) && await p.evaluate(() => document.querySelector('input[name=returnSameAsReverse]').value === 'false'));
await typeInto(p, 'input[name=returnName]', 'RR Own Back');
for (const [n, m] of [['RR Back Start', '0'], ['RR Back End', '140']]) { await addStop(); await fillStop('ol[aria-label="Route stops"]', n, m); }
await L.clickText(p, 'Create route', { sel: 'button[type=submit]' });
await p.waitForFunction(() => /\/dashboard\/routes\/[0-9a-f-]{36}/.test(location.pathname), { timeout: 15000 }).catch(() => {});
const ret2 = sql(`select id from routes where name = 'RR Own Back'`);
check('own return: created with the given name, mutually linked', !!ret2 && sql(`select count(*) from routes a join routes b on a.return_route_id = b.id and b.return_route_id = a.id where a.name = 'RR Own'`) === '1');
check('own return: its stops are the ones entered, not a reversed copy', sql(`select string_agg(name, ',' order by stop_order) from route_stops where route_id = '${ret2}'`) === 'RR Back Start,RR Back End');

// 3. a return with no stops is refused in the form and creates nothing
await go('/dashboard/routes/new');
const n0 = routesBefore();
await fields('RR NoStops'); await goStops();
await p.evaluate(() => [...document.querySelectorAll('fieldset')].find((f) => /^Return route$/.test(f.querySelector('legend').textContent.trim())).querySelector('input[type=checkbox]').click()); await sleep(400);
await L.clickText(p, 'Create route', { sel: 'button[type=submit]' }); await sleep(1500);
check('no return stops: stays on the form and creates nothing', /\/dashboard\/routes\/new/.test(p.url()) && routesBefore() === n0 && sql(`select count(*) from routes where name like 'RR NoStops%'`) === '0');

// 4. a direct insert from the browser session is no longer possible, and the old lone-route call is closed
const tok = await L.tokenFor(email, PW);
let r = await fetch(L.STUB + '/rest/v1/routes', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${tok}`, apikey: tok, prefer: 'return=minimal' }, body: JSON.stringify({ company_id: A, name: 'RR Direct', origin_name: 'a', destination_name: 'b' }) });
check('a direct POST to /routes is refused', r.status >= 400 && sql(`select count(*) from routes where name = 'RR Direct'`) === '0', String(r.status));
r = await L.rpc(tok, 'create_route_with_stops', { p_name: 'RR Lone', p_code: null, p_origin: 'a', p_destination: 'b', p_description: null, p_stops: [{ name: 'x', offsetMinutes: 0 }, { name: 'y', offsetMinutes: 5 }] });
check('the old create_route_with_stops call is refused', r.status >= 400 && sql(`select count(*) from routes where name = 'RR Lone'`) === '0', String(r.status));

await browser.close();
process.exit(L.summary() ? 0 : 1);
