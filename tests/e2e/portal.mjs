// Customer portal + cancellation, real browser against: production build (next start), real local PostgreSQL + PostgREST (RLS, RPCs),
// and the GoTrue-compatible STUB (NOT live Supabase Auth). Run: EXTRA_SEED=tests/e2e/seed-portal.sql bash tests/e2e/run-e2e.sh portal.mjs 0
import * as L from './lib.mjs';
const { check, sleep, text, waitText, clickText, dialogText, typeInto, sql, sqlRow, snap, T } = L;
const PW = 'Passw0rd!x';
const WINDOW = 24; // company_settings.cancellation_window_hours (default); asserted below from the DB, not assumed

async function mk(email, name, phone) {
  await fetch(L.STUB + '/auth/v1/signup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: PW, data: { full_name: name, phone } }) });
  await L.confirmEmail(email); return L.tokenFor(email, PW);
}
const book = (tok, trip, seats, phone, name, key) => L.rpc(tok, 'create_my_booking', { p_trip_id: trip, p_seats: seats, p_full_name: name, p_phone: phone, p_idempotency_key: key });
const seatsBooked = (trip) => Number(sql(`select seats_booked from trips where id = '${trip}'`));
const bk = (id) => sqlRow(`select status, (cancelled_at is not null) as has_cancelled_at, cancellation_reason from bookings where id = '${id}'`);
const portalText = async (p) => (await text(p)).replace(/\n+/g, ' | ');
const cardFor = (p, ref) => p.evaluate((r) => { const els = [...document.querySelectorAll('div')].filter((d) => d.innerText.includes(r) && d.className.includes('rounded-2xl')); const c = els[els.length - 1]; return c ? c.innerText.replace(/\n+/g, ' | ') : ''; }, ref);

check('setup: company cancellation window is 24h (test assumes it)', Number(sql(`select cancellation_window_hours from company_settings where company_id = '${T(101)}'`)) === WINDOW);

// ---------- data via the real RPCs (as each customer, with real JWTs) ----------
const carolTok = await mk('carol@e2e.test', 'Carol Customer', '01033334444');
const daveTok = await mk('dave@e2e.test', 'Dave Customer', '01055556666');
const cCancel = (await book(carolTok, T(805), 2, '+201033334444', 'Carol Customer', 'p-805')).body;   // cancellable, 2 seats
const cWindow = (await book(carolTok, T(804), 1, '+201033334444', 'Carol Customer', 'p-804')).body;   // +5h: inside the window
const cStale = (await book(carolTok, T(807), 1, '+201033334444', 'Carol Customer', 'p-807')).body;    // will be moved inside the window after the page loads
const cHist = (await book(carolTok, T(808), 1, '+201033334444', 'Carol Customer', 'p-808')).body;
const dSame = (await book(daveTok, T(805), 1, '+201055556666', 'Dave Customer', 'd-805')).body;       // Dave on the SAME trip as Carol
const dFull = (await book(daveTok, T(806), 1, '+201055556666', 'Dave Customer', 'd-806')).body;       // fills the 1-seat trip
check('setup: bookings created through create_my_booking', [cCancel, cWindow, cStale, cHist, dSame, dFull].every((b) => b && b.reference));
check('setup: capacity counters = booked seats', seatsBooked(T(805)) === 3 && seatsBooked(T(806)) === 1 && seatsBooked(T(804)) >= 1);

const browser = await L.launch();
async function newSession(email, ctx = browser) { // a separate browser context = separate cookies, so two customers can be signed in at once
  const p = await L.newPage(ctx);
  await p.goto(L.BASE + '/app', { waitUntil: 'domcontentloaded', timeout: 60000 }); await waitText(p, /Showing \d+ Departures/i, 20000);
  await clickText(p, 'Sign In');
  await typeInto(p, '[role=dialog] input[type=email]', email); await typeInto(p, '[role=dialog] input[type=password]', PW);
  await clickText(p, 'Sign In', { sel: 'button[type=submit]', scope: '[role=dialog]' }); await sleep(2000);
  return p;
}
async function openPortal(p, who) {
  const h = await p.evaluateHandle((n) => [...document.querySelectorAll('button')].find((e) => e.offsetParent && e.innerText.includes(n)), who);
  await h.asElement().click(); await sleep(300);
  await clickText(p, 'My Trips'); await waitText(p, /My Trips & Bookings/, 8000); await sleep(1200);
}
const filter = async (p, label) => { await clickText(p, label, { sel: 'button' }); await sleep(500); };

// ---------- 1. navigation after sign-in + isolation ----------
const pc = await newSession('carol@e2e.test');
const afterLogin = await text(pc);
check('portal nav: signed in, menu shows the customer name', /Carol Customer/.test(afterLogin));
await openPortal(pc, 'Carol');
let pt = await portalText(pc);
check('portal nav: customer portal opens from the account menu', /My Trips & Bookings/.test(pt) && /Profile & Student ID/.test(pt));
check('portal: shows Carol\'s upcoming booking with the real reference and 2 seats / 90 EGP', pt.includes(cCancel.reference) && /2 Seats/.test(await cardFor(pc, cCancel.reference)) && /90 EGP/.test(await cardFor(pc, cCancel.reference)));
check('isolation: Carol\'s portal does NOT show Dave\'s bookings', !pt.includes(dSame.reference) && !pt.includes(dFull.reference));
await snap(pc, 'carol-portal');
// direct API attack from Carol's session: cancel Dave's booking / read his bookings
const carolTokBrowser = await L.tokenFor('carol@e2e.test', PW);
const attack = await L.rpc(carolTokBrowser, 'cancel_my_booking', { p_booking_id: dSame.id });
check('isolation: Carol cannot cancel Dave\'s booking by id (P0002, not found)', attack.status >= 400 && attack.body?.code === 'P0002', JSON.stringify(attack));
const peek = await L.rpc(carolTokBrowser, 'my_booking_details', {});
check('isolation: my_booking_details for Carol never contains Dave\'s ids', !JSON.stringify(peek.body).includes(dSame.id) && !JSON.stringify(peek.body).includes(dFull.id));
check('isolation: failed cancel changed nothing', bk(dSame.id).status === 'confirmed' && seatsBooked(T(805)) === 3);
const daveCtx = await browser.createBrowserContext();
const daveP = await newSession('dave@e2e.test', daveCtx); await openPortal(daveP, 'Dave');
const dpt = await portalText(daveP);
check('isolation: Dave sees his own bookings and none of Carol\'s', dpt.includes(dSame.reference) && !dpt.includes(cCancel.reference) && !dpt.includes(cWindow.reference));
await daveCtx.close();

// ---------- 2. cancellation UI: copy, window, success ----------
const card805 = await cardFor(pc, cCancel.reference);
check('cancel UI: confirmed booking inside the permitted window offers "Cancel Booking" (not "Request")', /Cancel Booking/.test(card805) && !/Request Cancellation/i.test(pt));
const card804 = await cardFor(pc, cWindow.reference);
check('window UI: booking inside the window has NO cancel button and says the period ended', !/Cancel Booking/.test(card804) && /Cancellation period has ended/.test(card804), card804);
check('window UI: no pending/"requested" state anywhere in the portal', !/Pending Review|Cancellation Requested|Requests/i.test(pt));
await snap(pc, 'before-cancel');
// open the modal for 805
const openCancel = async (p, ref) => p.evaluate((r) => { const els = [...document.querySelectorAll('div')].filter((d) => d.innerText.includes(r) && d.className.includes('rounded-2xl')); const c = els[els.length - 1]; const b = [...c.querySelectorAll('button')].find((x) => x.innerText.trim().startsWith('Cancel Booking')); if (!b) return false; b.click(); return true; }, ref);
check('cancel UI: modal opens', (await openCancel(pc, cCancel.reference)) && (await waitText(pc, /Cancellation is immediate and final/, 4000)));
const modal = await dialogText(pc);
check('cancel UI: modal states cancellation is immediate/final, no operator review, no hard-coded "3 hours"', /immediate and final/.test(modal) && /no operator review/.test(modal) && !/3 hours/i.test(modal), modal.slice(0, 300));
await typeInto(pc, '[role=dialog] textarea', 'Exam moved');
await clickText(pc, 'Cancel booking now', { sel: 'button', scope: '[role=dialog]' });
await sleep(2500);
pt = await portalText(pc);
const afterCancel = await cardFor(pc, cCancel.reference);
const dbc = bk(cCancel.id);
check('cancel success: DB booking cancelled with timestamp and reason', dbc.status === 'cancelled' && dbc.has_cancelled_at === true && dbc.cancellation_reason === 'Exam moved', JSON.stringify(dbc));
check('cancel success: capacity released exactly once (trip 805: 3 -> 1)', seatsBooked(T(805)) === 1, String(seatsBooked(T(805))));
check('cancel success: modal closed, no pending state, booking no longer under Upcoming', !(await dialogText(pc)) && !pt.includes(cCancel.reference) && !/Cancellation Requested|Pending Review/i.test(pt), pt.slice(0, 300));
await filter(pc, 'Cancelled');
const cancelledTab = await portalText(pc);
check('cancel success: appears under Cancelled with the Cancelled badge', cancelledTab.includes(cCancel.reference) && /Cancelled/.test(await cardFor(pc, cCancel.reference)));
await snap(pc, 'after-cancel');
// repeat cancellation (API): idempotent, no second release
const again = await L.rpc(carolTokBrowser, 'cancel_my_booking', { p_booking_id: cCancel.id });
const again2 = await L.rpc(carolTokBrowser, 'cancel_my_booking', { p_booking_id: cCancel.id });
check('repeat cancel: harmless no-op (already_cancelled, 0 seats released)', again.body?.already_cancelled === true && again.body?.seats_released === 0 && again2.body?.already_cancelled === true);
check('repeat cancel: capacity still released exactly once', seatsBooked(T(805)) === 1);
const dupes = Number(sql(`select count(*) from audit_logs where action = 'booking.cancelled' and entity_id = '${cCancel.id}'`));
check('repeat cancel: exactly one cancellation audit row', dupes === 1, String(dupes));

// ---------- 3. window rejection through the UI (stale page) ----------
await filter(pc, 'Upcoming');
check('window UI (stale): page still offers Cancel for the 48h booking', /Cancel Booking/.test(await cardFor(pc, cStale.reference)));
sql(`update trips set departure_at = now() + interval '10 hours', arrival_at = now() + interval '12 hours' where id = '${T(807)}'`); // time passes: now inside the window
check('window UI (stale): setup moved the trip inside the window', Number(sql(`select count(*) from public.bookings where id = '${cStale.id}'`)) === 1);
await openCancel(pc, cStale.reference); await waitText(pc, /immediate and final/, 3000);
await typeInto(pc, '[role=dialog] textarea', 'too late?');
await clickText(pc, 'Cancel booking now', { sel: 'button', scope: '[role=dialog]' }); await sleep(2000);
const dErr = await dialogText(pc);
check('window rejection: backend refuses, UI shows the localized "cancellation period has ended" error and stays open', /cancellation period for this trip has ended/i.test(dErr), dErr.slice(0, 300));
check('window rejection: booking still confirmed, seat still taken', bk(cStale.id).status === 'confirmed' && seatsBooked(T(807)) === 1);
await pc.keyboard.press('Escape'); await sleep(400);
await clickText(pc, 'Cancel', { sel: 'button', scope: '[role=dialog]' }).catch(() => {});

// ---------- 4. over-capacity in the booking UI ----------
await pc.goto(L.BASE + '/app', { waitUntil: 'domcontentloaded' }); await waitText(pc, /Showing \d+ Departures/i, 20000); await sleep(800);
const farDate = sql(`select to_char(departure_at at time zone 'Africa/Cairo','YYYY-MM-DD') from trips where id = '${T(806)}'`);
await pc.$eval('input[type=date]', (el, v) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, farDate);
await clickText(pc, 'Find Scheduled Trips'); await sleep(1200);
const fullCard = await pc.evaluate(() => [...document.querySelectorAll('button')].filter((b) => b.offsetParent).map((b) => b.innerText.trim()).filter((t) => /Book Seat|Fully Booked|Full|Sold/i.test(t)));
console.log('FULL-CARD-BUTTONS', JSON.stringify(fullCard));
check('over-capacity: the full trip is marked as full in search (0 seats left)', Number(sql(`select seats_available from public_search_trips() where trip_id = '${T(806)}'`)) === 0);
// Race: the page believes there is a seat. Make the UI attempt the booking while the DB is already full.
sql(`update trips set capacity = 3 where id = '${T(806)}'`); // DB: temporarily 2 seats free so the card is bookable
await pc.reload({ waitUntil: 'domcontentloaded' }); await waitText(pc, /Showing \d+ Departures/i, 20000); await sleep(600);
await pc.$eval('input[type=date]', (el, v) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, farDate);
await clickText(pc, 'Find Scheduled Trips'); await waitText(pc, /Showing 1 Departure/i, 6000);
await clickText(pc, 'Book Seat'); await waitText(pc, /Book Your Seat/, 6000);
await typeInto(pc, '[role=dialog] input[placeholder="01012345678"]', '01033334444');
sql(`update trips set capacity = 1 where id = '${T(806)}'`); // someone else took the seats before Carol confirms: DB is full again
await clickText(pc, 'Confirm booking', { sel: 'button[type=submit]', scope: '[role=dialog]' }); await sleep(2000);
const capErr = await dialogText(pc);
check('over-capacity: booking is refused with the "not enough seats" message, dialog stays open', /Not enough seats are left on this trip/.test(capErr) && !/MB-[A-Z0-9]{4,}/.test(capErr), capErr.slice(0, 300));
check('over-capacity: nothing was booked, counter unchanged', seatsBooked(T(806)) === 1 && Number(sql(`select count(*) from bookings b join customers c on c.id = b.customer_id join auth.users u on u.id = c.user_id where u.email = 'carol@e2e.test' and b.trip_id = '${T(806)}'`)) === 0);
await snap(pc, 'over-capacity');

// ---------- 5. history correct after refresh ----------
await pc.goto(L.BASE + '/app', { waitUntil: 'domcontentloaded' }); await waitText(pc, /Carol Customer/, 15000);
await openPortal(pc, 'Carol'); await filter(pc, 'All Bookings');
const hist = await portalText(pc);
const dbRows = sql(`select b.reference || ':' || b.status from bookings b join customers c on c.id = b.customer_id join auth.users u on u.id = c.user_id where u.email = 'carol@e2e.test' order by b.reference`).split('\n');
check('refresh: every one of Carol\'s DB bookings is listed, none of Dave\'s', dbRows.length === 4 && dbRows.every((r) => hist.includes(r.split(':')[0])) && !hist.includes(dSame.reference) && !hist.includes(dFull.reference), JSON.stringify(dbRows));
const statusOk = dbRows.every((r) => { const [ref, st] = r.split(':'); return st === 'cancelled' ? /Cancelled/.test(hist.slice(hist.indexOf(ref), hist.indexOf(ref) + 400)) : /Confirmed/.test(hist.slice(hist.indexOf(ref), hist.indexOf(ref) + 400)); });
check('refresh: statuses on screen match the database (1 cancelled, 3 confirmed)', statusOk && dbRows.filter((r) => r.endsWith(':cancelled')).length === 1, JSON.stringify(dbRows));
const liveSum = Number(sql(`select sum(b.total_amount) from bookings b join customers c on c.id = b.customer_id join auth.users u on u.id = c.user_id where u.email = 'carol@e2e.test' and b.status <> 'cancelled'`));
check('refresh: total trips/spent exclude the cancelled booking', /TOTAL TRIPS \| 3/.test(hist) && hist.includes(`TOTAL SPENT | ${liveSum} EGP`), `${liveSum} :: ${hist.slice(0, 160)}`);
const ls = await pc.evaluate(() => Object.keys(localStorage));
check('refresh: portal state comes from the backend (no booking data in localStorage)', ls.every((k) => /theme|locale|lang|sb-/.test(k)), JSON.stringify(ls));
check('no uncaught page errors', pc.errors.length === 0, JSON.stringify(pc.errors));
await snap(pc, 'history');
await browser.close();
process.exit(L.summary() ? 0 : 1);
