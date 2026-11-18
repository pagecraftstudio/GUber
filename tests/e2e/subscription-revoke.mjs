// Route subscriptions Phase E1 in a real browser: staff revoke with a per-booking choice (dashboard), member sees Revoked, expiry + Renew.
// Production build, local PostgreSQL + PostgREST, GoTrue-compatible STUB. Run: bash tests/e2e/run-e2e.sh subscription-revoke.mjs
import * as L from './lib.mjs';
const { check, sleep, text, typeInto, clickText, sql } = L;
const PW = 'Passw0rd!x';
const A = L.T(101);
const mk = async (email, name) => { await fetch(L.STUB + '/auth/v1/signup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: PW, data: { full_name: name } }) }); await L.confirmEmail(email); };
const ownerE = 'rv-owner@e2e.test', memberE = 'rv-member@e2e.test', member2E = 'rv-member2@e2e.test';
await mk(ownerE, 'RV Owner'); await mk(memberE, 'Rana Revoked'); await mk(member2E, 'Eman Expired');
sql(`update profiles set phone = '+201070000093' where email = '${memberE}'`);
sql(`update profiles set phone = '+201070000094' where email = '${member2E}'`);
const uid = (e) => sql(`select id from auth.users where email = '${e}'`);
sql(`insert into company_users (company_id, user_id, role_id) select '${A}', '${uid(ownerE)}', r.id from roles r where r.key = 'owner'`);
sql(`update plan_entitlements set int_value = null where key in ('max_route_plans','max_routes','max_buses','max_drivers','max_users') and plan_id = (select p.id from subscriptions s join plans p on p.id = s.plan_id where s.company_id = '${A}' limit 1)`);
const ownerTok = await L.tokenFor(ownerE, PW), memberTok = await L.tokenFor(memberE, PW), member2Tok = await L.tokenFor(member2E, PW);
const pair = await L.rpc(ownerTok, 'create_route_pair', { p_name: 'RV-Go', p_code: 'RVG', p_origin: 'Cairo', p_destination: 'Galala', p_description: null,
  p_stops: [{ name: 'R1', offsetMinutes: 0, stopType: 'pickup' }, { name: 'R2', offsetMinutes: 60, stopType: 'dropoff' }], p_return: { sameAsReverse: true } });
check('owner created a route pair', pair.status < 300, JSON.stringify(pair.body));
const go = sql(`select id from routes where company_id = '${A}' and name = 'RV-Go' order by created_at desc limit 1`);
const back = sql(`select id from routes where company_id = '${A}' and name = 'RV-Go (return)' order by created_at desc limit 1`);
sql(`insert into buses (company_id, plate_number, capacity) values ('${A}', 'RV-1', 30)`);
sql(`insert into drivers (company_id, full_name, phone) values ('${A}', 'RV Driver', '+201300000095')`);
const bus = sql(`select id from buses where plate_number = 'RV-1'`), drv = sql(`select id from drivers where full_name = 'RV Driver'`);
const mkTrip = (route, a, b) => sql(`insert into trips (company_id, route_id, bus_id, driver_id, departure_at, arrival_at, price, capacity, status) values ('${A}', '${route}', '${bus}', '${drv}', date_trunc('day', now()) + interval '${a}', date_trunc('day', now()) + interval '${b}', 50, 5, 'scheduled') returning id`).split('\n')[0];
const goTrip = mkTrip(go, '10 day 6 hours', '10 day 7 hours'), retTrip = mkTrip(back, '10 day 12 hours', '10 day 13 hours');
const plan = await L.rpc(ownerTok, 'create_route_plan', { p_route_id: go, p_name: 'RV Monthly', p_price: 500, p_validity_type: 'duration', p_duration_months: 1 });
for (const tok of [memberTok, member2Tok]) await L.rpc(tok, 'request_route_subscription', { p_plan_id: plan.body });
const subOf = (e) => sql(`select id from route_subscriptions where plan_id = '${plan.body}' and user_id = '${uid(e)}'`);
for (const e of [memberE, member2E]) await L.rpc(ownerTok, 'decide_route_subscription', { p_id: subOf(e), p_approve: true, p_note: null });
const bk = await L.rpc(memberTok, 'create_my_subscriber_booking', { p_subscription_id: subOf(memberE), p_outbound_trip_id: goTrip, p_return_trip_id: retTrip });
check('member booked go + return', bk.status < 300, JSON.stringify(bk.body));
const sub1 = subOf(memberE);

const browser = await L.launch();
const login = async (path, email) => { const ctx = await browser.createBrowserContext(); const p = await L.newPage(ctx); await p.setViewport({ width: 1200, height: 1000 });
  await p.goto(L.BASE + path, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await typeInto(p, path === '/login' ? 'input[type=email]' : 'input[name=email]', email); await typeInto(p, path === '/login' ? 'input[type=password]' : 'input[name=password]', PW);
  await p.keyboard.press('Enter'); await sleep(3500); return p; };

// ---- staff: revoke, keep the return leg ----
const o = await login('/company/login', ownerE);
await o.goto(L.BASE + '/dashboard/subscriptions?status=active', { waitUntil: 'domcontentloaded', timeout: 60000 }); await sleep(1500);
let t = await text(o);
check('inbox lists both active members', /Rana Revoked/.test(t) && /Eman Expired/.test(t));
await o.evaluate(() => [...document.querySelectorAll('table button')].find((b) => b.getAttribute('aria-label') === 'Revoke Rana Revoked').click()); await sleep(2500);
const dlgText = await o.$eval('table dialog[open]', (e) => e.innerText);
check('the dialog warns with both booked trips and their references', /Cairo → Galala/.test(dlgText) && /Galala → Cairo/.test(dlgText) && /2 will be cancelled/.test(dlgText), dlgText.slice(0, 300));
// untick the return leg (the second checkbox): it stays booked
await o.evaluate(() => document.querySelectorAll('table dialog[open] input[type=checkbox]')[1].click()); await sleep(400);
check('unticking updates the count', /1 will be cancelled/.test(await o.$eval('table dialog[open]', (e) => e.innerText)));
await o.screenshot({ path: '/tmp/e2e/shots/revoke-dialog.png', fullPage: true });
await o.evaluate(() => [...document.querySelectorAll('table dialog[open] button')].find((b) => b.innerText.trim() === 'Revoke subscription').click()); await sleep(3000);
check('db: subscription revoked with the actor recorded', sql(`select status || ':' || (revoked_by is not null)::text from route_subscriptions where id = '${sub1}'`) === 'revoked:true');
check('db: exactly the go booking was cancelled, the return one is kept', sql(`select string_agg((t.route_id = '${go}')::text || ':' || b.status, ',') from bookings b join trips t on t.id = b.trip_id where b.subscription_id = '${sub1}'`).split(',').sort().join() === 'false:confirmed,true:cancelled');
check('db: the freed seat is released, the kept one is held', sql(`select seats_booked::text from trips where id = '${goTrip}'`) === '0' && sql(`select seats_booked::text from trips where id = '${retTrip}'`) === '1');
t = await text(o);
await o.goto(L.BASE + '/dashboard/subscriptions?status=closed', { waitUntil: 'domcontentloaded', timeout: 60000 }); await sleep(1500);
check('closed filter now shows the revoked row with a Revoked badge', /Rana Revoked/.test(await text(o)) && /Revoked/.test(await text(o)));

// ---- member: sees revoked ----
const m = await login('/login', memberE);
await m.goto(L.BASE + '/my-subscriptions', { waitUntil: 'domcontentloaded', timeout: 60000 }); await sleep(1500);
t = await text(m);
check('member sees Revoked and the explanation, no Book button', /Revoked/.test(t) && /ended by the company/.test(t) && !/Book a trip/.test(t), t.slice(0, 300));

// ---- expiry + renew ----
const sub2 = subOf(member2E);
sql(`update route_subscriptions set valid_from = current_date - 40, valid_to = current_date - 1 where id = '${sub2}'`);
sql(`select app_private.expire_route_subscriptions()`);
check('db: the job expired the lapsed row only', sql(`select status from route_subscriptions where id = '${sub2}'`) === 'expired' && sql(`select status from route_subscriptions where id = '${sub1}'`) === 'revoked');
const m2 = await login('/login', member2E);
await m2.goto(L.BASE + '/my-subscriptions', { waitUntil: 'domcontentloaded', timeout: 60000 }); await sleep(1500);
check('member sees Expired with a Renew button', /Expired/.test(await text(m2)) && /Renew/.test(await text(m2)));
await clickText(m2, 'Renew'); await sleep(2500);
check('renew created a new pending request for the same plan', sql(`select count(*) from route_subscriptions where plan_id = '${plan.body}' and user_id = '${uid(member2E)}' and status = 'pending'`) === '1');

await browser.close();
process.exit(L.summary() ? 0 : 1);
