// STAGING-ONLY Realtime security PoC. DRAFT: syntax-checked, NOT executed against any project.
// Needs: npm i @supabase/supabase-js ; env: SUPABASE_URL, SUPABASE_ANON_KEY (publishable key only; never a service key),
//        optional CUSTOMER_EMAIL + CUSTOMER_PASSWORD (a staging customer test account), PHASE=before|after
// Usage: PHASE=after ROLE=anon node poc-realtime.mjs   |   PHASE=after ROLE=customer node poc-realtime.mjs
// The script never sends privileged messages: YOU send test events from the SQL editor when it prompts (nonce printed).
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const { SUPABASE_URL, SUPABASE_ANON_KEY, CUSTOMER_EMAIL, CUSTOMER_PASSWORD } = process.env;
const ROLE = process.env.ROLE ?? 'anon', PHASE = process.env.PHASE ?? 'after';
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error('set SUPABASE_URL and SUPABASE_ANON_KEY');
if (/service_role|sb_secret_/.test(SUPABASE_ANON_KEY)) throw new Error('refusing: that is not a publishable key');
const TOPIC = 'poc:marketplace:v1', OTHER = 'poc:other', WAIT_MS = 60_000;
const results = [];
const rec = (id, expect, got, pass) => { results.push({ id, expect, got, verdict: pass === null ? 'INCONCLUSIVE' : pass ? 'PASS' : 'FAIL' }); console.log(id, results.at(-1).verdict, '-', got); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
let token = SUPABASE_ANON_KEY;
if (ROLE === 'customer') {
  const { data, error } = await sb.auth.signInWithPassword({ email: CUSTOMER_EMAIL, password: CUSTOMER_PASSWORD });
  if (error) throw new Error('customer sign-in failed: ' + error.status);
  token = data.session.access_token;
}
await sb.realtime.setAuth(token);

function join(topic, onMsg) {
  return new Promise((resolve) => {
    const ch = sb.channel(topic, { config: { private: true, broadcast: { self: false, ack: true } } });
    ch.on('broadcast', { event: '*' }, (m) => onMsg?.(m));
    const t = setTimeout(() => resolve({ ch, status: 'TIMEOUT_NO_STATUS' }), 15_000);
    ch.subscribe((status, err) => { if (['SUBSCRIBED', 'CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) { clearTimeout(t); resolve({ ch, status, err: err?.message }); } });
  });
}
async function waitFor(pred, ms) { const end = Date.now() + ms; while (Date.now() < end) { if (pred()) return true; await sleep(250); } return false; }

// T1 subscribe to the allowed private topic
const got1 = []; const a = await join(TOPIC, (m) => got1.push(m));
rec('T1 subscribe allowed private topic', 'SUBSCRIBED', a.status + (a.err ? ' ' + a.err : ''), a.status === 'SUBSCRIBED');

// T2 receive a test event sent by the owner from SQL
const n2 = randomBytes(4).toString('hex');
console.log(`\nRUN IN SQL EDITOR NOW (within ${WAIT_MS / 1000}s):\n  select realtime.send(jsonb_build_object('nonce','${n2}'), 'invalidate', '${TOPIC}', true);\n`);
const ok2 = await waitFor(() => got1.some((m) => JSON.stringify(m).includes(n2)), WAIT_MS);
rec('T2 receive owner-sent event', 'event with nonce delivered', ok2 ? 'delivered' : 'not delivered', ok2);

// T3 client cannot publish (a second, independent subscriber must NOT see it; sender must get error/not ok)
const got3 = []; const b = await join(TOPIC, (m) => got3.push(m));
const n3 = randomBytes(4).toString('hex');
let sendRes; try { sendRes = await a.ch.send({ type: 'broadcast', event: 'invalidate', payload: { nonce: n3 } }); } catch (e) { sendRes = 'threw:' + e.message; }
await sleep(5000);
const leaked = got3.some((m) => JSON.stringify(m).includes(n3)) || got1.some((m) => JSON.stringify(m).includes(n3));
rec('T3 client publish is not delivered', 'nobody receives the client message', `send=${JSON.stringify(sendRes)} delivered=${leaked}`, !leaked);

// T4 unrelated topic: join must be refused OR no event delivered
const got4 = []; const c = await join(OTHER, (m) => got4.push(m));
const n4 = randomBytes(4).toString('hex');
if (c.status === 'SUBSCRIBED') {
  console.log(`\nRUN IN SQL EDITOR NOW:\n  select realtime.send(jsonb_build_object('nonce','${n4}'), 'invalidate', '${OTHER}', true);\n`);
  const seen = await waitFor(() => got4.some((m) => JSON.stringify(m).includes(n4)), 20_000);
  rec('T4 unrelated topic', 'join refused, or nothing delivered', `join=SUBSCRIBED delivered=${seen}`, !seen);
} else rec('T4 unrelated topic', 'join refused, or nothing delivered', 'join=' + c.status + (c.err ? ' ' + c.err : ''), true);

// T5 presence is not granted
let pres; try { const p = await a.ch.track({ x: 1 }); pres = p; } catch (e) { pres = 'threw:' + e.message; }
rec('T5 presence track', 'not ok / error', JSON.stringify(pres), pres !== 'ok');

// T6 no table access through REST (snapshot; run with PHASE=before and PHASE=after, compare files)
const rest = {};
for (const t of ['trips', 'bookings', 'customers', 'tickets', 'messages']) {
  const schemaHdr = t === 'messages' ? { 'Accept-Profile': 'realtime' } : {};
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${t}?select=*&limit=1`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, ...schemaHdr } });
  const body = await r.text();
  rest[t] = { status: r.status, rows: r.ok ? (JSON.parse(body).length) : null, code: r.ok ? null : (JSON.parse(body || '{}').code ?? null) };
}
console.log('T6 REST snapshot', JSON.stringify(rest));
rec('T6 REST snapshot recorded', 'identical to PHASE=before for the same ROLE (diff the two JSON files)', 'saved', null);

for (const x of [a, b, c]) { try { await x.ch.unsubscribe(); } catch {} }
const out = `poc-result-${ROLE}-${PHASE}.json`;
writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), role: ROLE, phase: PHASE, results, rest }, null, 2));
console.log('\nwrote', out); process.exit(results.some((r) => r.verdict === 'FAIL') ? 1 : 0);
