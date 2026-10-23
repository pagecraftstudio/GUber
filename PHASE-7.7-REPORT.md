# Phase 7.7 — Full Regression & Deployment

## Scope
Full regression, test-suite repair, dependency security fix, deployment runbook. No feature or migration changes.

## Findings and fixes
| Finding | Cause | Fix |
|---|---|---|
| Customer e2e (flow/tickets/portal) failed at "Sign In" click | Tests stale: header "Log In" is now a link to `/login` (page, not modal); post-login redirects to `/my-bookings` | Tests open `/login` directly and return to `/` after sign-in. Product unchanged. |
| Customer e2e redirects landed on another host, cookie lost | `next start -H 127.0.0.1` builds redirect URLs from the bind host; app was browsed via a different host | `run-e2e.sh` now uses `localhost` consistently (BASE, SITE_URL, bind). Test-harness only. |
| `next` 16.4.0 critical advisories | Verified with `npm audit`: image-optimization RCE (GHSA-2464-fhr4-w9xw), `use cache` RCE (GHSA-673q-mjm6-r5xr), Server Actions DoS (GHSA-p3m5-59mp-jv5r); fix in 16.4.2 | Patch bump `next` ^16.4.0 -> ^16.4.2 (lockfile updated); `npm audit --omit=dev`: 0 vulnerabilities |
| audit e2e not in the master runner | — | Added to `tests/run-all-local.sh` |

## Results (real runs, after the Next.js bump)
| Check | Result |
|---|---|
| tsc --noEmit | 0 errors |
| vitest | 432/432 |
| SQL suites 02-15 (cumulative, one DB) | 1353 pass, 0 fail |
| Lock oracle, unit + PostgREST integration (via run-all-local.sh) | pass |
| Browser e2e flow / tickets / portal / audit | 24 / 29 / 35 / 37, 0 failed |
| `tests/run-all-local.sh` | OVERALL PASS |
| next build | OK |
| bundle-scan.sh | PASS |
| service-role key in `src/` | none |
| npm audit --omit=dev | 0 vulnerabilities |

## Deliverable
`DEPLOYMENT.md`: env vars, migration order, first super admin, auth settings, smoke tests, rollback.

## Not done / not verified
- No deployment performed; nothing run against hosted Supabase, real GoTrue (e2e uses a stub) or Vercel.
- Not production-ready by the project's own definition until: a staging run on real Supabase, auth/booking rate limiting, monitoring, and a decision on payments/custom domains (see DEPLOYMENT.md §6).
- `next build` prints a one-time Next.js upgrade notice that makes the first build in a fresh session exit 1; a retry succeeds (affects `run-e2e.sh` first run only).
