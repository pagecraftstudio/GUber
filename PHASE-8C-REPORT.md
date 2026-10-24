# Phase 8C report: staging readiness (repo side only)

## Findings
- `supabase db push` (CLI 2.122.0, tested on a scratch DB) skips `0013b_*` with a warning: the booking idempotency helper would be missing. DEPLOYMENT.md was stale (said 0001-0019, `db push`).
- Migrations: 21 files 0001-0020 incl. 0013b, byte-identical to the uploaded 8B zip. 0001-0014 have no rollback notes (forward-only); 0015-0020 do.
- Env var names (3) match the code (`env-check`). Seed/cleanup had no environment guard; bootstrap was unsafe against a second super admin.

## Changes
- NEW `scripts/db/apply-migrations.sh`: psql applier + checksum ledger (`app_private.schema_ledger`); `--dry-run`, `--status`; refuses production, wrong/prod ref, non-localhost in local mode, non-Supabase DB, edited/removed applied files; each file single-transaction; psql `-w`.
- NEW `scripts/db/export-cli-migrations.sh`: CLI-compatible renamed copy (repo untouched).
- REWRITTEN `supabase/bootstrap/first_super_admin.sql`: validates, idempotent, refuses a second super admin, writes audit row.
- `supabase/bootstrap/first_company.sql`: marked fallback.
- `supabase/maintenance/cleanup_test_fixtures.sql`: inert unless operator flips `'no'` to `'yes'`.
- NEW `supabase/staging/seed_staging.sql`: refuses unless `app.environment='staging'`; idempotent demo company/route/bus/driver/3 trips.
- NEW `docs/STAGING-CHECKLIST.md`; UPDATED `DEPLOYMENT.md`.
- NEW tests: `tests/staging/db-scripts.sh` (in `run-all-local.sh`), `src/lib/db/migrations.test.ts`.
- No existing migration modified; no new migration needed.

## Results (actual, local Postgres 16 + PostgREST)
- `tsc --noEmit`: exit 0
- `vitest run`: 31 files, 558/558 pass
- `bash tests/staging/db-scripts.sh`: PASS (guards, apply, ledger, idempotency, tamper/missing/failing migration, seed guard, bootstrap, cleanup gate)
- `bash tests/run-all-local.sh`: OVERALL PASS (SQL suites, 6 integration suites, staging scripts). Browser e2e NOT run (E2E_TOOLS unset).
- `next build`: exit 0 (first run needed retry due to Next upgrade notice)
- `bundle-scan.sh`: PASS; `npm audit --omit=dev`: 0 vulnerabilities
- Bugs found in my own tests while building: psql password prompt hang; LIKE `_` wildcard matched 0013b; production-ref check ordering. All fixed.

## NOT verified / not claimed
Nothing applied to hosted Supabase (no access). Not verified: 0020 on a real project, PT429 -> HTTP 429 on hosted PostgREST, Auth redirect matching with `?from=`, email delivery, Vercel Firewall rules, browser e2e.

## Needs your credentials/actions
Create staging project; DB URL; refs; set `app.environment`; Auth URL/redirect/email template settings; Vercel env vars; create first user. All in docs/STAGING-CHECKLIST.md.

## Staging procedure
See docs/STAGING-CHECKLIST.md sections 1-8.

Stopped before 8D.
