// M2 completion in a real browser: /dashboard/users (members, role change, suspend, invitations, plan-limit message),
// permission denial, tenant isolation of the member RPCs, atomic route creation, and an axe-core sweep.
// Production build (next start), real local PostgreSQL + PostgREST (RLS, RPCs), GoTrue-compatible STUB (NOT live Supabase Auth).
// Run: SKIP_BUILD=1 bash tests/e2e/run-e2e.sh dashboard-users.mjs 1
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

// ---------------- owner: members, allowance, invite ----------------
const owner = await login('u-owner-a@e2e.test');
const baseMembers = members();
setUsersLimit(baseMembers + 3);
await go(owner, '/dashboard/users'); let t = await text(owner);
check('users: owner sees members, roles and the invite form', /Team members/.test(t) && /U Manager A/.test(t) && /Invite a teammate/.test(t), t.slice(0, 300));
check('users: shows how much of the team allowance is used and what is left', new RegExp(`${baseMembers} of ${baseMembers + 3} team members used`).test(t) && /3 left on your plan/.test(t), t.slice(0, 400));
check('users: own row has no role/suspend controls (cannot change yourself)', /You cannot change your own role or status/.test(t));
check('users: nav shows the Team link for users.read', await owner.evaluate(() => !!document.querySelector('nav a[href="/dashboard/users"]')));
await axeScan(owner, 'users (owner)');

await typeInto(owner, 'input[name=email]', 'new-hire@e2e.test');
await pickInviteRole(owner, 'operations');
await L.clickText(owner, 'Create invitation', { sel: 'button[type=submit]' });
check('invite: success message and the one-time link are shown', await waitText(owner, /Created\./) && await owner.evaluate(() => /\/invite\//.test(document.querySelector('input[readonly]')?.value || '')), (await text(owner)).slice(0, 700));
check('invite: stored for company A with the right role, and only a hash of the token', sql(`select count(*) from company_invites ci join roles r on r.id = ci.role_id where ci.company_id = '${A}' and ci.email = 'new-hire@e2e.test' and ci.status = 'pending' and r.key = 'operations' and length(ci.token_hash) > 20`) === '1');
await go(owner, '/dashboard/users'); t = await text(owner);
check('invite: the pending invitation is listed (and the link is NOT shown again)', /new-hire@e2e\.test/.test(t) && !(await owner.evaluate(() => /\/invite\//.test(document.querySelector('input[readonly]')?.value || ''))));
await typeInto(owner, 'input[name=email]', 'new-hire@e2e.test'); await pickInviteRole(owner, 'operations');
await L.clickText(owner, 'Create invitation', { sel: 'button[type=submit]' });
check('invite: a second invitation for the same email is refused with a clear message', await waitText(owner, /pending invitation for this email/), (await text(owner)).slice(0, 200));
check('invite: no duplicate row was created', sql(`select count(*) from company_invites where company_id = '${A}' and email = 'new-hire@e2e.test'`) === '1');
await go(owner, '/dashboard/users');
check('invite: revoke button has an accessible name naming the email', await clickByLabel(owner, 'Revoke new-hire@e2e.test'));
await sleep(1500);
check('invite: revoked in the database', sql(`select status from company_invites where company_id = '${A}' and email = 'new-hire@e2e.test'`) === 'revoked');

// ---------------- role change + suspend ----------------
await go(owner, '/dashboard/users');
await owner.evaluate(() => { const s = [...document.querySelectorAll('select')].find((x) => x.getAttribute('aria-label') === 'Role for U Booking A'); s.value = 'operations'; s.dispatchEvent(new Event('change', { bubbles: true })); });
check('role: change saved from the UI', await clickByLabel(owner, 'Save role U Booking A') && await waitText(owner, /Saved\./) && mrole(bookingA) === 'operations');
check('role: the change is audited', Number(sql(`select count(*) from audit_logs where action = 'member.role_changed' and company_id = '${A}'`)) >= 1);
await owner.evaluate(() => { const s = [...document.querySelectorAll('select')].find((x) => x.getAttribute('aria-label') === 'Role for U Booking A'); s.value = 'booking'; s.dispatchEvent(new Event('change', { bubbles: true })); });
await clickByLabel(owner, 'Save role U Booking A'); await sleep(1500);
check('suspend: member suspended from the UI', await clickByLabel(owner, 'Suspend U Booking A') && (await sleep(1500), mstatus(bookingA) === 'suspended'));
await go(owner, '/dashboard/users');
check('suspend: the page now offers Reactivate for that member', await owner.evaluate(() => !![...document.querySelectorAll('button')].find((b) => b.textContent.replace(/\s+/g, ' ').trim() === 'Reactivate U Booking A')));
await clickByLabel(owner, 'Reactivate U Booking A'); await sleep(1500);
check('suspend: reactivated from the UI', mstatus(bookingA) === 'active');

// ---------------- plan limit: users ----------------
setUsersLimit(members());
await go(owner, '/dashboard/users'); t = await text(owner);
check('limit: reached message names the resource and what to do next', /Plan limit reached/.test(t) && /team members/.test(t) && /upgrade the plan|MALAKY Studio support/.test(t), t.slice(0, 500));
const before = Number(sql(`select count(*) from company_invites where company_id = '${A}'`));
await typeInto(owner, 'input[name=email]', 'blocked@e2e.test'); await pickInviteRole(owner, 'booking');
await L.clickText(owner, 'Create invitation', { sel: 'button[type=submit]' }); await sleep(1200);
check('limit: submit is aria-disabled and no invitation is created', await owner.evaluate(() => document.querySelector('button[type=submit][aria-disabled="true"]') !== null) && Number(sql(`select count(*) from company_invites where company_id = '${A}'`)) === before);
await axeScan(owner, 'users (limit reached)');
setUsersLimit(20);

// ---------------- permission + isolation ----------------
const manager = await login('u-manager-a@e2e.test');
await go(manager, '/dashboard/users'); t = await text(manager);
check('manager: can see the team but gets the read-only notice and no controls', /only the company owner can change it/.test(t) && !/Invite a teammate/.test(t) && !(await manager.evaluate(() => !![...document.querySelectorAll('button')].find((b) => /^(Save role|Suspend|Revoke)/.test(b.textContent.trim())))));
const target = mid(bookingA);
let r = await L.rpc(tokManagerA, 'set_member_role', { p_member_id: target, p_role_key: 'owner' });
check('manager: direct RPC to promote is refused and nothing changes', r.status >= 400 && mrole(bookingA) === 'booking', JSON.stringify(r));
r = await L.rpc(tokManagerA, 'set_member_status', { p_member_id: target, p_status: 'suspended' });
check('manager: direct RPC to suspend is refused and nothing changes', r.status >= 400 && mstatus(bookingA) === 'active', JSON.stringify(r));
r = await L.rpc(tokOwnerB, 'set_member_role', { p_member_id: target, p_role_key: 'owner' });
check('Company B owner cannot change a Company A member (role unchanged)', r.status >= 400 && mrole(bookingA) === 'booking', JSON.stringify(r));
r = await L.rpc(tokOwnerB, 'set_member_status', { p_member_id: target, p_status: 'suspended' });
check('Company B owner cannot suspend a Company A member (status unchanged)', r.status >= 400 && mstatus(bookingA) === 'active', JSON.stringify(r));
const bookingPage = await login('u-booking-a@e2e.test');
await go(bookingPage, '/dashboard/users');
check('booking staff: /dashboard/users redirects to the dashboard with a visible permission message', bookingPage.url().includes('/dashboard') && !bookingPage.url().includes('/users') && /do not have permission/.test(await text(bookingPage)), bookingPage.url());
check('booking staff: no Team link in the navigation', await bookingPage.evaluate(() => !document.querySelector('nav a[href="/dashboard/users"]')));

// ---------------- atomic route creation ----------------
const routesBefore = Number(sql(`select count(*) from routes where company_id = '${A}'`));
r = await L.rpc(tokOwnerA, 'create_route_with_stops', { p_name: 'Atomic Bad', p_code: 'ATM-X', p_origin: 'Cairo', p_destination: 'Giza', p_description: null, p_stops: [{ name: 'Only One', offsetMinutes: 0 }] });
check('atomic: a bad stop list is refused and NO route is left behind', r.status >= 400 && Number(sql(`select count(*) from routes where company_id = '${A}'`)) === routesBefore, JSON.stringify(r));
r = await L.rpc(tokOwnerA, 'create_route_with_stops', { p_name: 'Atomic Good', p_code: 'ATM-OK', p_origin: 'Cairo', p_destination: 'Giza', p_description: null, p_stops: [{ name: 'Start Point', offsetMinutes: 0, stopType: 'pickup' }, { name: 'End Point', offsetMinutes: 20, stopType: 'dropoff' }] });
check('atomic: a good call creates the route and both stops in company A', r.status < 300 && sql(`select count(*) from route_stops s join routes r on r.id = s.route_id where r.code = 'ATM-OK' and s.company_id = '${A}'`) === '2', JSON.stringify(r));
r = await L.rpc(tokManagerA, 'create_route_with_stops', { p_name: 'Atomic Mgr', p_code: 'ATM-M', p_origin: 'Cairo', p_destination: 'Giza', p_description: null, p_stops: [{ name: 'Start Point', offsetMinutes: 0 }, { name: 'End Point', offsetMinutes: 20 }] });
check('atomic: a manager with routes.write may create (company derived from membership)', r.status < 300 && sql(`select company_id from routes where code = 'ATM-M'`) === A, JSON.stringify(r));
r = await L.rpc(tokOwnerB, 'create_route_with_stops', { p_name: 'Atomic B', p_code: 'ATM-B', p_origin: 'Cairo', p_destination: 'Giza', p_description: null, p_stops: [{ name: 'Start Point', offsetMinutes: 0 }, { name: 'End Point', offsetMinutes: 20 }] });
check('atomic: Company B call creates the route in Company B, never in A', r.status < 300 && sql(`select company_id from routes where code = 'ATM-B'`) === B, JSON.stringify(r));

// UI create now goes through the atomic RPC: route + stops appear together
await go(owner, '/dashboard/routes/new');
await typeInto(owner, 'input[name=name]', 'UI Atomic'); await typeInto(owner, 'input[name=originName]', 'Cairo'); await typeInto(owner, 'input[name=destinationName]', 'Alex');
for (const [n, m] of [['UI Stop One', '0'], ['UI Stop Two', '40']]) {
  await L.clickText(owner, 'Add stop', { sel: 'button' }); await sleep(300);
  await owner.evaluate((n, m) => { const rows = document.querySelectorAll('ol[aria-label="Route stops"] > li'); const li = rows[rows.length - 1]; const set = (el, v) => { const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value'); d.set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); }; const ins = li.querySelectorAll('input:not([type=checkbox])'); set(ins[0], n); set(ins[1], m); }, n, m);
}
await L.clickText(owner, 'Create route', { sel: 'button[type=submit]' });
await owner.waitForFunction(() => /\/dashboard\/routes\/[0-9a-f-]{36}/.test(location.pathname), { timeout: 15000 }).catch(() => {});
check('UI: creating a route with stops lands on its edit page with both stops saved', /\/dashboard\/routes\/[0-9a-f-]{36}/.test(owner.url()) && sql(`select count(*) from route_stops s join routes r on r.id = s.route_id where r.name = 'UI Atomic' and r.company_id = '${A}'`) === '2', owner.url());

await browser.close();
process.exit(L.summary() ? 0 : 1);
