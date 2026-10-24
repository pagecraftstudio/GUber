// Sign-out + protected-route behaviour in a real browser: production build (next start), real local PostgreSQL + PostgREST,
// GoTrue-compatible STUB (NOT live Supabase Auth). Run: SKIP_BUILD=1 bash tests/e2e/run-e2e.sh signout.mjs 1
import * as L from './lib.mjs';
const { check, sleep, text, waitText, clickText, typeInto, sql, T } = L;
const PW = 'Passw0rd!x', A = T(101);
async function mk(email, name, phone) {
  await fetch(L.STUB + '/auth/v1/signup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: PW, data: { full_name: name, phone } }) });
  await L.confirmEmail(email);
}
await mk('so-cust@e2e.test', 'Signout Customer', '01066660001'); await mk('so-drv@e2e.test', 'Signout Driver', '01066660002');
const drv = sql(`select id from auth.users where email = 'so-drv@e2e.test'`);
sql(`insert into company_users (company_id, user_id, role_id) select '${A}', '${drv}', r.id from roles r where r.key = 'driver'`);
sql(`insert into drivers (id, company_id, user_id, full_name, phone) values ('${T(971)}','${A}','${drv}','SO driver','+201000066002')`);

const browser = await L.launch();
const sbCookies = async (p) => (await p.cookies()).filter((c) => c.name.startsWith('sb-') && c.value);
const path = (p) => new URL(p.url()).pathname + new URL(p.url()).search;

async function customerLogin(ctx) {
  const p = await L.newPage(ctx);
  await p.goto(L.BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 60000 }); await waitText(p, /Sign In|Create Account/i, 15000); await sleep(600);
  await typeInto(p, '[role=dialog] input[type=email]', 'so-cust@e2e.test'); await typeInto(p, '[role=dialog] input[type=password]', PW);
  await clickText(p, 'Sign In', { sel: 'button[type=submit]', scope: '[role=dialog]' }); await sleep(2500);
  return p;
}
async function staffLogin(ctx, email) {
  const p = await L.newPage(ctx);
  await p.goto(L.BASE + '/company/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await typeInto(p, 'input[name=email]', email); await typeInto(p, 'input[name=password]', PW);
  await clickText(p, 'Sign in', { sel: 'button[type=submit]' }); await sleep(3500);
  return p;
}

// ---------- customer ----------
const c1 = await browser.createBrowserContext();
const p = await customerLogin(c1);
check('customer: signed in (session cookie set)', (await sbCookies(p)).length > 0, path(p));
await p.goto(L.BASE + '/my-bookings', { waitUntil: 'domcontentloaded', timeout: 60000 }); await sleep(1500);
check('customer: /my-bookings renders for the signed-in customer', path(p).startsWith('/my-bookings') && /Signout Customer/.test(await text(p)), path(p));
// staff-only areas never render for a customer
for (const r of ['/admin', '/dashboard', '/driver']) {
  await p.goto(L.BASE + r, { waitUntil: 'domcontentloaded', timeout: 60000 }); await sleep(800);
  const t = await text(p);
  check(`customer: ${r} shows no staff content`, !/Platform overview|Audit logs|Boarding progress|Companies/.test(t) && (/could not be found|404|no access|sign in/i.test(t) || /^\/(company\/login|no-access|my-bookings)/.test(path(p))), `${path(p)} :: ${t.slice(0, 100)}`);
}
await p.goto(L.BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 }); await waitText(p, /Showing \d+ Departures?/i, 20000);
// open the account menu and sign out
const menu = await p.evaluateHandle(() => [...document.querySelectorAll('button')].find((e) => e.offsetParent && e.innerText.includes('Signout')));
if (menu.asElement()) { await menu.asElement().click(); await sleep(300); }
await clickText(p, 'Sign Out', { sel: 'button' }); await sleep(2500);
check('customer sign-out: session cookie is gone', (await sbCookies(p)).length === 0, JSON.stringify((await p.cookies()).map((c) => c.name)));
const after = await text(p);
check('customer sign-out: the page no longer greets the customer', !/Signout Customer/.test(after), after.slice(0, 120));
await p.goto(L.BASE + '/my-bookings', { waitUntil: 'domcontentloaded', timeout: 60000 }); await sleep(1000);
check('customer sign-out: /my-bookings now redirects to /login', path(p).startsWith('/login'), path(p));
await p.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {}); await sleep(1000);
{ const bt = await text(p); check('customer sign-out: Back button does not reveal the account', !/Signout Customer/.test(bt) && !/Upcoming|Profile & Student ID/.test(bt), path(p) + ' :: ' + bt.replace(/\s+/g, ' ').slice(0, 300)); }
check('no uncaught page errors (customer)', p.errors.length === 0, JSON.stringify(p.errors));

// ---------- staff (driver) ----------
const c2 = await browser.createBrowserContext();
const d = await staffLogin(c2, 'so-drv@e2e.test');
check('driver: signed in and on /driver', path(d).startsWith('/driver'), path(d));
await clickText(d, 'Sign out', { sel: 'button' }); await sleep(2500);
check('driver sign-out: lands on the staff login', path(d).startsWith('/company/login'), path(d));
check('driver sign-out: session cookie is gone', (await sbCookies(d)).length === 0);
await d.goto(L.BASE + '/driver', { waitUntil: 'domcontentloaded', timeout: 60000 }); await sleep(800);
check('driver sign-out: /driver redirects back to the staff login', path(d).startsWith('/company/login'), path(d));
await d.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {}); await sleep(800);
check('driver sign-out: Back button shows no boarding page', !/Boarding progress|Expected/.test(await text(d)), (await text(d)).slice(0, 100));
check('no uncaught page errors (driver)', d.errors.length === 0, JSON.stringify(d.errors));

await browser.close();
process.exit(L.summary() ? 0 : 1);
