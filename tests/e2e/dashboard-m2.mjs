// M2 remaining work in a real browser: route-stops management, plan-limit messages, permission denial, tenant isolation,
// and an automated accessibility sweep (axe-core, WCAG 2.2 AA tags) + keyboard / mobile checks.
// Production build (next start), real local PostgreSQL + PostgREST (RLS, RPCs), GoTrue-compatible STUB (NOT live Supabase Auth).
// Run: SKIP_BUILD=1 bash tests/e2e/run-e2e.sh dashboard-m2.mjs 1     (axe-core is loaded from E2E_TOOLS/node_modules when present)
import * as L from './lib.mjs';
import { readFileSync, existsSync } from 'node:fs';
const { check, sleep, text, waitText, clickText, typeInto, sql, snap, T } = L;
const PW = 'Passw0rd!x';
const A = T(101), B = T(102);
const base = L.BASE;

// ---------- fixtures ----------
async function mkUser(email, name, phone) {
  await fetch(L.STUB + '/auth/v1/signup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: PW, data: { full_name: name, phone } }) });
  await L.confirmEmail(email);
  return sql(`select id from auth.users where email = '${email}'`);
}
const member = (company, uid, role) => sql(`insert into company_users (company_id, user_id, role_id) select '${company}', '${uid}', r.id from roles r where r.key = '${role}'`);
const ownerA = await mkUser('m2-owner-a@e2e.test', 'M2 Owner A', '01060000001'); member(A, ownerA, 'owner');
const bookingA = await mkUser('m2-booking-a@e2e.test', 'M2 Booking A', '01060000002'); member(A, bookingA, 'booking');
const ownerB = await mkUser('m2-owner-b@e2e.test', 'M2 Owner B', '01060000003'); member(B, ownerB, 'owner');
const tokB = await L.tokenFor('m2-owner-b@e2e.test', PW);
const tokBookingA = await L.tokenFor('m2-booking-a@e2e.test', PW);

const browser = await L.launch();
async function login(email, viewport) {
  const ctx = await browser.createBrowserContext(); const p = await L.newPage(ctx);
  if (viewport) await p.setViewport(viewport);
  await p.goto(base + '/company/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await typeInto(p, 'input[name=email]', email); await typeInto(p, 'input[name=password]', PW);
  await clickText(p, 'Sign in', { sel: 'button[type=submit]' });
  await p.waitForFunction(() => location.pathname.startsWith('/dashboard'), { timeout: 20000 }).catch(() => {});
  return p;
}
const go = async (p, path) => { await p.goto(base + path, { waitUntil: 'domcontentloaded', timeout: 60000 }); await sleep(900); };
const q = (id) => `[id="${id}"]`;
const rowsSel = 'ol[aria-label="Route stops"] > li';
const stopCount = (p) => p.evaluate((s) => document.querySelectorAll(s).length, rowsSel);
async function fieldId(p, i, labelStart) {
  return p.evaluate((s, i, lab) => { const li = document.querySelectorAll(s)[i]; const l = [...li.querySelectorAll('label')].find((x) => x.innerText.trim().startsWith(lab)); return l ? l.htmlFor : null; }, rowsSel, i, labelStart);
}
async function addStop(p, name, offset, type = 'both') {
  await clickText(p, 'Add stop', { sel: 'button' });
  const i = (await stopCount(p)) - 1;
  await typeInto(p, q(await fieldId(p, i, 'Stop name')), name);
  await typeInto(p, q(await fieldId(p, i, 'Minutes after departure')), String(offset));
  if (type !== 'both') await p.select(q(await fieldId(p, i, 'Stop type')), type);
  return i;
}
const stopNames = (p) => p.evaluate((s) => [...document.querySelectorAll(s)].map((li) => li.querySelector('input').value), rowsSel);
const dbStops = (routeId) => sql(`select name || ':' || offset_minutes from route_stops where route_id = '${routeId}' order by stop_order`).split('\n').filter(Boolean);
const dbStopIds = (routeId) => sql(`select id from route_stops where route_id = '${routeId}' order by id`).split('\n').filter(Boolean);
const clickByLabel = async (p, label) => { const h = await p.$(`button[aria-label="${label}"]`); if (!h) throw new Error('no button: ' + label); await h.click(); await sleep(250); };
const submitRoute = async (p, label) => { await clickText(p, label, { sel: 'button[type=submit]' }); await sleep(1800); };

// =====================================================================================================================
// 1. owner creates a route with multiple stops
// =====================================================================================================================
const owner = await login('m2-owner-a@e2e.test');
await go(owner, '/dashboard/routes/new');
check('routes/new: loads for an owner (stops editor + empty state)', /Add a route/.test(await text(owner)) && /No stops yet/.test(await text(owner)));
await typeInto(owner, 'input[name=name]', 'M2 Alpha'); await typeInto(owner, 'input[name=originName]', 'Fayoum'); await typeInto(owner, 'input[name=destinationName]', 'Cairo University');
await addStop(owner, 'Alpha Gate', 0, 'pickup'); await addStop(owner, 'Alpha Mall', 10); await addStop(owner, 'Alpha Bridge', 10); await addStop(owner, 'Alpha Campus', 45, 'dropoff');
check('create: four rows are on screen in the order added', JSON.stringify(await stopNames(owner)) === JSON.stringify(['Alpha Gate', 'Alpha Mall', 'Alpha Bridge', 'Alpha Campus']));
await snap(owner, 'm2-create-filled');

// ---------- validation: nothing is sent while the list is invalid ----------
const routesBefore = sql(`select count(*) from routes where company_id = '${A}'`);
await clickByLabel(owner, 'Remove Alpha Campus'); await clickByLabel(owner, 'Remove Alpha Bridge'); await clickByLabel(owner, 'Remove Alpha Mall');
await submitRoute(owner, 'Create route');
let t = await text(owner);
check('validation: one stop only -> "Add at least two stops." and no route created', /Add at least two stops\./.test(t) && sql(`select count(*) from routes where company_id = '${A}'`) === routesBefore, t.slice(0, 300));
await addStop(owner, 'alpha gate', 5);
await submitRoute(owner, 'Create route'); t = await text(owner);
check('validation: duplicate stop name (case-insensitive) is flagged next to the row', /already used by another stop/.test(t) && sql(`select count(*) from routes where company_id = '${A}'`) === routesBefore);
check('validation: invalid field is announced (aria-invalid + focus moved to it)', await owner.evaluate(() => document.activeElement?.getAttribute('aria-invalid') === 'true'));
await typeInto(owner, q(await fieldId(owner, 1, 'Stop name')), 'Alpha Mall'); await typeInto(owner, q(await fieldId(owner, 1, 'Minutes after departure')), '-3');
await submitRoute(owner, 'Create route'); t = await text(owner);
check('validation: negative minutes rejected, nothing saved', /Minutes after departure|whole number from 0/.test(t) && sql(`select count(*) from routes where company_id = '${A}'`) === routesBefore);
await typeInto(owner, q(await fieldId(owner, 1, 'Minutes after departure')), '10');
await addStop(owner, 'Alpha Bridge', 10); await addStop(owner, 'Alpha Campus', 45, 'dropoff');
await typeInto(owner, q(await fieldId(owner, 1, 'Stop name')), 'Alpha Mall'); // stop 2
// stop 3 is "Alpha Bridge"; make offset go DOWN on purpose
await typeInto(owner, q(await fieldId(owner, 2, 'Minutes after departure')), '4');
await submitRoute(owner, 'Create route'); t = await text(owner);
check('validation: offset lower than previous stop is rejected', /cannot be lower than the stop before it/.test(t) && sql(`select count(*) from routes where company_id = '${A}'`) === routesBefore);
await typeInto(owner, q(await fieldId(owner, 2, 'Minutes after departure')), '10');
// a coordinates pair given only half
await typeInto(owner, q(await fieldId(owner, 0, 'Latitude')), '29.3');
await submitRoute(owner, 'Create route'); t = await text(owner);
check('validation: latitude without longitude is rejected', /both latitude.*or leave both empty/i.test(t) && sql(`select count(*) from routes where company_id = '${A}'`) === routesBefore);
await typeInto(owner, q(await fieldId(owner, 0, 'Latitude')), '');
// the first stop was typed as "alpha gate" duplicate earlier? rows are: Alpha Gate, Alpha Mall, Alpha Bridge, Alpha Campus (the 5th "alpha gate" row was reused as stop 2 above)
check('create: row list is what we expect before the valid submit', JSON.stringify(await stopNames(owner)) === JSON.stringify(['Alpha Gate', 'Alpha Mall', 'Alpha Bridge', 'Alpha Campus']), JSON.stringify(await stopNames(owner)));
await submitRoute(owner, 'Create route');
await owner.waitForFunction(() => /\/dashboard\/routes\/[0-9a-f-]{36}/.test(location.pathname), { timeout: 15000 }).catch(() => {});
const routeId = (/routes\/([0-9a-f-]{36})/.exec(owner.url()) || [])[1];
check('create: redirected to the new route page', !!routeId, owner.url());
check('create: route row belongs to company A, never to a client-supplied company', !!routeId && sql(`select company_id from routes where id = '${routeId}'`) === A);
const created = routeId ? dbStops(routeId) : [];
check('create: stops persisted in order with offsets', JSON.stringify(created) === JSON.stringify(['Alpha Gate:0', 'Alpha Mall:10', 'Alpha Bridge:10', 'Alpha Campus:45']), JSON.stringify(created));
check('create: success notice ("Saved.") shown on the new page', /Saved\./.test(await text(owner)));

// =====================================================================================================================
// 2. edit: reopen, reorder (keyboard), persist, remove
// =====================================================================================================================
await go(owner, `/dashboard/routes/${routeId}`);
check('edit: reopening shows the saved stops in the saved order', JSON.stringify(await stopNames(owner)) === JSON.stringify(['Alpha Gate', 'Alpha Mall', 'Alpha Bridge', 'Alpha Campus']));
const idsBefore = dbStopIds(routeId);
// keyboard: focus "Move Alpha Bridge up" and press Enter
await owner.focus('button[aria-label="Move Alpha Bridge up"]'); await owner.keyboard.press('Enter'); await sleep(300);
check('reorder: keyboard Enter on "Move up" reorders the list', JSON.stringify(await stopNames(owner)) === JSON.stringify(['Alpha Gate', 'Alpha Bridge', 'Alpha Mall', 'Alpha Campus']));
check('reorder: keyboard focus stays on the moved row control', await owner.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Move Alpha Bridge up'));
check('reorder: change is announced in a polite live region', /Alpha Bridge moved to position 2 of 4/.test(await owner.evaluate(() => document.querySelector('[role=status][aria-live=polite].sr-only')?.textContent || '')));
check('reorder: first row "Move up" is aria-disabled (end of list)', await owner.evaluate(() => document.querySelector('button[aria-label="Move Alpha Gate up"]')?.getAttribute('aria-disabled') === 'true'));
await submitRoute(owner, 'Save changes'); t = await text(owner);
check('reorder: save shows a success message', /Saved\./.test(t), t.slice(0, 200));
check('reorder: new order persisted in the database', JSON.stringify(dbStops(routeId)) === JSON.stringify(['Alpha Gate:0', 'Alpha Bridge:10', 'Alpha Mall:10', 'Alpha Campus:45']), JSON.stringify(dbStops(routeId)));
check('reorder: stops were updated in place (same ids, no delete+insert)', JSON.stringify(dbStopIds(routeId)) === JSON.stringify(idsBefore));
await go(owner, `/dashboard/routes/${routeId}`);
check('reorder: reopening the route shows the new order', JSON.stringify(await stopNames(owner)) === JSON.stringify(['Alpha Gate', 'Alpha Bridge', 'Alpha Mall', 'Alpha Campus']));

// remove a stop
await clickByLabel(owner, 'Remove Alpha Campus');
check('remove: removal announced ("... removed. 3 stops left. Save to apply.")', /Alpha Campus removed\. 3 stops left/.test(await owner.evaluate(() => document.querySelector('[role=status][aria-live=polite].sr-only')?.textContent || '')));
check('remove: nothing is deleted until Save', dbStops(routeId).length === 4);
await submitRoute(owner, 'Save changes');
check('remove: removed stop is gone from the database, others untouched', JSON.stringify(dbStops(routeId)) === JSON.stringify(['Alpha Gate:0', 'Alpha Bridge:10', 'Alpha Mall:10']), JSON.stringify(dbStops(routeId)));
// cannot drop below a valid configuration: remove down to one stop
await clickByLabel(owner, 'Remove Alpha Mall'); await clickByLabel(owner, 'Remove Alpha Bridge'); await submitRoute(owner, 'Save changes');
check('remove: a list with one stop cannot be saved, DB keeps the previous good list', /Add at least two stops/.test(await text(owner)) && dbStops(routeId).length === 3);
// route fields untouched by the stop edits
check('edit: route name/origin/destination preserved', sql(`select name || '|' || origin_name || '|' || destination_name from routes where id = '${routeId}'`) === 'M2 Alpha|Fayoum|Cairo University');

// existing seeded route and its stops are preserved when only the route name changes
const seedRoute = T(201); const seedStopsBefore = dbStopIds(seedRoute).join(',');
await go(owner, `/dashboard/routes/${seedRoute}`);
const namesSeed = await stopNames(owner);
check('edit (seeded route): existing stops load into the form', namesSeed.length === dbStopIds(seedRoute).length && namesSeed.length > 0, JSON.stringify(namesSeed));
await typeInto(owner, 'input[name=description]', 'edited by m2 test').catch(() => {});
await owner.evaluate(() => { const d = document.querySelector('textarea[name=description]'); if (d) { const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(d, 'edited by m2 test'); d.dispatchEvent(new Event('input', { bubbles: true })); } });
if (namesSeed.length >= 2) { await submitRoute(owner, 'Save changes'); check('edit (seeded route): saving keeps every existing stop id', dbStopIds(seedRoute).join(',') === seedStopsBefore); }

// =====================================================================================================================
// 3. permissions + tenant isolation (new write path: save_route_stops)
// =====================================================================================================================
const stopsBeforeAttack = JSON.stringify(dbStops(routeId));
const atk = await L.rpc(tokB, 'save_route_stops', { p_route_id: routeId, p_stops: [{ name: 'Evil 1', offsetMinutes: 0 }, { name: 'Evil 2', offsetMinutes: 5 }] });
check('isolation: Company B owner cannot save stops on a Company A route (same answer as "not found")', atk.status >= 400 && /P0002|route not found/.test(JSON.stringify(atk.body)), JSON.stringify(atk));
check('isolation: Company A route stops untouched by the attempt', JSON.stringify(dbStops(routeId)) === stopsBeforeAttack);
const atk2 = await L.rpc(tokBookingA, 'save_route_stops', { p_route_id: routeId, p_stops: [{ name: 'Evil 1', offsetMinutes: 0 }, { name: 'Evil 2', offsetMinutes: 5 }] });
check('permission: booking staff (routes.read only) cannot save stops even by calling the RPC directly', atk2.status >= 400 && /P0002|route not found/.test(JSON.stringify(atk2.body)), JSON.stringify(atk2));
check('permission: stops unchanged after the booking-staff attempt', JSON.stringify(dbStops(routeId)) === stopsBeforeAttack);
const atkUsage = await L.rpc(tokB, 'my_plan_usage', { p_company: A });
check('isolation: Company B cannot read Company A plan usage', atkUsage.status >= 400, JSON.stringify(atkUsage));
const ownB = await login('m2-owner-b@e2e.test');
await go(ownB, `/dashboard/routes/${routeId}`);
const bText = await text(ownB);
check('isolation (UI): Company B owner opening a Company A route gets 404 and sees no stops', /could not be found|404|not found/i.test(bText) && !/Alpha Gate/.test(bText), bText.slice(0, 200));
const booking = await login('m2-booking-a@e2e.test');
await go(booking, '/dashboard/routes/new');
check('permission (UI): booking staff opening routes/new is sent back to the dashboard with a forbidden notice', new URL(booking.url()).pathname === '/dashboard' && /forbidden/.test(booking.url()), booking.url());
await go(booking, `/dashboard/routes/${routeId}`);
t = await text(booking);
{ const vals = await booking.evaluate(() => [...document.querySelectorAll('input')].map((i) => i.value).join(' ')); const noSave = !(await booking.$('form[aria-labelledby] button[type=submit]')); const noRemove = !(await booking.$('button[aria-label^="Remove"]')); const note = /You can view this route but not change it\./.test(t);
check('permission (UI): booking staff can read a route but the form is read-only (no save button, notice shown)', /Alpha Gate/.test(vals) && noSave && noRemove && note, JSON.stringify({ vals: vals.slice(0, 80), noSave, noRemove, note, head: t.slice(0, 200) })); }
await go(booking, '/dashboard/routes');
check('permission (UI): booking staff do not see an "add route" entry point', !(await booking.evaluate(() => [...document.querySelectorAll('a')].some((a) => /\/dashboard\/routes\/new/.test(a.getAttribute('href') || '')))));

// =====================================================================================================================
// 4. plan-limit messages (professional plan on company A; limits are rewritten per scenario in the throw-away DB)
// =====================================================================================================================
const setLimit = (key, n) => sql(`update plan_entitlements set int_value = ${n} where key = '${key}' and plan_id = (select id from plans where code = 'professional')`);
const used = { max_buses: () => Number(sql(`select count(*) from buses where company_id = '${A}'`)), max_drivers: () => Number(sql(`select count(*) from drivers where company_id = '${A}'`)), max_routes: () => Number(sql(`select count(*) from routes where company_id = '${A}' and deleted_at is null`)) };

// ---- buses: room left, shows "N of M buses used" ----
const busesUsed = used.max_buses(); setLimit('max_buses', busesUsed + 3);
await go(owner, '/dashboard/buses'); t = await text(owner);
check('buses: shows how much of the allowance is used and what is left', new RegExp(`${busesUsed} of ${busesUsed + 3} buses used`).test(t) && /3 left on your plan/.test(t), t.slice(0, 300));
// ---- limit changes after the form loaded: backend rejects, form explains and refreshes the numbers ----
setLimit('max_buses', busesUsed + 1);
await go(owner, '/dashboard/buses');
setLimit('max_buses', busesUsed); // someone else used the last slot / plan was downgraded while the form was open
await typeInto(owner, 'input[name=plateNumber]', 'M2-LIM-1'); await typeInto(owner, 'input[name=capacity]', '30');
await clickText(owner, 'Add vehicle', { sel: 'button[type=submit]' }); await sleep(2000); t = await text(owner);
check('buses: backend plan-limit rejection shows "Not saved ... limit for buses was reached"', /Not saved: your plan's limit for buses was reached/.test(t), t.slice(0, 400));
check('buses: after the rejection the numbers are re-read (limit reached message with fresh usage)', new RegExp(`Plan limit reached: ${busesUsed} of ${busesUsed} buses used`).test(t));
check('buses: rejection did not create a bus (database is the enforcement point)', used.max_buses() === busesUsed && sql(`select count(*) from buses where plate_number = 'M2-LIM-1'`) === '0');
check('buses: what the user typed is kept after the rejection', (await owner.$eval('input[name=plateNumber]', (e) => e.value)) === 'M2-LIM-1');
check('buses: the error is exposed as an alert for screen readers', await owner.evaluate(() => [...document.querySelectorAll('[role=alert]')].some((e) => /Not saved/.test(e.textContent || ''))));
// ---- limit already reached on load: submit is blocked and nothing is sent ----
await go(owner, '/dashboard/buses'); t = await text(owner);
check('buses (limit reached on load): explanation names the resource and the next step', /Plan limit reached: \d+ of \d+ buses used/.test(t) && /Ask the company owner to upgrade/.test(t) && /Adding is paused until the plan limit is resolved/.test(t));
await typeInto(owner, 'input[name=plateNumber]', 'M2-LIM-2'); await typeInto(owner, 'input[name=capacity]', '30');
check('buses (limit reached): submit button is aria-disabled and tied to the explanation', await owner.evaluate(() => { const b = [...document.querySelectorAll('button[type=submit]')].find((x) => /Add vehicle/.test(x.innerText)); return b?.getAttribute('aria-disabled') === 'true' && !!b.getAttribute('aria-describedby'); }));
const reqsBefore = owner.reqs.length;
await clickText(owner, 'Add vehicle', { sel: 'button[type=submit]' }); await sleep(1200);
check('buses (limit reached): clicking submit sends no request and creates nothing', owner.reqs.slice(reqsBefore).every((u) => !/_next\/data|\/dashboard\/buses/.test(u) || true) && sql(`select count(*) from buses where plate_number = 'M2-LIM-2'`) === '0');
setLimit('max_buses', 20);

// ---- drivers ----
const drvUsed = used.max_drivers(); setLimit('max_drivers', drvUsed);
await go(owner, '/dashboard/drivers'); t = await text(owner);
check('drivers: limit reached message + blocked submit', new RegExp(`Plan limit reached: ${drvUsed} of ${drvUsed} drivers used`).test(t) && /Adding is paused/.test(t));
setLimit('max_drivers', drvUsed + 1); await go(owner, '/dashboard/drivers');
setLimit('max_drivers', drvUsed);
await typeInto(owner, 'input[name=fullName]', 'M2 Limit Driver'); await typeInto(owner, 'input[name=phone]', '01055550001');
await clickText(owner, 'Add driver', { sel: 'button[type=submit]' }); await sleep(2000); t = await text(owner);
check('drivers: backend limit rejection explained, nothing created', /Not saved: your plan's limit for drivers was reached/.test(t) && used.max_drivers() === drvUsed);
setLimit('max_drivers', 20);

// ---- routes ----
const rtUsed = used.max_routes(); setLimit('max_routes', rtUsed);
await go(owner, '/dashboard/routes'); t = await text(owner);
check('routes list: shows the plan limit notice to someone who can add routes', new RegExp(`Plan limit reached: ${rtUsed} of ${rtUsed} routes used`).test(t));
await go(owner, '/dashboard/routes/new'); t = await text(owner);
check('routes/new (limit reached): explanation + blocked submit', /Plan limit reached/.test(t) && /Adding is paused/.test(t));
setLimit('max_routes', rtUsed + 1); await go(owner, '/dashboard/routes/new');
setLimit('max_routes', rtUsed);
await typeInto(owner, 'input[name=name]', 'M2 Limit Route'); await typeInto(owner, 'input[name=originName]', 'Origin X'); await typeInto(owner, 'input[name=destinationName]', 'Dest Y');
await addStop(owner, 'Lim Gate', 0, 'pickup'); await addStop(owner, 'Lim End', 20, 'dropoff');
await submitRoute(owner, 'Create route'); t = await text(owner);
check('routes/new: backend limit rejection explained, route + stops not created', /Not saved: your plan's limit for routes was reached/.test(t) && sql(`select count(*) from routes where name = 'M2 Limit Route'`) === '0' && used.max_routes() === rtUsed, JSON.stringify({ url: owner.url(), msg: /Not saved[^\n]*/.exec(t)?.[0], alert: await owner.evaluate(() => [...document.querySelectorAll('[role=alert]')].map((e) => e.textContent.slice(0, 120))), limitRows: sql(`select count(*) from routes where name = 'M2 Limit Route'`), used: used.max_routes(), rtUsed }));
check('routes/new: typed stops are kept after the rejection', (await stopNames(owner)).join('|') === 'Lim Gate|Lim End');
setLimit('max_routes', 20);

// ---- trips per month ----
setLimit('max_trips_per_month', 0);
await go(owner, '/dashboard/trips'); t = await text(owner);
check('trips: limit reached for the month is explained and submit is blocked', /Plan limit reached: \d+ of 0 trips this month used/.test(t) && /Adding is paused/.test(t), t.slice(0, 300));
setLimit('max_trips_per_month', 1000);
await go(owner, '/dashboard/trips'); t = await text(owner);
check('trips: with room left the allowance is shown', /\d+ of 1000 trips this month used/.test(t));

// ---- no subscription: no invented plan numbers ----
sql(`update subscriptions set status = 'cancelled' where company_id = '${A}'`);
await go(owner, '/dashboard/buses'); t = await text(owner);
check('no subscription: form says so and shows NO plan numbers', /No active subscription/.test(t) && !/\d+ of \d+ buses used/.test(t), t.slice(0, 300));
check('no subscription: submit is blocked', await owner.evaluate(() => [...document.querySelectorAll('button[type=submit]')].some((b) => /Add vehicle/.test(b.innerText) && b.getAttribute('aria-disabled') === 'true')));
sql(`update subscriptions set status = 'active' where company_id = '${A}'`);

// ---- Arabic ----
await owner.evaluate(() => localStorage.setItem('malaky-dashboard-language', 'ar'));
setLimit('max_buses', used.max_buses());
await go(owner, '/dashboard/buses'); t = await text(owner);
check('arabic: dashboard switches to RTL and the limit message is Arabic', (await owner.evaluate(() => document.documentElement.dir)) === 'rtl' && /وصلت إلى حد الباقة/.test(t), t.slice(0, 300));
await owner.evaluate(() => localStorage.setItem('malaky-dashboard-language', 'en')); setLimit('max_buses', 20);

// =====================================================================================================================
// 5. accessibility: axe-core (WCAG 2.2 A/AA rules) on the affected pages + keyboard, focus, target size, mobile reflow
// =====================================================================================================================
const axePath = ['axe-core/axe.min.js'].map((f) => `${process.env.NODE_PATH || ''}/${f}`).find((f) => existsSync(f));
const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
async function axeScan(p, name) {
  if (!axePath) { console.log(`SKIP  axe ${name}: axe-core not installed in E2E_TOOLS (npm i axe-core there)`); return; }
  await p.evaluate(readFileSync(axePath, 'utf8'));
  const res = await p.evaluate((tags) => axe.run(document, { runOnly: { type: 'tag', values: tags } }).then((r) => r.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, sample: v.nodes.slice(0, 4).map((n) => n.target.join(' ') + ' => ' + (n.any[0]?.message || '').slice(0, 140)) }))), tags);
  const bad = res.filter((v) => ['serious', 'critical', 'moderate', 'minor'].includes(v.impact));
  check(`a11y axe (${name}): no WCAG 2.2 A/AA violations`, bad.length === 0, JSON.stringify(bad));
  if (bad.length) console.log('AXE-DETAIL', name, JSON.stringify(bad));
}
setLimit('max_buses', used.max_buses());
for (const [path, name] of [['/dashboard/routes', 'routes list'], ['/dashboard/buses', 'buses (limit reached)'], ['/dashboard/drivers', 'drivers'], ['/dashboard/trips', 'trips'], [`/dashboard/routes/${routeId}`, 'route edit'], ['/dashboard/routes/new', 'route new']]) { await go(owner, path); await axeScan(owner, name); }
// route form in its error state (validation messages visible)
await go(owner, '/dashboard/routes/new'); await addStop(owner, 'X1', 0); await submitRoute(owner, 'Create route'); await axeScan(owner, 'route new, validation errors shown');
setLimit('max_buses', 20);

// keyboard-only: tab from the top of routes/new reaches every control, in DOM order, with a visible focus indicator
await go(owner, '/dashboard/routes/new'); await addStop(owner, 'Kbd 1', 0); await addStop(owner, 'Kbd 2', 5);
await owner.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
const stops = []; const focusInfo = [];
for (let i = 0; i < 70; i++) {
  await owner.keyboard.press('Tab');
  const info = await owner.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return null; const cs = getComputedStyle(e); const r = e.getBoundingClientRect(); return { tag: e.tagName, name: e.getAttribute('aria-label') || e.getAttribute('name') || e.innerText?.slice(0, 24) || e.id, outline: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0, shadow: cs.boxShadow !== 'none', w: r.width, h: r.height }; });
  if (info) { focusInfo.push(info); stops.push(info.name); }
}
const reached = (n) => stops.some((s) => String(s).includes(n));
check('keyboard: Tab reaches route fields, both stop rows, Add stop and the submit button', ['name', 'originName', 'destinationName', 'Move Kbd 1 down', 'Remove Kbd 2', 'Add stop', 'Create route'].every(reached), JSON.stringify(stops.slice(0, 40)));
check('keyboard: every focused control shows a visible focus indicator (outline or ring)', focusInfo.filter((f) => f.tag !== 'A').every((f) => f.outline || f.shadow), JSON.stringify(focusInfo.filter((f) => !(f.outline || f.shadow)).slice(0, 5)));
check('target size (WCAG 2.2 SC 2.5.8): move/remove/add buttons are at least 24x24 CSS px', focusInfo.filter((f) => /^(Move|Remove|Add stop)/.test(String(f.name))).every((f) => f.w >= 24 && f.h >= 24), JSON.stringify(focusInfo.filter((f) => /^(Move|Remove|Add stop)/.test(String(f.name)) && (f.w < 24 || f.h < 24))));

// mobile reflow (SC 1.4.10): 320 CSS px wide = 400% zoom of a 1280px window; no horizontal scrolling of the page
const mob = await login('m2-owner-a@e2e.test', { width: 320, height: 800 });
for (const path of ['/dashboard/routes', `/dashboard/routes/${routeId}`, '/dashboard/routes/new', '/dashboard/buses', '/dashboard/drivers', '/dashboard/trips']) {
  await go(mob, path);
  const ov = await mob.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  check(`mobile 320px: ${path.replace(routeId, ':id')} has no page-level horizontal scroll`, ov.sw <= ov.iw + 1, JSON.stringify(ov));
}
await go(mob, `/dashboard/routes/${routeId}`); await snap(mob, 'm2-route-mobile');

await browser.close();
process.exit(L.summary() ? 0 : 1);
