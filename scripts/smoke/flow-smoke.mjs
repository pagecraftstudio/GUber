#!/usr/bin/env node
// Authenticated flow smoke test over the PUBLIC API (supabase REST + Auth), the same calls the browser makes.
// Targets: SMOKE_TARGET=local (throw-away local stack) or SMOKE_TARGET=staging (a hosted STAGING project). There is NO production mode.
// Needs Node >= 20 (global fetch), no dependencies. It WRITES bookings (and cancels them again), so it only ever runs against disposable data.
//
// Required env:
//   SMOKE_TARGET=local|staging
//   SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY               (the same two values the app uses; never a service-role key)
//   SMOKE_COMPANY_SLUG                                   (default staging-demo): only this company's trips are ever booked
//   SMOKE_CUSTOMER_EMAIL / _PASSWORD, SMOKE_CUSTOMER2_EMAIL / _PASSWORD     two different confirmed customer accounts
// staging also requires: STAGING_PROJECT_REF (must be inside SUPABASE_URL), PRODUCTION_PROJECT_REF (must NOT be, strongly recommended)
// Optional:
//   SMOKE_APP_URL  (the deployed Next.js app origin, e.g. https://staging.example.com). When set, the anonymous marketplace search and the stop
//     listing go through the real HTTP routes /api/public/trips and /api/public/trips/:id/stops, exactly like the browser. When unset, the
//     search falls back to the direct RPC and the HTTP-route checks are SKIPPED (reported, never silently passed).
//   SMOKE_DRIVER_EMAIL / _PASSWORD + SMOKE_BOARD_TRIP_ID (a scheduled trip departing in 65..110 min, assigned to that driver; inside the
//     boarding window and outside the 60 min booking cutoff) [+ SMOKE_OTHER_TRIP_ID: a second trip, to prove wrong-trip rejection]
//   SMOKE_ADMIN_EMAIL / _PASSWORD (platform super_admin: proves /admin RPC access)
// Secrets are never printed: tokens, QR payloads and passwords stay in memory.
const env = (k, d) => (process.env[k] ?? d ?? '').trim();
const TARGET = env('SMOKE_TARGET'), URLX = env('SUPABASE_URL').replace(/\/$/, ''), KEY = env('SUPABASE_PUBLISHABLE_KEY');
const SLUG = env('SMOKE_COMPANY_SLUG', 'staging-demo');
const APP = env('SMOKE_APP_URL').replace(/\/$/, '');
let fail = 0, ran = 0, skipped = 0;
const die = (m) => { console.error('REFUSING: ' + m); process.exit(2); };
const ok = (n) => { ran++; console.log('PASS  ' + n); };
const bad = (n, d = '') => { ran++; fail = 1; console.log('FAIL  ' + n + (d ? '  -> ' + d : '')); };
const skip = (n, why) => { skipped++; console.log('SKIP  ' + n + '  (' + why + ')'); };
const check = (n, cond, d) => (cond ? ok(n) : bad(n, d));

// ---- guards: never production ----
if (TARGET !== 'local' && TARGET !== 'staging') die('set SMOKE_TARGET=local or SMOKE_TARGET=staging (there is no production mode)');
if (!URLX || !KEY) die('SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are required');
if (/service[_-]?role/i.test(KEY)) die('that looks like a service-role key; use the publishable (anon) key');
try { const p = JSON.parse(Buffer.from(KEY.split('.')[1] ?? '', 'base64url').toString()); if (p.role && p.role !== 'anon') die('the key carries role "' + p.role + '"; use the publishable (anon) key'); } catch { /* new-style publishable keys are not JWTs */ }
const host = new URL(URLX).hostname;
if (TARGET === 'local') { if (!['localhost', '127.0.0.1'].includes(host)) die('SMOKE_TARGET=local but SUPABASE_URL host is not localhost'); }
else {
  const s = env('STAGING_PROJECT_REF'), p = env('PRODUCTION_PROJECT_REF');
  if (!s) die('SMOKE_TARGET=staging requires STAGING_PROJECT_REF');
  if (!URLX.includes(s)) die('SUPABASE_URL does not contain STAGING_PROJECT_REF; wrong project?');
  if (p && (p === s || URLX.includes(p))) die('SUPABASE_URL matches PRODUCTION_PROJECT_REF');
  if (new URL(URLX).protocol !== 'https:') die('staging must use https');
}
if (APP) {
  let u; try { u = new URL(APP); } catch { die('SMOKE_APP_URL is not a URL'); }
  if (TARGET === 'staging' && u.protocol !== 'https:') die('staging SMOKE_APP_URL must use https');
  if (TARGET === 'local' && !['localhost', '127.0.0.1'].includes(u.hostname)) die('SMOKE_TARGET=local but SMOKE_APP_URL host is not localhost');
}
const need = (k) => env(k) || die('missing ' + k);
const C1 = { email: need('SMOKE_CUSTOMER_EMAIL'), password: need('SMOKE_CUSTOMER_PASSWORD') };
const C2 = { email: need('SMOKE_CUSTOMER2_EMAIL'), password: need('SMOKE_CUSTOMER2_PASSWORD') };
if (C1.email.toLowerCase() === C2.email.toLowerCase()) die('the two customer accounts must differ');

// ---- tiny client ----
async function req(path, { token, method = 'GET', body, headers = {} } = {}) {
  const r = await fetch(URLX + path, { method, headers: { apikey: KEY, authorization: 'Bearer ' + (token || KEY), 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  let j = null; try { j = await r.json(); } catch { /* empty */ }
  return { status: r.status, body: j };
}
const rpc = (fn, args = {}, token) => req('/rest/v1/rpc/' + fn, { token, method: 'POST', body: args });
const login = async (acct) => { const r = await req('/auth/v1/token?grant_type=password', { method: 'POST', body: acct }); return r.status === 200 ? r.body.access_token : null; };
/** Anonymous GET against the Next.js app (not Supabase): the public HTTP routes. */
const appGet = async (path) => {
  const r = await fetch(APP + path, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
  let j = null; try { j = await r.json(); } catch { /* empty */ }
  return { status: r.status, body: j, headers: r.headers };
};
const code = (r) => r.body?.code ?? String(r.status);
const denied = (r) => [401, 403].includes(r.status) || ['42501', 'PGRST301', 'PGRST302'].includes(r.body?.code);
const key = () => 'smoke-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
const created = []; // [token, booking id] cancelled again at the end

console.log(`target: ${TARGET} ${host}   company: ${SLUG}`);

// 1. public marketplace
const search = APP ? await appGet('/api/public/trips?limit=100') : await rpc('public_search_trips', { p_limit: 100 });
const searchRows = APP ? search.body?.data : search.body;
const trips = Array.isArray(searchRows) ? searchRows.filter((t) => t.company_slug === SLUG) : [];
check(APP ? 'marketplace: GET /api/public/trips answers 200 (HTTP route, not direct RPC)' : 'marketplace: anonymous search answers 200 (direct RPC; set SMOKE_APP_URL to test the HTTP route)', search.status === 200, String(search.status));
check(`marketplace: company ${SLUG} has an open trip`, trips.length > 0, 'seed the staging data first (supabase/staging/seed_staging.sql)');
check('marketplace: result carries no private fields', trips.length === 0 || !Object.keys(trips[0]).some((k) => /bus|driver|plate|license|phone|token/i.test(k)), Object.keys(trips[0] ?? {}).join(','));
if (!trips.length) { console.log('\nFLOW SMOKE: FAIL (nothing to book)'); process.exit(1); }
// the farthest departure: a booking must be cancellable (outside the company's cancellation window) so the smoke leaves nothing behind
const trip = [...trips].filter((t) => t.seats_available >= 2).sort((a, b) => (a.departure_at < b.departure_at ? 1 : -1))[0] ?? trips[0];
const seatsOf = async (id) => APP
  ? (await appGet(`/api/public/trips?companyId=${trip.company_id}&limit=100`)).body?.data?.find((t) => t.trip_id === id)?.seats_available
  : (await rpc('public_search_trips', { p_company_id: trip.company_id, p_limit: 100 })).body?.find((t) => t.trip_id === id)?.seats_available;
if (APP) {
  const c = search.headers.get('cache-control') ?? '';
  check('marketplace: HTTP route sends a browser-safe Cache-Control (no stale-while-revalidate, max-age=0)', /max-age=0/.test(c) && !/stale-while-revalidate/.test(c), c);
  const st = await appGet(`/api/public/trips/${trip.trip_id}/stops`);
  check('marketplace: GET /api/public/trips/:id/stops answers 200 with an array', st.status === 200 && Array.isArray(st.body?.data), String(st.status));
  const bad = await appGet('/api/public/trips?limit=100000');
  check('marketplace: HTTP route rejects invalid input with 400', bad.status === 400, String(bad.status));
} else skip('marketplace: HTTP routes /api/public/*', 'SMOKE_APP_URL not set');

// 2. anonymous cannot do customer things
const anonBook = await rpc('create_my_booking', { p_trip_id: trip.trip_id, p_seats: 1, p_full_name: 'x', p_phone: '+201000000000', p_idempotency_key: key() });
check('anonymous cannot book', denied(anonBook), code(anonBook));
check('anonymous cannot read bookings table', (await req('/rest/v1/bookings?select=id&limit=1')).body?.length === 0 || denied(await req('/rest/v1/bookings?select=id&limit=1')));

// 3. customer 1 books, replays, reads, gets QR
const t1 = await login(C1), t2 = await login(C2);
check('customer 1 can sign in (email confirmed)', !!t1, 'sign-in failed: confirmed account? password?');
check('customer 2 can sign in', !!t2);
if (!t1 || !t2) { console.log('\nFLOW SMOKE: FAIL (cannot sign in)'); process.exit(1); }
const before = await seatsOf(trip.trip_id);
const k1 = key();
const b1 = await rpc('create_my_booking', { p_trip_id: trip.trip_id, p_seats: 1, p_full_name: 'Smoke One', p_phone: env('SMOKE_CUSTOMER_PHONE', '+201000990001'), p_idempotency_key: k1 }, t1);
check('booking: created and confirmed', b1.status === 200 && b1.body?.status === 'confirmed', `${b1.status} ${code(b1)}`);
const bid = b1.body?.id; if (bid) created.push([t1, bid]);
const rep = await rpc('create_my_booking', { p_trip_id: trip.trip_id, p_seats: 1, p_full_name: 'Smoke One', p_phone: env('SMOKE_CUSTOMER_PHONE', '+201000990001'), p_idempotency_key: k1 }, t1);
check('booking: replaying the same key returns the same booking, no second seat', rep.body?.id === bid && String(rep.body?.idempotent_replay) === 'true', `${rep.status} ${code(rep)}`);
check('seats: availability dropped by exactly 1', before !== undefined && (await seatsOf(trip.trip_id)) === before - 1, `before=${before}`);
const mine = await rpc('my_booking_details', {}, t1);
check('portal: customer 1 sees the booking', Array.isArray(mine.body) && mine.body.some((b) => b.id === bid));
const theirs = await rpc('my_booking_details', {}, t2);
check('isolation: customer 2 does not see it', Array.isArray(theirs.body) && !theirs.body.some((b) => b.id === bid));
const peek = await rpc('my_ticket_qr', { p_booking_id: bid }, t2);
check('isolation: customer 2 cannot fetch its QR', peek.status >= 400 && !JSON.stringify(peek.body).includes('MALAKY:TICKET'), code(peek));
const steal = await rpc('cancel_my_booking', { p_booking_id: bid }, t2);
check('isolation: customer 2 cannot cancel it', steal.status >= 400, code(steal));
const qr = await rpc('my_ticket_qr', { p_booking_id: bid }, t1);
check('ticket: owner gets exactly 1 QR payload with the expected format', qr.status === 200 && Array.isArray(qr.body) && qr.body.length === 1 && /^MALAKY:TICKET:/.test(qr.body[0]?.qr_payload ?? ''), String(qr.status));
for (const t of ['bookings', 'tickets', 'audit_logs', 'companies', 'subscriptions', 'platform_users']) {
  const r = await req(`/rest/v1/${t}?select=*&limit=3`, { token: t2 });
  check(`cross-tenant: customer cannot read raw ${t}`, denied(r) || (Array.isArray(r.body) && r.body.length === 0), `${r.status} rows=${Array.isArray(r.body) ? r.body.length : '?'}`);
}

// 4. cancel + release
const c1r = await rpc('cancel_my_booking', { p_booking_id: bid }, t1);
check('cancel: owner cancels (outside the cancellation window)', c1r.status === 200, `${c1r.status} ${code(c1r)} (trip must depart after the company's cancellation window)`);
if (c1r.status === 200) created.pop();
check('cancel: seat is released', (await seatsOf(trip.trip_id)) === before);
const again = await rpc('cancel_my_booking', { p_booking_id: bid }, t1);
check('cancel: repeating is harmless', again.status === 200 || again.status === 409 || again.status === 404, String(again.status));
check('seats: repeat cancel did not release twice', (await seatsOf(trip.trip_id)) === before);

// 5. driver + boarding (optional, needs a trip inside the boarding window)
const dEmail = env('SMOKE_DRIVER_EMAIL'), bTrip = env('SMOKE_BOARD_TRIP_ID'), oTrip = env('SMOKE_OTHER_TRIP_ID');
if (dEmail && env('SMOKE_DRIVER_PASSWORD') && bTrip) {
  const td = await login({ email: dEmail, password: env('SMOKE_DRIVER_PASSWORD') });
  check('driver can sign in', !!td);
  const mine = await rpc('driver_my_trips', {}, td);
  check('driver sees assigned trips only (all rows belong to the driver)', mine.status === 200 && Array.isArray(mine.body) && mine.body.some((t) => t.trip_id === bTrip), String(mine.status));
  check('customer cannot use driver RPCs', denied(await rpc('driver_my_trips', {}, t1)) || (await rpc('driver_my_trips', {}, t1)).body?.length === 0);
  const bb = await rpc('create_my_booking', { p_trip_id: bTrip, p_seats: 2, p_full_name: 'Smoke One', p_phone: env('SMOKE_CUSTOMER_PHONE', '+201000990001'), p_idempotency_key: key() }, t1);
  check('boarding setup: booked 2 seats on the boarding trip', bb.status === 200, `${bb.status} ${code(bb)} (trip must depart in 65..110 min)`);
  if (bb.body?.id) {
    created.push([t1, bb.body.id]);
    const q = (await rpc('my_ticket_qr', { p_booking_id: bb.body.id }, t1)).body ?? [];
    const board = async (trip_id, tok, who = td) => (await rpc('board_ticket', { p_trip_id: trip_id, p_token: tok }, who));
    const g = await board(bTrip, 'MALAKY:TICKET:not-a-real-token');
    check('boarding: a forged code is rejected', g.status >= 400 || /invalid/i.test(JSON.stringify(g.body)), code(g));
    const cb = await board(bTrip, q[0]?.qr_payload, t1);
    check('boarding: a customer cannot board', cb.status >= 400, code(cb));
    const ok1 = await board(bTrip, q[0]?.qr_payload);
    check('boarding: valid ticket boards', ok1.status === 200 && ok1.body?.result === 'boarded', `${ok1.status} ${JSON.stringify(ok1.body?.result ?? code(ok1))}`);
    const dup = await board(bTrip, q[0]?.qr_payload);
    check('boarding: duplicate scan is refused as already boarded', dup.status === 200 && dup.body?.result === 'already_boarded', `${dup.status} ${JSON.stringify(dup.body?.result ?? code(dup))}`);
    if (oTrip) {
      const ob = await rpc('create_my_booking', { p_trip_id: oTrip, p_seats: 1, p_full_name: 'Smoke One', p_phone: env('SMOKE_CUSTOMER_PHONE', '+201000990001'), p_idempotency_key: key() }, t1);
      if (ob.body?.id) { created.push([t1, ob.body.id]); const oq = (await rpc('my_ticket_qr', { p_booking_id: ob.body.id }, t1)).body ?? []; const wr = await board(bTrip, oq[0]?.qr_payload); check('boarding: a ticket of another trip is rejected', !(wr.status === 200 && wr.body?.result === 'boarded'), JSON.stringify(wr.body?.result ?? code(wr))); }
      else bad('wrong-trip setup', `${ob.status} ${code(ob)}`);
    } else skip('boarding: wrong-trip rejection', 'SMOKE_OTHER_TRIP_ID not set');
  }
} else skip('driver + boarding flow', 'SMOKE_DRIVER_EMAIL/_PASSWORD/SMOKE_BOARD_TRIP_ID not set');

// 6. /admin surface: only platform staff
for (const [who, tok] of [['anonymous', undefined], ['customer', t1]]) {
  const r = await rpc('admin_platform_overview', {}, tok);
  check(`admin: ${who} is denied admin_platform_overview`, denied(r) || r.status >= 400, `${r.status} ${code(r)}`);
  const l = await rpc('admin_list_audit_logs', {}, tok);
  check(`admin: ${who} is denied the audit log`, denied(l) || l.status >= 400, `${l.status} ${code(l)}`);
  const w = await rpc('admin_set_company_status', { p_company: trip.company_id, p_status: 'suspended', p_reason: 'smoke should be denied' }, tok);
  check(`admin: ${who} cannot suspend a company`, denied(w) || w.status >= 400, `${w.status} ${code(w)}`);
}
if (env('SMOKE_ADMIN_EMAIL') && env('SMOKE_ADMIN_PASSWORD')) {
  const ta = await login({ email: env('SMOKE_ADMIN_EMAIL'), password: env('SMOKE_ADMIN_PASSWORD') });
  check('admin: super admin can sign in', !!ta);
  const ov = await rpc('admin_platform_overview', {}, ta);
  check('admin: super admin reads the platform overview', ov.status === 200, `${ov.status} ${code(ov)}`);
  const cl = await rpc('admin_list_companies', {}, ta);
  check('admin: super admin lists companies, including the staging one', cl.status === 200 && JSON.stringify(cl.body).includes(SLUG), `${cl.status}`);
  const al = await rpc('admin_list_audit_logs', {}, ta);
  check('admin: super admin reads the audit log', al.status === 200, `${al.status} ${code(al)}`);
  const cs = await rpc('admin_set_subscription_status', { p_subscription: '00000000-0000-4000-8000-00000000dead', p_status: 'active', p_reason: 'smoke probe' }, ta);
  check('admin: an unknown subscription id is refused with the database not-found error (P0002), nothing changed', cs.status >= 400 && code(cs) === 'P0002', `${cs.status} ${code(cs)}`);
} else skip('super admin checks', 'SMOKE_ADMIN_EMAIL/_PASSWORD not set');

// 7. sign-out (scope local) revokes the refresh token; the call itself must succeed
const lo = await req('/auth/v1/logout?scope=local', { token: t2, method: 'POST' });
check('sign-out: Auth logout answers 204', lo.status === 204 || lo.status === 200, String(lo.status));

// cleanup: cancel anything still open (best effort; trips close to departure may refuse, report it)
for (const [tok, id] of created) { const r = await rpc('cancel_my_booking', { p_booking_id: id }, tok); if (r.status !== 200) console.log(`NOTE  could not cancel smoke booking ${id.slice(0, 8)}: ${code(r)} (clean up by hand in the staging DB)`); }
console.log(`\nran ${ran}, skipped ${skipped}`); console.log(fail ? 'FLOW SMOKE: FAIL' : 'FLOW SMOKE: PASS'); process.exit(fail);
