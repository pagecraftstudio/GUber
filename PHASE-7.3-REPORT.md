# Phase 7.3 - Company Management

## Scope
List/search/filter, detail, create (company + trial subscription + owner invite, atomic), edit profile, suspend / reactivate / cancel, internal notes, owner re-invite and revoke.
Excluded: subscription assign/status/period (7.4), audit-log page (7.5), role matrix (7.6), domains (Phase 12), email delivery of invites.

## Changes
| Type | File |
|---|---|
| migration | `supabase/migrations/0017_admin_company_management.sql`: `admin_list_companies`, `admin_company_detail`, `admin_create_company`, `admin_update_company`, `admin_set_company_status`, `admin_add_note` |
| SQL tests | `supabase/tests/13_company_management_tests.sql`; added to `tests/run-all-local.sh` |
| feature | `src/features/companies/{schema,repository,service}.ts` extended, new `admin-output.ts`; `src/features/admin/{actions,action-state}.ts`; `src/lib/db/map-error.ts` rules |
| UI | `src/components/admin/{AdminField,AdminPagination,ConfirmDialog,InviteLinkPanel,CompanyForms,format,messages}`; pages `/admin/companies`, `/new`, `/[id]`, `/[id]/edit`, `loading.tsx`; nav item enabled |
| unit tests | `src/features/companies/admin.test.ts`; updated `map-error.test.ts`, `platform.test.ts`, `admin-routes.test.ts` |

Reused unchanged: `requirePlatform`, `getPlatformServiceContext`, `assert_platform`, `audit_platform`, `create_invite`, `revoke_invite`, `live_subscription`, pagination/search helpers, StatCard/StatusBadge/StateViews.

## Security
- Every write is a SECURITY DEFINER RPC, `search_path=''`, role from `auth.uid()` via `assert_platform`. No role, actor or company authority is a parameter (SQL test B checks parameter names).
- Direct writes still refused for super_admin (0015); test I re-checks `companies` and `company_notes`.
- Create is atomic; failure leaves no company, subscription, invite or audit row (test E, snapshot compare).
- Invite token returned once, stored only as hash, never in audit, URL, cookie or log; held in React action state only.
- Audit rows: `company.created`, `company.updated` (changed fields only, no-op writes nothing), `company.suspended|reactivated|cancelled|status_changed`, `company.note_added` (no note text). Create also yields `invite.created` from the reused RPC (2 rows, deliberate).
- Read RPCs never return `token_hash`.

## Decisions taken (flag if you disagree; final matrix is 7.6)
- Read: all three platform roles. Create/edit/status/invite/revoke: super_admin. Notes: super_admin + support.
- Transitions: trial->active|suspended|cancelled; active->suspended|cancelled; suspended->trial|active|cancelled; cancelled terminal.
- Suspend/cancel need a reason (3..500). Suspension does NOT touch subscription, trips or bookings.
- New company = status `trial` + one `trialing` monthly subscription; slug immutable.
- "pending" company status maps to `trial` (as the audit proposed).
- Old `platformList/platformGet` kept (still used by integration tests); the UI uses the new RPCs.

## Commands run and results
| Command | Result |
|---|---|
| `tsc --noEmit` syntax-only pass over new/changed files (project deps not installed) | no TS1xxx syntax errors. NOT a type check |
| `npx tsc --noEmit` (full) | NOT RUN: no node_modules, network disabled |
| `npx vitest run src` | NOT RUN: same reason |
| SQL suites 02..13 incl. new 13 | NOT RUN: no Postgres in this environment |
| PostgREST integration suites, `next build`, bundle scan, browser e2e | NOT RUN |

Nothing above is claimed to pass. 7.3 acceptance is NOT met until you run `tests/run-all-local.sh` (expect suite 13 to report 0 failed and 02..12 to stay green) and `npx tsc --noEmit && npx vitest run src`. Likely first-run fixes: SQL test syntax/ordering, strict TS typing of `z.preprocess` fields.

## Not verified
- Behaviour of `useActionState` forms and `<dialog>` in a real browser.
- SQL error codes raised by trigger paths (phone normalisation, `create_invite`) match what suite 13 expects.
