// Subscription plans + request inbox in a real browser (/dashboard/plans, /dashboard/subscriptions).
// Production build (next start), real local PostgreSQL + PostgREST, GoTrue-compatible STUB (NOT live Supabase Auth).
// Run: bash tests/e2e/run-e2e.sh dashboard-subscriptions.mjs   (add SKIP_BUILD=1 when the build is current)
import * as L from './lib.mjs';
const { check, sleep, text, typeInto, sql } = L;
const PW = 'Passw0rd!x';
const A = L.T(101);
const base = L.BASE;
const ownerEmail = 'sub-owner-a@e2e.test';
const memberEmail = 'sub-member@e2e.test';
for (const [email, name, phone] of [[ownerEmail, 'Sub Owner', '01070000071'], [memberEmail, 'Sub Member', '01070000072']]) {
  await fetch(L.STUB + '/auth/v1/signup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: PW, data: { full_name: name, phone } }) });
  await L.confirmEmail(email);
}
sql(`update profiles set phone = '+201070000072' where email = '${memberEmail}'`);   // a request needs a valid phone on the profile (22023 otherwise)
const ownerId = sql(`select id from auth.users where email = '${ownerEmail}'`);
sql(`insert into company_users (company_id, user_id, role_id) select '${A}', '${ownerId}', r.id from roles r where r.key = 'owner'`);
sql(`insert into website_settings (company_id, is_published) values ('${A}', true) on conflict (company_id) do update set is_published = true`);
sql(`update company_settings set booking_enabled = true where company_id = '${A}'`);
sql(`update plan_entitlements set int_value = null where key = 'max_route_plans' and plan_id = (select id from plans where code = 'professional')`);
const routeId = sql(`select id from routes where company_id = '${A}' and deleted_at is null and is_active order by created_at limit 1`);
const routeName = sql(`select name from routes where id = '${routeId}'`);

const browser = await L.launch();
const ctx = await browser.createBrowserContext(); const p = await L.newPage(ctx);
await p.setViewport({ width: 1300, height: 1200 });
await p.goto(base + '/company/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
await typeInto(p, 'input[name=email]', ownerEmail); await typeInto(p, 'input[name=password]', PW);
await L.clickText(p, 'Sign in', { sel: 'button[type=submit]' });
await p.waitForFunction(() => location.pathname.startsWith('/dashboard'), { timeout: 20000 }).catch(() => {});
const go = async (path) => { await p.goto(base + path, { waitUntil: 'domcontentloaded', timeout: 60000 }); await sleep(900); };

// 1. create a plan from the form
await go('/dashboard/plans');
let t = await text(p);
check('plans page: title, empty state and the create form', /Subscription plans/.test(t) && /No plans yet/.test(t) && /Create plan/.test(t));
check('sidebar lists Plans and Requests', /Plans/.test(t) && /Requests/.test(t));
await p.select('select[name=routeId]', routeId);
await typeInto(p, 'input[name=name]', 'E2E Monthly');
await typeInto(p, 'input[name=price]', '900');
await typeInto(p, 'input[name=durationMonths]', '1');
await L.clickText(p, 'Create plan', { sel: 'button[type=submit]' });
await sleep(1800);
check('plan created in the database with the entered price and 1 month', sql(`select count(*) from route_plans where name = 'E2E Monthly' and price = 900 and validity_type = 'duration' and duration_months = 1 and route_id = '${routeId}' and company_id = '${A}'`) === '1');
await go('/dashboard/plans');
t = await text(p);
check('plan row shows name, route and validity', /E2E Monthly/.test(t) && t.includes(routeName) && /1 month from approval/.test(t));
await p.screenshot({ path: '/tmp/e2e/shots/plans.png', fullPage: true });

// 2. a date-range plan, and a bad one is refused
await p.select('select[name=validityType]', 'range'); await sleep(300);
await p.select('select[name=routeId]', routeId);
await typeInto(p, 'input[name=name]', 'E2E Term'); await typeInto(p, 'input[name=price]', '2500');
await p.evaluate(() => { const set = (n, v) => { const el = document.querySelector(`input[name=${n}]`); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }; set('startsOn', '2027-01-01'); set('endsOn', '2026-12-01'); });
await L.clickText(p, 'Create plan', { sel: 'button[type=submit]' }); await sleep(1500);
check('end before start: refused, nothing created', sql(`select count(*) from route_plans where name = 'E2E Term'`) === '0');
await p.evaluate(() => { const el = document.querySelector('input[name=endsOn]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '2027-06-01'); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); });
await L.clickText(p, 'Create plan', { sel: 'button[type=submit]' }); await sleep(1800);
check('range plan created with both dates', sql(`select count(*) from route_plans where name = 'E2E Term' and validity_type = 'range' and starts_on = '2027-01-01' and ends_on = '2027-06-01'`) === '1');

// 3. a member asks for the plan; the owner sees it and approves
const planId = sql(`select id from route_plans where name = 'E2E Monthly'`);
const memberTok = await L.tokenFor(memberEmail, PW);
const rq = await L.rpc(memberTok, 'request_route_subscription', { p_plan_id: planId });
check('member can request the plan', rq.status < 300, String(rq.status));
const subId = sql(`select id from route_subscriptions where plan_id = '${planId}'`);
await go('/dashboard/subscriptions');
t = await text(p);
check('inbox: pending request shows member, MASAR ID, plan and price', /Sub Member/.test(t) && /MSR-/.test(t) && /E2E Monthly/.test(t) && /Approve/.test(t) && /1 waiting for a decision/.test(t));
await p.screenshot({ path: '/tmp/e2e/shots/requests.png', fullPage: true });
await p.evaluate(() => [...document.querySelectorAll('button')].find((b) => /^Approve$/.test(b.textContent.trim())).click());
await sleep(500);
check('approve asks for confirmation first', /Approve this request\?/.test(await L.dialogText(p)));
await p.evaluate(() => { const d = document.querySelector('dialog[open]'); [...d.querySelectorAll('button')].find((b) => /^Approve$/.test(b.textContent.trim())).click(); });
await sleep(2000);
check('approved: active, dates set, paid', sql(`select status = 'active' and valid_from is not null and valid_to is not null and paid_at is not null from route_subscriptions where id = '${subId}'`) === 't');
await go('/dashboard/subscriptions?status=active');
check('Active filter lists the approved member', /Sub Member/.test(await text(p)));

// 4. isolation: a stranger token cannot decide or read
await fetch(L.STUB + '/auth/v1/signup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'sub-stranger@e2e.test', password: PW, data: { full_name: 'Stranger' } }) });
await L.confirmEmail('sub-stranger@e2e.test');
const strTok = await L.tokenFor('sub-stranger@e2e.test', PW);
const bad = await L.rpc(strTok, 'decide_route_subscription', { p_id: subId, p_approve: false, p_note: null });
check('a non-member cannot decide a request', bad.status >= 400 && sql(`select status from route_subscriptions where id = '${subId}'`) === 'active', String(bad.status));
const rd = await fetch(L.STUB + '/rest/v1/route_subscription_list?select=id', { headers: { authorization: `Bearer ${strTok}`, apikey: strTok } });
check('a non-member reads no inbox rows', rd.status < 300 && (await rd.json()).length === 0);

await browser.close();
process.exit(L.summary() ? 0 : 1);
