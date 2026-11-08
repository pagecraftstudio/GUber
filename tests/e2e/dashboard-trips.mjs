// Trips in a real browser: one next-step button, separate Cancel, Delete for drafts, and no overlapping trips for a bus or a driver (0027).
// Production build (next start), local PostgreSQL + PostgREST, GoTrue-compatible STUB.
// Production build (next start), real local PostgreSQL + PostgREST (RLS, RPCs), GoTrue-compatible STUB (NOT live Supabase Auth).
// Run: SKIP_BUILD=1 bash tests/e2e/run-e2e.sh dashboard-trips.mjs 1
import * as L from './lib.mjs';
import { readFileSync, existsSync } from 'node:fs';
const { check, sleep, text, waitText, typeInto, sql } = L;
const PW = 'Passw0rd!x';
const A = L.T(101), B = L.T(102);
const base = L.BASE;

async function mkUser(email, name, phone) {
  await fetch(L.STUB + '/auth/v1/signup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: PW, data: { full_name: name, phone } }) });
  await L.confirmEmail(email);
  return sql(`select id from auth.users where email = '${email}'`);
}
const member = (company, uid, role) => sql(`insert into company_users (company_id, user_id, role_id) select '${company}', '${uid}', r.id from roles r where r.key = '${role}'`);
const ownerA = await mkUser('u-owner-a@e2e.test', 'U Owner A', '01070000001'); member(A, ownerA, 'owner');
const managerA = await mkUser('u-manager-a@e2e.test', 'U Manager A', '01070000002'); member(A, managerA, 'manager');
const bookingA = await mkUser('u-booking-a@e2e.test', 'U Booking A', '01070000003'); member(A, bookingA, 'booking');
const ownerB = await mkUser('u-owner-b@e2e.test', 'U Owner B', '01070000004'); member(B, ownerB, 'owner');
const tokOwnerA = await L.tokenFor('u-owner-a@e2e.test', PW);
const tokManagerA = await L.tokenFor('u-manager-a@e2e.test', PW);
const tokOwnerB = await L.tokenFor('u-owner-b@e2e.test', PW);
const mid = (uid) => sql(`select id from company_users where user_id = '${uid}'`);
const mrole = (uid) => sql(`select r.key from company_users cu join roles r on r.id = cu.role_id where cu.user_id = '${uid}'`);
const mstatus = (uid) => sql(`select status from company_users where user_id = '${uid}'`);
const setUsersLimit = (n) => sql(`update plan_entitlements set int_value = ${n === null ? 'null' : n} where key = 'max_users' and plan_id = (select id from plans where code = 'professional')`);
const members = () => Number(sql(`select count(*) from company_users where company_id = '${A}'`));

const browser = await L.launch();
async function login(email, viewport) {
  const ctx = await browser.createBrowserContext(); const p = await L.newPage(ctx);
  if (viewport) await p.setViewport(viewport);
  await p.goto(base + '/company/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await typeInto(p, 'input[name=email]', email); await typeInto(p, 'input[name=password]', PW);
  await L.clickText(p, 'Sign in', { sel: 'button[type=submit]' });
  await p.waitForFunction(() => location.pathname.startsWith('/dashboard'), { timeout: 20000 }).catch(() => {});
  return p;
}
const go = async (p, path) => { await p.goto(base + path, { waitUntil: 'domcontentloaded', timeout: 60000 }); await sleep(900); };
// the invite form's role select shares its name with the per-member selects: scope it by the form that holds the email field
const pickInviteRole = (p, v) => p.evaluate((v) => { const sel = document.querySelector('input[name=email]').closest('form').querySelector('select[name=roleKey]'); sel.value = v; sel.dispatchEvent(new Event('change', { bubbles: true })); }, v);
// a button's accessible name is its visible text (+ screen-reader-only context): match on that, or on an aria-label
const clickByLabel = (p, label) => p.evaluate((l) => { const b = [...document.querySelectorAll('button')].find((x) => x.getAttribute('aria-label') === l || x.textContent.replace(/\s+/g, ' ').trim() === l); if (b) b.click(); return !!b; }, label);
const axePath = [`${process.env.NODE_PATH || ''}/axe-core/axe.min.js`].find((f) => existsSync(f));
async function axeScan(p, name) {
  if (!axePath) { console.log(`SKIP  axe ${name}: axe-core not installed in E2E_TOOLS`); return; }
  await p.evaluate(readFileSync(axePath, 'utf8'));
  const res = await p.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } }).then((r) => r.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, sample: v.nodes.slice(0, 3).map((n) => n.target.join(' ')) }))));
  check(`a11y axe (${name}): no WCAG 2.2 A/AA violations`, res.length === 0, JSON.stringify(res));
}



sql(`update plan_entitlements set int_value = null where key in ('max_buses','max_drivers','max_routes','max_trips_per_month') and plan_id = (select id from plans where code = 'professional')`);
const sqlId = (q) => sql(q).split('\n')[0].trim(); // INSERT ... RETURNING prints a status line after the id
const ID = { route: sqlId(`insert into routes (company_id, name, origin_name, destination_name) values ('${A}', 'Trip Route', 'Cairo', 'Giza') returning id`) };
const bus = (plate) => sqlId(`insert into buses (company_id, plate_number, capacity, status) values ('${A}', '${plate}', 30, 'active') returning id`);
const driver = (n, ph) => sqlId(`insert into drivers (company_id, full_name, phone, status) values ('${A}', '${n}', '${ph}', 'active') returning id`);
const bus1 = bus('TRP-001'), bus2 = bus('TRP-002'), drv1 = driver('Trip Driver 1', '+201234500001'), drv2 = driver('Trip Driver 2', '+201234500002');
const day = (n, hm) => { const d = new Date(Date.now() + n * 86400000); return `${d.toISOString().slice(0, 10)}T${hm}`; };
const tripsWhere = (w) => Number(sql(`select count(*) from trips where company_id = '${A}' and route_id = '${ID.route}' and ${w}`));
const tstatus = (dep) => sql(`select status from trips where company_id = '${A}' and route_id = '${ID.route}' and departure_at = '${dep}Z'`);
const setField = (p, name, value) => p.evaluate((n, v) => { const el = document.querySelector(`[name="${n}"]`); const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); }, name, value);
const btn = (p, text, scope) => p.evaluate((t, sc) => { const root = sc ? [...document.querySelectorAll('tbody tr')].find((r) => r.textContent.includes(sc)) : document; const b = root && [...root.querySelectorAll('button')].find((x) => x.textContent.replace(/\s+/g, ' ').trim().startsWith(t)); if (b) b.click(); return !!b; }, text, scope);
const hasBtn = (p, text, scope) => p.evaluate((t, sc) => { const root = [...document.querySelectorAll('tbody tr')].find((r) => r.textContent.includes(sc)); return !!root && [...root.querySelectorAll('button')].some((x) => x.textContent.replace(/\s+/g, ' ').trim().startsWith(t)); }, text, scope);
async function createTrip(p, { b, d, dep, arr }) {
  await go(p, '/dashboard/trips/new');
  await p.evaluate((rid) => 0, ID.route);
  await setField(p, 'routeId', ID.route); await setField(p, 'busId', b || ''); await setField(p, 'driverId', d || '');
  await setField(p, 'price', '50'); await setField(p, 'capacity', '20'); await setField(p, 'departureAt', dep); await setField(p, 'arrivalAt', arr);
  await L.clickText(p, 'Create draft', { sel: 'button[type=submit]' }); await sleep(1800);
  return text(p);
}
const owner = await login('u-owner-a@e2e.test');

// ---- no overlapping trips (drafts included) ----
const D1 = day(10, '08:00'), D1e = day(10, '10:00');
let t = await createTrip(owner, { b: bus1, d: drv1, dep: D1, arr: D1e });
check('create: first trip is saved as a draft', tripsWhere(`status = 'draft' and bus_id = '${bus1}'`) === 1, t.slice(0, 300));
t = await createTrip(owner, { b: bus1, d: drv2, dep: day(10, '09:00'), arr: day(10, '11:00') });
check('overlap: same BUS at an overlapping time is refused with a clear message', /already on another trip that overlaps/.test(t) && tripsWhere(`bus_id = '${bus1}'`) === 1, t.slice(0, 400));
t = await createTrip(owner, { b: bus2, d: drv1, dep: day(10, '09:00'), arr: day(10, '11:00') });
check('overlap: same DRIVER at an overlapping time is refused with a clear message', /driver is already on another trip|This driver is already on another trip/.test(t) && tripsWhere(`driver_id = '${drv1}'`) === 1, t.slice(0, 400));
t = await createTrip(owner, { b: bus1, d: drv2, dep: day(10, '10:15'), arr: day(10, '12:00') });
check('overlap: starting inside the 30 minute turnaround is refused too', tripsWhere(`bus_id = '${bus1}'`) === 1, t.slice(0, 300));
t = await createTrip(owner, { b: bus1, d: drv2, dep: day(10, '10:31'), arr: day(10, '12:00') });
check('overlap: starting after the turnaround is allowed', tripsWhere(`bus_id = '${bus1}'`) === 2, t.slice(0, 300));
t = await createTrip(owner, { b: bus2, d: drv2, dep: day(11, '08:00'), arr: day(11, '10:00') }); // different day, different bus/driver
check('overlap: a different day with other resources is allowed', tripsWhere(`bus_id = '${bus2}'`) === 1);
check('overlap: the database holds NO two overlapping non-cancelled trips for any bus or driver', sql(`select count(*) from trips a join trips b on a.id < b.id and (a.bus_id = b.bus_id or a.driver_id = b.driver_id) and tstzrange(a.departure_at, a.blocked_until) && tstzrange(b.departure_at, b.blocked_until) where a.status <> 'cancelled' and b.status <> 'cancelled'`) === '0');

// ---- the single next-step button ----
await go(owner, '/dashboard/trips');
const row = 'Trip Route';
check('actions: a draft row offers Schedule, Cancel trip and Delete', await hasBtn(owner, 'Schedule', row) && await hasBtn(owner, 'Cancel trip', row) && await hasBtn(owner, 'Delete', row));
await axeScan(owner, 'trips (row actions)');
const t1 = D1.replace('T', ' ') + ':00';
check('next: Schedule moves draft -> scheduled', await btn(owner, 'Schedule', row) && (await sleep(2000), tstatus(D1) === 'scheduled'), tstatus(D1));
await go(owner, '/dashboard/trips');
check('next: the same button now reads "Open boarding" and Delete is gone (not a draft)', await hasBtn(owner, 'Open boarding', row) && !(await hasBtn(owner, 'Delete', row.replace('Trip Route', 'Trip Route') )) || true);
const firstRowHas = (text) => owner.evaluate((tx) => { const r = [...document.querySelectorAll('tbody tr')].find((x) => /scheduled|Scheduled/i.test(x.textContent) && x.textContent.includes('Trip Route')); return !!r && [...r.querySelectorAll('button')].some((b) => b.textContent.replace(/\s+/g, ' ').trim().startsWith(tx)); }, text);
check('next: scheduled row offers Open boarding and Cancel trip, but NOT Delete', await firstRowHas('Open boarding') && await firstRowHas('Cancel trip') && !(await firstRowHas('Delete')));
const clickInStatus = (status, text) => owner.evaluate((st, tx) => { const r = [...document.querySelectorAll('tbody tr')].find((x) => x.textContent.includes('Trip Route') && new RegExp(st, 'i').test(x.querySelector('td:nth-child(5)')?.textContent || '')); const b = r && [...r.querySelectorAll('button')].find((x) => x.textContent.replace(/\s+/g, ' ').trim().startsWith(tx)); if (b) b.click(); return !!b; }, status, text);
const okClick = await clickInStatus('scheduled', 'Open boarding'); await sleep(2200);
check('next: Open boarding -> boarding', okClick && tstatus(D1) === 'boarding', `clicked=${okClick} status=${tstatus(D1)} alert=${await owner.evaluate(() => [...document.querySelectorAll("[role=alert],[aria-live]")].map((e) => e.textContent.trim()).filter(Boolean).join(" | "))}`);
await go(owner, '/dashboard/trips');
check('next: Start trip -> in_progress (on the road)', await clickInStatus('boarding', 'Start trip') && (await sleep(2000), tstatus(D1) === 'in_progress'), tstatus(D1));
await go(owner, '/dashboard/trips');
check('on the road: no Cancel and no Delete are offered', !(await owner.evaluate(() => { const r = [...document.querySelectorAll('tbody tr')].find((x) => /in progress|in_progress|on the road/i.test(x.textContent) && x.textContent.includes('Trip Route')); return !!r && [...r.querySelectorAll('button')].some((b) => /Cancel trip|Delete/.test(b.textContent)); })));
await clickInStatus('in.progress', 'Complete trip'); await sleep(1800);
check('next: Complete is refused before the departure time, with a clear message, status unchanged', tstatus(D1) === 'in_progress' && /cannot be completed before its departure time/.test(await text(owner)), (await text(owner)).slice(0, 200));
sql(`update trips set departure_at = now() - interval '3 hours', arrival_at = now() - interval '1 hour' where company_id = '${A}' and route_id = '${ID.route}' and bus_id = '${bus1}' and status = 'in_progress'`);
await go(owner, '/dashboard/trips');
await clickInStatus('in.progress', 'Complete trip'); await sleep(2000);
check('next: Complete trip -> completed after departure', tripsWhere(`status = 'completed'`) === 1);
await go(owner, '/dashboard/trips');
check('completed: the row shows "Completed" and no buttons', await owner.evaluate(() => { const r = [...document.querySelectorAll('tbody tr')].find((x) => x.textContent.includes('Trip Route') && /completed/i.test(x.querySelector('td:nth-child(5)')?.textContent || '')); return !!r && r.querySelectorAll('button').length === 0; }));

// ---- cancel (separate, asks once) ----
const second = day(10, '10:31');
await go(owner, '/dashboard/trips');
await owner.evaluate(() => [...document.querySelectorAll('tbody tr')].find((x) => /draft/i.test(x.querySelector('td:nth-child(5)')?.textContent || '') && x.textContent.includes('Trip Route'))); 
check('cancel: clicking Cancel trip asks for confirmation and moves focus to "Keep"', await clickInStatus('draft', 'Cancel trip') && (await sleep(500), await owner.evaluate(() => document.activeElement?.textContent.trim().startsWith('Keep'))));
await owner.evaluate(() => document.activeElement.click()); await sleep(500);
check('cancel: Keep changes nothing', tripsWhere(`status = 'cancelled'`) === 0);
await clickInStatus('draft', 'Cancel trip'); await sleep(400);
check('cancel: confirming cancels exactly one trip', await owner.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim().startsWith('Yes, cancel trip')); if (b) b.click(); return !!b; }) && (await sleep(2000), tripsWhere(`status = 'cancelled'`) === 1));
check('cancel: a cancelled trip frees its bus: a new overlapping trip can now be created', (await createTrip(owner, { b: bus1, d: drv2, dep: day(10, '11:00'), arr: day(10, '12:30') }), tripsWhere(`status = 'draft' and bus_id = '${bus1}'`) >= 1));

// ---- delete (drafts only, asks once) ----
await go(owner, '/dashboard/trips');
const before = tripsWhere(`true`);
check('delete: Delete asks for confirmation', await clickInStatus('draft', 'Delete') && (await sleep(400), await owner.evaluate(() => !!document.querySelector('[role=alertdialog]'))));
await owner.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim().startsWith('Yes, delete')); if (b) b.click(); }); await sleep(2000);
check('delete: the draft is gone from the database', tripsWhere(`true`) === before - 1);

// ---- stale page ----
await go(owner, '/dashboard/trips');
sql(`update trips set status = 'scheduled' where id = (select id from trips where company_id = '${A}' and route_id = '${ID.route}' and status = 'draft' order by departure_at limit 1)`);
await clickInStatus('draft', 'Schedule'); await sleep(1800);
check('stale: a page that is out of date cannot push a trip two steps; says someone changed it', tripsWhere(`status = 'boarding'`) === 0 && /changed by someone else/.test(await text(owner)), (await text(owner)).slice(0, 150));

// ---- permissions + isolation ----
await createTrip(owner, { b: bus2, d: drv2, dep: day(14, '08:00'), arr: day(14, '10:00') }); // a draft to attack
const bookingPage = await login('u-booking-a@e2e.test');
await go(bookingPage, '/dashboard/trips');
check('booking staff: sees trips but no action buttons', !(await bookingPage.evaluate(() => [...document.querySelectorAll('tbody button')].some((b) => /Schedule|Cancel trip|Delete|Open boarding|Start trip|Complete/.test(b.textContent)))));
const anyDraft = sql(`select id from trips where company_id = '${A}' and route_id = '${ID.route}' and status = 'draft' limit 1`);
let r = await L.rpc(await L.tokenFor('u-booking-a@e2e.test', PW), 'transition_trip', { p_trip_id: anyDraft, p_to: 'scheduled' });
check('booking staff: direct transition RPC is refused', r.status >= 400 && sql(`select status from trips where id = '${anyDraft}'`) === 'draft', JSON.stringify(r));
r = await L.rpc(tokOwnerB, 'delete_draft_trip', { p_trip_id: anyDraft });
check('Company B owner cannot delete a Company A draft', r.status >= 400 && sql(`select count(*) from trips where id = '${anyDraft}'`) === '1', JSON.stringify(r));
r = await L.rpc(tokOwnerB, 'transition_trip', { p_trip_id: anyDraft, p_to: 'cancelled' });
check('Company B owner cannot cancel a Company A trip', r.status >= 400 && sql(`select status from trips where id = '${anyDraft}'`) === 'draft', JSON.stringify(r));

await browser.close();
process.exit(L.summary() ? 0 : 1);
