// Tickets + driver boarding in a real browser: production build (next start), real local PostgreSQL + PostgREST (RLS, RPCs), GoTrue-compatible STUB (NOT live Supabase Auth).
// Run: SKIP_BUILD=1 bash tests/e2e/run-e2e.sh tickets.mjs 1
import * as L from './lib.mjs';
const { check, sleep, text, waitText, clickText, typeInto, sql, sqlRow, snap, T } = L;
const PW = 'Passw0rd!x';
const A = T(101);

async function mk(email, name, phone) {
  await fetch(L.STUB + '/auth/v1/signup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: PW, data: { full_name: name, phone } }) });
  await L.confirmEmail(email); return L.tokenFor(email, PW);
}
const uidOf = (email) => sql(`select id from auth.users where email = '${email}'`);
const rpc = (tok, fn, args) => L.rpc(tok, fn, args);

// ---- fixtures: two drivers (own trips), one customer ----
await mk('drv-e2e1@e2e.test', 'Driver One', '01070000001'); await mk('drv-e2e2@e2e.test', 'Driver Two', '01070000002');
const carolTok = await mk('tix-carol@e2e.test', 'Tix Carol', '01077770001');
const d1 = uidOf('drv-e2e1@e2e.test'), d2 = uidOf('drv-e2e2@e2e.test');
sql(`insert into company_users (company_id, user_id, role_id) select '${A}', u, r.id from unnest(array['${d1}','${d2}']::uuid[]) u, roles r where r.key = 'driver'`);
sql(`insert into buses (id, company_id, plate_number, capacity) values ('${T(991)}','${A}','E2E-991',20),('${T(992)}','${A}','E2E-992',20)`);
sql(`insert into drivers (id, company_id, user_id, full_name, phone) values ('${T(981)}','${A}','${d1}','E2E driver 1','+201000099001'),('${T(982)}','${A}','${d2}','E2E driver 2','+201000099002')`);
sql(`insert into trips (id, company_id, route_id, bus_id, driver_id, departure_at, arrival_at, price, capacity, status) values
  ('${T(995)}','${A}','${T(201)}','${T(991)}','${T(981)}', now() + interval '90 minutes', now() + interval '210 minutes', 40, 10, 'scheduled'),
  ('${T(996)}','${A}','${T(201)}','${T(992)}','${T(982)}', now() + interval '90 minutes', now() + interval '210 minutes', 40, 10, 'scheduled')`);
const b1 = (await rpc(carolTok, 'create_my_booking', { p_trip_id: T(995), p_seats: 2, p_full_name: 'Tix Carol', p_phone: '+201077770001', p_idempotency_key: 'tix-e2e-1' })).body;
const b2 = (await rpc(carolTok, 'create_my_booking', { p_trip_id: T(996), p_seats: 1, p_full_name: 'Tix Carol', p_phone: '+201077770001', p_idempotency_key: 'tix-e2e-2' })).body;
check('setup: bookings exist and each seat got a ticket in the same transaction', b1?.reference && b2?.reference && sql(`select count(*) from tickets where booking_id = '${b1.id}'`) === '2' && sql(`select count(*) from tickets where booking_id = '${b2.id}'`) === '1');

const browser = await L.launch();
async function signIn(ctx, email, path = '/company/login') {
  const p = await L.newPage(ctx);
  await p.goto(L.BASE + path, { waitUntil: 'domcontentloaded', timeout: 60000 });
  return p;
}
async function staffLogin(email) {
  const ctx = await browser.createBrowserContext(); const p = await L.newPage(ctx);
  await p.goto(L.BASE + '/company/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await typeInto(p, 'input[name=email]', email); await typeInto(p, 'input[name=password]', PW);
  await clickText(p, 'Sign in', { sel: 'button[type=submit]' }); await sleep(3500);
  return { ctx, p };
}

// ---------- 1. customer: tickets + QR in the portal ----------
const cctx = await browser.createBrowserContext(); const cp = await L.newPage(cctx);
const qrBodies = []; // what the browser itself received from my_ticket_qr (the only place a raw token ever appears)
cp.on('response', async (r) => { if (r.url().includes('/rpc/my_ticket_qr') && r.ok()) { try { qrBodies.push(await r.json()); } catch {} } });
await cp.goto(L.BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 }); await waitText(cp, /Showing \d+ Departures/i, 20000);
await clickText(cp, 'Sign In'); await typeInto(cp, '[role=dialog] input[type=email]', 'tix-carol@e2e.test'); await typeInto(cp, '[role=dialog] input[type=password]', PW);
await clickText(cp, 'Sign In', { sel: 'button[type=submit]', scope: '[role=dialog]' }); await sleep(2000);
const h = await cp.evaluateHandle(() => [...document.querySelectorAll('button')].find((e) => e.offsetParent && e.innerText.includes('Tix')));
await h.asElement().click(); await sleep(300); await clickText(cp, 'My Trips'); await waitText(cp, /My Trips & Bookings/, 8000); await sleep(1200);
const portal = await text(cp);
check('customer: portal lists the booking and offers the boarding pass (not the mock token line)', portal.includes(b1.reference) && /Boarding Pass/i.test(portal) && !/Opaque Token/.test(portal), portal.slice(0, 200));
check('customer: opening the portal alone does NOT issue QR tokens (no my_ticket_qr call)', qrBodies.length === 0);
const openPass = (ref) => cp.evaluate((r) => { const els = [...document.querySelectorAll('div')].filter((d) => d.innerText.includes(r) && d.className.includes('rounded-2xl')); const c = els[els.length - 1]; const b = c && [...c.querySelectorAll('button')].find((x) => /boarding pass/i.test(x.innerText)); if (!b) return false; b.click(); return true; }, ref);
check('customer: boarding pass opens', await openPass(b1.reference));
await cp.waitForSelector('[data-testid=ticket-qr]', { timeout: 10000 }).catch(() => {});
const view = await text(cp);
check('customer: a real QR image is rendered', !!(await cp.$('[data-testid=ticket-qr]')));
check('customer: both tickets are selectable (Pass 1 / Pass 2)', /Pass 1/.test(view) && /Pass 2/.test(view), view.slice(0, 300));
check('customer: the raw token text is never printed on the page', !/MALAKY:TICKET/.test(view) && !(await cp.evaluate(() => document.documentElement.innerHTML.includes('MALAKY:TICKET'))));
check('customer: server issued exactly the payloads for 2 tickets, format ok, nothing in localStorage', qrBodies.length === 1 && qrBodies[0].length === 2 && qrBodies[0].every((x) => /^MALAKY:TICKET:[A-Za-z0-9_-]{64}$/.test(x.qr_payload)) && (await cp.evaluate(() => JSON.stringify(localStorage) + JSON.stringify(sessionStorage))).indexOf('MALAKY:TICKET') < 0);
await snap(cp, 'customer-ticket');
const tokens1 = qrBodies[0].map((x) => x.qr_payload);

// ---------- 2. driver: mobile page ----------
const d1s = await staffLogin('drv-e2e1@e2e.test');
check('driver: sign-in lands on /driver (not the staff dashboard)', new URL(d1s.p.url()).pathname === '/driver', d1s.p.url());
await d1s.p.setViewport({ width: 390, height: 844 });
await waitText(d1s.p, /Boarding progress|Expected/, 10000); await sleep(800);
let dt = await text(d1s.p);
check('driver: sees only own trip, with 2 expected / 0 boarded / 2 remaining', /Expected\s*\n?2/.test(dt) && (await d1s.p.$eval('[data-testid=stat-boarded]', (e) => e.textContent)) === '0' && (await d1s.p.$$eval('select option', (o) => o.length)) === 1, dt.slice(0, 300));
check('driver: no horizontal scroll on a 390px phone', await d1s.p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
const scan = async (p, code) => { await typeInto(p, '#manual-code', code); await clickText(p, 'Board passenger', { sel: 'button[type=submit]' }); await sleep(1200); return p.$eval('[data-testid=scan-outcome]', (e) => e.innerText).catch(() => ''); };
let out = await scan(d1s.p, 'garbage');
check('driver: invalid code rejected with a clear message', /Invalid ticket/.test(out), out);
out = await scan(d1s.p, tokens1[0]);
check('driver: valid ticket boards', /Boarded: ticket 1/.test(out), out);
check('driver: stats move to 2 / 1 / 1', (await d1s.p.$eval('[data-testid=stat-boarded]', (e) => e.textContent)) === '1' && (await d1s.p.$eval('[data-testid=stat-remaining]', (e) => e.textContent)) === '1');
out = await scan(d1s.p, tokens1[0]);
check('driver: duplicate scan says "Already boarded" and does not count twice', /Already boarded/.test(out) && (await d1s.p.$eval('[data-testid=stat-boarded]', (e) => e.textContent)) === '1', out);
check('db: one boarding event for the ticket, with driver, user and trip', sql(`select count(*) from boarding_events where trip_id = '${T(995)}' and driver_id = '${T(981)}' and user_id = '${d1}'`) === '1');
const wrong = await rpc(await L.tokenFor('tix-carol@e2e.test', PW), 'my_ticket_qr', { p_booking_id: b2.id });
out = await scan(d1s.p, wrong.body[0].qr_payload);
check('driver: another driver\'s ticket (other trip) is refused', /different trip/.test(out), out);
check('db: refused scan boarded nothing', sql(`select count(*) from tickets where booking_id = '${b2.id}' and status = 'boarded'`) === '0');
// cancel the booking: the remaining ticket must stop working
const cancel = await rpc(await L.tokenFor('tix-carol@e2e.test', PW), 'cancel_my_booking', { p_booking_id: b1.id });
check('customer cancel: refused (90 min out is inside the 24h window, and boarding has already opened)', cancel.status >= 400 && cancel.body?.code === '23514', JSON.stringify(cancel.body));
sql(`update bookings set status = 'cancelled', cancelled_at = now() where id = '${b1.id}'`); // an operator cancels (same trigger path as every other cancel)
out = await scan(d1s.p, tokens1[1]);
check('driver: cancelled ticket is refused', /cancelled/i.test(out), out);
check('db: voided tickets, boarded one stays boarded', sql(`select string_agg(status, ',' order by ticket_index) from tickets where booking_id = '${b1.id}'`) === 'boarded,void');
await snap(d1s.p, 'driver-after');

// ---------- 3. authorization in the browser ----------
const d2s = await staffLogin('drv-e2e2@e2e.test');
await waitText(d2s.p, /Expected|No trips/, 10000); await sleep(600);
const d2opts = await d2s.p.$$eval('select option', (o) => o.map((x) => x.value));
check('driver 2: sees only their own trip', d2opts.length === 1 && d2opts[0] === T(996), JSON.stringify(d2opts));
const d2tok = await L.tokenFor('drv-e2e2@e2e.test', PW);
const steal = await rpc(d2tok, 'board_ticket', { p_trip_id: T(995), p_token: tokens1[1] });
check('driver 2: cannot board on driver 1\'s trip by calling the RPC directly (neutral "trip not found")', steal.body?.code === 'P0002' && steal.body?.message === 'trip not found', JSON.stringify(steal.body));
const cust = await rpc(await L.tokenFor('tix-carol@e2e.test', PW), 'board_ticket', { p_trip_id: T(995), p_token: tokens1[1] });
check('customer: cannot board by calling the RPC', cust.body?.code === 'P0002', JSON.stringify(cust.body));
const cctx2 = await browser.createBrowserContext(); const anon = await L.newPage(cctx2);
await anon.goto(L.BASE + '/driver', { waitUntil: 'domcontentloaded' }); await sleep(1500);
check('anonymous: /driver redirects to sign-in', new URL(anon.url()).pathname === '/company/login', anon.url());
// a customer account (no membership) must not reach the driver page
const cust2 = await browser.createBrowserContext(); const cpg = await L.newPage(cust2);
await cpg.goto(L.BASE + '/company/login', { waitUntil: 'domcontentloaded' });
await typeInto(cpg, 'input[name=email]', 'tix-carol@e2e.test'); await typeInto(cpg, 'input[name=password]', PW);
await clickText(cpg, 'Sign in', { sel: 'button[type=submit]' }); await sleep(3000);
await cpg.goto(L.BASE + '/driver', { waitUntil: 'domcontentloaded' }); await sleep(1500);
check('customer account: /driver does not render the boarding page', new URL(cpg.url()).pathname !== '/driver' && !/Boarding progress/.test(await text(cpg)), cpg.url());
// revoked driver: existing session, next scan refused
sql(`update drivers set status = 'inactive' where id = '${T(982)}'`);
out = await scan(d2s.p, (await rpc(await L.tokenFor('tix-carol@e2e.test', PW), 'my_ticket_qr', { p_booking_id: b2.id })).body[0].qr_payload);
check('revoked driver: live session is refused on the next scan', /not assigned to you/.test(out), out);
check('db: nothing boarded for trip 996', sql(`select count(*) from tickets where trip_id = '${T(996)}' and status = 'boarded'`) === '0');
check('no uncaught page errors (driver 1, customer)', d1s.p.errors.length === 0 && cp.errors.length === 0, JSON.stringify([d1s.p.errors, cp.errors]));
await browser.close();
process.exit(L.summary() ? 0 : 1);
