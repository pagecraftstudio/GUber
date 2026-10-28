import * as L from './lib.mjs';
const { check, sleep, text, hasText, waitText, clickText, dialogText, typeInto, sql, snap, T } = L;
const PW = 'Passw0rd!x';
const browser = await L.launch();
const alice = { name: 'Alice Tester', email: 'alice@e2e.test', phone: '01011112222' };

const authDialogTop = (p) => p.evaluate(() => { const ds = [...document.querySelectorAll('[role=dialog]')]; const top = ds.find((d) => { const r = d.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + 40); return t && d.contains(t); }); return top ? top.innerText : ''; });
async function openApp(p) { await p.goto(L.BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 }); await waitText(p, /Showing \d+ Departures|No trips|No Departures/i, 20000); await sleep(500); }
async function signUp(p, u) {
  await p.goto(L.BASE + '/login', { waitUntil: 'domcontentloaded' }); await waitText(p, /Sign In|Create Account/i, 15000); await sleep(600); console.log('SU1', (await dialogText(p)).replace(/\n+/g,' | ').slice(0,100)); await clickText(p, 'Create Account', { scope: '[role=dialog]' }); console.log('SU2', (await dialogText(p)).replace(/\n+/g,' | ').slice(0,100));
  await typeInto(p, '[role=dialog] input[placeholder*="Karim"]', u.name); await typeInto(p, '[role=dialog] input[type=email]', u.email);
  await typeInto(p, '[role=dialog] input[type=tel]', u.phone); await typeInto(p, '[role=dialog] input[type=password]', PW);
  await clickText(p, 'Create Account', { sel: 'button[type=submit]', scope: '[role=dialog]' }); await sleep(1500);
}
async function signIn(p, u) {
  if (!(await dialogText(p))) await p.goto(L.BASE + '/login', { waitUntil: 'domcontentloaded' }); await waitText(p, /Sign In|Create Account/i, 15000); await sleep(600);
  await typeInto(p, '[role=dialog] input[type=email]', u.email); await typeInto(p, '[role=dialog] input[type=password]', PW);
  await clickText(p, 'Sign In', { sel: 'button[type=submit]', scope: '[role=dialog]' }); await sleep(1800);
}

const p = await L.newPage(browser);
await openApp(p);
const landing = await text(p);
check('landing: real company shown', /Company A/.test(landing));
check('landing: unpublished company B not shown', !/Company B/.test(landing));
check('landing: no demo company/date/accounts', !/Galala Connect|Pass1234|karim|Quick Demo|Oct 14|2026-10-14|Demonstration Data|Demo\)/i.test(landing), landing.slice(0, 200));
check('landing: no dev preview switcher', (await p.$('aside[aria-label*="Preview"]')) === null);
const expected = sql(`select count(*) from public_search_trips()`);
check('search: UI trip count equals DB eligible count', new RegExp(`Showing ${expected} Departures`).test(landing), `expected ${expected}`);
await snap(p, 'landing');

// ---------- logged-out booking attempt ----------
const tripCards = () => p.evaluate(() => [...document.querySelectorAll('button')].filter((b) => b.innerText.trim().startsWith('Book Seat')).length);
const cardsInfo = () => p.evaluate(() => [...document.querySelectorAll('button')].filter((b) => b.innerText.trim().startsWith('Book Seat')).map((b) => { let n = b; for (let i = 0; i < 8 && n; i++, n = n.parentElement) if (/EGP/.test(n.innerText) && /Seats? Available|Fully Booked|Full/i.test(n.innerText)) return n.innerText.replace(/\n+/g, ' | '); return ''; }));
// DB truth: what eligible trips look like
const dbTrips = sql(`select price::int, seats_available, to_char(departure_at at time zone timezone,'HH24:MI') from public_search_trips() order by departure_at`).split('\n').map((r) => r.split('|'));
const infos = await cardsInfo();
check('search: every DB trip appears with correct fare, seats and departure time',
  dbTrips.every(([price, seats, hhmm]) => infos.some((t) => t.includes(`${price}EGP`) && new RegExp(`${seats} Seats? Available`).test(t) && t.includes(hhmm))), JSON.stringify({ dbTrips, infos }).slice(0, 400));
check('search: no placeholder route text', !/undefined/.test(landing));

// open the +50d trip (cap 3, 40 EGP) from the date filter
const farDate = sql(`select to_char(departure_at at time zone timezone,'YYYY-MM-DD') from public_search_trips() where capacity = 3 limit 1`);
await p.$eval('input[type=date]', (el, v) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, farDate);
await clickText(p, 'Find Scheduled Trips'); await waitText(p, /Showing 1 Departure/i);
check('search: date filter returns only that day trip', (await tripCards()) === 1 && /Showing 1 Departure/i.test(await text(p)));
await clickText(p, 'Book Seat'); await waitText(p, /Book Your Seat/);
let d = await dialogText(p);
check('booking dialog: route title is real (no "undefined")', /Fayoum\s*→\s*Cairo/.test(d) && !/undefined/.test(d), d.slice(0, 120));
check('booking dialog: logged-out shows sign-in required, no guest checkout/discount/boarding-pass claims', /Sign in to book/.test(d) && !/Guest Checkout|15% Off|Boarding Pass|credit card/i.test(d), d.slice(0, 300));
await typeInto(p, '[role=dialog] input[placeholder*="Omar"]', 'Ghost'); await typeInto(p, '[role=dialog] input[placeholder="01012345678"]', '01099998888');
await clickText(p, 'Sign in to book', { sel: 'button[type=submit]', scope: '[role=dialog]' }); await sleep(800);
const dlg2 = await dialogText(p);
console.log('DIALOGS', JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('[role=dialog]')].map((d) => { const r = d.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + 40); return { head: d.innerText.slice(0, 30).replace(/\n/g, ' '), z: getComputedStyle(d.closest('[class*=fixed]') || d).zIndex, onTop: !!top && d.contains(top) }; }))));
check('booking logged-out: no booking created, auth dialog opens', sql(`select count(*) from bookings where source = 'web'`) === '0' && /Email Address/.test(await authDialogTop(p)), 'web bookings=' + sql(`select count(*) from bookings where source = 'web'`) + ' dialog=' + dlg2.replace(/\n+/g, ' | ').slice(0, 250));
await snap(p, 'logged-out-booking');
console.log('DLG-AFTER', (await dialogText(p)).replace(/\n+/g,' | ').slice(0,200));
await p.keyboard.press('Escape'); await sleep(400);
console.log('DLG-AFTER-ESC', (await dialogText(p)).replace(/\n+/g,' | ').slice(0,200));

// ---------- signup (email confirmation required) ----------
await p.reload({ waitUntil: 'domcontentloaded' }); await waitText(p, /Departures/i);
await signUp(p, alice);
const dd = await dialogText(p);
const notice = await p.evaluate(() => { const n = document.querySelector('[role=dialog] [role=status]'); return n ? { text: n.innerText, bg: getComputedStyle(n).backgroundColor } : null; });
check('signup: confirmation shown as success notice (role=status, green), not an error', !!notice && /confirm/i.test(notice.text) && !(await p.$('[role=dialog] [role=alert]')), JSON.stringify(notice) + dd.slice(0, 200));
check('signup: account exists in auth.users and profile row created by trigger', sql(`select count(*) from auth.users u join profiles p on p.id = u.id where u.email = '${alice.email}'`) === '1');
const hasSession = () => p.evaluate(() => /(^|;\s*)sb-[^=;]*-auth-token(\.\d+)?=/.test(document.cookie));
check('signup: still no session cookie', !(await hasSession()));
await snap(p, 'signup-notice');

// sign in BEFORE confirming -> localized error, not a raw provider message
await signIn(p, alice);
console.log('AFTER-LOGIN1', (await dialogText(p)).replace(/\n+/g,' | ').slice(0,300));
const err1 = await p.evaluate(() => (document.querySelector('[role=dialog] [role=alert]') || {}).innerText || '');
check('login before confirmation: clear error shown', /confirm your email/i.test(err1), err1);
await L.confirmEmail(alice.email);
await signIn(p, alice);
for (let i = 0; i < 40 && (await dialogText(p)); i++) await sleep(250);
console.log('URL2', p.url(), await hasSession());
console.log('AFTER-LOGIN2', (await dialogText(p)).replace(/\n+/g,' | ').slice(0,300));
check('login after confirmation: dialog closes, session cookie set by real supabase-js', !(await dialogText(p)) && (await hasSession()));
await openApp(p); // customer login is now the /login page, which redirects to the portal; go back to the trip search
const hdr = await p.evaluate(() => [...document.querySelectorAll('header button, header a, nav button, nav a')].map((e) => e.innerText.trim()).filter(Boolean));
console.log('HEADER ITEMS', JSON.stringify(hdr));
await snap(p, 'logged-in');

// ---------- book as Alice (2 seats), with a delayed request to observe the loading state ----------
const aliceId = sql(`select id from auth.users where email = '${alice.email}'`);
await p.$eval('input[type=date]', (el, v) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, farDate);
await clickText(p, 'Find Scheduled Trips'); await waitText(p, /Showing 1 Departure/i);
await clickText(p, 'Book Seat'); await waitText(p, /Book Your Seat/);
d = await dialogText(p);
check('booking dialog (signed in): shows account, no unwired promises', /Alice Tester/.test(d) && !/Guest Checkout|15% Off|Boarding Pass|credit card/i.test(d), d.slice(0, 300));
await typeInto(p, '[role=dialog] input[placeholder="01012345678"]', alice.phone);
await clickText(p, '2 Seats', { scope: '[role=dialog]' });
check('booking dialog: total = server price x seats (80 EGP, no phantom discount)', /80 EGP/.test(await dialogText(p)) && !/Discount/i.test(await dialogText(p)), (await dialogText(p)).slice(-250));
await p.setRequestInterception(true);
p.on('request', async (r) => { if (r.url().includes('/rpc/create_my_booking')) { await sleep(1500); } r.continue().catch(() => {}); });
const qrResponses = []; p.on('response', (r) => { if (/my_ticket_qr/.test(r.url())) qrResponses.push(r.status()); }); // diagnostics only: shown when the QR check fails
await clickText(p, 'Confirm booking', { sel: 'button[type=submit]', scope: '[role=dialog]' });
await sleep(500);
const loadingState = await p.evaluate(() => { const b = [...document.querySelectorAll('[role=dialog] button[type=submit]')].pop(); return b ? { disabled: b.disabled, busy: b.getAttribute('aria-busy'), html: b.innerHTML.includes('animate-spin') } : null; });
check('loading state: submit is disabled/busy while the booking request is in flight', !!loadingState && (loadingState.disabled || loadingState.busy === 'true' || loadingState.html), JSON.stringify(loadingState));
await waitText(p, /MB-[A-Z0-9]+/, 10000);
await p.setRequestInterception(false);
const ticketText = await text(p);
const ref = (ticketText.match(/MB-[A-Z0-9]{4,}/) || [])[0];
check('booking: confirmation shows real reference from PostgreSQL', !!ref && sql(`select count(*) from bookings where reference = '${ref}'`) === '1', ref);
await p.waitForSelector('[data-testid=ticket-qr]', { timeout: 10000 }).catch(() => {});
const tix = Number(sql(`select count(*) from tickets t join bookings b on b.id = t.booking_id where b.reference = '${ref}'`));
check('booking: confirmation shows a server-issued QR (one ticket per seat in the DB), no mock token, raw token not printed', !!(await p.$('[data-testid=ticket-qr]')) && tix === 2 && !/malaky_sec_tk|MALAKY:TICKET|Opaque/i.test(await text(p)), `tickets=${tix} my_ticket_qr http=${JSON.stringify(qrResponses)} pageErrors=${JSON.stringify(p.errors)} qrImgs=${await p.$$eval('img', (i) => i.length)} skeleton=${await p.$$eval('.animate-pulse', (i) => i.length)} :: ${(await text(p)).slice(0, 200)}`);
const row = L.sqlRow(`select b.seats_count, b.status, b.source, b.total_amount::int as total, (c.user_id = '${aliceId}') as owned, (b.created_by = '${aliceId}') as created_by_me, t.seats_booked from bookings b join customers c on c.id = b.customer_id join trips t on t.id = b.trip_id where b.reference = '${ref}'`);
// row_to_json gives real booleans (psql text prints 't'/'f'), so compare booleans as booleans
check('booking persisted: 2 seats, confirmed, web, 80 EGP, owned by Alice, trip counter = 2', row?.seats_count === 2 && row.status === 'confirmed' && row.source === 'web' && row.total === 80 && row.owned === true && row.created_by_me === true && row.seats_booked === 2, JSON.stringify(row));
await snap(p, 'booked');

// ---------- refresh: state must come from the backend, not localStorage ----------
await p.reload({ waitUntil: 'domcontentloaded' }); await waitText(p, /Alice Tester/, 15000);
check('refresh: still signed in from the session cookie', /Alice Tester/.test(await text(p)));
const lsKeys = await p.evaluate(() => Object.keys(localStorage));
check('refresh: no mock data in localStorage (only theme/locale prefs)', lsKeys.every((k) => /theme|locale|lang|sb-/.test(k)), JSON.stringify(lsKeys));
await clickText(p, 'A\nAlice'.split('\n')[1] ? 'A' : 'A', { sel: 'header button, nav button' }).catch(() => {});
console.log('MENU', (await text(p)).replace(/\n+/g, ' | ').slice(0, 400));
await snap(p, 'menu');
await browser.close();
process.exit(L.summary() ? 0 : 1);
