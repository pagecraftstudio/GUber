# Phase 8C — Hosted staging preparation

Date: 2026-10-28. Scope: preparation only. **No hosted check of any kind was performed by Claude**: this sandbox has no credentials for your Supabase/Vercel accounts, and its egress allowlist blocks `guber-six.vercel.app` (`curl` → HTTP 000). Everything marked "verified" below was verified on a **local scratch Postgres**, never on your projects. Nothing was deployed, applied, seeded, cancelled or deleted anywhere.

**Rule for the whole phase:** the existing Supabase project and `guber-six.vercel.app` are PRODUCTION until you prove otherwise. Never run `apply-migrations.sh`, a seed, the cleanup script or any smoke test that writes against them.

## 1. Findings about the existing hosted database (reasoned from the code; confirm with section 3)

| # | Finding | Evidence |
|---|---|---|
| F1 | Manual SQL-editor runs **cannot** have written `app_private.schema_ledger`. Only `scripts/db/apply-migrations.sh` creates and fills it (`create table if not exists …` in the script; no migration mentions it). Expect: ledger table absent (or empty). | Script read; local simulation: all 22 files applied by hand → `to_regclass('app_private.schema_ledger')` is NULL |
| F2 | **Do not run the runner against that project.** With no ledger it reports all 22 as pending and would re-run every file from 0001. Local simulation: re-running `0002` on a migrated DB → `ERROR: relation "profiles" already exists`. Each file runs in one transaction so it fails closed at the first non-idempotent file, but any earlier idempotent file would be recorded in the ledger as "applied by the runner", polluting it. | Local run |
| F3 | **`--dry-run` is not read-only.** It executes `create schema if not exists app_private` and `create table if not exists app_private.schema_ledger` before listing. It changes no data, but it does write DDL. Observed locally (an empty ledger table appeared after a dry run). Therefore never run even `--dry-run` or `--status` against the existing project. Use the read-only SQL below instead. | Script lines 49–51; local run |
| F4 | You ran "21 files"; the tree has 22 (`0013b` is the 22nd). Which one was skipped is unknown. Most likely `0013b` (it sorts between 0013 and 0014 and is easy to miss) **or** `0021` (new). Missing `0013b` means booking idempotency is silently absent, which is a correctness risk. | Section 3 detects each |
| F5 | The migrations were applied in separate SQL-editor queries: a failed/partial query can leave a file half-applied only if it was not run as one script. Presence checks cannot prove completeness; only a clean rebuild (staging) can. | — |

## 2. Local verification of the runner's safeguards (done, local only)

`bash scripts/db/apply-migrations.sh --dry-run` with each bad configuration (fake URLs, no connection made):

| Configuration | Result |
|---|---|
| no `TARGET_ENV` | `REFUSING: set TARGET_ENV=local or TARGET_ENV=staging` |
| `TARGET_ENV=production` | `REFUSING: this script never targets production…` |
| staging, no `STAGING_PROJECT_REF` | refused (`requires STAGING_PROJECT_REF`; exit via bash `:?`) |
| staging, URL lacks the staging ref | `REFUSING: DATABASE_URL does not contain STAGING_PROJECT_REF` |
| staging, URL contains `PRODUCTION_PROJECT_REF` | `REFUSING: DATABASE_URL contains PRODUCTION_PROJECT_REF` |
| staging ref == production ref | `REFUSING: STAGING_PROJECT_REF equals PRODUCTION_PROJECT_REF` |
| `TARGET_ENV=local` with a remote host | `REFUSING: … database host is not localhost` |
| local plain Postgres without `auth` schema | `REFUSING: no 'auth' schema` |
| `tests/staging/db-scripts.sh` | `== STAGING SCRIPTS: PASS` (applier, seed guard, bootstrap, cleanup gate) |

Weak point to know: the production guard works only if **you set `PRODUCTION_PROJECT_REF` to the existing project's ref** (it is "optional but recommended" in the script). The only other protection is that the URL must contain the staging ref. **Always export both refs.**

## 3. Read-only inspection of the existing project (YOU run it; ~1 minute)

File: `scripts/db/verify-hosted-readonly.sql`. One `begin read only … rollback` transaction, SELECT only, returns object names/counts, never row contents (it shows only aggregate counts of customers/bookings/companies and the number of super admins). Verified locally: a read-only transaction rejects any write; it reports every object present on a fully migrated scratch DB with 0 MISSING, and reports `0021 … MISSING` / marker `NO` on a scratch DB built without 0021.

Run (Supabase Dashboard → SQL Editor on the **existing** project; paste the file contents; or `psql` with a read-only URL):

```bash
psql "$EXISTING_PROJECT_DATABASE_URL" -X -A -F ' | ' -f scripts/db/verify-hosted-readonly.sql
```

Interpret:
| Output | Meaning |
|---|---|
| `ledger_table: ABSENT` | Expected (F1). The runner was never used. |
| any `object … MISSING` | That migration was **not applied**. `0013b my_booking_replay` MISSING = booking idempotency absent. `0021 has_live_subscription` MISSING = 0021 not applied. |
| any `marker … NO` | Migration object exists but the function body is not the expected version (e.g. 0020 wrapper or 0013b logic missing). |
| `public tables without RLS` ≠ 0 | **Stop. Security incident-class finding.** |
| `anon EXECUTE on public functions` ≠ `preview_invite, public_search_trips, public_trip_stops, resolve_tenant` | Unexpected grant: report it. |
| `app.environment` = `(unset: treat as PRODUCTION)` | Expected for production; also proves the staging seed script would refuse here. |

Paste the output back to me (no keys, no passwords; it contains no customer rows). I will not touch the ledger. **Ledger repair is a separate decision and is NOT done:** if, after review, you want the existing project recorded in a ledger, the safe path is a reviewed one-off `INSERT` of the 22 `(filename, sha256)` pairs (hashes from `sha256sum supabase/migrations/*.sql` on the exact repo version you applied by hand), created by you manually after you confirm every object above is present. Never let the runner "catch up" on that project.

Also confirm what code `guber-six.vercel.app` runs (Vercel → Deployments → which commit). If the deployed code is older than Phase 8, the production DB having 0020/0021 is compatible (0021 only hides trips), but the production app currently talks to Supabase directly (no `/api/public/*`).

## 4. Staging environment (separate Supabase project + Vercel Preview)

Do everything below in **new** resources. Nothing reuses a key, URL or database of the existing project.

### 4.1 Supabase staging project
1. Dashboard → New project, name `malaky-bus-staging`, any region, strong DB password (store in your password manager only). Note `STAGING_REF` (from the project URL `https://<STAGING_REF>.supabase.co`).
2. Note the existing project's ref as `PROD_REF` (Settings → General → Reference ID).
3. Settings → Database → Connection string → **Session pooler or Direct** URI with password. Export in your shell only:
```bash
export DATABASE_URL='postgres://postgres.<STAGING_REF>:<password>@<host>:5432/postgres'
export STAGING_PROJECT_REF='<STAGING_REF>'
export PRODUCTION_PROJECT_REF='<PROD_REF>'      # REQUIRED in practice: this is the production guard
export TARGET_ENV=staging
```
4. Mark it staging (SQL editor, staging project only): `alter database postgres set app.environment = 'staging';` then reconnect.

### 4.2 Apply migrations with the custom runner (staging only)
```bash
cd <repo root>
bash scripts/db/apply-migrations.sh --dry-run   # expect: 22 "pending" lines, "dry run: 22 migration(s) would be applied", no CHANGED/MISSING
# take a backup first (Dashboard → Database → Backups); a brand-new empty project has nothing to lose, still note it
bash scripts/db/apply-migrations.sh             # expect: done: 22 applied, 0 already present
bash scripts/db/apply-migrations.sh --status    # expect: ledger OK; 0 pending
bash scripts/db/apply-migrations.sh             # expect: done: 0 applied, 22 already present
psql "$DATABASE_URL" -X -A -F ' | ' -f scripts/db/verify-hosted-readonly.sql   # expect 0 MISSING, 0 NO, 0 RLS gaps, ledger_rows 22
psql "$DATABASE_URL" -tA -c "select filename from app_private.schema_ledger where filename like '0013b%' or filename like '0021%'"   # 2 rows
```
Never `supabase db push` (skips `0013b`). Before step 2, re-check the printed `DATABASE_URL` host contains `<STAGING_REF>` and **not** `<PROD_REF>` (the script also enforces this).

### 4.3 Supabase Auth (staging project → Authentication)
1. URL Configuration → **Site URL** = `https://<STAGING_ALIAS>` (https, no trailing slash). The alias is defined in 4.4 step 3.
2. **Redirect URLs**: `https://<STAGING_ALIAS>/auth/confirm` and `https://<STAGING_ALIAS>/**`; (local dev only) `http://localhost:3000/**`. Do not add the production host.
3. Providers → Email: Confirm email **ON**; Secure password change **ON**.
4. Email templates: Confirm signup link `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email`; Reset password link `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=recovery`.
5. SMTP: the built-in sender is very low-rate; configure custom SMTP before testing with several accounts.
6. Rate Limits: review sign-in/sign-up/email; write down the values you chose.
7. Do **not** enable CAPTCHA (frontend token support is not implemented).
8. Settings → API: copy the **publishable (anon) key** and the URL. Never copy the service-role/secret key anywhere for this phase.

### 4.4 Vercel Preview deployment (does not touch `guber-six.vercel.app`)
Prefer a dedicated Vercel project (e.g. `malaky-bus-staging`) so staging variables can never mix with production ones. If you must use the existing project, scope every variable to **Preview** and a specific branch, and never pass `--prod`.
1. Create branch `staging` from the Phase 8 final archive (new Git repo or branch; do not merge it into the branch that production deploys from).
2. Environment variables, scope = **Preview** (branch `staging`), via dashboard or CLI:
```bash
vercel env add NEXT_PUBLIC_SUPABASE_URL preview staging              # https://<STAGING_REF>.supabase.co
vercel env add NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY preview staging  # staging publishable key
vercel env add NEXT_PUBLIC_SITE_URL preview staging                  # https://<STAGING_ALIAS>
```
Do **not** add a service-role key, `NEXT_PUBLIC_UI_DATA_MODE` or `SKIP_ENV_VALIDATION`. The build refuses an `http` URL, localhost, a `sb_secret_`/service-role key in the publishable slot, and secret-named `NEXT_PUBLIC_*` variables.
3. Stable alias: use the branch alias Vercel generates for `staging` (`<project>-git-staging-<team>.vercel.app`) or assign a domain; put exactly that host in `NEXT_PUBLIC_SITE_URL` and in the Supabase Site URL. Random per-commit URLs break e-mail links and telemetry origin checks.
4. Deploy a preview (never production): `git push origin staging` (Git integration) or `vercel deploy` **without** `--prod`. Check in the Vercel UI that the deployment's target is "Preview".
5. Deployment Protection: preview protection blocks anonymous visitors including e-mail link clickers. Use a protection-bypass for testers or switch protection off for this staging project only.
6. Verify the staging deployment uses staging Supabase: open the alias, browser devtools → Network: requests go to `<STAGING_REF>.supabase.co` only.

### 4.5 Vercel Firewall (staging project → Firewall → Custom Rules)
Create in order, action **Log** first for a day, then **Rate Limit / Deny**, key = IP. Do not set lower limits (campus NAT).

| Rule name | Condition | Limit |
|---|---|---|
| operator-login | POST and path equals `/company/login` | 10 / 1 min |
| forgot-password | POST and path equals `/forgot-password` | 5 / 5 min |
| reset-password | POST and path equals `/reset-password` | 10 / 5 min |
| invite | POST and path starts with `/invite/` | 10 / 5 min |
| telemetry | path starts with `/api/telemetry/` | 30 / 1 min |
| csp-report | path equals `/api/csp-report` | 30 / 1 min |
| auth-callback | path equals `/auth/confirm` | 20 / 1 min |
| public-search | GET and path starts with `/api/public/` | 60 / 1 min |

Verify (not before): `for i in $(seq 1 15); do curl -s -o /dev/null -w "%{http_code} " -X POST https://<STAGING_ALIAS>/company/login -d x=1; done` → 429s after the limit; for the public rule vary `?date=` to defeat the CDN cache. Until you see 429s, firewall protection is **not active**. The rules do not protect direct Supabase calls (section 6).

### 4.6 First super admin (staging)
1. Staging dashboard → Authentication → Add user (email + password, auto-confirm).
2. Edit the e-mail at the top of `supabase/bootstrap/first_super_admin.sql`; run it in the staging SQL editor. Expect one row, role `super_admin`. (Refuses unknown/unconfirmed users or a second active super admin; re-run is a no-op.)
3. Sign in at `https://<STAGING_ALIAS>/login`, open `/admin`; `/admin/audit-logs` must show `platform.bootstrap_super_admin`.

### 4.7 Seed demo data (staging only)
Run `supabase/staging/seed_staging.sql` in the **staging** SQL editor. It raises unless `app.environment = 'staging'` (so it refuses on the existing project, whose setting is unset). Then `/` should show 3 upcoming Cairo → Galala trips for company `staging-demo`. Create two confirmed customer accounts, plus optional driver/admin accounts, for the smoke test.

### 4.8 Smoke tests (staging only, in this order)
```bash
# 1. read-only, no accounts: routing, headers, public routes
bash scripts/smoke/deploy-smoke.sh https://<STAGING_ALIAS>
# 2. authenticated flow (WRITES and cancels bookings in company staging-demo only)
export SMOKE_TARGET=staging SUPABASE_URL=https://<STAGING_REF>.supabase.co SUPABASE_PUBLISHABLE_KEY='<staging publishable key>'
export STAGING_PROJECT_REF=<STAGING_REF> PRODUCTION_PROJECT_REF=<PROD_REF> SMOKE_COMPANY_SLUG=staging-demo
export SMOKE_APP_URL=https://<STAGING_ALIAS>
export SMOKE_CUSTOMER_EMAIL=… SMOKE_CUSTOMER_PASSWORD=… SMOKE_CUSTOMER2_EMAIL=… SMOKE_CUSTOMER2_PASSWORD=…
# optional: SMOKE_DRIVER_EMAIL/PASSWORD + SMOKE_BOARD_TRIP_ID (+ SMOKE_OTHER_TRIP_ID), SMOKE_ADMIN_EMAIL/PASSWORD
node scripts/smoke/flow-smoke.mjs
```
`flow-smoke.mjs` refuses production mode, a service-role key, a URL missing the staging ref, a URL containing the production ref, and one account used twice (tested locally). Then the manual list in `docs/STAGING-CHECKLIST.md` §8b (signup/confirm e-mail, forgot password, QR on a phone, 429 behaviour, cross-tenant check with two staging companies, driver boarding, super-admin actions, sign-out revocation on real GoTrue). Record every result.

## 5. Rollback (staging)
App: Vercel → Deployments → promote the previous deployment. DB: forward-only; for staging simplest is to delete and recreate the staging project and re-run 4.2. Production is never rolled back by anything in this document.

## 6. Remaining security issues from the final report

### 6.1 Uncapped `p_offset` — recommended fix (drafted, tested locally, NOT applied, NOT in `supabase/migrations/`)
- `docs/proposals/0022_cap_public_search_offset.sql`: `public_search_trips` offset clamped to `0..1000` (identical signature, columns, filters, grants).
- `docs/proposals/18_offset_cap_tests.sql`: 5 assertions (cap present in definition, absurd offset no error and equals the capped result, negative offset = 0, limit still ≤ 100, `anon` still has EXECUTE).
- Local result: on a scratch DB with migrations + suites 02–17 + proposal 0022: **1463 passed, 0 failed** (1458 existing + 5 new).
- To adopt (needs your approval): move both files into `supabase/migrations/` as `0022_…sql` and `supabase/tests/18_…sql`, add `18_offset_cap_tests` to `tests/run-all-local.sh`, re-run the full local suite, then apply on **staging** with the runner (expect 23 pending/applied from scratch). Production only with a separately reviewed procedure.

### 6.2 Direct anonymous RPC bypass — recommendation (unchanged decision B; nothing implemented)
- Keep anonymous `EXECUTE` on `public_search_trips`/`public_trip_stops` for now. Data is public by design, read-only, tenant- and subscription-filtered, `limit` ≤ 100 and (after 0022) `offset` ≤ 1000. 6.1 bounds the cost per call; it does not stop call volume.
- If you later need to close it, the safe design (no service-role key): a dedicated Postgres role `public_catalog` with `EXECUTE` on exactly those two functions, `NOLOGIN`, granted to `authenticator`; the Next.js route mints a short-lived JWT (`role: public_catalog`, 60 s expiry) signed with a **server-only** secret; then `revoke execute … from anon, authenticated`. Preconditions: your Supabase project's JWT signing mode must allow a server-minted token (legacy JWT secret vs asymmetric signing keys; check on the staging project first), the signing secret stays in Vercel server env only (never `NEXT_PUBLIC_*`, never in the bundle: `bundle-scan.sh` must keep passing). Tests required: anonymous direct RPC → 401/403; `/api/public/*` → 200; token expiry; tampered token rejected; RLS/tenant suites unchanged; `flow-smoke.mjs` marketplace checks via `SMOKE_APP_URL`; deployment order (ship code + secret first, revoke last, rollback = re-grant). Not implemented; **requires your explicit approval**, and it introduces a new secret.
- Cheaper mitigations to evaluate on staging: Supabase dashboard API/DB usage alerts and plan compute headroom (unverified), and a CDN-cached public path (already in place for the app's own traffic).

## 7. Blockers (nothing below was verified by Claude)

| # | Blocker | Owner | Needed to clear |
|---|---|---|---|
| B1 | Existing project's schema/ledger unverified; unknown which of the 22 files is missing | you | run section 3, send output |
| B2 | Existing ledger absent by design of manual SQL (F1); never run runner there | you | decision on optional manual ledger insert after B1 |
| B3 | Staging Supabase project does not exist | you | 4.1 |
| B4 | Staging Vercel project/alias/env vars do not exist | you | 4.4 |
| B5 | Auth config, SMTP, e-mail templates unset | you | 4.3 |
| B6 | Firewall rules not created; 429 unobserved | you | 4.5 |
| B7 | Super admin not bootstrapped, no seed, no smoke accounts on staging | you | 4.6–4.7 |
| B8 | Offset cap not adopted | you (approval) | 6.1 |
| B9 | Direct-RPC bypass open (decision B) | you (approval) | 6.2 |
| B10 | QR browser failure from your earlier runs unexplained (not reproducible locally) | you + me | rerun `flow.mjs` on your machine; send the new diagnostic line |
| B11 | Hosted behaviours unverified (real Auth, redirects, PT429→429, CDN `Vercel-CDN-Cache-Control`, real sign-out revocation, backups/restore) | you | 4.8 + checklist |
| B12 | Which code version production runs is unknown | you | Vercel deployments page |

## 8. Status

| Environment | Status |
|---|---|
| Local | validated (Phase 8 final report; plus this phase's local checks) |
| Staging | **NOT CREATED, NOT TESTED. Not ready; preparation only.** |
| Production (`guber-six.vercel.app` + existing project) | **UNVERIFIED. No readiness claim.** Treated as production; untouched. |
