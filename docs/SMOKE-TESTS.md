# Smoke tests (Phase 8E)

Three environments, three different promises. Never mix them up.

| Level | What it is | May write data? | Tools | Status in this repo |
|---|---|---|---|---|
| **LOCAL** | throw-away local Postgres + PostgREST + a GoTrue **stub** (not real Supabase Auth) | yes | `tests/run-all-local.sh` | run, results in PHASE-8E-REPORT.md |
| **STAGING (hosted)** | a dedicated Supabase staging project + Vercel preview alias, own keys, own data | yes, only the `staging-demo` company | `scripts/smoke/deploy-smoke.sh`, `scripts/smoke/flow-smoke.mjs`, the manual list below | **NOT run: no credentials** |
| **PRODUCTION** | real customers | **never** | `scripts/smoke/deploy-smoke.sh` only (GET/HEAD, no credentials, no writes) | **NOT run** |

`flow-smoke.mjs` has no production mode and refuses unsafe targets (exit 2). The SQL suites refuse real Supabase projects. Never use production customer data as fixtures.

## Commands
```bash
# LOCAL, everything (SQL, integration, staging scripts, optional browser suites)
PSQL=psql POSTGREST=/path/to/postgrest E2E_TOOLS=/dir/with/puppeteer CHROME_PATH=/path/to/chromium bash tests/run-all-local.sh

# LOCAL browser suites individually (production build + local stack; see tests/e2e/run-e2e.sh for the exact arguments):
#   flow.mjs 0 | tickets.mjs 1 | portal.mjs 0 (EXTRA_SEED=tests/e2e/seed-portal.sql) | audit.mjs 1 | flow-smoke-local.mjs 1 | deploy-smoke-local.mjs 1 | signout.mjs 1

# STAGING 1: routing, access gates, headers, public routes /api/public/* (read-only, no accounts)
bash scripts/smoke/deploy-smoke.sh https://<staging-alias>

# STAGING 2: authenticated flow over the public API (writes + cancels bookings in company `staging-demo`)
export SMOKE_TARGET=staging SUPABASE_URL=https://<STAGING_REF>.supabase.co SUPABASE_PUBLISHABLE_KEY=<publishable key>
export STAGING_PROJECT_REF=<STAGING_REF> PRODUCTION_PROJECT_REF=<PROD_REF> SMOKE_COMPANY_SLUG=staging-demo
export SMOKE_CUSTOMER_EMAIL=... SMOKE_CUSTOMER_PASSWORD=... SMOKE_CUSTOMER2_EMAIL=... SMOKE_CUSTOMER2_PASSWORD=...   # two different, confirmed staging customers
# optional: driver + boarding (create a trip departing in 65..110 min for that driver; a second trip proves wrong-trip rejection)
export SMOKE_DRIVER_EMAIL=... SMOKE_DRIVER_PASSWORD=... SMOKE_BOARD_TRIP_ID=<uuid> SMOKE_OTHER_TRIP_ID=<uuid>
# optional: platform admin
export SMOKE_ADMIN_EMAIL=... SMOKE_ADMIN_PASSWORD=...
# recommended: the staging app origin, so the marketplace search + stops are tested through /api/public/* (the real browser path)
export SMOKE_APP_URL=https://<staging-alias>
node scripts/smoke/flow-smoke.mjs   # without SMOKE_APP_URL the search falls back to the direct RPC and the HTTP checks print SKIP
```
Type the passwords into your own shell; do not paste them into chats or tickets. The script never prints tokens, QR payloads or passwords. Bookings on the boarding trips cannot be cancelled (inside the cancellation window); the script says so and leaves them: use a throw-away trip.

## The 12 areas: expected access policy and coverage
Legend: **L** = automated locally (file). **S-auto** = covered by `flow-smoke.mjs` / `deploy-smoke.sh` on staging. **S-manual** = you check it by hand on staging. Nothing in the STAGING column has been run.

| # | Area | Expected policy | LOCAL (automated) | STAGING |
|---|---|---|---|---|
| 1 | `/` marketplace, trip discovery | public; indexable; only published, active-company, future, open trips; no private fields | `08_*` P1, `e2e/flow.mjs`, `deploy-smoke.sh` | S-auto: `deploy-smoke` (200, indexable), `flow-smoke` (search, no private fields) |
| 2 | `/login` customer login | public page; wrong password and unconfirmed e-mail show a clear error; success lands on `/my-bookings` | `e2e/flow.mjs`, `e2e/portal.mjs` | S-auto: sign-in works; S-manual: real e-mail confirmation + wrong password UI |
| 3 | `/my-bookings` | signed-in customer only; signed out -> `/login?next=` ; sees only own bookings | `e2e/portal.mjs`, `e2e/signout.mjs`, `deploy-smoke.sh` | S-auto: redirect + own/other isolation via RPC; S-manual: page renders |
| 4 | Booking create / confirm / cancel / seats | server price, idempotent, no overbooking, cancel inside window refused, seats released once | `08_*`, `09_*`, `customer-web/idempotency.int.test.ts`, `e2e/flow.mjs`, `e2e/portal.mjs` | S-auto: create, replay, seats -1, cancel, seats restored, repeat cancel |
| 5 | Ticket + QR | one ticket per seat; QR only for the owner; raw token never in the page; re-issue invalidates the old QR | `10_*`, `tickets.int.test.ts`, `e2e/tickets.mjs` | S-auto: owner gets QR, other customer refused; S-manual: QR image renders |
| 6 | `/driver` | assigned driver only; others get "trip not found"; customer / signed-out cannot see it | `10_*`, `e2e/tickets.mjs`, `deploy-smoke.sh` | S-auto (needs driver + trip env): driver sees trip, customer refused |
| 7 | Boarding scan | forged code rejected; wrong-trip rejected; duplicate = already boarded; valid boards once | `10_*` (parallel scans), `tickets.int.test.ts`, `e2e/tickets.mjs` | S-auto (needs `SMOKE_BOARD_TRIP_ID`, `SMOKE_OTHER_TRIP_ID`) |
| 8 | `/admin` | signed out -> staff login; customer and tenant staff -> 404/redirect, no content; super_admin/support/billing per role | `11_*`, `12_*`, `e2e/audit.mjs`, `e2e/signout.mjs`, `deploy-smoke.sh` | S-auto: anon/customer denied RPCs, super admin reads; S-manual: `/admin` pages |
| 9 | Companies, subscriptions, audit logs | only audited RPCs; reasons required; billing redacted; log append-only | `13_*`, `14_*`, `15_*`, `audit.int.test.ts`, `e2e/audit.mjs` | S-auto: list companies, audit log read; S-manual: create company, change subscription, see the audit entry |
| 10 | Cross-tenant isolation | company A can never read/modify company B | `04_*`, `services.int.test.ts`, `portal.mjs`, `tickets.int.test.ts` | S-auto: customer cannot read raw `bookings/tickets/audit_logs/companies/subscriptions/platform_users`; S-manual: two staff accounts of two companies |
| 11 | Suspended / expired subscription | see table below | `17_lifecycle_policy_tests.sql` (21 checks), `05_*`, `14_*` | S-manual: suspend + reactivate `staging-demo` from `/admin`, retry |
| 12 | Sign-out + protected routes | cookie cleared, protected routes redirect, Back shows nothing | `e2e/signout.mjs` | S-auto: logout 204; S-manual: cookie gone in devtools, `Secure` flag |

### Item 11 policy (pinned by `17_lifecycle_policy_tests.sql`)
| Actor / action | Company **suspended** | Subscription **expired** |
|---|---|---|
| Marketplace lists its trips | hidden | hidden (migration 0021, pinned by `17_lifecycle_policy_tests.sql`) |
| New customer booking | refused, "trip not found" | refused, `42501 no active subscription` |
| Customer reads own bookings | hidden (0 rows) | works |
| Customer QR / cancel | not reachable | works |
| Driver trips / boarding | no trips; scan = "trip not found", nothing boarded | works (day-of-travel boarding keeps running) |
| Staff context | `company_status = suspended`, 0 permissions | normal; new users/buses/drivers/routes/trips refused |
| Reactivation / renewal | service resumes at once | booking works again |

## Findings from 8E
1. ~~Expired subscription still lists bookable-looking trips.~~ **Resolved by migration 0021** (search + stops hide companies without a live subscription; booking refusal unchanged).
2. ~~Customer sign-out scope inconsistent.~~ **Resolved**: customer sign-out uses `{ scope: 'local' }`. Real GoTrue behaviour is still unverified (the local stub does not revoke).
3. A non-existent id in admin RPCs returns PostgREST HTTP 500 with SQLSTATE P0002 (not 404). The service layer maps it by code, so users see a clean error; log dashboards will count these as 5xx.

## Manual staging checklist (the parts no script covers)
- [ ] `/` shows the 3 demo trips; open one; booking dialog shows server price; booking as customer 1 shows a reference and a QR.
- [ ] `/login` wrong password shows a clear error; unconfirmed e-mail says to confirm.
- [ ] `/my-bookings` lists the booking; Cancel works for a trip beyond the window.
- [ ] `/driver` as the driver: only the assigned trip; scan page works with a real phone camera (camera path is not covered by any automated test).
- [ ] `/admin` as super admin: overview, company detail, subscription change, audit entry appears. As customer: 404.
- [ ] Suspend `staging-demo` (reason required): marketplace empty, booking fails; reactivate: back.
- [ ] Sign out: devtools -> Application -> Cookies: `sb-*` gone; `Secure` set; `/my-bookings` redirects.
- [ ] Run `deploy-smoke.sh` and `flow-smoke.mjs`; keep the output (it contains no secrets).
