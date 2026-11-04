# M1 preparation (local only): report

Evidence label: **LOCAL**. Nothing was applied to hosted Supabase or Vercel. M1 itself (hosted staging) still needs your accounts and credentials.

## 1. Migration 0022 adopted (decision D-4, recommended "yes")
- `supabase/migrations/0022_cap_public_search_offset.sql`: `public_search_trips` now clamps `p_offset` to 0..1000. Compared line by line with the function in 0021: the offset line is the only change. Signature, filters, grants and security settings are identical. Rollback is in the header.
- `supabase/tests/18_offset_cap_tests.sql` (5 assertions) added to `tests/run-all-local.sh`. Result on a scratch DB: **1463 passed, 0 failed** (1458 + 5). Migration unit tests 70/70. Staging-scripts suite: ledger now 23 rows, 48 PASS.
- Marker for 0022 added to `scripts/db/verify-hosted-readonly.sql`; file counts in `DEPLOYMENT.md` and `docs/STAGING-CHECKLIST.md` changed 22 to 23 (0001-0022).
- Honest limit: on the small test data, "absurd offset equals offset 1000" compares two zero counts. The assertion that really guards the change is the one that checks the function definition contains the clamp. A behavioural test needs more than 1000 trips.
- Not covered: anonymous direct access to the function is still allowed (decision B, finding F2).

## 2. F1 (QR) explained
- Product code is correct. In the diagnostic run `my_ticket_qr` returned 200 at 4.5 s, then the QR image rendered.
- The page's main thread stalled about 55 s before the lazily loaded `qrcode` chunk finished. The test only waited 10 s. The sandbox has 1 vCPU running Next, PostgREST, the auth stub and a single-process Chromium.
- Two other checks (landing company name, departures count) failed intermittently for the same reason: they read page text on the first "Showing N Departures", which can be a stale count on a slow runner.
- Fix, test file only (`tests/e2e/flow.mjs`): wait up to 90 s for the QR, and wait for the DB's expected count and the company name before asserting. Result: flow **24 / 24**.
- What this does not prove: that your own earlier 23/24 had the same cause. It is consistent with it. A real fault would still fail after 90 s.
- Possible UX follow-up (not done): a slow phone may see the grey QR placeholder for a long time. `TicketQrImage` also hides a failed QR silently. Both are worth a decision in M1 task 7.

## 3. Final local gate after these changes
`tsc` exit 0; vitest 37 files / 638 passed; SQL 1463 / 0; flow 24 / 24. The other browser suites were not rerun after the test-file edit, since only `flow.mjs` changed.

## 4. Still needed from you before M1 can run
1. D-1 (Realtime out of v1) and D-2 (manual billing, no online booking payments): your answers.
2. Supabase staging project, Vercel project with a stable alias, custom SMTP, and `DATABASE_URL`, `STAGING_PROJECT_REF`, `PRODUCTION_PROJECT_REF` exported in your own shell only.
3. Approval of migration 0022 for staging (it is the 23rd file; the applier will show 23 pending).
4. `main` branch protection on GitHub per `docs/BRANCHING.md`.
