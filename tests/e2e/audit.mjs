// Phase 7.5 audit log UI in a real browser: production build (next start), real local PostgreSQL + PostgREST (RLS, RPCs), GoTrue-compatible STUB (NOT live Supabase Auth).
// Run: bash tests/e2e/run-e2e.sh audit.mjs 1
import * as L from './lib.mjs';
const { check, sleep, text, waitText, clickText, typeInto, sql, snap, T } = L;
const PW = 'Passw0rd!x';

async function mk(email, name) {
  await fetch(L.STUB + '/auth/v1/signup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: PW, data: { full_name: name } }) });
  await L.confirmEmail(email);
  return sql(`select id from auth.users where email = '${email}'`);
}
const superId = await mk('aud-super@e2e.test', 'Super Auditor');
const supportId = await mk('aud-support@e2e.test', 'Support Auditor');
const billingId = await mk('aud-billing@e2e.test', 'Billing Auditor');
const tenantId = await mk('aud-tenant@e2e.test', 'Tenant Owner');
sql(`insert into platform_users (user_id, role) values ('${superId}','super_admin'),('${supportId}','support'),('${billingId}','billing')`);
sql(`insert into company_users (company_id, user_id, role_id) select '${T(101)}', '${tenantId}', id from roles where key = 'owner'`);

// fixtures: a diff-able entry with a hostile value, and 120 filler rows so keyset paging has pages
const XSS = '<img src=x onerror=window.__xss=1>';
sql(`select set_config('request.jwt.claim.sub','${superId}',false); select app_private.audit_platform('${T(101)}','company.updated','company','${T(101)}','{"name":"Old Name","phone":"+201000000001"}'::jsonb, '{"name":"${XSS}","phone":"+201000000001","country":"EG"}'::jsonb)`);
sql(`insert into audit_logs (actor_type, company_id, action, entity_type, created_at) select 'system', '${T(102)}', 'booking.created', 'booking', now() - (g || ' minutes')::interval - interval '1 hour' from generate_series(1,120) g`);
const entryId = sql(`select id from audit_logs where action = 'company.updated' and metadata->'after'->>'country' = 'EG' limit 1`);
const total = Number(sql('select count(*) from audit_logs'));

const browser = await L.launch();
async function login(email, viewport) {
  const ctx = await browser.createBrowserContext(); const p = await L.newPage(ctx);
  if (viewport) await p.setViewport(viewport);
  await p.goto(L.BASE + '/company/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await typeInto(p, 'input[name=email]', email); await typeInto(p, 'input[name=password]', PW);
  await clickText(p, 'Sign in', { sel: 'button[type=submit]' }); await sleep(3500);
  return { ctx, p };
}
// streaming pages show a skeleton first: wait for it to go before reading the page
async function go(p, path) {
  await p.goto(L.BASE + path, { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 50; i++) { if (!(await p.$('[role=status][aria-label^="Loading"]'))) break; await sleep(200); }
  await sleep(300); return text(p);
}
const is404 = (t) => /could not be found|404/i.test(t);
const rowIds = (p) => p.$$eval('tbody tr a[href^="/admin/audit-logs/"]', (as) => as.map((a) => a.getAttribute('href').split('/').pop()));

// ---------- anonymous + tenant ----------
{
  const ctx = await browser.createBrowserContext(); const p = await L.newPage(ctx);
  await p.goto(L.BASE + '/admin/audit-logs', { waitUntil: 'domcontentloaded', timeout: 60000 }); await sleep(800);
  check('anon: audit log redirects to staff login', p.url().includes('/company/login'), p.url());
  await ctx.close();
}
{
  const { ctx, p } = await login('aud-tenant@e2e.test');
  for (const path of ['/admin/audit-logs', `/admin/audit-logs/${entryId}`, `/admin/audit-logs?company=${T(102)}`]) {
    const t = await go(p, path);
    check(`tenant owner: ${path.slice(0, 40)} is a 404 and leaks nothing`, is404(t) && !/booking\.created|Old Name|Audit entry/i.test(t), t.slice(0, 100));
  }
  await ctx.close();
}

// ---------- billing: headers yes, details no, no staff summary ----------
{
  const { ctx, p } = await login('aud-billing@e2e.test');
  let t = await go(p, '/admin/audit-logs');
  check('billing: sees the log', /Audit logs/.test(t) && (await rowIds(p)).length > 0, t.slice(0, 150));
  check('billing: no staff-activity summary', !/MALAKY staff activity/i.test(t));
  t = await go(p, `/admin/audit-logs/${entryId}`);
  check('billing: company entry details are withheld', /not available to your role/.test(t) && !/Old Name/.test(t) && !/support@|@e2e\.test/.test(t), t.slice(0, 200));
  await ctx.close();
}

// ---------- support ----------
{
  const { ctx, p } = await login('aud-support@e2e.test');
  let t = await go(p, '/admin/audit-logs');
  check('support: sees summary and list', /MALAKY staff activity/i.test(t) && /By area/i.test(t) && (await rowIds(p)).length > 0, `rows=${(await rowIds(p)).length}`);
  t = await go(p, `/admin/audit-logs/${entryId}`);
  check('support: detail shows the diff and the actor email', /Old Name/.test(t) && /aud-super@e2e\.test/.test(t), t.slice(0, 250));
  await ctx.close();
}

// ---------- super admin ----------
const { ctx, p } = await login('aud-super@e2e.test');
let t = await go(p, '/admin');
check('overview: recent activity links to the audit log', !!(await p.$('a[href="/admin/audit-logs"]')) && !!(await p.$('a[href^="/admin/audit-logs/"]')));
check('sidebar: audit logs is a live link', !!(await p.$('nav a[href="/admin/audit-logs"]')));

t = await go(p, '/admin/audit-logs');
check('list: heading, summary and table render', /Audit logs/.test(t) && /Last 7 days/.test(t) && /Append-only/.test(t));
const page1 = await rowIds(p);
check('list: first page has exactly 50 rows', page1.length === 50, String(page1.length));
check('list: first page is newest-first (the diff entry made just now is on it)', page1.includes(entryId));
await snap(p, 'audit-list');

// keyset paging across the whole log
const all = [...page1]; let pages = 1;
for (let guard = 0; guard < 20; guard++) {
  const older = await p.$('a[href*="bat="]');
  if (!older) break;
  const href = await p.evaluate((e) => e.getAttribute('href'), older);
  if (!/Older entries/.test(await p.evaluate((e) => e.innerText, older))) break;
  await go(p, href); pages++; all.push(...(await rowIds(p)));
}
check('paging: walking "Older entries" visits every row exactly once', all.length === total && new Set(all).size === total, `${all.length} rows, ${new Set(all).size} unique, expected ${total}`);
check('paging: the last page says "End of log" and offers "← Newest"', /End of log/.test(await text(p)) && /← Newest/.test(await text(p)));
await clickText(p, '← Newest'); await sleep(800);
check('paging: "← Newest" returns to the first page', (await rowIds(p)).length === 50 && !p.url().includes('bat='), p.url());

// filters
t = await go(p, '/admin/audit-logs');
await p.select('select[name=namespace]', 'booking'); await clickText(p, 'Apply', { sel: 'button[type=submit]' }); await sleep(1500);
for (let i = 0; i < 30 && (await p.$('[role=status][aria-label^="Loading"]')); i++) await sleep(200);
let ids = await rowIds(p);
check('filter: area=booking keeps the URL param and shows only booking rows', p.url().includes('namespace=booking') && ids.length > 0 && !ids.includes(entryId), p.url());
t = await go(p, `/admin/audit-logs?company=${T(101)}`);
check('filter: company chip shows and only that company\'s entries remain', /Company:/.test(t) && (await rowIds(p)).includes(entryId) && !/Company B/.test(t.split('Company:')[1] ?? ''), t.slice(0, 300));
t = await go(p, '/admin/audit-logs?actorType=system&from=2000-01-01&to=2000-12-31');
check('filter: empty result shows the empty state', /No entries match/.test(t), t.slice(0, 200));
t = await go(p, '/admin/audit-logs?namespace=zzz&company=not-a-uuid');
check('filter: invalid filters are ignored with a notice, not a crash', /Some filters were not valid/.test(t) && (await rowIds(p)).length > 0, t.slice(0, 200));
t = await go(p, `/admin/audit-logs?company=${encodeURIComponent("' or 1=1 --")}&namespace=${encodeURIComponent("x'; drop table audit_logs;--")}`);
check('filter: injection strings are inert', /Some filters were not valid/.test(t) && sql('select count(*) from audit_logs') !== '0');
t = await go(p, '/admin/audit-logs?from=2030-02-01&to=2030-01-01');
check('filter: from after to is rejected with the notice', /Some filters were not valid/.test(t));

// detail: diff + XSS safety
t = await go(p, `/admin/audit-logs/${entryId}`);
check('detail: shows action, actor, company, entry id', /Company profile updated/.test(t) && /Super Auditor/.test(t) && /Company A/.test(t) && t.includes(entryId));
check('detail: diff table shows changed and unchanged fields', /name/.test(t) && /Old Name/.test(t) && /country/.test(t) && /phone/.test(t));
check('detail: the hostile value is shown as literal text', t.includes(XSS), t.slice(0, 400));
check('detail: the hostile value did not execute and created no element', (await p.evaluate(() => window.__xss)) === undefined && !(await p.$('img[src="x"]')));
check('detail: changed rows are marked for assistive tech', (await p.$$eval('tbody tr', (r) => r.filter((x) => /\(changed\)/.test(x.innerText)).length)) >= 2);
check('detail: unknown id is a 404', is404(await go(p, '/admin/audit-logs/00000000-0000-4000-8000-0000000fffff')));
check('detail: malformed id is a 404', is404(await go(p, '/admin/audit-logs/not-a-uuid')));

// company page + links
t = await go(p, `/admin/companies/${T(101)}`);
check('company page: has a Recent activity card with this company\'s entries and a View all link', /Recent activity/.test(t) && /Company profile updated/.test(t) && !!(await p.$(`a[href="/admin/audit-logs?company=${T(101)}"]`)));
await p.setViewport({ width: 390, height: 800 });
for (const path of ['/admin/audit-logs', `/admin/audit-logs/${entryId}`, `/admin/audit-logs?company=${T(101)}`]) {
  await go(p, path);
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  const wide = overflow > 1 ? await p.evaluate(() => [...document.querySelectorAll('html,body,body *')].filter((e) => e.scrollWidth > window.innerWidth + 1).slice(0, 8).map((e) => `${e.tagName}.${String(e.className).slice(0, 40)} sw=${e.scrollWidth} cw=${e.clientWidth} ov=${getComputedStyle(e).overflowX} pos=${getComputedStyle(e).position}`)) : [];
  const wide0 = overflow > 1 ? await p.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => { if (e.getBoundingClientRect().right <= window.innerWidth + 1) return false; for (let a = e.parentElement; a; a = a.parentElement) { const o = getComputedStyle(a).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden') return false; } return true; }).slice(0, 6).map((e) => `${e.tagName}.${String(e.className).slice(0, 60)}[${Math.round(e.getBoundingClientRect().width)}] ${e.innerText.slice(0, 40)}`)) : [];
  check(`mobile 390px: ${path.slice(0, 45)} has no horizontal page scroll`, overflow <= 1, `overflow ${overflow}px ${JSON.stringify(wide)}`);
}
await snap(p, 'audit-mobile');
check('db: viewing the log wrote no audit rows (only fixtures + earlier writes)', Number(sql('select count(*) from audit_logs')) === total, `${sql('select count(*) from audit_logs')} vs ${total}`);
check('no uncaught page errors', p.errors.length === 0, p.errors.join(' | '));
check('browser never contacted a service-role endpoint', !p.reqs.some((u) => /service_role/i.test(u)));
await browser.close();
process.exit(L.summary() ? 0 : 1);
