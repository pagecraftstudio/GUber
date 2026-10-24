# Staging checklist (human-executed)

Status: NOT executed. Nothing here has been run against a hosted Supabase project or Vercel. Tick each box yourself and record the result. Never use production credentials for any step.

## 0. Rules
- Staging = its own Supabase project (own ref, own keys). Production = a different project. Never share keys or DB.
- Never paste keys, DB passwords or tokens into tickets, chats or reports.
- Migrations are forward-only. Restore = Supabase backup/PITR.

## 1. Create staging project
- [ ] New Supabase project. Note ref `STAGING_REF` and (separately) the production ref `PROD_REF`.
- [ ] Settings -> Database -> connection string (use the direct or session-pooler URL, with password). Export in your shell only:
  `export DATABASE_URL='postgres://...'` `export STAGING_PROJECT_REF=<STAGING_REF>` `export PRODUCTION_PROJECT_REF=<PROD_REF>`

## 2. Migrations (21 files, 0001 ... 0020)
- [ ] `TARGET_ENV=staging bash scripts/db/apply-migrations.sh --dry-run` -> expect 21 pending, 0 CHANGED/MISSING.
- [ ] Take a backup (Dashboard -> Database -> Backups).
- [ ] `TARGET_ENV=staging bash scripts/db/apply-migrations.sh` -> expect `done: 21 applied`.
- [ ] `... --status` -> all `applied`. Re-run -> `0 applied`.
- The script refuses: no/other TARGET_ENV, `production`, URL missing `STAGING_PROJECT_REF`, URL containing `PRODUCTION_PROJECT_REF`, non-Supabase DB, edited/removed applied files.
- WARNING `supabase db push` skips `0013b` (CLI 2.122). Do not use it. CLI fallback: `scripts/db/export-cli-migrations.sh <outdir>` (renames to `00135_`), only on a fresh project, never mixed with the ledger.
- If staging was ever migrated by the SQL editor or CLI: ledger is empty, so the script would re-run files. Do not re-run on a populated DB; reset the staging project instead.
- [ ] Verify in SQL editor: `select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity;` -> 0.
- [ ] `select to_regprocedure('app_private.my_booking_replay(uuid,text,uuid,integer,uuid,uuid,text)');` -> not null (0013b).
- [ ] Hosted-only risk to watch: 0020 + PostgREST must return HTTP 429 for SQLSTATE `PT429`; test in section 8.

## 3. Mark database as staging (guards the seed)
- [ ] SQL editor: `alter database postgres set app.environment = 'staging';` (then reconnect). Never run on production.

## 4. Auth settings (Dashboard -> Authentication)
- [ ] URL Configuration: Site URL = staging site URL (https, no trailing slash).
- [ ] Redirect URLs: `https://<staging-host>/auth/confirm` and `https://<staging-host>/**`. Local dev: `http://localhost:3000/**`. Check that redirects carrying `?from=/path` still match (not verified on hosted GoTrue).
- [ ] Providers -> Email: "Confirm email" ON. Secure password change ON.
- [ ] Email templates: Confirm signup link `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email`; Reset password link `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=recovery`.
- [ ] Built-in SMTP is heavily rate limited; configure custom SMTP before testing with many users.
- [ ] Signup/sign-in rate limits reviewed (Auth -> Rate Limits).

## 5. Environment variables (Vercel Preview/staging, names match `src/lib/env*`)
| Name | Value |
|---|---|
| NEXT_PUBLIC_SUPABASE_URL | https://<STAGING_REF>.supabase.co |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | staging publishable (anon) key |
| NEXT_PUBLIC_SITE_URL | https://<staging host> |
- [ ] No service-role key in Vercel. `NEXT_PUBLIC_UI_DATA_MODE` unset. `SKIP_ENV_VALIDATION` unset (CI only).

## 6. First super admin
- [ ] Dashboard -> Authentication -> Add user (email + password, auto-confirm).
- [ ] Edit email at the top of `supabase/bootstrap/first_super_admin.sql`, run in SQL editor. Expect one row, role `super_admin`.
- Script refuses if the user is unknown/unconfirmed or another active super admin exists. Re-run is a no-op.
- [ ] Sign in at `/login`, open `/admin`; `/admin/audit-logs` shows `platform.bootstrap_super_admin`.

## 7. Seed demo data (staging only)
- [ ] Run `supabase/staging/seed_staging.sql`. It raises unless `app.environment = 'staging'`. Idempotent.
- [ ] Optional driver: create a confirmed auth user, replace `REPLACE_WITH_DRIVER_EMAIL` in section 2 of the seed, re-run.
- [ ] `/` shows 3 upcoming Cairo -> Galala trips for company `staging-demo`.
- Cleanup: `supabase/maintenance/cleanup_test_fixtures.sql` is inert until you change `'no'` to `'yes'`; staging only, read it first.

## 8. Smoke tests
Run `scripts/smoke/deploy-smoke.sh` and `scripts/smoke/flow-smoke.mjs`; see docs/SMOKE-TESTS.md for env vars and the full matrix.

## 8b. Manual verification
- [ ] Customer signup -> confirmation email -> link lands on `/auth/confirm` -> signed in.
- [ ] Forgot password -> email -> `/auth/confirm` -> reset form -> new password works; "back" link returns to the right page.
- [ ] Book a seat; repeat quickly >limit times -> HTTP 429 from PostgREST (0020). Note actual limit behaviour.
- [ ] Company user of company A cannot see company B rows (run SQL tenant suite against a staging copy).
- [ ] Driver sees only assigned trips; boarding scan works.
- [ ] Super admin: create company, suspend, subscription change; support/billing roles restricted.
- [ ] Browser devtools: no service-role key or secrets in bundles; CSP report-only headers present.

## 9. Rollback guidance
| Migration | Rollback |
|---|---|
| 0001-0014 (+0013b) | none; forward-only. Restore backup. |
| 0015-0020 | statements listed in each file header; apply manually only after data-impact review. |
App: Vercel "Promote previous deployment".

## 10. Not verified by repo tests
Hosted Supabase behaviour, applying 0020 on a real project, Auth redirect matching with query strings, real email delivery, Vercel Firewall rules (see docs/RATE-LIMITING.md), PT429 -> 429 on hosted PostgREST.
