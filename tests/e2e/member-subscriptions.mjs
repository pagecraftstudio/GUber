// Member side of route subscriptions in a real browser (/my-subscriptions, plans, book).
// Production build, local PostgreSQL + PostgREST, GoTrue-compatible STUB. Run: bash tests/e2e/run-e2e.sh member-subscriptions.mjs
import * as L from './lib.mjs';
const { check, sleep, text, typeInto, sql } = L;
const PW = 'Passw0rd!x';
const A = L.T(101);
const base = L.BASE;
const ownerEmail = 'msub-owner@e2e.test', memberEmail = 'msub-member@e2e.test', otherEmail = 'msub-other@e2e.test';
for (const [email, name] of [[ownerEmail, 'MSub Owner'], [memberEmail, 'MSub Member'], [otherEmail, 'MSub Other']]) {
  await fetch(L.STUB + '/auth/v1/signup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: PW, data: { full_name: name } }) });
  await L.confirmEmail(email);
}
sql(`update profiles set phone = '+201070000081' where email = '${memberEmail}'`);
sql(`update profiles set phone = '+201070000082' where email = '${otherEmail}'`);
const ownerId = sql(`select id from auth.users where email = '${ownerEmail}'`);
sql(`insert into company_users (company_id, user_id, role_id) select '${A}', '${ownerId}', r.id from roles r where r.key = 'owner'`);
sql(`update plan_entitlements set int_value = null where key in ('max_route_plans','max_routes') and plan_id = (select id from plans where code = (select p.code from subscriptions s join plans p on p.id = s.plan_id where s.company_id = '${A}' limit 1))`);
sql(`update company_settings set booking_enabled = true where company_id = '${A}'`);
const ownerTok = await L.tokenFor(ownerEmail, PW);
const pair = await L.rpc(ownerTok, 'create_route_pair', { p_name: 'MSub-Go', p_code: 'MSG', p_origin: 'Cairo', p_destination: 'Galala', p_description: null,
  p_stops: [{ name: 'M1', offsetMinutes: 0, stopType: 'pickup' }, { name: 'M2', offsetMinutes: 60, stopType: 'dropoff' }], p_return: { sameAsReverse: true } });
check('owner created a route pair', pair.status < 300, JSON.stringify(pair.body));
const goRoute = sql(`select id from routes where company_id = '${A}' and name = 'MSub-Go' order by created_at desc limit 1`);
const retRoute = sql(`select id from routes where company_id = '${A}' and name = 'MSub-Go (return)' order by created_at desc limit 1`);
sql(`insert into buses (company_id, plate_number, capacity) values ('${A}', 'MSUB-1', 30)`);
sql(`insert into drivers (company_id, full_name, phone) values ('${A}', 'MSub Driver', '+201300000091')`);
const bus = sql(`select id from buses where plate_number = 'MSUB-1'`), drv = sql(`select id from drivers where full_name = 'MSub Driver'`);
const day = sql(`select (current_date + 3)::text`);
const trip = (route, h1, h2) => sql(`insert into trips (company_id, route_id, bus_id, driver_id, departure_at, arrival_at, price, capacity, status) values ('${A}', '${route}', '${bus}', '${drv}', '${day} ${h1}:00+00', '${day} ${h2}:00+00', 50, 5, 'scheduled') returning id`).split('\n')[0];
const goTrip = trip(goRoute, '08', '09'); const retTrip = trip(retRoute, '15', '16');
const plan = await L.rpc(ownerTok, 'create_route_plan', { p_route_id: goRoute, p_name: 'MSub Monthly', p_price: 700, p_validity_type: 'duration', p_duration_months: 1 });
check('owner created a plan', plan.status < 300, JSON.stringify(plan.body));

const browser = await L.launch();
const login = async (email) => { const ctx = await browser.createBrowserContext(); const p = await L.newPage(ctx); await p.setViewport({ width: 1100, height: 1000 });
  await p.goto(base + '/login', { waitUntil: 'domcontentloaded', timeout: 60000 }); await typeInto(p, 'input[type=email]', email); await typeInto(p, 'input[type=password]', PW);
  await p.keyboard.press('Enter'); await sleep(3500); return p; };
const go = async (p, path) => { await p.goto(base + path, { waitUntil: 'domcontentloaded', timeout: 60000 }); await sleep(1200); return text(p); };
const clickBtn = (p, re) => p.evaluate((src) => { const r = new RegExp(src); const b = [...document.querySelectorAll('button,a')].find((x) => r.test(x.textContent.trim())); if (b) b.click(); return !!b; }, re.source);

const m = await login(memberEmail);
let t = await go(m, '/my-subscriptions');
const masar = sql(`select masar_id from profiles where email = '${memberEmail}'`);
check('member sees own MASAR ID and the empty state', t.includes(masar) && /No subscriptions yet/.test(t), t.slice(0, 200));

// request from the plans page
t = await go(m, '/my-subscriptions/plans');
check('plans page lists the plan with its price', /MSub Monthly/.test(t) && /700/.test(t));
await clickBtn(m, /^Request this plan$/); await sleep(2000);
check('request stored as pending for this member', sql(`select count(*) from route_subscriptions where plan_id = '${plan.body}' and status = 'pending' and masar_id = '${masar}'`) === '1');
t = await go(m, '/my-subscriptions');
check('my subscriptions shows the pending request', /MSub Monthly/.test(t) && /Pending/.test(t));

// owner approves
const subId = sql(`select id from route_subscriptions where plan_id = '${plan.body}'`);
const ap = await L.rpc(ownerTok, 'decide_route_subscription', { p_id: subId, p_approve: true, p_note: null });
check('owner approved', ap.status < 300, JSON.stringify(ap.body));
t = await go(m, '/my-subscriptions');
check('subscription is active with a Book a trip button', /Active/.test(t) && /Book a trip/.test(t));

// booking: go + return
t = await go(m, `/my-subscriptions/${subId}/book`);
await m.evaluate((d) => { const el = document.querySelector('input[type=date]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, d); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, day);
await clickBtn(m, /^Show trips$/); await sleep(2000);
await m.select('select', goTrip); await sleep(500);
await clickBtn(m, /^Yes, book my return too$/); await sleep(2000);
const selects = await m.$$('select'); check('return trip picker appears', selects.length === 2);
await selects[1].select(retTrip); await sleep(300);
await m.screenshot({ path: '/tmp/e2e/shots/member-book.png', fullPage: true });
await clickBtn(m, /^Confirm booking$/); await sleep(2500);
check('booked page shown', /Your seat is reserved/.test(await text(m)));
check('two subscriber bookings, price 0, paid, one group', sql(`select count(*) from bookings where subscription_id = '${subId}' and total_amount = 0 and payment_status = 'paid' and status <> 'cancelled' and round_trip_group_id is not null`) === '2');
t = await go(m, '/my-subscriptions');
check('list shows both legs', /Go/.test(t) && /Return/.test(t));
await m.screenshot({ path: '/tmp/e2e/shots/member-subs.png', fullPage: true });

// second booking the same day is refused by the UI state
t = await go(m, `/my-subscriptions/${subId}/book`);
await m.evaluate((d) => { const el = document.querySelector('input[type=date]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, d); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, day);
await clickBtn(m, /^Show trips$/); await sleep(2000);
check('day already booked is explained', /already have both seats/.test(await text(m)));

// cancel one leg cancels both
await go(m, '/my-subscriptions');
await clickBtn(m, /^Cancel trip$/); await sleep(2500);
check('cancelling one leg cancelled both', sql(`select count(*) from bookings where subscription_id = '${subId}' and status = 'cancelled'`) === '2');

// isolation: another member cannot open the booking page nor see the subscription
const o = await login(otherEmail);
t = await go(o, `/my-subscriptions/${subId}/book`);
check("another member gets 404 on someone else's subscription", /could not be found|404/i.test(t));
t = await go(o, '/my-subscriptions');
check('another member sees no foreign subscription', !/MSub Monthly/.test(t) && !t.includes(masar));
// anonymous is sent to login
const anon = await (await browser.createBrowserContext()).newPage();
await anon.goto(base + '/my-subscriptions', { waitUntil: 'domcontentloaded', timeout: 60000 }); await sleep(1500);
check('anonymous is redirected to login', new URL(anon.url()).pathname.startsWith('/login'), anon.url());

await browser.close();
process.exit(L.summary() ? 0 : 1);
