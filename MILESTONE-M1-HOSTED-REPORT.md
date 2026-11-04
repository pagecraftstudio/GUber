# M1 hosted verification report (2026-11-04)

**Target:** Supabase project `GUber` (ref zsclpwcehqqggoenlshq, eu-central-1, PG 17). **Declared by owner: PRODUCTION** (not a separate staging project). `app.environment` unset.
**Method:** read-only queries, and tests inside transactions that always roll back (a final `raise exception`). No data was written except migration 0023 (owner approved).

## Results
| Check | Result |
|---|---|
| Signature objects for migrations 0001-0022 incl. 0013b | all present |
| Behaviour markers (0013b, 0020, 0021, 0022) | all pass |
| Fingerprint vs scratch DB built from repo (columns 414, policies 160, triggers 105, indexes 142, constraints 252, functions 99, function grants 82, catalog counts) | identical |
| Function bodies | identical except `app_private.is_trip_public` (see F7) |
| Tables without RLS | 0 (every public table has at least one policy) |
| anon EXECUTE on public functions | preview_invite, public_search_trips, public_trip_stops, resolve_tenant (expected) |
| Read isolation, both companies, 10 tables | other-company rows visible: 0 |
| Write isolation (UPDATE/DELETE on 13 tables, 9 RPCs, domains), both directions | all blocked or 0 rows |
| `seat_drift()` | 0 rows |
| Local SQL suites on scratch Postgres 16 | 1463 passed, 0 failed (before suite 19) |

## Findings
- **H1 (high, FIXED by 0023):** `my_company` view (auto-updatable, SECURITY DEFINER) had INSERT/UPDATE/DELETE/TRUNCATE/TRIGGER/REFERENCES granted to `authenticated` through Supabase default privileges. A tenant user could UPDATE their own `companies` row (rows=1 for name and status). DELETE was stopped only by a foreign key. Fixed by migration 0023, applied by hand on 2026-11-04; verified SELECT ok, UPDATE/DELETE/INSERT denied. The local stub lacks default grants, so earlier suites could not see it. Suite 19 now guards the grants.
- **F7 (drift, OPEN, decision D-5):** prod `app_private.is_trip_public` equals `docs/proposals/unreviewed_is_trip_public_live_subscription.sql` (also requires a live subscription), not 0013. Not in `supabase/migrations/`.
- **Ledger (OPEN):** `app_private.schema_ledger` absent; Supabase migration history empty; migrations were applied by hand. Do not use the runner on this project. Insert ledger rows only after D-5 is settled.
- Auth: leaked-password protection disabled (OPEN, owner action).
- Linter: `my_company` SECURITY DEFINER view flagged ERROR (intentional, filtered by `current_company_ids()`); 14 `app_private` functions executable by anon (compare with local baseline, OPEN); `domains` INSERT/UPDATE granted to authenticated, gated by RLS (F4, known).

## Not verified
Vitest and browser suites, smoke scripts against the deployment, real Auth email flow, Firewall 429, QR on a phone, backup and restore drill, hosted run of suites.
