# Phase 8D report: Vercel deployment readiness (repo side only)

Input: `malaky-phase8c.zip`. Treated as source of truth; its 8B/8C reports were re-checked, not trusted.

## Re-verified from the zip before changing anything
- `tsc --noEmit` exit 0; `vitest run` 558/558; `npm audit --omit=dev` 0 vulnerabilities; Next 16.4.2 (engines `>=20.9.0`); Node 22.22.2.
- Real `next build` runs, 5 bad configurations, each FAILS the build with variable names only: no env; mock mode; `NEXT_PUBLIC_STRIPE_SECRET`; http site URL with `VERCEL_ENV=preview`; service-role JWT in the publishable slot.
- A valid configuration builds (exit 0, 27 routes plus Proxy). `bundle-scan.sh` PASS.
- `next start` smoke: protected routes redirect to the correct login (`/my-bookings`, `/reset-password` -> `/login`; `/dashboard`, `/admin`, `/driver` -> `/company/login`); security headers on pages and 404; marketplace `index,follow`, operator pages `noindex`.

## Problems found and fixed (each reproduced first)
| # | Problem | Fix | Test |
|---|---|---|---|
| 1 | `SKIP_ENV_VALIDATION=1` was honoured on Vercel **Preview** (only production was protected), so a staging deploy could skip validation | `shouldEnforce` ignores it whenever `VERCEL_ENV` or `VERCEL` is set | `env-check.test.ts` (+2). Real build with `VERCEL_ENV=preview SKIP_ENV_VALIDATION=1` and no vars now exits 1 |
| 2 | Auth cookies had no `Secure` flag (`@supabase/ssr` defaults omit it) | `src/lib/supabase/cookie-options.ts`, applied in server client, proxy and browser client when `SITE_URL` is https. `httpOnly` stays false: the browser client must read the session | `cookie-options.test.ts` (4) |
| 3 | Marketplace loads Google Fonts; CSP report-only policy did not list them (report noise now, breakage at Stage 2) | added the two Google Fonts hosts to report-only only; enforced policy unchanged | `security-headers.test.ts` (+2) |
| 4 | `engines.node` `>=20.9.0` lets Vercel pick an untested major | pinned `22.x` in package.json and the one matching lockfile line (nothing else in the lockfile changed) | `npm ci` OK |

## Added
- `scripts/smoke/deploy-smoke.sh <url>`: read-only deployment smoke, PASS against local `next start`. My first draft asserted the wrong thing for a bare junk recovery link (it defaults to the operator audience by design, because both real flows pass `from=` explicitly); corrected to the real contract.
- `docs/VERCEL-CHECKLIST.md`; `DEPLOYMENT.md` section 2 updated.

## Results (actual)
- `tsc --noEmit`: 0. `vitest run`: 32 files, 566/566.
- `bash tests/run-all-local.sh` (local Postgres 16, PostgREST 12.2.12): tsc, vitest, SQL suites 02-16 (1412 assertions, 0 failed), lock-oracle, six PostgREST integration suites (55, 8, 16, 9, 8, 10) all PASS.
- The staging-scripts step failed in my sandbox only because its Postgres demanded a password over TCP. After setting local trust auth, `tests/staging/db-scripts.sh` = 48 PASS. I did not rerun the whole `run-all-local.sh` after that one change.
- `next build` (http-localhost and https/preview variants): exit 0. `bundle-scan.sh` PASS. `npm audit --omit=dev` 0.
- Browser e2e: NOT run (needs puppeteer and Chrome).

## NOT verified / not claimed
No Vercel project, no hosted Supabase. Unverified: dashboard settings, the `Secure` cookie in a real browser, `/auth/confirm` fallback landing for a plain signup confirmation, email delivery, preview-URL behaviour, Firewall rules, PT429 as HTTP 429 on hosted PostgREST, CSP in real browsers. A production build sends enforced `upgrade-insecure-requests` even on http://localhost, so browsers may refuse local http assets there (irrelevant on https).

## Remaining risks
- Password-reset emails sent before 8B lack `from=`; if expired they route to the operator flow.
- Next 16.4.3 exists; audit is clean on 16.4.2, so not bumped. Read its changelog before the staging cut.
- HSTS `includeSubDomains` (2 years) will cover tenant subdomains later: every tenant host must serve https.
- Telemetry origin check ties staging to one stable host (VERCEL-CHECKLIST section 3).

## Needs you
Create the Vercel project; set the 3 variables per environment; assign a stable staging alias; add it to Supabase Auth URLs; run `scripts/smoke/deploy-smoke.sh` against it and send me the output. Then `docs/STAGING-CHECKLIST.md` with real accounts.

Status: **READY FOR STAGING (repo side)**. Not deployed. Stopped before 8E.
