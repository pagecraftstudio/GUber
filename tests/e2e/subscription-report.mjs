// Route subscriptions Phase E2 in a real browser: the company report page (owner) and its permission gate (booking staff).
// Production build, local PostgreSQL + PostgREST, GoTrue-compatible STUB. Run: bash tests/e2e/run-e2e.sh subscription-report.mjs
import * as L from './lib.mjs';
const { check, sleep, text, typeInto, sql } = L;
const PW = 'Passw0rd!x';
const A = L.T(101);
const mk = async (email, name) => { await fetch(L.STUB + '/auth/v1/signup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: PW, data: { full_name: name } }) }); await L.confirmEmail(email); };
const ownerE = 'rp-owner@e2e.test', staffE = 'rp-staff@e2e.test', memberE = 'rp-member@e2e.test';
await mk(ownerE, 'RP Owner'); await mk(staffE, 'RP Staff'); await mk(memberE, 'Rita Report');
sql(`update profiles set phone = '+201070000097' where email = '${memberE}'`);
const uid = (e) => sql(`select id from auth.users where email = '${e}'`);
const role = (k) => sql(`select id from roles where key = '${k}'`);
sql(`insert into company_users (company_id, user_id, role_id) values ('${A}', '${uid(ownerE)}', '${role('owner')}')`);
sql(`insert into company_users (company_id, user_id, role_id) values ('${A}', '${uid(staffE)}', '${role('booking')}')`);
sql(`update plan_entitlements set int_value = null where key in ('max_route_plans','max_routes','max_buses','max_drivers','max_users') and plan_id = (select p.id from subscriptions s join plans p on p.id = s.plan_id where s.company_id = '${A}' limit 1)`);
const ownerTok = await L.tokenFor(ownerE, PW), memberTok = await L.tokenFor(memberE, PW);
const pair = await L.rpc(ownerTok, 'create_route_pair', { p_name: 'RP-Go', p_code: 'RPG', p_origin: 'Cairo', p_destination: 'Galala', p_description: null,
  p_stops: [{ name: 'P1', offsetMinutes: 0, stopType: 'pickup' }, { name: 'P2', offsetMinutes: 60, stopType: 'dropoff' }], p_return: { sameAsReverse: true } });
check('owner created a route pair', pair.status < 300, JSON.stringify(pair.body));
const go = sql(`select id from routes where company_id = '${A}' and name = 'RP-Go' order by created_at desc limit 1`);
sql(`insert into buses (company_id, plate_number, capacity) values ('${A}', 'RP-1', 30)`);
sql(`insert into drivers (company_id, full_name, phone) values ('${A}', 'RP Driver', '+201300000098')`);
const bus = sql(`select id from buses where plate_number = 'RP-1'`), drv = sql(`select id from drivers where full_name = 'RP Driver'`);
const goTrip = sql(`insert into trips (company_id, route_id, bus_id, driver_id, departure_at, arrival_at, price, capacity, status) values ('${A}', '${go}', '${bus}', '${drv}', date_trunc('hour', now()) + interval '3 day 6 hours', date_trunc('hour', now()) + interval '3 day 7 hours', 20, 30, 'scheduled') returning id`).split('\n')[0];
const plan = await L.rpc(ownerTok, 'create_route_plan', { p_route_id: go, p_name: 'RP Monthly', p_price: 500, p_validity_type: 'duration', p_duration_months: 1 });
await L.rpc(memberTok, 'request_route_subscription', { p_plan_id: plan.body });
const sub = sql(`select id from route_subscriptions where plan_id = '${plan.body}' and user_id = '${uid(memberE)}'`);
await L.rpc(ownerTok, 'decide_route_subscription', { p_id: sub, p_approve: true, p_note: null });
const bk = await L.rpc(memberTok, 'create_my_subscriber_booking', { p_subscription_id: sub, p_outbound_trip_id: goTrip, p_return_trip_id: null });
check('member booked the go trip', bk.status < 300, JSON.stringify(bk.body));

const browser = await L.launch();
const login = async (email) => { const ctx = await browser.createBrowserContext(); const p = await L.newPage(ctx); await p.setViewport({ width: 1200, height: 1000 });
  await p.goto(L.BASE + '/company/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await typeInto(p, 'input[name=email]', email); await typeInto(p, 'input[name=password]', PW);
  await p.keyboard.press('Enter'); await sleep(3500); return p; };

// ---- owner ----
const o = await login(ownerE);
await o.goto(L.BASE + '/dashboard/subscriptions', { waitUntil: 'domcontentloaded', timeout: 60000 }); await sleep(1500);
check('owner sees the Report link on the requests page', /Report/.test(await text(o)));
await o.goto(L.BASE + '/dashboard/subscriptions/report', { waitUntil: 'domcontentloaded', timeout: 60000 }); await sleep(2000);
let t = await text(o);
check('report page loads with its three sections and the definitions', /Subscription report/.test(t) && /By plan/.test(t) && /By day/.test(t) && /Next 7 days/.test(t) && /How these numbers are counted/.test(t));
check('the plan row shows 1 active and revenue for the approved subscription', /RP Monthly/.test(t) && /500/.test(t));
check('the booked trip appears in the next 7 days with its subscriber seat', /RP-Go\t[^\n]*\t29 \/ 30\t1\t0/.test(t));
await o.screenshot({ path: '/tmp/e2e/shots/subscription-report.png', fullPage: true });
await o.goto(L.BASE + '/dashboard/subscriptions/report?from=2026-12-31&to=2026-01-01', { waitUntil: 'domcontentloaded', timeout: 60000 }); await sleep(1500);
t = await text(o);
check('a reversed range shows the error and still renders the default report', /366 days/.test(t) && /By plan/.test(t));

// ---- booking staff: no analytics.read ----
const s = await login(staffE);
const resp = await s.goto(L.BASE + '/dashboard/subscriptions/report', { waitUntil: 'domcontentloaded', timeout: 60000 }); await sleep(1500);
t = await text(s);
check('booking staff cannot see the report', !/By plan/.test(t) && !/Revenue/.test(t));
await s.goto(L.BASE + '/dashboard/subscriptions', { waitUntil: 'domcontentloaded', timeout: 60000 }); await sleep(1500);
check('booking staff do not get the Report link', !/\bReport\b/.test(await text(s)));

await browser.close();
process.exit(L.summary() ? 0 : 1);
