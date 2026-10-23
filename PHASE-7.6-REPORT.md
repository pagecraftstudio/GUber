# Phase 7.6 — Roles & Operational Decisions

## Scope
Centralise platform-role authorization decisions. Excludes: new roles, role-management UI, DB changes, deployment (7.7).

## Decisions (documented)
| Capability | Roles | DB enforcement |
|---|---|---|
| Browse every admin section (overview, companies, subscriptions, plans, audit) | super_admin, support, billing | assert_platform(all three); billing metadata redacted in Postgres |
| Company lifecycle (create/edit/status/domains/invite owner) | super_admin | assert_platform(['super_admin']) |
| Internal notes | super_admin, support | assert_platform(['super_admin','support']) |
| Subscription / plan mutations | super_admin, billing | assert_platform(['super_admin','billing']) |
| Audit summary counters | super_admin, support | assert_platform(['super_admin','support']) |
Nav shows all sections to every platform role (decision); mutations are gated per action.

## Changes
- NEW `src/features/platform/permissions.ts`: `ROLE_SETS` + `canRole` (single source of truth).
- Replaced 4 duplicated role arrays (admin actions, company service, subscription service, audit service, nav, two page guards) with `ROLE_SETS`.
- NEW `permissions.test.ts`: scans migrations 0016+ and fails if any `assert_platform` role list has no matching ROLE_SETS entry (and vice versa).
- 3 structural tests updated from literal-array greps to `ROLE_SETS.*` references.
- No migration, no RPC change, no behaviour change.

## Results (real runs)
| Check | Result |
|---|---|
| tsc --noEmit | 0 errors |
| vitest | 432/432 (23 files) |
| `tests/run-all-local.sh` (SQL 02-15 = 1353 pass/0 fail, lock oracle, unit, PostgREST integration) | OVERALL PASS |
| next build | OK (needed one retry: build printed a Next.js security-upgrade notice and stopped on first run) |
| bundle-scan.sh | PASS |
| e2e `audit.mjs` | 37/37 |

## Not verified / caveats
- Customer e2e (`flow.mjs`, `tickets.mjs`, `portal.mjs`) FAIL in this sandbox at the "Sign In" click (flow: 11 checks pass then `no clickable element: Sign In`). The identical failure occurs on the untouched 7.5 zip, so it is not caused by 7.6; root cause NOT diagnosed. Customer/driver behaviour is covered here only by SQL + integration + unit suites.
- Next.js reports a known security advisory for the installed version; no upgrade done (needs your decision, belongs in 7.7).
- Not tested: hosted Supabase, real GoTrue, Vercel.
