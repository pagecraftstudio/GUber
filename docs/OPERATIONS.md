# Operations: observability, failure triage, rollback, recovery

Status legend: **IMPLEMENTED+TESTED** = code in this repo with unit tests. **UNVERIFIED** = needs a real Vercel/Supabase project. **RECOMMENDED** = decision for you, nothing installed.

## 1. What the app logs (IMPLEMENTED+TESTED locally; Vercel log output UNVERIFIED)
One JSON object per line on stdout/stderr. Fields: `ts level event env release` + event fields. `release` = first 7 chars of `VERCEL_GIT_COMMIT_SHA`.

| Event | Source | Meaning |
|---|---|---|
| `operation.failed` | server (`source:"server"`) or browser report (`source:"client_report"`) | booking.create, booking.cancel, ticket.qr, ticket.board failed. Fields: `op outcome pgCode httpStatus tripId bookingId seats userId companyId detail` |
| `operation.failed.unexpected` | server | non-AppError thrown inside a booking op (scrubbed error summary) |
| `request.unhandled_error` | `onRequestError` in `src/instrumentation.ts` | any uncaught server error: `method path routePath routeType digest error{name,message}` |
| `telemetry.log_failed`, `log.failed` | logger | logging itself failed (data-free) |

`outcome` values: `rate_limited unauthenticated forbidden not_found validation conflict business_rule plan_limit network internal unknown`. `pgCode` is the SQLSTATE/PostgREST code (`PT429` = rate limit, `42501` = forbidden or no active subscription, `23505` = duplicate, `53400` = plan limit).

Never logged (enforced by `src/lib/log/redact.ts`, tested): passwords, tokens, JWTs, `MALAKY:TICKET:*` QR payloads, Authorization/cookie headers, e-mail, phone, names, request bodies, query strings, stack traces. Ids (UUIDs) are kept on purpose.

**Important blind spot.** Customer booking, cancel, QR and driver boarding go browser -> Supabase directly, not through Next. Their failures reach the log only through `POST /api/telemetry/failure` (browser report, unverified input, capped at 8/min per page, needs a session). A user whose browser blocks the report, or who is offline, is invisible here. The authoritative record for those operations is Postgres: `audit_logs`, `bookings`, tickets, and the Supabase **API logs** and **Postgres logs** in the dashboard.

Public catalogue routes log `public_search.trips.failed` / `public_search.stops.failed` (fields: `pgCode httpStatus outcome`), `*.bad_shape` and `*.exception`; upstream details are never returned to the caller (502/429 only, `no-store`).

## 2. Checking for failure
### App (Vercel)
1. `curl -s https://<host>/api/health` -> `{"status":"ok","release":"abc1234"}`. This proves the deployment serves requests. It does not prove the database is reachable.
2. Vercel -> project -> Logs. Filter `level:error` or search `request.unhandled_error`, `operation.failed`. Group by `event` + `op` + `outcome`.
3. Compare `release` in recent errors with the current deployment to see whether a deploy caused it.
4. `scripts/smoke/deploy-smoke.sh https://<host>` (read-only) after any deploy or suspected incident.

### Database (Supabase dashboard)
1. Reports -> API / Database, and Logs -> API Edge Logs: filter status >= 500 and 429.
2. Logs -> Postgres Logs: search `ERROR`, `FATAL`, `deadlock`, `too many connections`.
3. Auth -> Logs for login, e-mail and recovery failures.
4. `TARGET_ENV=staging bash scripts/db/apply-migrations.sh --status` (or `select filename from app_private.schema_ledger order by filename`): confirm the applied list matches `supabase/migrations/` (0013b sits between 0013 and 0014). The dashboard Migrations page shows CLI history, not this ledger.

### Reading the common failures
| Symptom in logs | Likely cause | First action |
|---|---|---|
| burst of `outcome:rate_limited pgCode:PT429` | real abuse or a campus NAT hitting limits | check limits in `docs/RATE-LIMITING.md`; do not raise blindly |
| `forbidden` + `detail` mentioning subscription on `booking.create` | company subscription expired/suspended (intended) | superadmin -> company -> subscription |
| `internal` on one `op` after a deploy | code/schema mismatch | compare `release`; roll back app (section 3) |
| `request.unhandled_error` with a `digest` | server render/handler crash | search the same `digest` in Vercel Logs for the original; reproduce locally |
| `ticket.board` `not_found` repeated | wrong-trip scans (intended rejection) or driver not assigned | not an incident unless volume is unusual |
| 5xx on admin "not found" RPCs | known: PostgREST maps `P0002` to 500; service layer handles it | do not alert on this alone |

## 3. Rollback
### Application (UNVERIFIED on a real project)
- Vercel -> Deployments -> pick the last good deployment -> **Instant Rollback** / "Promote to Production" (wording varies by plan and dashboard version).
- Rollback does **not** touch the database or environment variables. Env var changes apply only to **new** deployments; to revert an env var, restore the value and redeploy.
- Because migrations are forward-only, every migration must stay compatible with the previous app release for one deploy cycle (add columns/functions first, remove old ones in a later migration). Do not ship a migration that breaks the app version you may need to roll back to.
- After rollback: run `deploy-smoke.sh`, check `/api/health` shows the older `release`.

### Database
- Applied migrations are never edited. Fix forward with a new migration.
- Manual undo only if data impact is understood: migrations 0015-0021 list their ROLLBACK statements in the header. 0020 renames functions into another schema, so reverse the renames in the stated order. Run first on a staging copy.
- Never run rollback SQL on production without a fresh backup and your approval.

## 4. Backup and recovery
Check what your Supabase plan actually includes; this repo cannot verify it. Typical: free projects have no managed backups, paid projects have daily backups, point-in-time recovery (PITR) is a paid add-on. **Confirm in Dashboard -> Database -> Backups before relying on any of this.**

Before every production migration:
1. Confirm a backup exists from the last 24h (or enable PITR), or take a manual dump: `pg_dump "$DIRECT_DB_URL" --schema=public --schema=auth -Fc -f pre-migration.dump` (direct connection string from the dashboard; keep the file private, it contains customer data; never commit it).
2. Run `TARGET_ENV=staging bash scripts/db/apply-migrations.sh --dry-run` on staging and read the list. There is no production mode in that script (DEPLOYMENT.md 4.4); never use `supabase db push` (it skips `0013b`).
3. Apply on staging first, run the SQL + smoke suites, then production.

Recovery paths, least to most destructive:
1. Bad deploy: roll back the app (section 3).
2. Bad migration, no data loss: forward-fix migration.
3. Bad data (wrong update/delete): restore to a **new** project (backup or PITR), copy back only the affected rows after review. Do not restore over the live project unless total loss.
4. Total loss: restore backup to a new project, update the three env vars on Vercel and the Auth Site URL/redirect URLs, redeploy, run smoke tests. Supabase Storage objects are not part of a DB dump; if you store media there, back it up separately.

Test a restore into a throw-away project once before launch. An untested backup is a hope, not a backup.

## 5. External monitoring (RECOMMENDED, nothing installed)
- **Uptime**: any external pinger on `GET /api/health` every 1 min from outside Vercel (Better Stack, UptimeRobot, Checkly). Alert on 2 consecutive failures. Add a second check on `/` expecting 200.
- **Errors**: Sentry (or similar) is the usual pick for a Next.js app. It would add a dependency and CSP `connect-src` changes, so it is a deliberate step, not done here. Until then use Vercel Logs + a **log drain** to a log service, with alerts on `level=error`. The logger has one sink seam (`setLogSink`) for this.
- **Alerts worth having first**: `/api/health` down; error-rate spike on `request.unhandled_error`; `operation.failed` with `outcome=internal` > 0 over 5 min; Supabase project paused / DB CPU or connections high (Supabase dashboard notifications).
- Do not send any monitor request bodies, headers or QR payloads. Treat third-party monitors as processors of personal data: check their data-region and retention.

## 6. Not done / needs you
- Nothing here has run on a real Vercel or Supabase project.
- Uptime monitor, error monitor, log drain, backup settings: your accounts and decisions.
- Restore drill: needs a throw-away Supabase project.
