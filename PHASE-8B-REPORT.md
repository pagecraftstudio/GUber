# Phase 8B - Security hardening report

Status: **8B complete locally. NOT verified against hosted Supabase or Vercel.** Phase 8C not started.

## Changed / added files
Migration (new, nothing applied was edited): `supabase/migrations/0020_rate_limiting.sql`
SQL tests: `supabase/tests/16_rate_limit_tests.sql` (+59 assertions)
Integration: `tests/integration/rate-limit.int.test.ts`; `tests/run-all-local.sh` (suite 16 + `bus_rl` step)
Redirects: `src/lib/auth/redirect.ts`, `src/app/auth/confirm/route.ts`, `src/app/(auth)/forgot-password/page.tsx`, `src/app/company/login/page.tsx`, `src/features/auth/actions.ts`, `src/features/auth/search-params.ts`, `src/ui/lib/real/authService.real.ts`
Logging: `src/lib/log/{redact,index,report-schema,service-failure}.ts`, `src/app/api/telemetry/failure/route.ts`, `src/ui/lib/reportFailure.ts`, `src/ui/lib/real/customerBackend.ts`, `src/features/driver/driverApi.ts`, `src/features/bookings/service.ts`, `src/lib/errors.ts`, `src/lib/db/map-error.ts`
Env: `src/lib/env-check.ts`, `src/lib/env.ts`, `src/instrumentation.ts`, `next.config.ts`, `.env.example`
Headers/CSP: `src/lib/security-headers.ts`, `src/app/api/csp-report/route.ts`
Deps: `zod` ^4.6.7 (new high advisory GHSA-mrhx-c7xc-m3w5 in <4.6.6)
Tests (unit): redirect, auth/confirm route, log/redaction, failure route, reportFailure, env-check, security-headers, csp-report, map-error, real, driverApi
Docs: `docs/RATE-LIMITING.md`, `docs/SECURITY-HEADERS.md`, this report

## Results (actually run here: Ubuntu, Node 22, local Postgres 16.15, PostgREST 12.2.3)
| Check | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npx vitest run src` | 30 files, 553 tests passed |
| `bash tests/run-all-local.sh` | **OVERALL: PASS** - SQL suites 02-16: 1412 passed / 0 failed; lock-oracle 0; integration services+booking, customer-web, idempotency, tickets, **rate-limit (8)**, audit all exit 0 |
| `npm run build` (valid env) | success |
| `npm run build` (no env / http URL + sb_secret key) | fails with clear, value-free message (verified) |
| `bash tests/bundle-scan.sh` | PASS |
| `npm audit --omit=dev` | 0 vulnerabilities (after zod bump) |
| `next start` headers probe | CSP, CSP-Report-Only, Permissions-Policy present; `/api/telemetry/failure` without Origin -> 403; `/api/csp-report` -> 204; `/my-bookings` anonymous -> 307 |
Browser e2e (`E2E_TOOLS`) was **not run**.

## Findings fixed
1. No server-side rate limiting -> DB limiter, wrappers keep original signatures; implementations moved to `app_private` with EXECUTE revoked (bypass tests pass).
2. Customer sent to operator login (`/forgot-password` back link, `/auth/confirm` fallback to `/dashboard`) -> audience-aware; open-redirect allow-list unchanged.
3. `Permissions-Policy: camera=()` blocked the driver QR scanner -> `camera=(self)`.
4. Env validation lazy -> build and server start fail fast; rejects service-role/secret keys and secret-named `NEXT_PUBLIC_*`.
5. New zod advisory -> upgraded.
6. No CSP -> staged (see docs/SECURITY-HEADERS.md).

## Honest limitations
- **Failed calls are not counted** by the DB limiter (Postgres rolls the counter back with the failed call). Only committed calls and the call that hits the ceiling count.
- **Vercel Firewall cannot protect** customer login, public search, booking, QR or boarding: the browser calls Supabase directly. My 8A proposal overstated this. Firewall rules cover operator login/reset, invites, telemetry, csp-report only. See docs/RATE-LIMITING.md.
- Server logging for customer/driver operations relies on **client-reported** failures (`source=client_report`, unverified) because those calls bypass this server. Authoritative copies live in Supabase API/Postgres logs. Staff booking create/cancel is logged server-side (`source=server`).
- CSP `script-src` is not yet protective (`'unsafe-inline'`, Report-Only). Nonce stage pending.
- `/login` (customer) page ignores `?error=confirm_failed` (no banner); user lands on the login screen.
- Fixed-window limiter allows up to 2x burst at a boundary. `hits` counter table needs occasional purge.
- Not verified: hosted Supabase behaviour, `0013b` filename under Supabase CLI, Auth redirect URL allow-list accepting the new `&from=` query on `redirectTo` (add `https://<site>/**` to Supabase Auth redirect URLs and test), Vercel build with `instrumentation.ts`.

## Your manual actions
1. Create the Vercel Firewall rules in docs/RATE-LIMITING.md (Log mode first) and verify with curl; until then "not active".
2. Supabase dashboard: review Auth rate limits; confirm redirect URL allow-list covers `/auth/confirm?...&from=...`.
3. Decide: route public search through a cached Next route handler (closes the anonymous-search gap).
4. On staging: run `supabase db push --dry-run` (confirms `0013b_` naming and applies 0020), then the 8E smoke tests.
5. Run browser e2e (`E2E_TOOLS=1 bash tests/run-all-local.sh`) where Chrome is available.
