// M2 close-out in a real browser: /dashboard/customers (+detail), /dashboard/settings, /dashboard/trips/new (business-rule messages),
// role-based navigation + server guards for every role, tenant isolation of the new reads/writes, billing visibility, and an axe sweep.
// Production build (next start), real local PostgreSQL + PostgREST (RLS), GoTrue-compatible STUB (NOT live Supabase Auth).
// Run: SKIP_BUILD=1 bash tests/e2e/run-e2e.sh dashboard-pages.mjs 1
import * as L from './lib.mjs';
import { readFileSync, existsSync } from 'node:fs';
const { check, sleep, text, typeInto, sql } = L;
const PW = 'Passw0rd!x';
const A = L.T(101), B = L.T(102);
const base = L.BASE;

async function mkUser(email, name, phone) {
  await fetch(L.STUB + '/auth/v1/signup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: PW, data: { full_name: name, phone } }) });
  await L.confirmEmail(email);
  return sql(`select id from auth.users where email = '${email}'`);
}
const member = (company, uid, role) => sql(`insert into company_users (company_id, user_id, role_id) select '${company}', '${uid}', r.id from roles r where r.key = '${role}'`);
const roles = ['owner', 'manager', 'operations', 'booking', 'driver'];
let n = 0;
for (const r of roles) { const uid = await mkUser(`p-${r}-a@e2e.test`, `P ${r} A`, `0108000000${++n}`); member(A, uid, r); }
const ownerB = await mkUser('p-owner-b@e2e.test', 'P Owner B', '01080000009'); member(B, ownerB, 'owner');
const tokB = await L.tokenFor('p-owner-b@e2e.test', PW);
const tokManager = await L.tokenFor('p-manager-a@e2e.test', PW);
const tokOwner = await L.tokenFor('p-owner-a@e2e.test', PW);

// ---- data ----
sql(`insert into customers (company_id, full_name, phone) select '${A}', 'Pager Cust ' || lpad(g::text, 2, '0'), '+2010999' || lpad(g::text, 5, '0') from generate_series(1, 30) g`);
sql(`insert into customers (company_id, full_name, phone) values ('${B}', 'Hidden Bee', '+201099999999')`);
const custA = sql(`select id from customers where company_id = '${A}' and full_name = 'Pager Cust 07'`);
const custB = sql(`select id from customers where company_id = '${B}' and full_name = 'Hidden Bee'`);
let hasBooking = false;
try {
  sql(`insert into bookings (company_id, reference, trip_id, customer_id, seats_count, unit_price, total_amount, currency, status, source) select '${A}', 'MB-PGTEST', t.id, '${custA}', 1, 10, 10, 'EGP', 'confirmed', 'staff' from trips t where t.company_id = '${A}' and t.status = 'scheduled' limit 1`);
  hasBooking = sql(`select count(*) from bookings where reference = 'MB-PGTEST'`) === '1';
} catch { /* no scheduled trip in this fixture: the history check below is skipped and says so */ }
sql(`insert into buses (company_id, plate_number, capacity, status) values ('${A}', 'M2P-ACT', 30, 'active'), ('${A}', 'M2P-ACT2', 30, 'active'), ('${A}', 'M2P-OFF', 30, 'inactive')`);
sql(`insert into drivers (company_id, full_name, phone) values ('${A}', 'M2P Driver', '+201000009001'), ('${A}', 'M2P Driver2', '+201000009002')`);
sql(`update plan_entitlements set int_value = 200 where key in ('max_buses','max_trips_per_month') and plan_id = (select id from plans where code = 'professional')`);

const browser = await L.launch();
async function login(email, viewport) {
  const ctx = await browser.createBrowserContext(); const p = await L.newPage(ctx);
  if (viewport) await p.setViewport(viewport);
  await p.goto(base + '/company/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await typeInto(p, 'input[name=email]', email); await typeInto(p, 'input[name=password]', PW);
  await L.clickText(p, 'Sign in', { sel: 'button[type=submit]' });
  await p.waitForFunction(() => location.pathname.startsWith('/dashboard') || location.pathname.startsWith('/driver'), { timeout: 20000 }).catch(() => {});
  return p;
}
const go = async (p, path) => { await p.goto(base + path, { waitUntil: 'domcontentloaded', timeout: 60000 }); await sleep(900); };
const forbidden = (p) => new URL(p.url()).pathname === '/dashboard' && /error=forbidden/.test(p.url());
const navLinks = (p) => p.evaluate(() => [...new Set([...document.querySelectorAll('a[href^="/dashboard"]')].filter((a) => !a.closest('main')).map((a) => a.getAttribute('href')))].sort());
const setVal = (p, sel, v) => p.evaluate((sel, v) => { const e = document.querySelector(sel); const proto = e.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(e, v); e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, sel, v);
const axePath = [`${process.env.NODE_PATH || ''}/axe-core/axe.min.js`].find((f) => existsSync(f));
async function axeScan(p, name) {
  if (!axePath) { console.log(`SKIP  axe ${name}: axe-core not installed in E2E_TOOLS`); return; }
  await p.evaluate(readFileSync(axePath, 'utf8'));
  const res = await p.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } }).then((r) => r.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, sample: v.nodes.slice(0, 3).map((x) => x.target.join(' ') + ' => ' + (x.any[0]?.message || '').slice(0, 120)) }))));
  check(`a11y axe (${name}): no WCAG 2.2 A/AA violations`, res.length === 0, JSON.stringify(res));
}

// =================================================================================================================
// 1. role-based navigation + server guards (the guard, not the menu, is the control)
// =================================================================================================================
const NAV = {
  owner: ['/dashboard', '/dashboard/bookings', '/dashboard/buses', '/dashboard/customers', '/dashboard/drivers', '/dashboard/routes', '/dashboard/settings', '/dashboard/trips', '/dashboard/users', '/dashboard/website'],
  manager: ['/dashboard', '/dashboard/bookings', '/dashboard/buses', '/dashboard/customers', '/dashboard/drivers', '/dashboard/routes', '/dashboard/settings', '/dashboard/trips', '/dashboard/users', '/dashboard/website'],
  operations: ['/dashboard', '/dashboard/bookings', '/dashboard/buses', '/dashboard/drivers', '/dashboard/routes', '/dashboard/settings', '/dashboard/trips'],
  booking: ['/dashboard', '/dashboard/bookings', '/dashboard/customers', '/dashboard/routes', '/dashboard/settings', '/dashboard/trips'],
  driver: ['/dashboard'],
};
const pages = {};
for (const r of roles) {
  const p = await login(`p-${r}-a@e2e.test`); pages[r] = p;
  if (r === 'driver' && !p.url().includes('/dashboard')) await go(p, '/dashboard');
  check(`nav (${r}): shows exactly the pages this role can open`, JSON.stringify(await navLinks(p)) === JSON.stringify(NAV[r]), JSON.stringify(await navLinks(p)));
}
await go(pages.operations, '/dashboard/customers'); check('guard: operations staff are refused /dashboard/customers', forbidden(pages.operations), pages.operations.url());
await go(pages.operations, '/dashboard/users'); check('guard: operations staff are refused /dashboard/users', forbidden(pages.operations));
await go(pages.operations, '/dashboard/website'); check('guard: operations staff are refused /dashboard/website', forbidden(pages.operations));
await go(pages.booking, '/dashboard/trips/new'); check('guard: booking staff are refused /dashboard/trips/new (no trips.write)', forbidden(pages.booking), pages.booking.url());
await go(pages.booking, '/dashboard/buses'); check('guard: booking staff are refused /dashboard/buses', forbidden(pages.booking));
await go(pages.driver, '/dashboard/trips'); check('guard: a driver is refused the company trips page', forbidden(pages.driver), pages.driver.url());
await go(pages.driver, '/dashboard/customers'); check('guard: a driver is refused /dashboard/customers', forbidden(pages.driver));
await go(pages.driver, '/dashboard/settings'); check('guard: a driver is refused /dashboard/settings', forbidden(pages.driver));
// billing is owner-only (there is no billing page yet; the data boundary is RLS)
const subs = async (tok) => (await fetch(`${L.STUB}/rest/v1/subscriptions?select=id`, { headers: { authorization: `Bearer ${tok}`, apikey: 'x' } }).then((r) => r.json()));
check('billing: the owner can read the subscription', Array.isArray(await subs(tokOwner)) && (await subs(tokOwner)).length >= 1);
check('billing: a manager cannot read subscriptions', Array.isArray(await subs(tokManager)) && (await subs(tokManager)).length === 0);
const tokOps = await L.tokenFor('p-operations-a@e2e.test', PW);
check('billing: operations staff cannot read subscriptions', (await subs(tokOps)).length === 0);

// =================================================================================================================
// 2. customers: list, search, pagination, detail, isolation
// =================================================================================================================
const owner = pages.owner;
await go(owner, '/dashboard/customers'); let t = await text(owner);
check('customers: list shows the first page and the total', /Pager Cust/.test(t) && /\d+ customers · page 1 of 2/.test(t), t.slice(0, 300));
check('customers: page 1 has 25 rows and a Next link', (await owner.evaluate(() => document.querySelectorAll('tbody tr').length)) === 25 && /Next page/.test(t));
check('customers: Company B customers are never listed', !/Hidden Bee/.test(t));
await owner.evaluate(() => [...document.querySelectorAll('a')].find((a) => /Next page/.test(a.innerText))?.click()); await sleep(1500); t = await text(owner);
check('customers: page 2 loads the remaining rows', /page 2 of 2/.test(t) && (await owner.evaluate(() => document.querySelectorAll('tbody tr').length)) >= 1);
await go(owner, '/dashboard/customers'); await typeInto(owner, '#customer-q', 'Cust 07'); await owner.keyboard.press('Enter'); await sleep(1500); t = await text(owner);
check('customers: search by name finds exactly one', /Pager Cust 07/.test(t) && (await owner.evaluate(() => document.querySelectorAll('tbody tr').length)) === 1 && /1 customer found/.test(t), t.slice(0, 300));
await go(owner, '/dashboard/customers?q=99900013'); t = await text(owner);
check('customers: search by part of a phone number works', /Pager Cust 13/.test(t));
await go(owner, '/dashboard/customers?q=Hidden'); t = await text(owner);
check('customers: searching for another company\'s customer finds nothing', /No customers match your search/.test(t) && !/Hidden Bee/.test(t));
await go(owner, '/dashboard/customers?q=Pager%2507'); t = await text(owner);
check('customers: LIKE wildcards in the search box are stripped, not used as a pattern', !/Pager Cust 07/.test(t) && /No customers match your search/.test(t), t.slice(0, 200));
await go(owner, '/dashboard/customers?page=999'); t = await text(owner);
check('customers: an out-of-range page shows an empty page, not an error', !/Application error|500/.test(t));
await go(owner, `/dashboard/customers/${custA}`); t = await text(owner);
check('customers: detail shows phone and staff notes section', /Pager Cust 07/.test(t) && /\+201099900007/.test(t) && /Staff notes/.test(t), t.slice(0, 300));
if (hasBooking) check('customers: detail lists the customer\'s bookings', /MB-PGTEST/.test(t), t.slice(0, 400)); else console.log('SKIP  customers: booking history (no scheduled trip in this fixture to attach a booking to)');
await go(owner, `/dashboard/customers/${custB}`); t = await text(owner);
check('isolation (UI): Company A owner opening a Company B customer gets 404', /could not be found|404|not found/i.test(t) && !/Hidden Bee/.test(t), t.slice(0, 200));
await go(owner, '/dashboard/customers/not-a-uuid'); check('customers: a malformed id is a 404 too', /could not be found|404|not found/i.test(await text(owner)));
const ownB = await login('p-owner-b@e2e.test');
await go(ownB, `/dashboard/customers/${custA}`); t = await text(ownB);
check('isolation (UI): Company B owner opening a Company A customer gets 404', /could not be found|404|not found/i.test(t) && !/Pager Cust 07/.test(t));
const restB = await fetch(`${L.STUB}/rest/v1/customers?id=eq.${custA}&select=id,notes`, { headers: { authorization: `Bearer ${tokB}`, apikey: 'x' } }).then((r) => r.json());
check('isolation (API): Company B cannot read a Company A customer row', Array.isArray(restB) && restB.length === 0, JSON.stringify(restB));
await go(pages.booking, '/dashboard/customers'); check('customers: booking staff can open the list', /Pager Cust/.test(await text(pages.booking)));
await go(pages.manager, `/dashboard/customers/${custA}`); check('customers: a manager can open a detail page', /Pager Cust 07/.test(await text(pages.manager)));

// =================================================================================================================
// 3. settings
// =================================================================================================================
const dbs = (col) => sql(`select ${col} from company_settings where company_id = '${A}'`);
await go(owner, '/dashboard/settings'); t = await text(owner);
check('settings: owner sees the read-only company profile and the editable settings form', /Company profile/.test(t) && /Booking and operations/.test(t) && !!(await owner.$('input[name=bookingCutoffMinutes]')) && !(await owner.$('main input[name=name]')), t.slice(0, 200));
check('settings: the profile section says who changes the profile', /managed by the platform team/.test(t));
await setVal(owner, 'input[name=bookingCutoffMinutes]', '120'); await setVal(owner, 'input[name=maxSeatsPerBooking]', '6');
await owner.evaluate(() => { const c = document.querySelector('input[name=allowGuestBooking]'); if (c.checked) c.click(); });
await L.clickText(owner, 'Save settings', { sel: 'button[type=submit]' }); await sleep(1800); t = await text(owner);
check('settings: save shows a success message', /Saved\./.test(t), t.slice(0, 300));
check('settings: values persisted for company A', dbs('booking_cutoff_minutes') === '120' && dbs('max_seats_per_booking') === '6' && dbs('allow_guest_booking') === 'f');
await go(owner, '/dashboard/settings');
check('settings: reopening shows the saved values', (await owner.$eval('input[name=bookingCutoffMinutes]', (e) => e.value)) === '120' && !(await owner.$eval('input[name=allowGuestBooking]', (e) => e.checked)));
await setVal(owner, 'input[name=timezone]', 'Mars/Phobos');
await L.clickText(owner, 'Save settings', { sel: 'button[type=submit]' }); await sleep(1800); t = await text(owner);
check('settings: an invalid time zone is refused and nothing changes', !/Saved\./.test(t) && dbs('timezone') !== 'Mars/Phobos' && (await owner.evaluate(() => document.querySelector('input[name=timezone]').getAttribute('aria-invalid'))) === 'true', t.slice(0, 300));
await setVal(owner, 'input[name=timezone]', 'Africa/Cairo');
await owner.evaluate(() => { const c = document.querySelector('input[name=supportedLocales][value=ar]'); if (c.checked) c.click(); });
await setVal(owner, 'select[name=defaultLocale]', 'ar');
await L.clickText(owner, 'Save settings', { sel: 'button[type=submit]' }); await sleep(1800);
check('settings: default language must be one of the supported languages', !/Saved\./.test(await text(owner)) && dbs('default_locale') === 'ar' && dbs('supported_locales').includes('ar'));
await go(owner, '/dashboard/settings'); await setVal(owner, 'input[name=maxSeatsPerBooking]', '99');
await L.clickText(owner, 'Save settings', { sel: 'button[type=submit]' }); await sleep(1500);
check('settings: out-of-range seats per booking refused', dbs('max_seats_per_booking') === '6');
await go(pages.manager, '/dashboard/settings'); await setVal(pages.manager, 'input[name=bookingCutoffMinutes]', '45');
await L.clickText(pages.manager, 'Save settings', { sel: 'button[type=submit]' }); await sleep(1800);
check('settings: a manager (settings.write) can save', dbs('booking_cutoff_minutes') === '45');
for (const r of ['operations', 'booking']) {
  await go(pages[r], '/dashboard/settings'); t = await text(pages[r]);
  check(`settings: ${r} staff get a read-only view (notice, no form, no save button)`, /You can view these settings but not change them\./.test(t) && !(await pages[r].$('input[name=bookingCutoffMinutes]')) && !/Save settings/.test(t), t.slice(0, 200));
}
const patch = await fetch(`${L.STUB}/rest/v1/company_settings?company_id=eq.${A}`, { method: 'PATCH', headers: { authorization: `Bearer ${tokB}`, apikey: 'x', 'content-type': 'application/json', prefer: 'return=representation' }, body: JSON.stringify({ booking_cutoff_minutes: 7 }) }).then((r) => r.json());
check('isolation (API): Company B cannot update Company A settings', Array.isArray(patch) && patch.length === 0 && dbs('booking_cutoff_minutes') === '45', JSON.stringify(patch));
const patchBooking = await fetch(`${L.STUB}/rest/v1/company_settings?company_id=eq.${A}`, { method: 'PATCH', headers: { authorization: `Bearer ${await L.tokenFor('p-booking-a@e2e.test', PW)}`, apikey: 'x', 'content-type': 'application/json', prefer: 'return=representation' }, body: JSON.stringify({ booking_cutoff_minutes: 8 }) }).then((r) => r.json());
check('permission (API): booking staff cannot update settings even by calling the API directly', Array.isArray(patchBooking) && patchBooking.length === 0 && dbs('booking_cutoff_minutes') === '45', JSON.stringify(patchBooking));
sql(`update company_settings set default_locale = 'ar', supported_locales = '{ar,en}', max_seats_per_booking = 4, allow_guest_booking = true, booking_cutoff_minutes = 60 where company_id = '${A}'`);

// =================================================================================================================
// 4. trips/new: dedicated page + business-rule messages (the database is the enforcement point; tests below prove the UI shows it)
// =================================================================================================================
const tripsA = () => Number(sql(`select count(*) from trips where company_id = '${A}'`));
const routeId = sql(`select id from routes where company_id = '${A}' and deleted_at is null order by created_at limit 1`);
async function fillTrip(p, { bus, driver, cap, dep, arr }) {
  await go(p, '/dashboard/trips/new');
  await setVal(p, 'select[name=routeId]', routeId);
  if (bus) await setVal(p, 'select[name=busId]', sql(`select id from buses where company_id = '${A}' and plate_number = '${bus}'`));
  if (driver) await setVal(p, 'select[name=driverId]', sql(`select id from drivers where company_id = '${A}' and full_name = '${driver}'`));
  await setVal(p, 'input[name=price]', '25'); await setVal(p, 'input[name=capacity]', String(cap));
  await setVal(p, 'input[name=departureAt]', dep); await setVal(p, 'input[name=arrivalAt]', arr);
  await L.clickText(p, 'Create draft', { sel: 'button[type=submit]' }); await sleep(2200);
  return text(p);
}
await go(owner, '/dashboard/trips'); t = await text(owner);
check('trips: the list has an "Add a trip" link to the dedicated page and no inline form', /Add a trip/.test(t) && !(await owner.$('select[name=routeId]')));
await go(owner, '/dashboard/trips/new');
check('trips/new: dedicated page loads for a role with trips.write', /Add a trip/.test(await text(owner)) && !!(await owner.$('select[name=routeId]')));
await go(pages.operations, '/dashboard/trips/new'); check('trips/new: operations staff (trips.write) can open it', !!(await pages.operations.$('select[name=routeId]')));
const before = tripsA();
t = await fillTrip(owner, { bus: 'M2P-ACT', driver: 'M2P Driver', cap: 30, dep: '2031-03-04T08:00', arr: '2031-03-04T10:00' });
check('trips/new: a valid trip is created with its bus and driver', tripsA() === before + 1 && sql(`select count(*) from trips t join buses b on b.id = t.bus_id where b.plate_number = 'M2P-ACT' and t.company_id = '${A}'`) === '1', t.slice(0, 300));
t = await fillTrip(owner, { bus: 'M2P-ACT', cap: 31, dep: '2031-03-05T08:00', arr: '2031-03-05T10:00' });
check('business rule: capacity above the bus capacity is refused with a clear message', /between 1 and 30/.test(t) && tripsA() === before + 1, t.slice(-300));
t = await fillTrip(owner, { cap: 20, dep: '2031-03-05T10:00', arr: '2031-03-05T09:00' });
check('business rule: arrival before departure is refused with a clear message', /Arrival must be later than departure/.test(t) && tripsA() === before + 1, t.slice(-300));
// Drafts may overlap; the exclusion constraints apply once a trip is scheduled. Create the drafts, then move them through the UI.
await fillTrip(owner, { bus: 'M2P-ACT', driver: 'M2P Driver2', cap: 20, dep: '2031-03-04T09:00', arr: '2031-03-04T11:00' });
await fillTrip(owner, { bus: 'M2P-ACT2', driver: 'M2P Driver', cap: 20, dep: '2031-03-04T09:00', arr: '2031-03-04T11:00' });
await fillTrip(owner, { cap: 20, dep: '2031-03-04T12:00', arr: '2031-03-04T13:00' });
check('trips/new: overlapping drafts are accepted (rules apply when a trip is scheduled)', tripsA() === before + 4);
const tripId = (bus, drv, hour) => sql(`select t.id from trips t left join buses b on b.id = t.bus_id left join drivers d on d.id = t.driver_id where t.company_id = '${A}' and t.status = 'draft' and ${bus ? `b.plate_number = '${bus}'` : 't.bus_id is null'} ${drv ? `and d.full_name = '${drv}'` : ''} and to_char(t.departure_at at time zone 'UTC', 'YYYY-MM-DD') = '2031-03-04' order by t.created_at limit 1`);
async function moveTrip(p, id, to) {
  await go(p, '/dashboard/trips');
  const ok = await p.evaluate((id, to) => { const f = document.querySelector(`input[name=id][value="${id}"]`)?.closest('form'); if (!f) return false; f.querySelector('select[name=to]').value = to; f.requestSubmit(); return true; }, id, to);
  await sleep(2500);
  return { ok, t: await text(p), alert: await p.evaluate(() => [...document.querySelectorAll('[role=alert]')].map((e) => e.textContent).join(' | ')) };
}
const t1 = tripId('M2P-ACT', 'M2P Driver'), t2 = tripId('M2P-ACT', 'M2P Driver2'), t3 = tripId('M2P-ACT2', 'M2P Driver'), t4 = tripId(null, null);
let r = await moveTrip(owner, t1, 'scheduled');
check('lifecycle: a trip with a free bus and driver can be scheduled', sql(`select status from trips where id = '${t1}'`) === 'scheduled' && /Saved\./.test(r.t), r.t.slice(-300));
r = await moveTrip(owner, t2, 'scheduled');
check('business rule: an overlapping bus is refused with a clear message (no error page)', /already assigned to an overlapping trip/.test(r.alert) && sql(`select status from trips where id = '${t2}'`) === 'draft', JSON.stringify(r.alert) + r.t.slice(-200));
r = await moveTrip(owner, t3, 'scheduled');
check('business rule: an overlapping driver is refused with a clear message', /driver is already assigned to an overlapping trip/.test(r.alert) && sql(`select status from trips where id = '${t3}'`) === 'draft', JSON.stringify(r.alert));
r = await moveTrip(owner, t4, 'scheduled');
check('business rule: scheduling without a bus and driver is refused with a clear message', /Assign a bus and a driver/.test(r.alert) && sql(`select status from trips where id = '${t4}'`) === 'draft', JSON.stringify(r.alert));
sql(`update buses set status = 'inactive' where company_id = '${A}' and plate_number = 'M2P-ACT2'`);
sql(`update trips set driver_id = (select id from drivers where company_id = '${A}' and full_name = 'M2P Driver2'), bus_id = (select id from buses where company_id = '${A}' and plate_number = 'M2P-ACT2'), departure_at = '2031-04-01 08:00+00', arrival_at = '2031-04-01 10:00+00', blocked_until = '2031-04-01 10:30+00' where id = '${t3}'`);
r = await moveTrip(owner, t3, 'scheduled');
check('business rule: a bus that became inactive after the draft was saved is refused with a clear message', /This bus is not active/.test(r.alert) && sql(`select status from trips where id = '${t3}'`) === 'draft', JSON.stringify(r.alert));
await go(owner, '/dashboard/trips'); await axeScan(owner, 'trips list (rule message shown)');
await go(pages.owner, '/dashboard/trips?error=bus_conflict'); check('a11y: rule messages are announced as an alert', (await pages.owner.evaluate(() => [...document.querySelectorAll('[role=alert]')].some((e) => /overlapping trip/.test(e.textContent)))));
await go(pages.owner, '/dashboard/trips?error=<script>alert(1)</script>'); check('security: unknown error codes in the URL are never echoed', !/<script|alert\(1\)/.test(await text(pages.owner)));
const dbTrip = await fetch(`${L.STUB}/rest/v1/rpc/transition_trip`, { method: 'POST', headers: { authorization: `Bearer ${tokB}`, apikey: 'x', 'content-type': 'application/json' }, body: JSON.stringify({ p_trip_id: sql(`select id from trips where company_id = '${A}' order by created_at desc limit 1`), p_to: 'scheduled' }) });
check('isolation (API): Company B cannot move a Company A trip through the lifecycle', dbTrip.status >= 400);

// =================================================================================================================
// 5. accessibility sweep on the new pages (desktop) + reflow at 320px
// =================================================================================================================
for (const [path, name] of [['/dashboard/customers', 'customers list'], [`/dashboard/customers/${custA}`, 'customer detail'], ['/dashboard/customers?q=zzzz', 'customers, no results'], ['/dashboard/settings', 'settings (owner form)'], ['/dashboard/trips/new', 'trips new']]) { await go(owner, path); await axeScan(owner, name); }
await go(pages.booking, '/dashboard/settings'); await axeScan(pages.booking, 'settings (read-only)');
await go(owner, '/dashboard/settings'); await setVal(owner, 'input[name=timezone]', 'Mars/Phobos'); await L.clickText(owner, 'Save settings', { sel: 'button[type=submit]' }); await sleep(1500); await axeScan(owner, 'settings, validation error shown');
await go(owner, '/dashboard/customers');
check('a11y: the search box has a visible label and the results announce their count in a status region', (await owner.evaluate(() => !!document.querySelector('label[for=customer-q]') && !!document.querySelector('[role=status]'))));
const mob = await login('p-owner-a@e2e.test', { width: 320, height: 800 });
for (const path of ['/dashboard/customers', `/dashboard/customers/${custA}`, '/dashboard/settings', '/dashboard/trips/new']) {
  await go(mob, path);
  const ov = await mob.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  check(`mobile 320px: ${path.replace(custA, ':id')} has no page-level horizontal scroll`, ov.sw <= ov.iw + 1, JSON.stringify(ov));
}
await browser.close();
process.exit(L.summary() ? 0 : 1);
