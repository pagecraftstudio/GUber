# Migration 0022 investigation (read-only; nothing connected, applied, reversed or rewritten)

## 1. What is in the repo (main = db5f394)
- `supabase/migrations/` ends at `0021_public_listing_requires_live_subscription.sql`. `0022.sql` was REMOVED there in 22dd3c8.
- Preserved as `docs/proposals/unreviewed_is_trip_public_live_subscription.sql` (header explains; body unchanged).
- A DIFFERENT proposal also uses the number 0022: `docs/proposals/0022_cap_public_search_offset.sql` (+ `18_offset_cap_tests.sql`, docs/STAGING-PREP-8C.md §6.1). Two competing "0022"s: whichever is adopted first must take 0022, the other 0023.
- Provenance: `git log` shows commit `41fbf4e` by pagecraftstudio, 2026-10-30 14:28 +02:00, message "migration 022 adding only" (also added .DS_Store files), 28 minutes after "8C staging". So the owner added it on purpose, right after staging prep.
- Format evidence: the body is in `pg_get_functiondef` style (`CREATE OR REPLACE FUNCTION ... SET search_path TO ''`, `$function$`, upper-case SQL), unlike every repo migration (lower-case, `set search_path = ''`, `$$`). It looks pasted from a database/dashboard export, i.e. possibly from a database where it was already running. This is an inference, not proof.

## 2. Intended difference 0013 vs 0021 vs proposed 0022
| | 0013 (original) | 0021 (current main) | proposed 0022 |
|---|---|---|---|
| `app_private.is_trip_public(uuid)` | scheduled, departure > now+cutoff, booking_enabled, website published, `is_company_active` | UNCHANGED (explicitly: "NOT touched") | same + `AND app_private.has_live_subscription(t.company_id)` |
| `app_private.has_live_subscription(uuid)` | does not exist | NEW: `exists(select 1 from app_private.live_subscription(p_company))`; revoked from public/anon/authenticated | (depends on 0021) |
| `public_search_trips` / `public_trip_stops` | no subscription filter | filter on `has_live_subscription` (expired company disappears from marketplace) | unchanged |
| `create_my_booking` for an expired company | n/a | trip still "public"; refused by entitlement checks with `42501 no active subscription` (pinned by suite 17 line 57) | `is_trip_public` false -> `P0002 trip not found` BEFORE entitlement checks (0013 line 115) |
Design intent of 0021 (its header): hiding from search is presentation; booking protection stays in the entitlement path, so the customer gets a specific error and existing customers' own bookings/tickets/cancellation keep working.
Intent of 0022: defence in depth, so a stale link or direct RPC call cannot reach a booking for an expired company. Stricter, but changes the error contract.

### Predicted impact if 0022 is live (NOT executed; analysis of code only)
1. `supabase/tests/17_lifecycle_policy_tests.sql` line 57 expects `42501|no active subscription`; with 0022 the answer would be `P0002|trip not found` -> suite 17 would fail against a DB carrying 0022.
2. `0013b` `create_my_booking`: the `is_trip_public` gate (line 69) runs BEFORE the idempotency replay (`my_booking_replay`, line ~86). Code reading says: with 0022, a customer retrying an already-committed booking request after the company's subscription lapsed gets `P0002 trip not found` instead of the original booking (today the same already happens for an unpublished site or a departed trip). Not executed; needs a test before adoption.
3. UX: customers lose the "subscription expired" signal (becomes indistinguishable from unknown trip). May be desirable (no oracle) or not.
4. Security: stricter, not weaker. No new grants.

## 3. Read-only SQL for the owner (run in Supabase SQL editor on STAGING first, then PRODUCTION, one at a time, as the postgres role)
Every statement is SELECT inside `begin read only`. None touches row data of customers.
```sql
begin read only;

-- A. Deployed definition of is_trip_public + which variant it is
select p.oid::regprocedure                       as fn,
       md5(pg_get_functiondef(p.oid))            as def_md5,
       pg_get_functiondef(p.oid) ilike '%has_live_subscription%' as has_0022_change,
       p.prosecdef as security_definer, p.provolatile, p.proconfig
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'app_private' and p.proname = 'is_trip_public';

select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'app_private' and p.proname = 'is_trip_public';

-- B. has_live_subscription / live_subscription exist? definitions? grants?
select p.oid::regprocedure as fn, md5(pg_get_functiondef(p.oid)) as def_md5, p.prosecdef
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'app_private' and p.proname in ('has_live_subscription','live_subscription','is_company_active');
select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'app_private' and p.proname = 'has_live_subscription';
-- expect NO anon/authenticated/PUBLIC execute on app_private.is_trip_public / has_live_subscription
select p.proname, has_function_privilege('anon', p.oid, 'execute') as anon,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'app_private' and p.proname in ('is_trip_public','has_live_subscription');

-- C. Migration history: runner ledger, then CLI history, then what exists at all
select to_regclass('app_private.schema_ledger') as runner_ledger,
       to_regclass('supabase_migrations.schema_migrations') as cli_history;
select filename, sha256, applied_at from app_private.schema_ledger order by filename;        -- only if the table exists
select version, name from supabase_migrations.schema_migrations order by version;             -- only if the table exists
-- 0022 recorded? ledger stores the file name, i.e. '0022.sql'
select * from app_private.schema_ledger where filename like '0022%';
select * from supabase_migrations.schema_migrations where version like '0022%' or name ilike '%0022%' or name ilike '%is_trip_public%';

-- D. Drift evidence
--  D1 repo's own checker (counts/names only): paste scripts/db/verify-hosted-readonly.sql (it is `begin read only ... rollback`)
--  D2 behavioural probe, read-only: trips that pass every 0013 condition but whose company has no live subscription.
--     If is_trip_public() returns FALSE for them, the 0022 variant is live; TRUE means the 0013/0021 variant.
select count(*) filter (where app_private.is_trip_public(t.id))          as public_true,
       count(*) filter (where not app_private.is_trip_public(t.id))      as public_false
from public.trips t
where t.status = 'scheduled' and t.departure_at > now()
  and not app_private.has_live_subscription(t.company_id);
--  D3 same probe on the opposite side (sanity: should be all TRUE where site is published and company active)
select count(*) filter (where app_private.is_trip_public(t.id)) as public_true, count(*) as total
from public.trips t join public.website_settings w on w.company_id = t.company_id
where t.status = 'scheduled' and t.departure_at > now() and w.is_published and app_private.has_live_subscription(t.company_id);
--  D4 anything else the dashboard may have changed: functions in app_private/public whose md5 you can diff against the repo (see §4)
select n.nspname, p.proname, md5(pg_get_functiondef(p.oid)) as def_md5
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('app_private','public') and p.prokind = 'f' order by 1, 2;

rollback;
```
Interpretation:
| A: has_0022_change | C: ledger/CLI row for 0022 | Meaning | Action |
|---|---|---|---|
| false | none | repo-consistent (0013 variant) | nothing; keep proposal parked |
| true | none | applied by hand (SQL editor) = DRIFT; DB differs from repo and ledger | owner decision §5 |
| true | `0022.sql` | applied by runner while the file existed on main (before 22dd3c8) | ledger now has an orphan: runner reports `MISSING 0022.sql` and refuses further runs |
| false | `0022.sql` | applied then reverted manually | ledger orphan, same runner refusal |

## 4. Comparing staging and production safely
1. Read-only: run §3 blocks A-D in both projects, `begin read only ... rollback`, as the dashboard `postgres` role. Never run the migration runner against production (it has no production mode, by design).
2. Save outputs, `diff` the `def_md5` columns; any difference in function md5 between staging and production, or vs a local scratch DB built from main, is drift.
3. Local baseline for md5s: build scratch DB from main (`DB=bus_sql bash tests/integration/reset-db.sh`) and run D4 there. Note `pg_get_functiondef` is deterministic for the same Postgres major version; compare like with like.
4. CAUTION about `scripts/db/apply-migrations.sh --status` and `--dry-run`: they are NOT read-only. Before the mode check, the script runs `create schema if not exists app_private` and `create table if not exists app_private.schema_ledger` on the target (lines 51-53). On staging that is acceptable (it is the staging tool); do not use it as an inspection tool on any database where creating the ledger is unwanted. Use the pure SELECTs above instead. (Doc claim to correct: DEPLOYMENT.md calls `--status` a status check, not a no-op.)
5. Owner-only commands, staging only, if the ledger already exists and you accept the CREATE IF NOT EXISTS side effect:
```bash
export DATABASE_URL='postgres://...staging...'   # never paste into chat/logs
TARGET_ENV=staging STAGING_PROJECT_REF=<staging-ref> PRODUCTION_PROJECT_REF=<prod-ref> \
  bash scripts/db/apply-migrations.sh --status
# expected on main: 22 files (0001..0021 incl. 0013b) ; if a ledger row 0022.sql exists you will see "MISSING 0022.sql"
```

## 5. Decision options for the owner (nothing is applied by this audit)
| Option | When | Work |
|---|---|---|
| A. Keep 0013/0021 design (recommended default) | A shows has_0022_change=false | nothing |
| B. Adopt 0022 as a real migration `0023_..` (or 0022, renumbering the offset cap) | owner wants the stricter gate | add tests: suite 17 line 57 -> new expectation, replay-after-expiry test, header ROLLBACK note; run all suites; apply to staging via runner; then a separately reviewed production step |
| C. Staging already has it | A true on staging | decide B (then backfill ledger deliberately) or revert staging with the 0013 `create or replace` (documented ROLLBACK in the proposal header) in a reviewed change |
Do NOT edit or reuse `0022.sql` in migrations/ (runner treats applied files as immutable, checksum mismatch aborts).

## 6. Remaining unknowns
Whether staging/production carry 0022 (no credentials here). Replay-vs-gate ordering is settled by code (gate first); its behavioural effect is untested.
