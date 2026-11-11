const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const BASE = 'http://localhost:3000', STUB = 'http://127.0.0.1:3200', PW = 'Passw0rd!x';
const OUT = process.env.OUT || '/tmp/claude-0/baseline-shots';
const sql = (q) => execFileSync('/tmp/claude-0/psqlpg', ['-tA', '-d', 'bus_base', '-c', q]).toString().trim();
const T = (n) => `00000000-0000-4000-8000-000000000${n}`;
const A = T(101);
async function mk(email, name) {
  await fetch(STUB + '/auth/v1/signup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: PW, data: { full_name: name, phone: '0108' + String(Math.floor(Math.random() * 1e7)).padStart(7, '0') } }) });
  await fetch(`${STUB}/__test/confirm?email=${encodeURIComponent(email)}`).then((r) => r.json()).catch(() => {});
  return sql(`select id from auth.users where email = '${email}'`);
}
const member = (uid, role) => sql(`insert into company_users (company_id, user_id, role_id) select '${A}', '${uid}', r.id from roles r where r.key = '${role}' on conflict do nothing`);
const WIDTHS = [{ w: 1440, h: 900 }, { w: 375, h: 812 }];
const EXTRA = [{ w: 320, h: 700 }, { w: 768, h: 1024 }, { w: 1024, h: 768 }];

async function loginCtx(browser, email, loginPath, doneRe) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(BASE + loginPath, { waitUntil: 'domcontentloaded' });
  const cust = loginPath === '/login';
  await p.fill(cust ? 'input[type=email]' : 'input[name=email]', email); await p.fill(cust ? 'input[type=password]' : 'input[name=password]', PW);
  await (cust ? p.getByRole('button', { name: /^sign in$/i }) : p.locator('button[type=submit]')).click();
  if (cust) { await p.waitForTimeout(2500); await ctx.storageState().then(() => {}); await p.goto(BASE + '/my-bookings', { waitUntil: 'networkidle' }); }
  await p.waitForFunction((re) => new RegExp(re).test(location.pathname), doneRe, { timeout: 20000 }).catch(() => console.log('login slow', email, p.url()));
  const state = await ctx.storageState(); await ctx.close(); return state;
}

async function shoot(browser, state, spec, lang, vp, tag) {
  const pre = `${OUT}/${spec.group}/${spec.slug}.${lang}.${tag || vp.w}.png`; if (fs.existsSync(pre)) return;
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, storageState: state, deviceScaleFactor: 1, locale: lang === 'ar' ? 'ar-EG' : 'en-GB' });
  await ctx.addInitScript((l) => { try { localStorage.setItem('malaky-dashboard-language', l); localStorage.setItem('malaky_locale', l); localStorage.setItem('malaky-language', l); } catch (e) {} }, lang);
  await ctx.addCookies([{ name: 'malaky-dashboard-language', value: lang, url: BASE }]);
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  ctx.setDefaultTimeout(5000);
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
  const resp = await p.goto(BASE + spec.path, { waitUntil: 'load', timeout: 45000 }).catch((e) => { errs.push('goto ' + e.message.slice(0, 80)); return null; });
  await p.waitForTimeout(1200);
  if (spec.act) await spec.act(p).catch((e) => errs.push('act ' + e.message.slice(0, 80)));
  const dir = `${OUT}/${spec.group}`; fs.mkdirSync(dir, { recursive: true });
  const file = `${dir}/${spec.slug}.${lang}.${tag || vp.w}.png`;
  await p.screenshot({ path: file, fullPage: true, timeout: 20000 }).catch(async (e) => { errs.push('fullpage failed, viewport used'); await p.screenshot({ path: file, timeout: 15000 }); });
  const dirAttr = await p.evaluate(() => document.documentElement.dir + '|' + document.documentElement.lang).catch(() => '');
  console.log(JSON.stringify({ file: file.replace(OUT + '/', ''), status: resp ? resp.status() : null, finalPath: new URL(p.url()).pathname, dir: dirAttr, errs: errs.slice(0, 2) }));
  await ctx.close();
}

(async () => {
  const owner = await mk('b-owner@e2e.test', 'Baseline Owner'); member(owner, 'owner');
  const driver = await mk('b-driver@e2e.test', 'Baseline Driver'); member(driver, 'driver');
  const sup = await mk('b-super@e2e.test', 'Baseline Super'); sql(`insert into platform_users (user_id, role) values ('${sup}','super_admin') on conflict do nothing`);
  await mk('b-pass@e2e.test', 'Baseline Passenger');
  const susp = await mk('b-susp@e2e.test', 'Baseline Suspended Owner'); sql(`insert into company_users (company_id, user_id, role_id) select '${T(103)}', '${susp}', r.id from roles r where r.key = 'owner' on conflict do nothing`);
  const inact = await mk('b-inactive@e2e.test', 'Baseline Inactive'); sql(`insert into company_users (company_id, user_id, role_id, status) select '${A}', '${inact}', r.id, 'suspended' from roles r where r.key = 'booking' on conflict do nothing`);
  const ids = {
    route: sql(`select id from routes where company_id='${A}' limit 1`),
    customer: sql(`select id from customers where company_id='${A}' limit 1`),
    company: A,
    audit: sql(`select id from audit_logs limit 1`),
  };
  const browser = await chromium.launch();
  const S = {
    owner: await loginCtx(browser, 'b-owner@e2e.test', '/company/login', '^/(dashboard|driver)'),
    driver: await loginCtx(browser, 'b-driver@e2e.test', '/company/login', '^/(dashboard|driver)'),
    super: await loginCtx(browser, 'b-super@e2e.test', '/company/login', '^/(admin|dashboard|continue)'),
    pass: await loginCtx(browser, 'b-pass@e2e.test', '/login', '^/my-bookings'),
    susp: await loginCtx(browser, 'b-susp@e2e.test', '/company/login', '^/(suspended|dashboard|no-access)'),
    inactive: await loginCtx(browser, 'b-inactive@e2e.test', '/company/login', '^/(no-access|dashboard)'),
    anon: undefined,
  };
  const specs = [
    // passenger / public
    { g: 'public', slug: 'marketplace-home', path: '/', who: 'anon', extra: true },
    { g: 'public', slug: 'booking-dialog', path: '/', who: 'anon', act: async (p) => { await p.getByRole('button', { name: /book seat|احجز مقعد/i }).first().click(); await p.waitForTimeout(900); } },
    { g: 'public', slug: 'login', path: '/login', who: 'anon' },
    { g: 'public', slug: 'register', path: '/register', who: 'anon' },
    { g: 'public', slug: 'forgot-password', path: '/forgot-password', who: 'anon' },
    { g: 'public', slug: 'reset-password', path: '/reset-password', who: 'anon' },
    { g: 'public', slug: 'company-login', path: '/company/login', who: 'anon' },
    { g: 'public', slug: 'invite-invalid', path: '/invite/not-a-real-token', who: 'anon' },
    { g: 'public', slug: 'not-found-404', path: '/this-page-does-not-exist', who: 'anon' },
    { g: 'public', slug: 'no-access', path: '/no-access', who: 'inactive' },
    { g: 'public', slug: 'suspended', path: '/suspended', who: 'susp' },
    { g: 'passenger', slug: 'my-bookings', path: '/my-bookings', who: 'pass' },
    // company
    ...[['overview', '/dashboard'], ['bookings', '/dashboard/bookings'], ['trips', '/dashboard/trips'], ['trips-new', '/dashboard/trips/new'], ['trips-regular', '/dashboard/trips/regular'],
      ['routes', '/dashboard/routes'], ['routes-new', '/dashboard/routes/new'], ['routes-detail', `/dashboard/routes/${ids.route}`], ['buses', '/dashboard/buses'], ['drivers', '/dashboard/drivers'],
      ['customers', '/dashboard/customers'], ['customers-detail', `/dashboard/customers/${ids.customer}`], ['users', '/dashboard/users'], ['website', '/dashboard/website'], ['settings', '/dashboard/settings']]
      .map(([slug, path]) => ({ g: 'company', slug, path, who: 'owner' })),
    { g: 'company', slug: 'bookings-filtered-empty', path: '/dashboard/bookings?q=zzzz', who: 'owner' },
    // driver
    { g: 'driver', slug: 'driver-home', path: '/driver', who: 'driver' },
    // admin
    ...[['admin-overview', '/admin'], ['companies', '/admin/companies'], ['companies-new', '/admin/companies/new'], ['company-detail', `/admin/companies/${ids.company}`], ['company-edit', `/admin/companies/${ids.company}/edit`],
      ['plans', '/admin/plans'], ['subscriptions', '/admin/subscriptions'], ['audit-logs', '/admin/audit-logs']].map(([slug, path]) => ({ g: 'admin', slug, path, who: 'super' })),
  ];
  const only = process.argv[2];
  for (const s of specs) {
    if (only && !s.slug.includes(only)) continue;
    const spec = { group: s.g, slug: s.slug, path: s.path, act: s.act };
    for (const lang of ['en', 'ar']) {
      for (const vp of WIDTHS) await shoot(browser, S[s.who], spec, lang, vp);
      if (s.extra) for (const vp of EXTRA) await shoot(browser, S[s.who], spec, lang, vp);
    }
  }
  await browser.close();
})();
