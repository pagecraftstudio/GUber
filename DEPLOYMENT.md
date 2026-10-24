# Deployment runbook (GitHub -> Vercel -> Supabase)

Status: procedure only (staging first: docs/STAGING-CHECKLIST.md). NOT executed against a hosted Supabase project or Vercel in this repo's test runs.

## 1. Supabase project
1. Create the project. Keep the service-role key out of Vercel unless a feature explicitly needs it (the app code uses none; `grep -rn service_role src` is empty).
2. Apply migrations 0001-0020 (21 files, incl. `0013b`) with `scripts/db/apply-migrations.sh` (psql + checksum ledger). **Do NOT use `supabase db push`**: CLI 2.122 skips `0013b_*` (name is not `<digits>_name.sql`), so the booking idempotency helper would be missing. If you must use the CLI, generate a renamed copy with `scripts/db/export-cli-migrations.sh` and never mix it with the ledger. Full procedure: `docs/STAGING-CHECKLIST.md`. Never edit an applied migration; add a new one.
3. Auth settings: Site URL = production URL; add `<site>/auth/confirm` and `<site>/**` to Redirect URLs; keep "Confirm email" ON.
4. Create the first platform user: Dashboard -> Authentication -> Add user (auto-confirm), then run `supabase/bootstrap/first_super_admin.sql` with that email. This is the only path that grants platform roles.
5. Create the first company from the Super Admin UI (`/admin/companies/new`); `bootstrap/first_company.sql` is the fallback.
6. Do NOT run `supabase/maintenance/cleanup_test_fixtures.sql` in production.

## 2. Vercel
Environment variables (Production + Preview), none are secrets except as noted:
| Name | Value |
|---|---|
| NEXT_PUBLIC_SUPABASE_URL | https://<ref>.supabase.co |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | publishable (anon) key, >=20 chars |
| NEXT_PUBLIC_SITE_URL | https://<production host>, no trailing slash |
Never set `NEXT_PUBLIC_UI_DATA_MODE=mock` (production builds throw if it is set). Never prefix a secret with `NEXT_PUBLIC_`.
Build command `next build`; Node 22.

## 3. Pre-deploy gate (run locally or in CI)
`tsc --noEmit`, `vitest run`, `bash tests/run-all-local.sh` (set E2E_TOOLS/CHROME_PATH for browser suites), `next build`, `bash tests/bundle-scan.sh`, `npm audit --omit=dev`.

## 4. Post-deploy smoke test
- `/` lists trips; `/login` signs a customer in; `/admin` returns 404 for a customer and a login redirect when signed out.
- Super admin: `/admin` overview loads; open a company; `/admin/audit-logs` shows the bootstrap actions.
- With a support and a billing user: support cannot create/suspend a company or change a subscription; billing sees audit entries redacted.
- Company A user cannot read Company B rows (run the tenant isolation SQL suite against a staging copy, never production data).

## 5. Rollback
- App: Vercel "Promote previous deployment".
- DB: migrations are forward-only. Each admin migration (0015-0020) header lists its rollback statements; apply them manually only after assessing data impact. Take a Supabase backup before every migration run.

## 6. Known gaps before real traffic
Rate limiting on auth/booking endpoints (Supabase Auth limits + Vercel firewall), custom domains/wildcard DNS, payment provider, monitoring/alerting, and a test run against a real Supabase project (all only tested here against local Postgres + PostgREST + a GoTrue stub).
