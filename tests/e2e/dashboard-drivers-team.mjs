// Drivers <-> Team sync in a real browser (migration 0026): a driver record and a driver login are one thing.
// Production build (next start), local PostgreSQL + PostgREST, GoTrue-compatible STUB.
// Production build (next start), real local PostgreSQL + PostgREST (RLS, RPCs), GoTrue-compatible STUB (NOT live Supabase Auth).
// Run: SKIP_BUILD=1 bash tests/e2e/run-e2e.sh dashboard-drivers-team.mjs 1
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


const drv = (name) => sql(`select id from drivers where company_id = '${A}' and full_name = '${name}'`);
const dUser = (name) => sql(`select coalesce(user_id::text, '') from drivers where company_id = '${A}' and full_name = '${name}'`);
const dStatus = (name) => sql(`select status from drivers where company_id = '${A}' and full_name = '${name}'`);
setLimit();
function setLimit() { sql(`update plan_entitlements set int_value = null where key in ('max_users','max_drivers') and plan_id = (select id from plans where code = 'professional')`); }
const rowText = (p, needle) => p.evaluate((n) => { const r = [...document.querySelectorAll('tbody tr')].find((x) => x.textContent.includes(n)); return r ? r.textContent.replace(/\s+/g, ' ') : ''; }, needle);
const roleOptions = (p, label) => p.evaluate((l) => { const s = [...document.querySelectorAll('select')].find((x) => x.getAttribute('aria-label') === l); return s ? [...s.options].map((o) => o.value) : null; }, label);
const owner = await login('u-owner-a@e2e.test');

// 1. add a driver on the Drivers page -> it is offered on the Team page (Drivers -> Team)
await go(owner, '/dashboard/drivers');
await typeInto(owner, 'input[name=fullName]', 'Sync Driver One'); await typeInto(owner, 'input[name=phone]', '01090000001');
await L.clickText(owner, 'Add driver', { sel: 'button[type=submit]' }); await waitText(owner, /Created\./);
await typeInto(owner, 'input[name=fullName]', 'Sync Driver Two'); await typeInto(owner, 'input[name=phone]', '01090000002');
await L.clickText(owner, 'Add driver', { sel: 'button[type=submit]' }); await sleep(1500);
check('drivers: both records exist', drv('Sync Driver One') !== '' && drv('Sync Driver Two') !== '');
let t = await rowText(owner, 'Sync Driver One');
check('drivers: new driver shows "No login yet" and an invite control (owner)', /No login yet/.test(t) && await owner.evaluate(() => !![...document.querySelectorAll('form')].find((f) => f.getAttribute('aria-label') === 'Invite login for Sync Driver One')), t);
await axeScan(owner, 'drivers (login column)');
await go(owner, '/dashboard/users');
await pickInviteRole(owner, 'driver'); await sleep(300);
const offered = await owner.evaluate(() => { const s = document.querySelector('select[name=driverId]'); return s ? [...s.options].map((o) => o.textContent) : null; });
check('team: choosing role Driver asks for a driver record and lists the unlinked drivers', !!offered && offered.includes('Sync Driver One') && offered.includes('Sync Driver Two'), JSON.stringify(offered));

// 2. a plain driver invite is impossible (no record to link): refused by the database
const r1 = await L.rpc(tokOwnerA, 'create_invite', { p_email: 'plain@e2e.test', p_role_key: 'driver', p_company_id: null });
check('db: create_invite with role driver is refused', r1.status >= 400 && sql(`select count(*) from company_invites where email = 'plain@e2e.test'`) === '0', JSON.stringify(r1));

// 3. invite from the Team page -> pending shows on Drivers (Team -> Drivers)
await typeInto(owner, 'input[name=email]', 'sync-one@e2e.test');
await owner.evaluate((id) => { const s = document.querySelector('select[name=driverId]'); s.value = id; s.dispatchEvent(new Event('change', { bubbles: true })); }, drv('Sync Driver One'));
await L.clickText(owner, 'Create invitation', { sel: 'button[type=submit]' });
check('team: driver invitation created and the one-time link is shown', await waitText(owner, /Created\./) && await owner.evaluate(() => /\/invite\//.test(document.querySelector('input[readonly]')?.value || '')));
const inv = sql(`select driver_id from company_invites where email = 'sync-one@e2e.test' and company_id = '${A}'`);
check('db: the invitation carries the driver record', inv === drv('Sync Driver One'), inv);
await go(owner, '/dashboard/drivers'); t = await rowText(owner, 'Sync Driver One');
check('drivers: that driver now shows "Invitation pending" (synced from Team)', /Invitation pending/.test(t), t);
await go(owner, '/dashboard/users');
const offered2 = await (async () => { await pickInviteRole(owner, 'driver'); await sleep(300); return owner.evaluate(() => [...document.querySelector('select[name=driverId]').options].map((o) => o.textContent)); })();
check('team: a driver with a pending invitation is no longer offered', !offered2.includes('Sync Driver One') && offered2.includes('Sync Driver Two'), JSON.stringify(offered2));

// 4. the invited person accepts -> both pages show the link
const syncOne = await mkUser('sync-one@e2e.test', 'Sync One Login', '01080000001');
const tokSyncOne = await L.tokenFor('sync-one@e2e.test', PW);
await L.rpc(tokOwnerA, 'revoke_invite', { p_invite_id: sql(`select id from company_invites where email = 'sync-one@e2e.test'`) });
const re = await L.rpc(tokOwnerA, 'invite_driver', { p_driver_id: drv('Sync Driver One'), p_email: 'sync-one@e2e.test' });
const token = re.body?.[0]?.token;
const acc = await L.rpc(tokSyncOne, 'accept_invite', { p_token: token });
check('accept: invitation accepted', acc.status < 300 && mrole(syncOne) === 'driver', JSON.stringify(acc));
check('db: the driver record is linked to the new login and active', dUser('Sync Driver One') === syncOne && dStatus('Sync Driver One') === 'active');
await go(owner, '/dashboard/drivers'); t = await rowText(owner, 'Sync Driver One');
check('drivers page: shows the linked login', /Linked to Sync One Login/.test(t) && /sync-one@e2e\.test/.test(t), t);
await go(owner, '/dashboard/users'); t = await rowText(owner, 'Sync One Login');
check('team page: member shows role Driver and the driver record', /Driver/.test(t) && /Driver record: Sync Driver One/.test(t), t);
const opts = await roleOptions(owner, 'Role for U Booking A');
check('team: a non-driver cannot be switched to Driver from the role menu (needs a record)', Array.isArray(opts) && !opts.includes('driver'), JSON.stringify(opts));

// 5. suspend from Team -> record inactive on Drivers (Team -> Drivers); reactivate restores
check('team: suspend the driver login from the UI', await clickByLabel(owner, 'Suspend Sync One Login'));
await sleep(1500);
check('db: suspending the login deactivates the driver record', mstatus(syncOne) === 'suspended' && dStatus('Sync Driver One') === 'inactive');
await go(owner, '/dashboard/drivers'); t = await rowText(owner, 'Sync Driver One');
check('drivers page: shows inactive + "login suspended"', /Inactive|inactive/.test(t) && /login suspended/.test(t), t);
await go(owner, '/dashboard/users'); await clickByLabel(owner, 'Reactivate Sync One Login'); await sleep(1500);
check('db: reactivating the login reactivates the driver record', mstatus(syncOne) === 'active' && dStatus('Sync Driver One') === 'active');

// 6. role away from driver unlinks (Team -> Drivers)
await go(owner, '/dashboard/users');
await owner.evaluate(() => { const s = [...document.querySelectorAll('select')].find((x) => x.getAttribute('aria-label') === 'Role for Sync One Login'); s.value = 'booking'; s.dispatchEvent(new Event('change', { bubbles: true })); });
await clickByLabel(owner, 'Save role Sync One Login'); await sleep(1500);
check('db: leaving the driver role unlinks the record and deactivates it', dUser('Sync Driver One') === '' && dStatus('Sync Driver One') === 'inactive' && mrole(syncOne) === 'booking');
await go(owner, '/dashboard/drivers'); t = await rowText(owner, 'Sync Driver One');
check('drivers page: shows "No login yet" again', /No login yet/.test(t), t);

// 7. link an existing member from the Drivers page (repair path) -> Team shows it
await go(owner, '/dashboard/drivers');
await owner.evaluate(() => { const f = [...document.querySelectorAll('form')].find((x) => x.getAttribute('aria-label') === 'Link a team member to Sync Driver Two'); const s = f.querySelector('select'); const o = [...s.options].find((x) => /U Booking A/.test(x.textContent)); s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true })); });
await clickByLabel(owner, 'Link Sync Driver Two');
await sleep(1800);
check('db: existing member linked to the driver record and made a driver', dUser('Sync Driver Two') === bookingA && mrole(bookingA) === 'driver');
await go(owner, '/dashboard/users'); t = await rowText(owner, 'U Booking A');
check('team page: the member now shows role Driver with its record', /Driver record: Sync Driver Two/.test(t), t);
check('audit: linking is recorded', Number(sql(`select count(*) from audit_logs where action = 'driver.linked' and company_id = '${A}'`)) >= 1);
await axeScan(owner, 'users (driver rows)');

// 8. permissions and isolation
const manager = await login('u-manager-a@e2e.test');
await go(manager, '/dashboard/drivers'); t = await text(manager);
check('manager: Drivers page shows logins read-only (no invite or link controls)', /Linked to/.test(t) && !(await manager.evaluate(() => !![...document.querySelectorAll('form')].find((f) => /^(Invite login|Link a team member)/.test(f.getAttribute('aria-label') || '')))));
const dTwo = drv('Sync Driver Two');
let r = await L.rpc(tokManagerA, 'invite_driver', { p_driver_id: drv('Sync Driver One'), p_email: 'mgr-try@e2e.test' });
check('manager: direct invite_driver is refused, nothing created', r.status >= 400 && sql(`select count(*) from company_invites where email = 'mgr-try@e2e.test'`) === '0', JSON.stringify(r));
r = await L.rpc(tokOwnerB, 'invite_driver', { p_driver_id: drv('Sync Driver One'), p_email: 'b-try@e2e.test' });
check('Company B owner cannot invite a login for a Company A driver', r.status >= 400 && sql(`select count(*) from company_invites where email = 'b-try@e2e.test'`) === '0', JSON.stringify(r));
r = await L.rpc(tokOwnerB, 'link_driver_login', { p_driver_id: drv('Sync Driver One'), p_member_id: mid(syncOne) });
check('Company B owner cannot link Company A records (unchanged)', r.status >= 400 && dUser('Sync Driver One') === '', JSON.stringify(r));
r = await L.rpc(tokOwnerA, 'link_driver_login', { p_driver_id: drv('Sync Driver One'), p_member_id: mid(ownerA) });
check('owner cannot be turned into a driver login', r.status >= 400 && mrole(ownerA) === 'owner', JSON.stringify(r));

await browser.close();
process.exit(L.summary() ? 0 : 1);
