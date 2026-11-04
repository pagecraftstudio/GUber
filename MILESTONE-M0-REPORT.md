# M0 — Baseline and repository hygiene: report

Date: 2026-11-04. Basis: `GUber-full-project.zip` extracted into a clean directory, `npm ci`, Node 22.23.4, npm 10.9.9.
Evidence labels: every result below is **LOCAL** (local Postgres 16.15, PostgREST 12.2.12, GoTrue stub, headless Chromium).
Nothing was run on hosted Supabase or Vercel. Nothing here is "production-ready"; M0 only fixes the starting point.

## 1. Regression gate on the clean checkout

| Step | Result | Report said | Verdict |
|---|---|---|---|
| `npm ci` | ok, 0 vulnerabilities (`npm audit --omit=dev`) | — | match |
| `npx tsc --noEmit` | exit 0 | pass | match |
| `npx vitest run` | **37 files, 638 passed** | 36 files, 636 | difference, explained (below) |
| SQL suites 02–17 + lock oracle | **1458 passed, 0 failed** | 1458 / 0 | match |
| Integration: services+booking | 55 passed | pass | match |
| Integration: customer-web + public-search | 13 passed | pass | match |
| Integration: idempotency + cancellation | 16 passed | pass | match |
| Integration: tickets + boarding | 9 passed | pass | match |
| Integration: rate limit (0020) | 8 passed | pass | match |
| Integration: audit | 14 passed | pass | match |
| Staging scripts (applier, seed guard, bootstrap, cleanup) | 48 PASS, 0 FAIL | pass | match (see note 2) |
| Browser: flow | **23 passed, 1 failed** | 23/24 | **same failure as finding F1** |
| Browser: tickets | 29 passed, 0 failed | pass | match |
| Browser: portal | 35 passed, 0 failed | pass | match |
| Browser: audit viewer | 37 passed, 0 failed | pass | match |
| Browser: flow-smoke (local) | 55 PASS, 0 FAIL | pass | match |
| Browser: deploy-smoke (local) | 2 passed, 0 failed | pass | match |
| Browser: sign-out + protected routes | 16 passed, 0 failed | pass | match |
| `next build` | exit 0 | pass | match |
| `bundle-scan.sh` (run on the exact build, twice) | PASS | pass | match |

Notes:
1. **Test count.** `src/lib/env-example.test.ts` (2 tests) exists in the archive and is mentioned in no report. 36+1 files and 636+2 tests accounts for the difference exactly. This is consistent with the explanation; I did not find a record that proves it.
2. **Sandbox setup, not project change.** `tests/staging/db-scripts.sh` expects a local `postgres` role with password `pw` over TCP. A fresh cluster has none, so the first run failed 22 checks with "password authentication failed". After `alter role postgres password 'pw'` on the scratch cluster, all 48 pass. Worth one line in the runner's header comment (not changed here).
3. The browser suites were run with `@sparticuz/chromium` from npm, not a system Chromium.

## 2. Finding F1 (QR) — now reproducible

Plan status was "not reproduced, cause unknown". In this sandbox the flow suite failed the same check in the 2 runs that completed (the third did not finish within the tool's time limit). Evidence from the test's own diagnostic line:

- the database holds 2 tickets for the new booking (`tickets=2`), so server-side issuing worked;
- `[data-testid=ticket-qr]` was absent 10 seconds after the booking reference appeared;
- `.animate-pulse` count was 0, and no page errors were logged;
- in one run `my_ticket_qr` returned 200; in the other the listener recorded nothing.

What this rules out: both "tickets still loading" and "the `qrcode` chunk failed to import" render an `.animate-pulse` placeholder in `DigitalTicketView.tsx` / `TicketQrImage.tsx`. With zero placeholders, the ticket view took a different branch (error, empty ticket list, boarded, or no token), or was not mounted.
What it does not show: which branch. I have not read the page DOM at failure time and I am not claiming a root cause.
Also noted: `TicketQrImage` swallows a failed QR generation silently (`.catch(() => setSrc(null))`), which would hide a real fault from users and from logs.
Next step belongs to M1 task 7: capture `innerHTML` of the dialog at failure, and decide whether to surface errors from `TicketQrImage`. Not fixed in M0.

> **Update (same day):** F1 is explained, see `MILESTONE-M1-PREP-REPORT.md`. It was a slow-runner timing problem in the test harness, not a missing QR.

## 3. Hygiene changes (applied to the extracted copy; the original zip is untouched)

| # | Change | Why |
|---|---|---|
| 1 | Deleted `tsconfig.tsbuildinfo` | Build artifact; already in `.gitignore`. The supplied patch `0002` no longer applies because tsc rewrites the file, so it was removed directly |
| 2 | Deleted 3 `.DS_Store` files; added `.DS_Store` to `.gitignore` | Was not ignored; this is why they got into the archive |
| 3 | Moved `supabase/tests/04-split-tests (1)` to `docs/audit/archive/04-split-tests-sql-editor/` | Not referenced by `run-all-local.sh`, `package.json`, scripts or docs (searched). It is a paste-into-SQL-Editor split of suite 04, which M1 may want for hosted isolation checks, so it is archived rather than deleted |
| 4 | Copied `audit-reports/` into `docs/audit/` | One source of truth inside the project. The original folder outside the project is left in place; delete it once you have confirmed the copy |
| 5 | Added `docs/BRANCHING.md` | Branch and PR policy (task 5). Branch protection itself must be set on GitHub by the owner |
| 6 | Applied Phase 1.1 patch `0001` (test only) | See D-6 below |

The archive contains no `.git` directory, so "remove from version control" could not be done as a commit. Initialize or reconnect the repository from this cleaned tree and the first commit will already be free of these files.

## 4. Decision D-6 (Phase 1.1 patches) — reviewed, applied, yours to veto

- Patch 0001 changes only `tests/integration/services.int.test.ts`. The old helper drew trip days from 1970-day 20 000 + random(20 000). Day 20 000 is 2024-10-04, so on 2026-11-04 about 3.8% of draws were in the past and the trip state machine rejected them ("trip already departed"). The flake grows slightly every day. The patch bases the draw on today + 30 days. Services + booking passed 55/55 twice after the patch.
- Patch 0002 only stops tracking the build file; done by item 1.
- No production code, migration or policy changed. To revert: `git apply -R -p1 docs/audit/phase-1.1-patches/0001-*.patch`.

## 5. Exit criteria

| Criterion | Status |
|---|---|
| Regression gate passes on a clean checkout, or each difference is explained | Met with one open item: browser `flow` 23/24 is finding F1, reproduced, not explained. Test-count difference explained |
| Repository contains no OS or build artifacts | Met in the cleaned tree. Re-running `tsc` recreates `tsconfig.tsbuildinfo` locally; it is ignored by git |

## 6. Remaining work and what I need from you

- **Your answers still pending from the plan:** D-1 (Realtime out of v1: recommended yes), D-2 (manual billing vs online payments: recommended manual, bookings payments out), and whether you have Supabase and Vercel accounts and a pilot company in mind.
- **M1 prerequisites (owner-run):** separate Supabase staging project, Vercel project plus stable alias, custom SMTP for Auth, and `DATABASE_URL`, `STAGING_PROJECT_REF`, `PRODUCTION_PROJECT_REF` in your shell only. Never paste them here.
- **GitHub:** protect `main` as listed in `docs/BRANCHING.md`.
- **F1:** root cause open (section 2).

M0 is complete pending your approval. M1 does not start until you approve it.
