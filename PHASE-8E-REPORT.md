# Phase 8E report: end-to-end smoke tests (local automated; hosted NOT run)

Input: `malaky-phase8d.zip`, treated as source of truth. Nothing was run against hosted Supabase or Vercel (no credentials).

## Added
- `supabase/tests/17_lifecycle_policy_tests.sql` (21 checks): what a suspended company and an expired subscription may do, per role (customer, driver, staff, anonymous). Wired into `run-all-local.sh`.
- `tests/e2e/signout.mjs` (16 checks, real browser): customer and driver sign-out, cookie cleared, protected routes redirect, Back shows nothing, customer cannot see `/admin /dashboard /driver` content.
- `scripts/smoke/flow-smoke.mjs`: authenticated flow smoke over the public API for a hosted STAGING project (search, book, replay, seats, isolation, QR, cancel, optional boarding/wrong-trip/duplicate, `/admin` denial and super-admin access, raw-table cross-tenant reads, logout). Refuses production (no production mode), service-role keys, missing/matching refs, one account used twice. Never prints tokens, QR payloads or passwords.
- `tests/e2e/flow-smoke-local.mjs`: runs that script against the local stack (46 checks) and checks its refusal guards and that output has no secrets.
- `docs/SMOKE-TESTS.md`: the 12 areas x LOCAL / STAGING / PRODUCTION matrix, expected access policy, commands, manual checklist. `DEPLOYMENT.md` and `docs/STAGING-CHECKLIST.md` point to it.
- No migration added or changed. No application code changed.

## Findings (documented, NOT changed: product decisions)
1. Expired subscription: booking is refused (`42501 no active subscription`) but the marketplace still lists the trips. Recommend hiding them (needs migration 0021).
2. Customer sign-out uses the browser client default scope (all devices); staff sign-out uses `scope: 'local'`. Recommend local for customers unless intended. Cannot be verified with the local stub.
3. Admin RPC "not found" arrives as HTTP 500 / SQLSTATE P0002 from PostgREST; the service layer maps it, but log counters will see 5xx.
Suspended-company behaviour is correct and now pinned: hidden from marketplace, booking and boarding answer "trip not found", staff get 0 permissions, reactivation restores service.

## Results (actual, this sandbox: Postgres 16, PostgREST 12.2.12, Chromium + puppeteer, GoTrue STUB)
- `npx tsc --noEmit`: exit 0
- `npx vitest run`: 32 files, 566/566
- `bash tests/run-all-local.sh` with browser suites enabled: OVERALL PASS. SQL suites 02-17: 1433 assertions, 0 failed; lock-oracle 0; six PostgREST integration suites pass; staging scripts PASS; browser e2e: flow 24, tickets 29, portal 35, audit 37, flow-smoke 46 (+guards), signout 16, all 0 failed.
- `next build`: exit 0. `bash tests/bundle-scan.sh`: PASS. `npm audit --omit=dev`: 0 vulnerabilities.
- `scripts/smoke/deploy-smoke.sh http://localhost:3055` (next start): PASS.
- Note: 8D never ran the browser suites; they were run here for the first time on this tree.
- Test-writing mistakes found and fixed: RLS hid a booking id from the customer in my first SQL draft; one over-loose Back-button regex; a smoke script that picked a trip inside the cancellation window and left bookings behind (now picks the farthest departure).

## NOT verified
Everything hosted: real Auth e-mail flow, `Secure` cookies in a browser, PT429 as HTTP 429, CSP in real browsers, Vercel behaviour, `flow-smoke.mjs` against a real project (it passed only against the local stub/PostgREST), phone-camera QR scanning, global-vs-local sign-out on real GoTrue, production anything.

## Needs you
Staging project + Vercel alias; two confirmed customers, a driver, optionally a super admin; a throw-away trip departing in 65-110 min; then run `deploy-smoke.sh` and `flow-smoke.mjs` (env vars in docs/SMOKE-TESTS.md) and send me the output (no secrets in it). Decide findings 1 and 2.

Status: **READY FOR STAGING SMOKE (repo side)**. Not deployed. Stopped before 8F.
