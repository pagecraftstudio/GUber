// Runs scripts/smoke/flow-smoke.mjs against the LOCAL stack (production build, local Postgres + PostgREST, GoTrue STUB).
// Proves the smoke script itself works; it proves nothing about hosted Supabase. Run: bash tests/e2e/run-e2e.sh flow-smoke-local.mjs 1
import * as L from './lib.mjs';
import { spawnSync } from 'node:child_process';
const { sql, T } = L; const PW = 'Passw0rd!x', A = T(101);
async function mk(email, name, phone) {
  await fetch(L.STUB + '/auth/v1/signup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: PW, data: { full_name: name, phone } }) });
  await L.confirmEmail(email); return sql(`select id from auth.users where email = '${email}'`);
}
await mk('smk-c1@e2e.test', 'Smoke C1', '01055550001'); await mk('smk-c2@e2e.test', 'Smoke C2', '01055550002');
const d = await mk('smk-drv@e2e.test', 'Smoke Driver', '01055550003'); const s = await mk('smk-super@e2e.test', 'Smoke Super', '01055550004');
sql(`insert into platform_users (user_id, role) values ('${s}','super_admin')`);
sql(`insert into company_users (company_id, user_id, role_id) select '${A}', '${d}', r.id from roles r where r.key = 'driver'`);
sql(`insert into buses (id, company_id, plate_number, capacity) values ('${T(941)}','${A}','SMK-1',20),('${T(942)}','${A}','SMK-2',20)`);
sql(`insert into drivers (id, company_id, user_id, full_name, phone) values ('${T(951)}','${A}','${d}','Smoke driver','+201000055003')`);
sql(`insert into drivers (id, company_id, full_name, phone) values ('${T(952)}','${A}','Smoke other driver','+201000055009')`);
sql(`insert into trips (id, company_id, route_id, bus_id, driver_id, departure_at, arrival_at, price, capacity, status) values
 ('${T(945)}','${A}','${T(201)}','${T(941)}','${T(951)}', now() + interval '90 minutes', now() + interval '210 minutes', 40, 10, 'scheduled'),
 ('${T(946)}','${A}','${T(201)}','${T(942)}','${T(952)}', now() + interval '95 minutes', now() + interval '215 minutes', 40, 10, 'scheduled')`);
const run = (extra = {}) => spawnSync('node', ['scripts/smoke/flow-smoke.mjs'], { encoding: 'utf8', env: { PATH: process.env.PATH, SMOKE_TARGET: 'local', SUPABASE_URL: L.STUB, SUPABASE_PUBLISHABLE_KEY: 'local-publishable-key-0123456789', SMOKE_COMPANY_SLUG: 'company-a',
  SMOKE_CUSTOMER_EMAIL: 'smk-c1@e2e.test', SMOKE_CUSTOMER_PASSWORD: PW, SMOKE_CUSTOMER2_EMAIL: 'smk-c2@e2e.test', SMOKE_CUSTOMER2_PASSWORD: PW,
  SMOKE_DRIVER_EMAIL: 'smk-drv@e2e.test', SMOKE_DRIVER_PASSWORD: PW, SMOKE_BOARD_TRIP_ID: T(945), SMOKE_OTHER_TRIP_ID: T(946),
  SMOKE_ADMIN_EMAIL: 'smk-super@e2e.test', SMOKE_ADMIN_PASSWORD: PW, ...extra } });
const r = run(); process.stdout.write(r.stdout + r.stderr);
let ok = r.status === 0;
// guard checks: the script must refuse unsafe targets (exit 2) without touching anything
for (const [name, extra] of [['refuses production target', { SMOKE_TARGET: 'production' }], ['refuses staging without refs', { SMOKE_TARGET: 'staging' }],
  ['refuses staging URL containing the production ref', { SMOKE_TARGET: 'staging', STAGING_PROJECT_REF: 'stg', PRODUCTION_PROJECT_REF: 'prd', SUPABASE_URL: 'https://stg-prd.supabase.co' }],
  ['refuses a service-role key', { SUPABASE_PUBLISHABLE_KEY: 'sb_service_role_xxxxxxxxxxxxxxxxxxxx' }], ['refuses one account used twice', { SMOKE_CUSTOMER2_EMAIL: 'smk-c1@e2e.test' }]]) {
  const g = run(extra); const pass = g.status === 2 && /REFUSING/.test(g.stderr); L.check('guard: ' + name, pass, `exit ${g.status} ${g.stderr.slice(0, 120)}`); ok = ok && pass;
}
const leaks = /MALAKY:TICKET:[A-Za-z0-9_-]{6}|Passw0rd|eyJ/.test(r.stdout + r.stderr); L.check('output contains no tokens, QR payloads or passwords', !leaks); ok = ok && !leaks;
const open = sql(`select count(*) from bookings b join customers c on c.id = b.customer_id where b.status <> 'cancelled' and c.full_name = 'Smoke One'`);
console.log('open smoke bookings after run: ' + open);
process.exit(ok ? 0 : 1);
