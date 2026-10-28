# Phase 8 — Final Report

Date of validation: 2026-10-28. Environment: Linux container, Node 22.23.4, Postgres 16.15, PostgREST 12.2.12, Chromium 1243 (headless shell) driven by puppeteer-core, GoTrue **stub** (not real Supabase Auth).
**Everything below is LOCAL validation. Nothing was run against hosted Supabase or Vercel. Nothing was deployed. No production data or migration was touched.**

## 10. Final status: **READY FOR STAGING** (local evidence only) — production: **BLOCKED**

Conditions attached to "ready for staging":
- The QR browser failure you reported (23/24) **could not be reproduced and its cause is not identified** (section 3). It is classified as *unreproduced*, not as fixed. Diagnostics were added so that a recurrence explains itself.
- All hosted behaviour (Auth, Vercel CDN/Firewall, PT429 → 429, redirects) is unverified (section 7).
- The direct-Supabase-RPC bypass of the public-search rate limit is **still open** by decision (section 5).

---

## 1. Implemented changes and changed files

Carried over from the WIP state (already in the archive you supplied): migration `0021`, subscription-aware public search/stops, customer sign-out `{ scope: 'local' }`, shared admin not-found helper, `GET /api/public/trips`, `GET /api/public/trips/[tripId]/stops`, client switch to those routes, unit/SQL/integration tests.

Changed in this final pass:

| File | Change |
|---|---|
| `src/lib/public-search/handler.ts` | **Bug fix.** `stale-while-revalidate` removed from `Cache-Control`; moved to `Vercel-CDN-Cache-Control` only. New exports `TRIPS_CDN_CACHE`, `STOPS_CDN_CACHE`, `cdnCacheFor`. |
| `src/lib/public-search/public-search.test.ts` | Regression assertions: no SWR in `Cache-Control`, `max-age=0`, CDN header value (trips and stops). |
| `scripts/smoke/flow-smoke.mjs` | Optional `SMOKE_APP_URL`: marketplace search/stops now go through the HTTP routes (+ cache header, stops, 400 checks). Without it: direct-RPC fallback and an explicit `SKIP`. Booking/ticket/boarding/admin direct-RPC checks are unchanged (they test the DB boundary). |
| `scripts/smoke/deploy-smoke.sh` | New section 4c: `/api/public/trips` 200 + JSON, browser-safe cache header, no cookie, 400 on bad input, `/stops` 400 on bad id, POST → 405. |
| `tests/e2e/deploy-smoke-local.mjs` (new) | Runs `deploy-smoke.sh` against the local production build. |
| `tests/e2e/flow-smoke-local.mjs` | Passes `SMOKE_APP_URL`. |
| `tests/e2e/flow.mjs` | QR assertion **unchanged**; failure message now includes `my_ticket_qr` HTTP statuses, page errors, image/skeleton counts, page text. |
| `tests/run-all-local.sh` | Added the deploy-smoke browser suite. |
| `DEPLOYMENT.md`, `docs/STAGING-CHECKLIST.md`, `docs/SMOKE-TESTS.md`, `docs/OPERATIONS.md`, `docs/RATE-LIMITING.md` | Updated (22 migrations, 0021, resolved gaps, public routes, Firewall rule, 3b decision, local-vs-hosted). |
| `PHASE-8-WIP-STATUS.md` | Removed (superseded by this report). |

## 2. Migration 0021 and ledger verification

`0021_public_listing_requires_live_subscription.sql` — public search and stop listing require `app_private.has_live_subscription(company)` (single definition `app_private.live_subscription`, 0015). `is_trip_public()` and the booking path are untouched; a direct `create_my_booking` for an expired company is still refused (`42501`).

Total migrations in the tree: **22** (0001–0021 including `0013b`). Earlier docs said 21; corrected.

Verified with `scripts/db/apply-migrations.sh`, `TARGET_ENV=local`, scratch DB `bus_mig` (never `supabase db push`):
- `--dry-run` → `dry run: 22 migration(s) would be applied`
- apply → `done: 22 applied, 0 already present`
- `--status` → `ledger OK; 0 pending`
- `app_private.schema_ledger`: 22 rows, last = 0021; stored sha256 prefix `46c71f6552d9` = `sha256sum` of the file (match)
- second apply → `done: 0 applied, 22 already present` (idempotent)

Not done: applying to staging or production.

## 3. QR browser failure — root cause: **NOT FOUND (unreproduced)**

What was done:
1. Rebuilt the environment from your latest archive. `flow.mjs` (production build, `next start`, local Postgres/PostgREST/stub): **24/24 on the first run, then 4 more runs 24/24, then 2 runs under deliberate CPU saturation (2× cores busy loops) 24/24.** The failing check (`[data-testid="ticket-qr"]`) passed every time.
2. Read the full path: `create_my_booking` → `DigitalTicketView` effect → `RealTransportService.getBookingTickets` → `customerBackend.ticketQr` → RPC `my_ticket_qr` (0014, wrapped by the 0020 limiter, bucket `ticket.qr` 30/10 min) → `TicketQrImage` (dynamic `import('qrcode')` → `toDataURL` → `<img data-testid="ticket-qr">`). The component shows a pulsing skeleton until the QR data-URL exists; the test waits 10 s for the selector.
3. **No baseline comparison occurred.** The original `malaky-phase8g.zip` was not provided in this session, so the "same test on the original archive" step could not be run. I do not claim the failure is pre-existing or a regression.
4. The bundle/proxy/AuthContext changes cannot be linked to the symptom from the code path above: `/api/public/*` is not on the QR path.

Plausible environment-specific causes (hypotheses, **not verified**): QR chunk or `my_ticket_qr` slower than the 10 s wait on a slow runner; `my_ticket_qr` error (limiter/auth) leaving the skeleton; a blocked/slow external request in the sandbox (Chromium here tried `fonts.googleapis.com` etc. and the egress proxy refused them — the page still rendered).

What was added: the failure message of that check now prints the `my_ticket_qr` HTTP statuses, page errors, `<img>` and skeleton counts and the page text. **If it fails again, send that line**; it will separate "RPC failed" from "RPC slow" from "render failed". The assertion itself was not loosened or skipped.

### Different bug found and fixed (by running the other suites)
`tests/e2e/portal.mjs` **failed** on the first full run (`no clickable element: Book Seat`). Cause: `/api/public/trips` sent `Cache-Control: public, max-age=0, s-maxage=30, stale-while-revalidate=60`. Chrome honours `stale-while-revalidate` for its own cache, so after seats were freed in the DB the page still rendered the stale "Fully Booked" card (DB said 2 seats, UI said full). This is a **regression introduced by the new route** (the old direct RPC had no HTTP cache) with real user impact: stale seat counts for up to 60 s. Fix: browsers get `public, max-age=0, s-maxage=30` (revalidate every time); `stale-while-revalidate` is granted to the Vercel CDN only through `Vercel-CDN-Cache-Control`. Regression tests: unit assertions (trips + stops), `deploy-smoke.sh` 4c, `flow-smoke.mjs`, and `portal.mjs` itself (35/35 after the fix).

## 4. Tests actually run (final code, same archive)

| Command | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npx vitest run` | 36 files, **636 passed** (count unchanged: new assertions were added to existing tests) |
| `bash tests/run-all-local.sh` with `E2E_TOOLS` set (all suites incl. browser) | **OVERALL: PASS**, exit 0 |
| · SQL suites 02–17 + lock oracle | cumulative **1458 passed, 0 failed** |
| · integration (real PostgREST): services+booking 55, customer-web+public-search 13, idempotency 16, tickets 9, rate-limit 8, audit 14 | all passed |
| · staging scripts | PASS |
| · browser `flow.mjs` | 24/24 |
| · browser `tickets.mjs` | 29/29 (QR render, driver boarding page) |
| · browser `portal.mjs` | 35/35 (isolation, cancellation, capacity, history) |
| · browser `audit.mjs` | 37/37 |
| · browser `flow-smoke-local.mjs` → `flow-smoke.mjs` | 49 checks PASS (46 before the 3 new HTTP-route checks) + 5/5 guard refusals + no secret leakage |
| · browser `deploy-smoke-local.mjs` → `deploy-smoke.sh` | PASS (2/2 wrapper checks, includes new public-route checks) |
| · browser `signout.mjs` | 16/16 |
| `next build` (with the three `NEXT_PUBLIC_*` vars) | exit 0; routes `/api/public/trips` and `/api/public/trips/[tripId]/stops` present. (A build without the vars fails closed with variable names only — observed.) |
| `bash tests/bundle-scan.sh` on that exact build | **PASS** (build id `CDonJFTph7tfEXiTZhpKr`, fingerprint `dcfa53fa8db442ea`) |
| `npm audit --omit=dev` | found 0 vulnerabilities |
| `deploy-smoke.sh` | PASS locally (via the suite above) |

Classified remaining notes (not failures):
- `flow-smoke` prints `NOTE could not cancel smoke booking …: 23514` ×2 and "open smoke bookings after run: 2". Those are the boarding-test bookings on trips departing in ~90 min, inside the cancellation window by design. On staging they must be cleaned by hand (already the documented behaviour).
- `NOTE upgrade-insecure-requests on a plain-http target` — expected for a local http production build.

Not run: a **baseline** (original 8G) run; hosted anything.

## 5. Public-search rate-limit decision

Full analysis: `docs/RATE-LIMITING.md` section 3b. Summary:
- Decision: **B — keep anonymous RPCs, document residual risk. The bypass is NOT closed.** Nothing about grants was changed; no secret was introduced.
- Why not A: it needs a service-role key (bypasses RLS on every table) in the web tier, or a hand-minted JWT whose feasibility depends on the project's JWT-signing setup (unverifiable without a hosted project), to protect read-only, tenant-filtered data that is public by design. That trades a low-severity availability/scraping risk for a high-severity secret.
- Residual risks: direct calls bypass Vercel Firewall and the CDN; Supabase has no per-endpoint limiter; `offset` is uncapped in the RPC (HTTP route validates it, RPC does not).
- Recommended follow-up needing your approval: migration `0022` capping `p_offset` (e.g. 1000); Supabase dashboard limits/alerts; revisit A under the preconditions listed in 3b.
- No test asserts that direct anonymous calls are denied, because they are allowed.

## 6. Security review findings

| # | Finding | Severity | State |
|---|---|---|---|
| 1 | `stale-while-revalidate` in browser-facing `Cache-Control` served stale seat availability | Medium (correctness/UX; booking RPC remained authoritative) | **Fixed + tested** |
| 2 | Direct anonymous RPC access bypasses Vercel Firewall/CDN | Low–Medium (public data, read-only, clamped) | Open, accepted (B), documented |
| 3 | `p_offset` uncapped in `public_search_trips` | Low | Open, follow-up proposed |
| 4 | No service-role key in code, env schema or bundle; scan passes | — | Verified (bundle-scan, route uses publishable key, no session) |
| 5 | Route responses: allow-listed columns, no cookies, no `Vary: cookie/authorization`, upstream errors → generic 502/429 `no-store`, GET only | — | Verified by unit tests |
| 6 | Tenant isolation / RLS: 1458 SQL assertions + portal/tickets browser isolation | — | Verified locally only |
| 7 | Smoke leaves 2 uncancellable bookings on boarding trips | Info | Documented |

## 7. Hosted verification status

**None performed.** Unverified: real Auth e-mail flow and redirect matching, `Secure` cookies, real-GoTrue sign-out `scope: 'local'`, `PT429` → HTTP 429 on hosted PostgREST, applying 0020/0021 on a real project, Vercel CDN behaviour of `/api/public/*` (`Vercel-CDN-Cache-Control`, `x-vercel-cache`), Firewall rule enforcement, CSP in real browsers, phone-camera QR scan, backups/restore drill.

## 8. Manual staging and Vercel steps (all documented, none done)

1. New Supabase staging project; export `DATABASE_URL`, `STAGING_PROJECT_REF`, `PRODUCTION_PROJECT_REF`; backup; `TARGET_ENV=staging bash scripts/db/apply-migrations.sh --dry-run` → expect 22 pending; apply; `--status` → `ledger OK; 0 pending`.
2. Auth settings, redirect URLs (`/auth/confirm`, `/**`), e-mail templates, first super admin via `supabase/bootstrap/first_super_admin.sql` (`docs/STAGING-CHECKLIST.md`, `DEPLOYMENT.md` §§4–6).
3. Vercel project with the three `NEXT_PUBLIC_*` vars on one stable alias.
4. Firewall rules incl. new `public-search` (GET, path starts with `/api/public/`, e.g. 60/min/IP), Log mode first, then verify 429 from a terminal (`docs/RATE-LIMITING.md` §3).
5. `deploy-smoke.sh https://<alias>`, then `flow-smoke.mjs` with `SMOKE_APP_URL=https://<alias>`, then the manual checklist (`docs/SMOKE-TESTS.md`, `docs/STAGING-CHECKLIST.md`).
6. Rollback: app = Vercel promote previous deployment; DB = forward-only, 0021 rollback statements in its header (restore the two functions from 0013, drop `app_private.has_live_subscription`) after a backup and data-impact review (`docs/OPERATIONS.md`).

## 9. Production migration blockers and required approval

- No production migration tooling exists by design (`apply-migrations.sh` refuses production). Production migration needs your explicit approval and a separate, reviewed procedure.
- Blockers: no hosted staging validation; QR failure unreproduced/unexplained; direct-RPC bypass decision B needs your sign-off; backup/restore drill not done; Auth, Firewall, monitoring not configured; payment provider not built.
- **Re-run after any further code change:** tsc, vitest, `run-all-local.sh` with browser suites, `next build`, `bundle-scan.sh`, `npm audit --omit=dev`.
