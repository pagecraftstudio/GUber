// STAGING-ONLY Realtime security PoC, rev 2. DRAFT: syntax-checked only. NOT EXECUTED against any project.
// Writes NOTHING to the database: it only subscribes, listens, tries (and expects to fail) to publish, and does read-only REST probes.
// Env: SUPABASE_URL, SUPABASE_ANON_KEY (publishable key ONLY), STAGING_PROJECT_REF (must be inside SUPABASE_URL),
//      PRODUCTION_PROJECT_REF (must NOT be inside SUPABASE_URL), ROLE=anon|customer, PHASE=before|after,
//      CUSTOMER_EMAIL, CUSTOMER_PASSWORD (customer role only; a staging test account with no company membership)
// Topics touched: poc:marketplace:v1 (allowed by the PoC policy) and poc:other, poc:auth-only (no policy) and spelling variants. Nothing else.
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const E = process.env;
const ROLE = E.ROLE ?? 'anon', PHASE = E.PHASE ?? 'after';
const must = (k) => { if (!E[k]) throw new Error(`set ${k}`); return E[k]; };
const URL_ = must('SUPABASE_URL'), KEY = must('SUPABASE_ANON_KEY'), STG = must('STAGING_PROJECT_REF'), PRD = must('PRODUCTION_PROJECT_REF');
if (!URL_.includes(STG)) throw new Error('refusing: SUPABASE_URL does not contain STAGING_PROJECT_REF');
if (URL_.includes(PRD) || STG === PRD) throw new Error('refusing: SUPABASE_URL contains PRODUCTION_PROJECT_REF');
if (/service_role|sb_secret_/.test(KEY)) throw new Error('refusing: not a publishable key');
if (ROLE === 'customer') { must('CUSTOMER_EMAIL'); must('CUSTOMER_PASSWORD'); }

const ALLOWED = 'poc:marketplace:v1', OTHER = 'poc:other', AUTHONLY = 'poc:auth-only';
const VARIANTS = ['poc:marketplace:v1 ', 'poc:marketplace:v10', 'POC:MARKETPLACE:V1', 'poc:marketplace:v1:x'];  // + poc:user:<own uid> and poc:user:<random uid> added below
const WAIT_OWNER_MS = 90_000, OBSERVE_MS = 15_000;
const T0 = Date.now(), iso = () => new Date().toISOString(), sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nonce = () => randomBytes(5).toString('hex');
const evidence = { role: ROLE, phase: PHASE, startedAt: iso(), supabaseHost: new URL(URL_).host, tests: {}, rest: {} };
const verdicts = [];
function record(id, expected, observed, verdict, why) { evidence.tests[id] = { expected, observed, verdict, why }; verdicts.push([id, verdict]); console.log(id, verdict, '-', why); }

async function mkClient(role) {
  const sb = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  let token = KEY, uid = null;
  if (role === 'customer') {
    const { data, error } = await sb.auth.signInWithPassword({ email: E.CUSTOMER_EMAIL, password: E.CUSTOMER_PASSWORD });
    if (error) throw new Error('customer sign-in failed: ' + (error.status ?? 'error'));
    token = data.session.access_token; uid = data.user.id;
  }
  await sb.realtime.setAuth(token);
  return { sb, token, role, uid };
}
// join(client, topic) -> { ch, status, err, log[] }. log = EVERY broadcast delivered on this channel, with local receive time.
function join(c, topic, { self = false } = {}) {
  return new Promise((resolve) => {
    const rec = { topic, role: c.role, log: [], statuses: [] };
    const ch = c.sb.channel(topic, { config: { private: true, broadcast: { self, ack: true } } });
    ch.on('broadcast', { event: '*' }, (m) => rec.log.push({ at: iso(), event: m.event, payload: m.payload }));
    const done = (status, err) => resolve({ ...rec, ch, status, err });
    const t = setTimeout(() => done('NO_STATUS_15S'), 15_000);
    ch.subscribe((status, err) => {
      rec.statuses.push({ at: iso(), status, err: err?.message ?? null });
      if (['SUBSCRIBED', 'CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) { clearTimeout(t); done(status, err?.message ?? null); }
    });
  });
}
const saw = (j, n) => j.log.some((m) => JSON.stringify(m.payload ?? {}).includes(n));
const sawAny = (j) => j.log.length;
async function waitSaw(js, n, ms) { const end = Date.now() + ms; while (Date.now() < end) { if (js.every((j) => saw(j, n))) return true; await sleep(250); } return js.every((j) => saw(j, n)); }
const ownerSql = (topic, n) => `select now() as owner_sent_at, realtime.send(jsonb_build_object('nonce','${n}'), 'invalidate', '${topic}', true);`;
async function ownerSend(topic, n, label) { console.log(`\n>>> OWNER, SQL EDITOR (${label}, within ${WAIT_OWNER_MS / 1000}s). Copy the owner_sent_at value into your result log:\n    ${ownerSql(topic, n)}\n`); }

const me = await mkClient(ROLE);                 // role under test
const obsAnon = await mkClient('anon');          // independent observer, anon
const obs2 = ROLE === 'customer' ? await mkClient('customer') : null; // second independent customer session
const closers = [];

// ---------- T1 + T2: allowed topic, subscribe and receive (with TWO independent observers)
const S = await join(me, ALLOWED, { self: true }); closers.push(S);
const O1 = await join(obsAnon, ALLOWED); closers.push(O1);
const O2 = obs2 ? await join(obs2, ALLOWED) : null; if (O2) closers.push(O2);
const observers = [O1, ...(O2 ? [O2] : [])];
record('T1', 'sender and observers all SUBSCRIBED', { sender: S.statuses, observers: observers.map((o) => o.statuses) },
  [S, ...observers].every((x) => x.status === 'SUBSCRIBED') ? 'PASS' : 'FAIL', `statuses sender=${S.status} observers=${observers.map((o) => o.status)}`);
const c1 = nonce(); await ownerSend(ALLOWED, c1, 'positive control C1 on allowed topic');
const got1 = await waitSaw([S, ...observers], c1, WAIT_OWNER_MS);
record('T2', 'owner-sent C1 delivered to sender AND every observer', { c1, deliveredTo: { sender: saw(S, c1), observers: observers.map((o) => saw(o, c1)) } }, got1 ? 'PASS' : 'FAIL', got1 ? 'C1 delivered to all' : 'C1 not delivered to all');

// ---------- T3: client publish must be rejected AND not delivered
const n3 = nonce(); let wsStatus; try { wsStatus = await S.ch.send({ type: 'broadcast', event: 'invalidate', payload: { nonce: n3 } }); } catch (e) { wsStatus = 'threw:' + e.message; }
let httpStatus = null;
try { const r = await fetch(`${URL_}/realtime/v1/api/broadcast`, { method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${me.token}`, 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ topic: ALLOWED, event: 'invalidate', payload: { nonce: n3 + 'h' }, private: true }] }) }); httpStatus = r.status; } catch (e) { httpStatus = 'threw:' + e.message; }
await sleep(OBSERVE_MS);
const leaked3 = [S, ...observers].some((j) => saw(j, n3) || saw(j, n3 + 'h'));
const c2 = nonce(); await ownerSend(ALLOWED, c2, 'post-control C2 on allowed topic (proves channels still alive)');
const alive = await waitSaw([S, ...observers], c2, WAIT_OWNER_MS);
const rejected = ['error', 'timed out'].includes(wsStatus) || (typeof wsStatus === 'string' && wsStatus.startsWith('threw:'));
let v3, why3;
if (!got1 || !alive) { v3 = 'INCONCLUSIVE'; why3 = 'control messages not delivered; non-delivery proves nothing'; }
else if (leaked3) { v3 = 'FAIL'; why3 = 'client-published message was delivered'; }
else if (rejected) { v3 = 'PASS'; why3 = 'sender status indicates rejection AND nobody (incl. server echo to sender) received it, controls delivered'; }
else { v3 = 'INCONCLUSIVE'; why3 = `not delivered but sender status was ${JSON.stringify(wsStatus)} (acked without delivery): follow up, not accepted as proof of rejection`; }
record('T3', 'ws send rejected (error/timed out), HTTP broadcast rejected, N3 absent from sender+all observers, controls C1/C2 present', { n3, wsStatus, httpBroadcastStatus: httpStatus, controls: { c1: got1, c2: alive }, N3seenBy: { sender: saw(S, n3), observers: observers.map((o) => saw(o, n3)) }, logs: { sender: S.log, observers: observers.map((o) => o.log) } }, v3, why3);

// ---------- T4: unauthorized topic: join refused AND no delivery; cross-topic leak; spelling variants
const n4 = nonce(), n4c = nonce();
const U = await join(me, OTHER); closers.push(U);
const A_only = S; // already joined ONLY to the allowed topic: used for the cross-topic leak check
let delivered4 = false, ownerNote4 = 'join refused; no owner send needed for U';
if (U.status === 'SUBSCRIBED') { await ownerSend(OTHER, n4, 'T4 event to the UNAUTHORIZED topic poc:other'); await sleep(20_000); delivered4 = saw(U, n4); ownerNote4 = 'join unexpectedly SUBSCRIBED; delivery checked'; }
await ownerSend(OTHER, n4c, 'T4 cross-topic event to poc:other while sender is joined ONLY to poc:marketplace:v1'); await sleep(20_000);
const crossLeak = saw(A_only, n4c) || observers.some((o) => saw(o, n4c));
const variantRes = [];
VARIANTS.push(`poc:user:${me.uid ?? '00000000-0000-0000-0000-000000000000'}`, 'poc:user:11111111-1111-1111-1111-111111111111');
for (const v of VARIANTS) { const j = await join(me, v); closers.push(j); variantRes.push({ topic: v, status: j.status, err: j.err, statuses: j.statuses }); }
const variantAllowed = variantRes.filter((r) => r.status === 'SUBSCRIBED');
const af = await join(me, AUTHONLY); closers.push(af);
let v4, why4; const refused = U.status !== 'SUBSCRIBED';
if (delivered4 || crossLeak) { v4 = 'FAIL'; why4 = 'message delivered on an unauthorized topic or leaked across topics'; }
else if (!got1) { v4 = 'INCONCLUSIVE'; why4 = 'positive control failed; cannot interpret non-delivery'; }
else if (!refused || variantAllowed.length || af.status === 'SUBSCRIBED') { v4 = 'INCONCLUSIVE'; why4 = 'a join to an unauthorized topic/variant reported SUBSCRIBED but nothing was delivered: record exact statuses; treat as finding to investigate'; }
else { v4 = 'PASS'; why4 = 'all unauthorized joins refused, no delivery, no cross-topic leak'; }
record('T4', 'join to poc:other, poc:auth-only and 4 spelling variants + 2 per-user topics refused; N4/N4c never delivered anywhere; controls present', { n4, n4c, otherJoin: { status: U.status, err: U.err, statuses: U.statuses }, authOnlyJoin: { status: af.status, err: af.err }, variants: variantRes, deliveredOnOther: delivered4, crossTopicLeak: crossLeak, note: ownerNote4, senderLog: S.log, observerLogs: observers.map((o) => o.log) }, v4, why4);

// ---------- T5 presence
let pres; try { pres = await S.ch.track({ nonce: nonce() }); } catch (e) { pres = 'threw:' + e.message; }
record('T5', 'presence track not ok', { pres }, pres === 'ok' ? 'FAIL' : 'PASS', `track result ${JSON.stringify(pres)}`);

// ---------- T6 REST exposure snapshot (counts and codes only; select=id; no row contents stored)
for (const t of ['trips', 'bookings', 'customers', 'tickets', 'messages']) {
  const prof = t === 'messages' ? { 'Accept-Profile': 'realtime' } : {};
  try { const r = await fetch(`${URL_}/rest/v1/${t}?select=id&limit=1`, { headers: { apikey: KEY, Authorization: `Bearer ${me.token}`, ...prof } }); const txt = await r.text(); let rows = null, code = null; try { const j = JSON.parse(txt); rows = Array.isArray(j) ? j.length : null; code = Array.isArray(j) ? null : (j.code ?? null); } catch {} evidence.rest[t] = { status: r.status, rows, code }; }
  catch (e) { evidence.rest[t] = { error: String(e.message) }; }
}
record('T6', 'REST snapshot identical to the PHASE=before file for the same ROLE', { rest: evidence.rest }, 'PENDING-DIFF', 'compare poc-evidence-<role>-before.json vs -after.json (statuses, rows, codes) with: diff <(jq .rest before.json) <(jq .rest after.json)');

for (const j of closers) { try { await j.ch.unsubscribe(); } catch {} }
evidence.finishedAt = iso(); evidence.verdicts = Object.fromEntries(verdicts);
const out = `poc-evidence-${ROLE}-${PHASE}.json`; writeFileSync(out, JSON.stringify(evidence, null, 2));
console.log('\nwrote', out, '\nPARITY (T7) is checked by the owner by comparing the anon and customer evidence files: customer verdict must equal anon verdict or be stricter for every test.');
process.exit(verdicts.some(([, v]) => v === 'FAIL') ? 1 : 0);
