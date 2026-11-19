// Route subscriptions Phase E3 in a real browser: expiry notice (member), Renew now, staff "Expiring soon" tab with the WhatsApp link, renewal approval.
// Production build, local PostgreSQL + PostgREST, GoTrue-compatible STUB. Run: bash tests/e2e/run-e2e.sh subscription-renewal.mjs
import * as L from './lib.mjs';
const { check, sleep, text, typeInto, sql } = L;
const PW = 'Passw0rd!x';
const A = L.T(101);
const mk = async (email, name) => { await fetch(L.STUB + '/auth/v1/signup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: PW, data: { full_name: name } }) }); await L.confirmEmail(email); };
const ownerE = 'rn-owner@e2e.test', memberE = 'rn-member@e2e.test';
await mk(ownerE, 'RN Owner'); await mk(memberE, 'Reem Renewer');
sql(`update profiles set phone = '+201070000099', locale = 'en' where email = '${memberE}'`);
const uid = (e) => sql(`select id from auth.users where email = '${e}'`);
sql(`insert into company_users (company_id, user_id, role_id) select '${A}', '${uid(ownerE)}', r.id from roles r where r.key = 'owner'`);
sql(`update plan_entitlements set int_value = null where key in ('max_route_plans','max_routes','max_buses','max_drivers','max_users') and plan_id = (select p.id from subscriptions s join plans p on p.id = s.plan_id where s.company_id = '${A}' limit 1)`);
const ownerTok = await L.tokenFor(ownerE, PW);
const pair = await L.rpc(ownerTok, 'create_route_pair', { p_name: 'RN-Go', p_code: 'RNG', p_origin: 'Cairo', p_destination: 'Galala', p_description: null,
  p_stops: [{ name: 'N1', offsetMinutes: 0, stopType: 'pickup' }, { name: 'N2', offsetMinutes: 60, stopType: 'dropoff' }], p_return: { sameAsReverse: true } });
check('owner created a route pair', pair.status < 300, JSON.stringify(pair.body));
const go = sql(`select id from routes where company_id = '${A}' and name = 'RN-Go' order by created_at desc limit 1`);
const plan = await L.rpc(ownerTok, 'create_route_plan', { p_route_id: go, p_name: 'RN Monthly', p_price: 450, p_validity_type: 'duration', p_duration_months: 1 });
const memberTok = await L.tokenFor(memberE, PW);
await L.rpc(memberTok, 'request_route_subscription', { p_plan_id: plan.body });
const sub = sql(`select id from route_subscriptions where plan_id = '${plan.body}' and user_id = '${uid(memberE)}'`);
await L.rpc(ownerTok, 'decide_route_subscription', { p_id: sub, p_approve: true, p_note: null });
sql(`update route_subscriptions set valid_from = current_date - 25, valid_to = current_date + 4 where id = '${sub}'`);
const n = sql(`select app_private.notify_expiring_subscriptions()`);
check('the nightly job wrote at least one notice', Number(n) >= 1, n);
check('exactly one notice for this subscription, unread', sql(`select count(*) from notifications where related_entity_id = '${sub}' and status <> 'read'`) === '1');

const browser = await L.launch();
const loginAt = async (path, email, emailSel, pwSel) => { const ctx = await browser.createBrowserContext(); const p = await L.newPage(ctx); await p.setViewport({ width: 1200, height: 1000 });
  await p.goto(L.BASE + path, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await typeInto(p, emailSel, email); await typeInto(p, pwSel, PW); await p.keyboard.press('Enter'); await sleep(3500); return p; };
const clickBtn = (p, re) => p.evaluate((src) => { const r = new RegExp(src); const b = [...document.querySelectorAll('button,a')].find((x) => r.test(x.textContent.trim())); if (b) b.click(); return !!b; }, re.source);

// ---- member ----
const m = await loginAt('/login', memberE, 'input[type=email]', 'input[type=password]');
await m.goto(L.BASE + '/my-subscriptions', { waitUntil: 'domcontentloaded', timeout: 60000 }); await sleep(1500);
let t = await text(m);
check('member sees the notice, marked New, naming the plan', /Notices/.test(t) && /Your subscription ends soon/.test(t) && /RN Monthly/.test(t) && /New/.test(t));
check('member sees Renew now with the explanation', /Renew now/.test(t) && /starts after the current one ends/.test(t));
await m.screenshot({ path: '/tmp/e2e/shots/renewal-member.png', fullPage: true });
await clickBtn(m, /^Mark all as read$/); await sleep(2000);
check('db: the notice is read', sql(`select status from notifications where related_entity_id = '${sub}'`) === 'read');
await clickBtn(m, /^Renew now$/); await sleep(2500);
check('db: a pending renewal for the same plan exists', sql(`select count(*) from route_subscriptions where plan_id = '${plan.body}' and user_id = '${uid(memberE)}' and status = 'pending'`) === '1');
t = await text(m);
check('member sees the renewal is waiting and Renew now is gone', /Renewal requested/.test(t) && !/Renew now/.test(t));

// ---- staff ----
const o = await loginAt('/company/login', ownerE, 'input[name=email]', 'input[name=password]');
await o.goto(L.BASE + '/dashboard/subscriptions?status=expiring', { waitUntil: 'domcontentloaded', timeout: 60000 }); await sleep(2000);
t = await text(o);
check('Expiring soon lists the member with days left and the renewal as requested', /Reem Renewer/.test(t) && /4 days left/.test(t) && /Requested/.test(t));
const href = await o.evaluate(() => (document.querySelector('table a[href^="https://wa.me/"]') || {}).href || '');
check('the WhatsApp link targets the member phone with the ready message', href.startsWith('https://wa.me/201070000099?text=') && decodeURIComponent(href).includes('Hello Reem Renewer') && decodeURIComponent(href).includes('RN Monthly'), href.slice(0, 120));
await o.screenshot({ path: '/tmp/e2e/shots/renewal-expiring.png', fullPage: true });

// approve the renewal: it starts the day after the old period ends
const ren = sql(`select id from route_subscriptions where plan_id = '${plan.body}' and status = 'pending'`);
const ap = await L.rpc(ownerTok, 'decide_route_subscription', { p_id: ren, p_approve: true, p_note: null });
check('owner approved the renewal', ap.status < 300, JSON.stringify(ap.body));
check('db: renewal starts the day after the old one ends', sql(`select (valid_from = (select valid_to + 1 from route_subscriptions where id = '${sub}'))::text from route_subscriptions where id = '${ren}'`) === 'true');
await o.goto(L.BASE + '/dashboard/subscriptions?status=expiring', { waitUntil: 'domcontentloaded', timeout: 60000 }); await sleep(1800);
check('a renewed subscription leaves the Expiring soon list', !/Reem Renewer/.test(await text(o)));

await browser.close();
process.exit(L.summary() ? 0 : 1);
