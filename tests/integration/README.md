# Integration tests (real Postgres + PostgREST + RLS)

These run the Phase 4 services against a real database through PostgREST with signed user JWTs, so RLS, triggers,
constraints, grants and RPCs are all real. They are NOT part of `npm test` and skip themselves without `PGRST_URL`.

1. Postgres 15+ with `reset-db.sh` applied (`DB=bus PSQL="psql" tests/integration/reset-db.sh`). It uses the local
   `auth` stub from `supabase/tests/00_supabase_stub.sql`, so it does not need a Supabase project.
2. PostgREST (v12) with: `db-uri` as role `authenticator`, `db-schemas = "public"`, `db-anon-role = "anon"`,
   `jwt-secret` = any 32+ char string, `server-port = 3100`.
3. `PGRST_URL=http://127.0.0.1:3100 PGRST_JWT_SECRET=<same secret> npm run test:integration`

Tests create rows with random names, but they consume plan quota (Company B is deliberately filled to its bus
limit). Re-run `reset-db.sh` before each full run.

## Customer web flow (migration 0013) and isolation
`customer-web.int.test.ts` needs `seed-customer-web.sql`, which publishes company A's website; `services.int.test.ts`
expects it unpublished. They therefore run on SEPARATE databases. `tests/run-all-local.sh` does this: `bus_sql`
(SQL suites), `bus_int` (services + booking), `bus_web` (seed + customer-web), each rebuilt by `reset-db.sh`.
