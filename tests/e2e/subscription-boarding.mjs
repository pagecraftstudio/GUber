// Route subscriptions Phase D in a real browser: the driver boards a subscriber by QR token and by MASAR ID on /driver.
// Production build, local PostgreSQL + PostgREST, GoTrue-compatible STUB. Run: bash tests/e2e/run-e2e.sh subscription-boarding.mjs
import * as L from './lib.mjs';
const { check, sleep, text, typeInto, clickText, sql } = L;
const PW = 'Passw0rd!x';
const A = L.T(101);
const mk = async (email, name, phone) => { await fetch(L.STUB + '/auth/v1/signup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: PW, data: { full_name: name, phone } }) }); await L.confirmEmail(email); };
const ownerE = 'sb-owner@e2e.test', memberE = 'sb-member@e2e.test', drvE = 'sb-driver@e2e.test';
await mk(ownerE, 'SB Owner'); await mk(memberE, 'Mona Subscriber'); await mk(drvE, 'SB Driver');
sql(`update profiles set phone = '+201070000091' where email = '${memberE}'`);
const uid = (e) => sql(`select id from auth.users where email = '${e}'`);
sql(`insert into company_users (company_id, user_id, role_id) select '${A}', '${uid(ownerE)}', r.id from roles r where r.key = 'owner'`);
sql(`insert into company_users (company_id, user_id, role_id) select '${A}', '${uid(drvE)}', r.id from roles r where r.key = 'driver'`);
sql(`update plan_entitlements set int_value = null where key in ('max_route_plans','max_routes','max_buses','max_drivers','max_users') and plan_id = (select p.id from subscriptions s join plans p on p.id = s.plan_id where s.company_id = '${A}' limit 1)`);
const ownerTok = await L.tokenFor(ownerE, PW), memberTok = await L.tokenFor(memberE, PW);
const pair = await L.rpc(ownerTok, 'create_route_pair', { p_name: 'SB-Go', p_code: 'SBG', p_origin: 'Cairo', p_destination: 'Galala', p_description: null,
  p_stops: [{ name: 'S1', offsetMinutes: 0, stopType: 'pickup' }, { name: 'S2', offsetMinutes: 60, stopType: 'dropoff' }], p_return: { sameAsReverse: true } });
check('owner created a route pair', pair.status < 300, JSON.stringify(pair.body));
const go = sql(`select id from routes where company_id = '${A}' and name = 'SB-Go' order by created_at desc limit 1`);
const back = sql(`select id from routes where company_id = '${A}' and name = 'SB-Go (return)' order by created_at desc limit 1`);
sql(`insert into buses (company_id, plate_number, capacity) values ('${A}', 'SB-1', 30)`);
sql(`insert into drivers (company_id, user_id, full_name, phone) values ('${A}', '${uid(drvE)}', 'SB Driver', '+201300000092')`);
const bus = sql(`select id from buses where plate_number = 'SB-1'`), drv = sql(`select id from drivers where full_name = 'SB Driver'`);
const mkTrip = (route, a, b) => sql(`insert into trips (company_id, route_id, bus_id, driver_id, departure_at, arrival_at, price, capacity, status) values ('${A}', '${route}', '${bus}', '${drv}', date_trunc('day', now()) + interval '${a}', date_trunc('day', now()) + interval '${b}', 50, 5, 'scheduled') returning id`).split('\n')[0];
const goTrip = mkTrip(go, '20 day 6 hours', '20 day 7 hours'), retTrip = mkTrip(back, '20 day 12 hours', '20 day 13 hours');
const plan = await L.rpc(ownerTok, 'create_route_plan', { p_route_id: go, p_name: 'SB Monthly', p_price: 500, p_validity_type: 'duration', p_duration_months: 1 });
check('owner created a plan', plan.status < 300, JSON.stringify(plan.body));
const rq = await L.rpc(memberTok, 'request_route_subscription', { p_plan_id: plan.body });
const subId = sql(`select id from route_subscriptions where plan_id = '${plan.body}'`);
check('member requested', rq.status < 300, JSON.stringify(rq.body));
check('owner approved', (await L.rpc(ownerTok, 'decide_route_subscription', { p_id: subId, p_approve: true, p_note: null })).status < 300);
const bk = await L.rpc(memberTok, 'create_my_subscriber_booking', { p_subscription_id: subId, p_outbound_trip_id: goTrip, p_return_trip_id: retTrip });
check('member booked go + return', bk.status < 300, JSON.stringify(bk.body));
// move the booked trips next to "now" so boarding is open (booking needs trips far enough ahead)
sql(`update trips set departure_at = now() + interval '10 minutes', arrival_at = now() + interval '40 minutes' where id = '${goTrip}'`);
sql(`update trips set departure_at = now() + interval '90 minutes', arrival_at = now() + interval '150 minutes' where id = '${retTrip}'`);
const goBooking = sql(`select id from bookings where subscription_id = '${subId}' and trip_id = '${goTrip}'`);
const qr = await L.rpc(memberTok, 'my_ticket_qr', { p_booking_id: goBooking });
const token = qr.body?.[0]?.qr_payload;
check('member opens the ticket and gets a QR payload', /^MALAKY:TICKET:/.test(token || ''), JSON.stringify(qr.body));
const masar = sql(`select masar_id from profiles where email = '${memberE}'`);

const browser = await L.launch();
const ctx = await browser.createBrowserContext(); const d = await L.newPage(ctx);
await d.setViewport({ width: 390, height: 844 });
await d.goto(L.BASE + '/company/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
await typeInto(d, 'input[name=email]', drvE); await typeInto(d, 'input[name=password]', PW);
await clickText(d, 'Sign in', { sel: 'button[type=submit]' }); await sleep(3500);
check('driver lands on /driver', new URL(d.url()).pathname === '/driver', d.url());
await L.waitText(d, /Boarding progress|Expected/, 10000); await sleep(800);
d.on('response', async (r) => { if (/\/rpc\/(board_ticket|scan_route)/.test(r.url())) console.log('RPC', r.status(), (await r.text().catch(() => '')).slice(0, 160)); });
const pick = async (i) => { await d.evaluate((n) => document.querySelectorAll('section[aria-label="Assigned trips"] button')[n].click(), i); await sleep(800); };   // cards are ordered by departure: go (0), return (1)
// Enter submits the form (a pointer click can land on the outcome banner after a success shifts the layout)
const scan = async (code) => { await typeInto(d, '#manual-code', code); await d.keyboard.press('Enter'); await sleep(2500); return d.$eval('[data-testid=scan-outcome]', (e) => e.innerText).catch(() => ''); };

await pick(0);
let out = await scan(token);
check('QR boards the subscriber and names the member + direction', /Boarded: Mona Subscriber \(Subscriber, go\)/.test(out), out);
check('one go scan row recorded', sql(`select count(*) from route_subscription_scans where subscription_id = '${subId}' and direction = 'go'`) === '1');
out = await scan(token);
check('replaying the same QR is a warning, no second scan', /Already boarded/.test(out) && sql(`select count(*) from route_subscription_scans where subscription_id = '${subId}'`) === '1', out);

await pick(1);
out = await scan(masar.toLowerCase());
check('MASAR ID boards the return leg (fallback)', /Boarded: Mona Subscriber \(Subscriber, return\)/.test(out), out);
check('ticket boarded and a boarding event exists for the return leg', sql(`select count(*) from boarding_events e join tickets t on t.id = e.ticket_id where e.trip_id = '${retTrip}' and t.status = 'boarded'`) === '1');
out = await scan(masar);
check('scanning the MASAR ID again is refused with a clear message', /already travelled in this direction today/.test(out), out);
out = await scan('MSR-ZZZZ-ZZZZ');
check('an unknown MASAR ID is refused', /Invalid ticket|No active subscription/.test(out), out);
check('two scans in total, one per direction', sql(`select string_agg(direction, ',' order by direction) from route_subscription_scans where subscription_id = '${subId}'`) === 'go,return');
await d.screenshot({ path: '/tmp/e2e/shots/driver-subscriber.png', fullPage: true });

await browser.close();
process.exit(L.summary() ? 0 : 1);
