# Deployment runbook (GitHub -> Vercel -> Supabase)

Last updated: Phase 8G. Source of truth is the repository; every command and file below was checked to exist in this tree.

**Nothing in this document has been executed against a hosted Supabase project or a live Vercel deployment.** Everything was run only against local Postgres + PostgREST + a GoTrue *stub* (see PHASE-8E-REPORT.md, PHASE-8F-REPORT.md). Sections are labelled so you can tell what is finished from what needs your credentials.

## 0. Status at a glance
| Area | State |
|---|---|
| Code, unit tests, SQL/RLS suites, local browser suites | Done and passing locally (8E: 1433 SQL assertions, 566 unit; 8F: 572 unit) |
| Rate limiting (DB limiter, migration 0020) | Done locally. HTTP 429 mapping on hosted PostgREST **unverified** |
| Rate limiting (Supabase Auth limits, Vercel Firewall rules) | **Manual, not active until you configure and test** (docs/RATE-LIMITING.md) |
| Structured logging, `/api/health`, runbook | Done locally. Vercel log output **unverified** |
| Staging Supabase project, Vercel project, Auth e-mail flow | **Needs your credentials** |
| External error monitor, uptime check, log drain | **Your decision, nothing installed** |
| Production deployment | **Not done, not authorised** |
| Production migration tooling | **Does not exist** (see 4.4) |

## 1. Prerequisites
- Node.js **22.x** (pinned in `package.json` `engines`; only tested on 22). npm (lockfile is `package-lock.json`, use `npm ci`).
- `psql` and network access to the target database (for `scripts/db/apply-migrations.sh`).
- Two **separate** Supabase projects: staging and production. Never share keys or database.
- A Vercel project connected to the GitHub repo, and one **stable** staging URL (domain alias), not a per-commit preview URL (see 5.3).
- Custom SMTP for Supabase Auth before testing with more than a few users (built-in SMTP is heavily rate limited).
- Shell hygiene: export `DATABASE_URL` and keys in your shell only. Never paste them into chats, tickets, reports or commits.

## 2. Environment variables
Exactly three, names verified against `src/lib/env.ts` and `src/lib/env-check.ts`. None are secrets. Set Production and Preview **separately**.
| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` (https required; http only for localhost) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | publishable (anon) key, at least 20 chars |
| `NEXT_PUBLIC_SITE_URL` | `https://<stable host>`, origin only, no trailing slash |

- `NEXT_PUBLIC_*` is inlined at build time: changing one needs a **redeploy**.
- Build and cold start fail with variable **names** (never values) if a variable is missing, uses http on a hosted env, points at localhost on Vercel, holds a `sb_secret_`/service-role key in the publishable slot, or if any `NEXT_PUBLIC_*` name contains SECRET/PRIVATE/PASSWORD/SERVICE_ROLE/API_KEY (verified by real `next build` runs in 8B/8D).
- Never set `NEXT_PUBLIC_UI_DATA_MODE=mock`. `SKIP_ENV_VALIDATION` is ignored on Vercel; do not set it.
- No service-role key belongs in Vercel: the app uses none. `grep -rn service_role src` still matches, but only `src/lib/env-check.ts` (rejects the key) and tests that assert its absence; any hit in other non-test code is a defect.

## 3. Pre-deploy gate (run locally or in CI)
```
npx tsc --noEmit
npx vitest run
bash tests/run-all-local.sh        # needs local Postgres + PostgREST; E2E_TOOLS + CHROME_PATH enable browser suites
npm run build
bash tests/bundle-scan.sh
npm audit --omit=dev
```
`run-all-local.sh` fails on a machine without Postgres/PostgREST; that is missing infrastructure, not a code result. Do not treat a run that skipped it as a pass.

## 4. Supabase staging setup  (**needs your credentials**)
Human checklist with tick boxes: **docs/STAGING-CHECKLIST.md**. Summary:

### 4.1 Create the project and set guards
New Supabase project. Export in your shell: `DATABASE_URL` (direct or session-pooler URL), `STAGING_PROJECT_REF`, and `PRODUCTION_PROJECT_REF` (so the scripts can refuse it).

### 4.2 Apply migrations (21 files: 0001-0020 including `0013b`)
```
TARGET_ENV=staging bash scripts/db/apply-migrations.sh --dry-run   # expect 21 pending, 0 CHANGED/MISSING
# take a backup first (Dashboard -> Database -> Backups)
TARGET_ENV=staging bash scripts/db/apply-migrations.sh             # expect: done: 21 applied
TARGET_ENV=staging bash scripts/db/apply-migrations.sh --status    # all applied; a re-run applies 0
```
- **Do not use `supabase db push`.** CLI 2.122 skips `0013b_*` (name is not `<digits>_name.sql`), so booking idempotency would silently be missing. The script uses its own ledger (`app_private.schema_ledger`, filename + sha256), not the CLI history. Never mix the two on one database. CLI fallback for a fresh project only: `scripts/db/export-cli-migrations.sh <outdir>`.
- The script refuses: no/other `TARGET_ENV`, `production`, a URL missing `STAGING_PROJECT_REF`, a URL containing `PRODUCTION_PROJECT_REF`, a non-Supabase database, and any applied file that was edited or removed.
- Each file runs in one transaction; a failure leaves the database at the previous file.
- Verify after applying (SQL editor): tables without RLS must be 0
  `select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity;`
  and the 0013b helper must exist
  `select to_regprocedure('app_private.my_booking_replay(uuid,text,uuid,integer,uuid,uuid,text)');` (not null).
- Never edit an applied migration. Add a new numbered file.

### 4.3 Mark the database as staging (guards the seed)
`alter database postgres set app.environment = 'staging';` then reconnect. Never on production. `supabase/staging/seed_staging.sql` raises unless this is set.

### 4.4 Production migrations
`apply-migrations.sh` has **no production mode by design**. There is no tested production procedure in this repo. When you decide to go live, that is a separate, explicitly approved step: take a fresh backup (or enable PITR), review the pending list with `--dry-run` logic on a restored copy, and agree the method (a reviewed change to the script, or a manual psql run of the same files in order including `0013b`). Do not improvise it.

## 5. Authentication configuration  (**needs your credentials**)
### 5.1 Supabase Auth (Dashboard -> Authentication)
- URL Configuration: Site URL = the stable staging (later production) origin, https, no trailing slash.
- Redirect URLs: `https://<host>/auth/confirm` and `https://<host>/**` (links carry `?next=...&from=...`). Local dev: `http://localhost:3000/**`. Matching with query strings on hosted GoTrue is **unverified**.
- Providers -> Email: "Confirm email" ON, secure password change ON.
- E-mail templates: confirm signup link `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email`; reset password link `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=recovery`.
- Rate limits reviewed (Auth -> Rate Limits); custom SMTP configured.

### 5.2 Behaviour built into the app (unit-tested; hosted behaviour unverified)
Customers and operators have separate login pages. A signed-out customer on `/my-bookings` goes to `/login`; operators on `/dashboard`, `/driver`, `/admin` go to `/company/login`. `next` is allowed only as a same-site path (open-redirect tested). A failed `/auth/confirm` link returns to the right forgot-password or login page with `error=confirm_failed`, never to a protected page.

### 5.3 Vercel staging URL pitfalls
Auth e-mail links and the telemetry origin check both use `NEXT_PUBLIC_SITE_URL`. Test on ONE stable alias. On random per-commit preview URLs, e-mails point at `SITE_URL` and telemetry reports get 403. Vercel Deployment Protection blocks anonymous visitors, including customers clicking an e-mail link: bypass for testers or leave it off for the staging alias.

## 6. First super admin  (**needs your credentials**)
1. Dashboard -> Authentication -> Add user (e-mail + password, auto-confirm).
2. Edit the e-mail at the top of `supabase/bootstrap/first_super_admin.sql`, run it in the SQL editor. Expect one row, role `super_admin`.
3. Safety: it refuses if the user is unknown or unconfirmed, or if another active super admin exists; a re-run is a no-op. This is the only path that grants platform roles.
4. Sign in at `/login`, open `/admin`; `/admin/audit-logs` must show `platform.bootstrap_super_admin`.
5. Create the first company in `/admin/companies/new` (`supabase/bootstrap/first_company.sql` is the fallback).

Staging demo data: `supabase/staging/seed_staging.sql` (staging only, idempotent, creates company `staging-demo`). `supabase/maintenance/cleanup_test_fixtures.sql` is inert until you change `'no'` to `'yes'`; staging only, read it first; **never run it on production**.

## 7. Vercel deployment  (**needs your credentials**)
Full checklist: **docs/VERCEL-CHECKLIST.md**. Summary:
1. Import the repo. Framework Next.js, Root Directory = the folder with `package.json`, Node 22.x, default `npm ci` / `next build`.
2. Function region near the Supabase project.
3. Set the three variables (section 2) for Preview/staging and, later, Production, pointing at the matching Supabase project. Never point previews at production Supabase.
4. Deploy, then confirm Vercel Logs show no `Invalid environment configuration` line.
5. Run the smoke tests (section 8).
Build/boot fail-fast and `next start` were verified locally; the hosted deployment itself was not.

## 8. Smoke tests
Matrix of 12 areas x LOCAL / STAGING / PRODUCTION, access policy per role, env vars: **docs/SMOKE-TESTS.md**.
| Level | Command | Writes data? |
|---|---|---|
| Local | `bash tests/run-all-local.sh` | yes, scratch DB |
| Staging, read-only | `bash scripts/smoke/deploy-smoke.sh https://<staging-alias>` | no |
| Staging, flows | `node scripts/smoke/flow-smoke.mjs` (env vars in docs/SMOKE-TESTS.md) | books then cancels, `staging-demo` only |
| Production | `deploy-smoke.sh` only | never |
`flow-smoke.mjs` refuses production, service-role keys, missing or matching refs, and one account used twice. Never use real customer data as fixtures. `deploy-smoke.sh` also checks `GET /api/health`.

Manual list (staging): customer sign-up -> e-mail -> `/auth/confirm` -> signed in; forgot password round trip; book a seat and repeat past the limit -> HTTP 429; company A cannot see company B; driver sees only assigned trips and boarding works; super admin creates/suspends a company and changes a subscription; support and billing roles are restricted; devtools show no secrets in bundles.

## 9. Security checks
| Check | How | Verified where |
|---|---|---|
| No service-role/secret in client code or bundle | `grep -rn service_role src` (only env-check.ts and tests may match), `bash tests/bundle-scan.sh` | locally |
| Dependencies | `npm audit --omit=dev` (0 vulnerabilities at 8F) | locally; re-run before each deploy |
| RLS on every public table | query in 4.2 returns 0 | SQL suites locally; run on staging |
| Tenant isolation, roles, lifecycle, rate limit | `supabase/tests/02..17` via `run-all-local.sh` | locally only; suites refuse real Supabase projects, so on staging use `flow-smoke.mjs` and the manual list |
| Security headers, CSP (report-only), indexing | `deploy-smoke.sh` | locally; real browsers unverified |
| Operator-only login/reset throttle | Vercel Firewall rules | **manual, unverified** |
| Customer login, signup, public search throttle | Supabase Auth limits only (these bypass Vercel) | **manual, unverified** |

## 10. Rollback, recovery, monitoring
Full procedure: **docs/OPERATIONS.md** (log events, triage, rollback, backup/restore, monitoring recommendation).
- App: Vercel Deployments -> previous deployment -> Promote/Instant Rollback. Does not revert the database or env vars.
- DB: forward-only. Migrations 0015-0020 list manual rollback statements in their headers; use only after a data-impact review, first on a staging copy. Confirm a backup before every migration run.
- Liveness: `GET /api/health`. Logs: Vercel Logs, JSON lines, secrets redacted.

## 11. Known limitations and manual steps
**Needs your credentials or approval:** staging project, Auth settings, SMTP, first super admin, Vercel project and alias, flow-smoke accounts (two confirmed customers, a driver, optional super admin, a throw-away trip departing in 65-110 min), Firewall rules, backup plan check, restore drill, monitor/log-drain choice, any production step.

**Unverified (never observed on hosted infrastructure):** real Auth e-mail flow and redirect matching, `Secure` cookies in a browser, `PT429` surfacing as HTTP 429, CSP in real browsers, Vercel behaviour, phone-camera QR scanning, global-vs-local sign-out on real GoTrue.

**Open product decisions (8E findings):**
1. Expired subscription: booking is refused but the marketplace still lists the trips. Hiding them needs a new migration (0021).
2. Customer sign-out revokes all devices (browser default); staff sign-out is local-only. Decide which you want.
3. Admin RPC "not found" arrives as HTTP 500 / SQLSTATE `P0002`; the service layer maps it, but error counters will see 5xx.

**Not built:** payment provider, custom domains / wildcard DNS, external error monitoring, uptime checks, CSP enforcement (report-only for now). The DB rate limiter counts only calls that commit, so floods of failing calls are not throttled by it (docs/RATE-LIMITING.md). Browser-to-Supabase failures reach server logs only through the unverified client report.
