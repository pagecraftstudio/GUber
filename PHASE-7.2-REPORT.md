# Phase 7.2 - Admin Layout & Platform Overview

## Scope
Admin shell (header + responsive sidebar), `/admin` overview page, one read-only RPC. No mutations, no new tables.
Excluded: company/subscription/audit pages and actions (7.3-7.5), role-to-section matrix (7.6).

## Changes
| Type | File |
|---|---|
| migration | `supabase/migrations/0016_admin_platform_overview.sql` -> `public.admin_platform_overview()` |
| SQL tests | `supabase/tests/12_platform_overview_tests.sql` (40 assertions); added to `tests/run-all-local.sh` |
| feature | `src/features/platform/{schema,repository,service,nav}.ts`, `platform.test.ts` |
| UI | `src/components/admin/{AdminSidebar,StatCard,StateViews,StatusBadge}.tsx` |
| routes | `src/app/admin/{layout,page,loading,error}.tsx`, `admin-routes.test.ts` |

## Security
- RPC: SECURITY DEFINER, `search_path=''`, no arguments, `assert_platform(super_admin|support|billing)` reads `auth.uid()`; EXECUTE revoked from PUBLIC/anon.
- Read-only: writes no audit row (test F). Audit `metadata` (before/after) is not returned.
- Page uses the user's RLS-bound client; no service-role key (bundle scan + structural test).
- Layout and page both call a platform guard; non-platform users get 404.

## Decisions taken (flag if you disagree)
- All three platform roles may view the overview (matrix deferred to 7.6).
- Unbuilt sections render as disabled "soon" items, not dead links.
- "Stale live" = status live but period ended; "companies without plan" = trial/active company with no live subscription.

## Not run
- PostgREST integration suites (no `postgrest` binary in this environment).
- Browser e2e; manual render of `/admin` against a real Supabase session.
