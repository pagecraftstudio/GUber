# Phase 8 follow-up: WORK IN PROGRESS snapshot (not a final report)

Contains: migration 0021 (hide trips of companies without a live subscription), customer sign-out scope 'local',
admin not-found helper + tests, /api/public/trips and /api/public/trips/:id/stops routes, proxy bypass, client switch.

Verified locally (Postgres 16 + PostgREST 12.2.12): tsc 0, vitest 636/636, run-all-local (no browser suites) OVERALL PASS, SQL 1458/0 failed.

OPEN / NOT DONE
- Browser e2e tests/e2e/flow.mjs: 23 passed, 1 FAILED (QR image not shown after booking confirmation). Cause unknown; not compared against baseline.
- Other browser suites, next build, bundle-scan, npm audit, deploy-smoke NOT re-run after these changes.
- Docs not updated (DEPLOYMENT.md, RATE-LIMITING.md, SMOKE-TESTS.md, STAGING-CHECKLIST.md still say 21 migrations / old known gap).
- Vercel Firewall rule for /api/public/* not documented. Direct Supabase RPC access with the publishable key is still open.
- Consolidated Phase 8 final report not written.
Status: NOT READY.
