# Phase 8F report: observability and recovery (local only; hosted NOT run)

## Audit (code = truth)
8B already shipped: JSON logger, two-layer redaction, `operation.failed` for booking.create/cancel (server) and ticket.qr/ticket.board (browser report via `/api/telemetry/failure`).
Gaps found: (1) no logging of uncaught server errors (only `src/app/admin/error.tsx` exists, shows nothing, logs nothing); (2) no liveness endpoint for uptime monitors; (3) no ops runbook, backup/recovery or monitoring guidance; (4) DEPLOYMENT.md rollback was two lines.

## Changed / added (no migration, no DB change)
- `src/lib/log/request-error.ts` (new), `src/instrumentation.ts` (adds `onRequestError`): one redacted JSON record per unhandled server error. Drops headers, query string, body, stack.
- `src/app/api/health/route.ts` (new): GET/HEAD liveness, `no-store`, no config, no DB.
- `src/lib/log/request-error.test.ts` (new, 6 tests): record shape, query-string token dropped, secrets scrubbed from message, never throws, health GET/HEAD.
- `scripts/smoke/deploy-smoke.sh`: health checks added.
- `docs/OPERATIONS.md` (new): log events, blind spot, failure triage, app rollback, DB rollback, backup/restore, monitoring recommendation.
- `DEPLOYMENT.md` section 5 and 6 updated.

## Results (actual, this sandbox)
- `npx tsc --noEmit`: exit 0
- `npx vitest run`: 33 files, 572/572
- `npm run build` (local env values): exit 0, `/api/health` listed
- `bash tests/bundle-scan.sh`: PASS
- `npm audit --omit=dev`: 0 vulnerabilities
- `deploy-smoke.sh http://localhost:3055` (next start): PASS incl. health
- `bash tests/run-all-local.sh`: **OVERALL FAIL, infrastructure**: sandbox has no Postgres/PostgREST, so SQL, integration and staging-script suites cannot run (unit + typecheck part passes). Browser e2e skipped (no E2E_TOOLS). Not a regression: nothing SQL-side changed. Must re-run where Postgres exists.

## NOT verified
Real Vercel log output, `onRequestError` firing on a real deployment, health through Vercel, backup/PITR availability on your plan, restore drill, any monitor.

## Needs you
Pick error monitor + uptime pinger + log drain (Sentry adds CSP change). Check Supabase backup plan. Restore drill in throw-away project. Re-run `run-all-local.sh` with Postgres.

Status: **8F DONE (repo side), local suite needs re-run on Postgres host.** Not deployed. Stopped before 8G.
