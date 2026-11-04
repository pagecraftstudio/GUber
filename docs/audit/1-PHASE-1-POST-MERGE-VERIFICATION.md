# Phase 1 — Post-merge verification (commit db5f3948db3fe98b35e4a92c0fe2d3c7e2dbcec9)

Date: 2026-11-01. Fresh worktree of origin/main, `npm ci`, nothing reused from earlier runs. Local only (Postgres 16, PostgREST 12.2.12, GoTrue STUB).

## Repository facts
| Check | Result |
|---|---|
| origin/main HEAD | `db5f394` "Merge pull request #4 from pagecraftstudio/fix/phase1-missing-config-files" |
| PR #4 merge in history | YES (HEAD itself); parents include 610edcf (.gitignore) and 6d14db8 (.env.example) |
| `.env.example`, `.gitignore` tracked on main | YES (`git ls-tree origin/main`) |
| 0022 relocation + 06 test fix + env-example test on main | YES (via 22dd3c8 "Testing Phase 1 (Stability)": `supabase/migrations/0022.sql` deleted, `docs/proposals/unreviewed_is_trip_public_live_subscription.sql` present) |
| `tsconfig.tsbuildinfo` | STILL TRACKED although `*.tsbuildinfo` is in .gitignore; `tsc` modifies it on every run. Low. Fix: `git rm --cached tsconfig.tsbuildinfo` |

## Results
| Command | Result |
|---|---|
| `npx tsc --noEmit` | PASS |
| `npx vitest run` | PASS 37 files, 638/638 |
| `npm run build` (placeholder env) | PASS (Compiled successfully) |
| `bash tests/bundle-scan.sh` | PASS (7/7 checks) |
| `npm audit --omit=dev` | PASS, 0 vulnerabilities |
| `tests/run-all-local.sh` (full, with E2E_TOOLS) | 1st run FAIL (environment), 2nd run FAIL on ONE test, see below |
| SQL suites 02-17 (cumulative) | PASS 1458 / 0 failed; lock oracle PASS |
| Integration: customer-web 13, idempotency 16, tickets 9, rate-limit 8, audit 14 | PASS |
| Integration: services+booking | 54/55 on the full run (1 FAIL), 55/55 on 3 immediate reruns |
| Staging scripts (applier, seed guard, bootstrap, cleanup) | PASS |
| Browser e2e: flow 24, tickets 29, portal 35, audit 37, signout 16, deploy-smoke 2, flow-smoke 49 ran / 0 skipped | PASS (puppeteer-core + Chromium 1243) |

## Failures and what they mean
1. **First run: everything after unit tests failed.** Cause: the local PostgreSQL service had stopped between sessions ("Connection refused"). Environment, not code. Restarted, `postgres` password reset to `pw` (needed by the staging-script suite), reran.
2. **Second run: `services.int.test.ts` "bus/driver double-booking ... " failed with `trip already departed` (23514).** Cause: test helper `day = () => 20_000 + Math.floor(Math.random()*20_000)` picks a day number since 1970. Today is day 20758, so ~3.8% of draws land in the PAST and the state machine (0011) correctly refuses to schedule a past trip. Pre-existing flaky test, not a product bug, and it gets worse as time passes only slowly. 3 immediate reruns: 55/55 each. Proposed fix (not applied; audit is read-only): `20_000` -> `Math.floor(Date.now()/86_400_000) + 30`.
   `run-all-local.sh` therefore reports OVERALL: FAIL for this commit on that run. I do not report it as a pass.
3. Same pattern (date arithmetic) as the 06 SQL test fixed in Phase 1: tests that depend on the wall clock need a sweep (Phase 1.1 candidate).

## Skipped / not run
- Nothing skipped inside executed suites (flow-smoke: ran 49, skipped 0).
- NOT run: anything against live Supabase/GoTrue, Vercel, real e-mail, phone camera QR, CSP in real browsers, Firewall rules.
- Auth in e2e is a GoTrue stub.
- `npm audit` reflects the registry at run time only.

## Verdict
Local verification of db5f394: GREEN except one pre-existing flaky integration test (passes on rerun). Live-environment acceptance remains open (see report 2 and the Vercel checklist in PHASE-1-FINAL-VERIFICATION.md).
