# Phase 7.4 - Subscription Management

## Scope
Subscriptions list (filters: live, stale, expiring, raw status; search; sort), assign plan, change status, change period, bulk-expire stale rows, read-only plans page. Actions live on the company page; the list links there.
Excluded: invoices/payments, payment provider, editing plans or prices, subscription history view (7.5 audit page shows the trail), role matrix (7.6), cron scheduling.

## Changes
| Type | File |
|---|---|
| migration | `supabase/migrations/0018_admin_subscription_management.sql`: `admin_list_subscriptions`, `admin_assign_subscription`, `admin_set_subscription_status`, `admin_set_subscription_period`, `admin_expire_subscriptions` |
| SQL tests | `supabase/tests/14_subscription_management_tests.sql`; added to `tests/run-all-local.sh` |
| feature | `src/features/subscriptions/{schema,admin-output,repository,service}.ts`; `src/features/admin/actions.ts` (+4 actions); `src/lib/db/map-error.ts` rules |
| UI | pages `/admin/subscriptions`, `/admin/plans`, `loading.tsx`; subscription card on `/admin/companies/[id]` gets assign, period, status and cancel dialogs; `ConfirmDialog` gains plain-data `fields`; nav items enabled |
| unit tests | `src/features/subscriptions/admin.test.ts`; updated `map-error.test.ts`, `platform.test.ts`, `admin-routes.test.ts` |

Reused unchanged: `assert_platform`, `audit_platform`, `live_subscription`, `entitlement_limit`, `listPlans`, pagination/search helpers, `ConfirmDialog`, `StatusBadge`.

## Security
- Every write is a SECURITY DEFINER RPC with `search_path=''`; role comes from `auth.uid()` via `assert_platform`; no role, actor or end date is a parameter (the DB computes periods from a day count and `now()`).
- Company row is locked FOR UPDATE before its subscriptions in every function (no double-live rows, no lock-order deadlock).
- Direct writes stay refused for super_admin, billing and tenants (SQL test H).
- History is never edited in place: a replaced subscription becomes `expired`; the new one is a new row.
- Each change writes audit rows with before/after: `subscription.assigned`, `.status_changed`, `.cancelled`, `.expired` (one per row in bulk expiry), `.period_changed`. Refused and read-only calls write none (test I).

## Decisions taken (flag if you disagree; final matrix is 7.6)
- Read: all platform roles. Write: super_admin and billing. Support is read-only here.
- Assign: plan must be active; start as trialing or active; period 1..1830 days from now; company must not be cancelled (suspended is allowed). The live or stale row is expired first.
- Downgrades are not retroactive: lower limits only block new items.
- Transitions: trialing->active|cancelled|expired; active->past_due|cancelled|expired; past_due->active|cancelled|expired; cancelled/expired terminal (assign a new plan to restart). Moving to active/past_due needs an unexpired period. Cancel/expire need a reason.
- Period change: live-status rows only; also revives a stale row; new end must be in the future. Shortening is allowed and audited.
- Expiry already bites at query time (0015). Bulk expire only tidies status and the audit trail; no cron is scheduled.
- Company status and subscription status stay independent.
- Plans page is read-only; no plan write RPC exists.

## Commands run and results
| Command | Result |
|---|---|
| `tsc --noEmit` syntax-only pass over new/changed files (project deps not installed) | no TS1xxx syntax errors. NOT a type check |
| `npx tsc --noEmit` (full) | NOT RUN: no node_modules, network disabled |
| `npx vitest run src` | NOT RUN: same reason |
| SQL suites 02..14 incl. new 14 | NOT RUN: no Postgres in this environment |
| PostgREST integration suites, `next build`, bundle scan, browser e2e | NOT RUN |

Nothing above is claimed to pass. 7.4 acceptance is NOT met until you run `tests/run-all-local.sh` (suite 14: 0 failed; 02..13 still green) and `npx tsc --noEmit && npx vitest run src`.
7.4 also assumes 7.3 was verified on your side; I could not verify it here.

## Not verified
- Dialog and form behaviour in a real browser.
- Exact SQLSTATEs in suite 14 for paths that cross 7.3's `admin_create_company` / `admin_set_company_status`.
- Suite 14 assumes no other suite leaves stale live-status rows that would make the expiry count differ; it compares counts taken just before the call, so extra stale rows are tolerated.
