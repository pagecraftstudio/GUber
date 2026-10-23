# Phase 7.5 — Audit Logs & Platform Activity

## Scope
Read-only audit viewer for platform staff. Excludes: any audit write path, export, role changes (7.6), deployment (7.7).

## Migration
`supabase/migrations/0019_admin_audit_logs.sql` (new; no earlier migration edited)
- `audit_logs` platform_select policy narrowed to super_admin + support (billing gets 0 rows on direct read).
- Indexes: `audit_logs_created_idx`, `audit_logs_action_idx`.
- RPCs (SECURITY DEFINER, search_path=''): `admin_list_audit_logs` (keyset cursor, filters), `admin_get_audit_log`, `admin_audit_summary` (super_admin/support only).
- Billing role: metadata redacted inside the RPC. Role is derived from auth.uid() only.
- audit_logs remains append-only (verified).

## App
- `src/features/audit/*` (catalog, schema, diff, links, repository, service, tests)
- `/admin/audit-logs` (filters, summary, cursor paging), `/admin/audit-logs/[id]` (diff, redaction), loading skeleton
- `AuditTable`, company page "Recent activity", overview links, nav enabled
- `map-error.ts`: invalid filter/range/cursor/limit -> validation; entry not found -> not_found

## Fixes found along the way
- 7.4 stale tests (6 vs 10 server actions; 3 vs 2 audit rows) updated.
- Blank filter fields invalidated all filters; now stripped before parsing.
- Mobile overflow on detail page: sr-only span in a table cell escaped the overflow wrapper (no positioned ancestor); wrappers now `relative`.

## Results (real runs)
| Check | Result |
|---|---|
| SQL suites 02-15 (`tests/run-all-local.sh`) | 1353 pass, 0 fail |
| tsc --noEmit | 0 errors |
| vitest | 427/427 |
| PostgREST integration `audit.int.test.ts` | 10/10 |
| Browser e2e `audit.mjs` | 37/37 |
| next build | OK (both audit routes dynamic) |
| bundle-scan.sh | PASS |
Note: run-all-local.sh overall PASS; build needs NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (>=20 chars) and NEXT_PUBLIC_SITE_URL.

## Not tested
Real Supabase hosted project, real GoTrue (e2e uses a stub), production Vercel deploy.
