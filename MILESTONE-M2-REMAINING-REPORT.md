# MILESTONE M2 (remaining work) - REPORT

Scope: route-stops UI, plan-limit messages, retire mock-era dashboard, browser tests + accessibility pass.
No deploy, no hosted Supabase, no production migration. Migrations: 0024 (already in repo) and 0025 (this completion). Stopped before M3.

## Starting point (verified, not assumed)
The M2 WIP already contained migration `0024` (`save_route_stops`, `my_plan_usage`), `StopsEditor`/`RouteForm`, plan-limit notices on the bus, driver, route and trip forms, and SQL suite 20 (tenant isolation for `save_route_stops`). This pass verified those end to end in a browser and closed the gaps below.

## Changed in this pass
| Area | Change |
|---|---|
| Mock retirement | Deleted `src/ui/components/dashboard/*` (12 files), `src/ui/lib/mock/sampleScanTokens.ts`, `src/ui/components/common/EmptyState.tsx` (orphaned). `src/ui/App.tsx`: `dashboard` view now shows a pointer to `/dashboard` (was mock-only `CompanyDashboard`; real mode already showed "not available"). |
| Accessibility | Light-mode `text-slate-400` / `text-slate-500` darkened (with dark variants) in `DashboardShell`, `PageHeader`, `DataTable`, `app/dashboard/{page,buses,trips,bookings,website}`; language toggle name now equals its visible text; trips "Go" button renamed "Apply". |
| Tests | New `tests/e2e/dashboard-m2.mjs` (73 checks), wired into `tests/run-all-local.sh`. `tests/e2e/portal.mjs`: retry when a reload destroys the execution context (harness race). |
| Docs | `docs/INTEGRATION-MAP.md`, `docs/SMOKE-TESTS.md`, this report. |

## Route stops
Create/edit with add, edit, remove, reorder (move up/down buttons, keyboard operable, no drag-and-drop). Client validation mirrors the server: at least two stops, unique names (case-insensitive), non-decreasing minutes, coordinates both or neither. Saving is by `save_route_stops` (RPC, RLS, `routes.write`). Reorder updates rows in place (ids preserved, tested). Booking staff get a read-only form; direct RPC calls by booking staff and by Company B are refused and leave data unchanged (tested).

## Plan-limit messages
Buses, drivers, routes (list + new) and trips (monthly): allowance text ("N of M used, K left"), limit-reached explanation naming the resource with blocked submit (`aria-disabled`, tied to the explanation), backend rejection after the limit changed (message + fresh numbers, typed input kept, nothing created), cancelled subscription (no plan numbers shown), Arabic/RTL. Enforcement stays in DB triggers. Verified in browser.
Users / staff invitations: now covered by `/dashboard/users` (see M2 completion below).

## Mock-era components
Removed: the whole legacy dashboard folder and the two orphaned helpers above (only importer was `App.tsx`). Retained: `src/ui/lib/transportService*` and mock lib (superadmin/customer views), common Button/Modal/Badge/Select/Toast/Pagination/ConfirmDialog, `src/ui/test/verifyLogic.ts` (standalone mock script, out of scope). Legacy-only demo features (recurring schedules, reports, overview metrics) had no real-mode counterpart before or after; they were never reachable in real mode.

## Browser tests
`dashboard-m2.mjs`: 73 passed / 0 failed. Create with multiple stops; five validation cases; keyboard reorder + persistence + reopen; remove; seeded route preserved; Company B and booking-staff denial (UI and RPC); limit messages for 4 resources; backend rejection; subscription cancelled; Arabic. Existing suites: flow, tickets, portal (35/35), audit, flow-smoke, deploy-smoke, signout all pass.
Note: the repo's browser tests are `puppeteer-core` scripts, not Playwright; existing infrastructure was used.

## Accessibility (WCAG 2.2 AA)
Automated: axe-core (wcag2a/2aa/21a/21aa/22aa) on routes list, route new (also in validation-error state), route edit, buses (limit reached), drivers, trips - 0 violations after fixes. Found and fixed: color contrast (serious, many nodes), label-content-name-mismatch (language toggle, trips Apply).
Checked in browser: Tab reaches every control; visible focus on all; stop buttons >= 24x24 px (SC 2.5.8); polite live-region announcements for move/remove; `aria-invalid` + focus on first invalid field; alert role for backend errors; no horizontal scroll at 320 px.
NOT done: manual screen-reader testing (NVDA/VoiceOver), Windows high-contrast mode, 200% text-spacing override, Arabic RTL axe scan. Automated checks are not a full audit.

## Regression gate (this sandbox, local Postgres 16 + PostgREST + GoTrue stub, not live Supabase)
| Command | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npx vitest run` | 37 files, 640 tests passed |
| `bash tests/run-all-local.sh` | OVERALL: PASS (SQL cumulative 1556 passed, 0 failed; all integration + e2e suites exit 0) |
| `next build` | exit 0 (requires `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SITE_URL`; the build refuses to run without them by design) |
| `bash tests/bundle-scan.sh` | PASS (run right after a clean build) |
| `npm audit --omit=dev` | 0 vulnerabilities |
Needs `PSQL`, `POSTGREST`, `E2E_TOOLS` (puppeteer-core, @sparticuz/chromium; axe-core optional - the axe step prints SKIP without it).

## M2 completion (migration 0025)
- `set_member_role`, `set_member_status` (SECURITY DEFINER, `users.write` derived from the caller's membership, own-row changes refused, member of another company answers like "not found", `keep_one_owner` still enforced, audited). Page `/dashboard/users`: members, role change, suspend/reactivate, pending invitations, invite form with plan-limit message, read-only view for managers, redirect for roles without `users.read`.
- `create_route_with_stops`: route and stops in ONE transaction (a bad stop list leaves no route behind); `createWithStops` now uses it. Closes the former non-atomic limitation.
- Tests: SQL suite 21 (cumulative SQL: 1633 passed, 0 failed incl. suites 21 and 22), `tests/e2e/dashboard-users.mjs` (invite, role, suspend, limit, manager/booking denial, Company B denial, atomic create, axe), `src/features/m2-completion.test.ts`. Vitest: 38 files, 663 tests.
- Gate on this tree (local Postgres 16 + PostgREST + GoTrue stub): `tsc` 0; vitest pass; `run-all-local.sh` OVERALL PASS (all e2e incl. portal, dashboard-m2, dashboard-users, signout); `next build` 0 (with the three NEXT_PUBLIC_* vars); `bundle-scan` PASS; `npm audit --omit=dev` 0 vulnerabilities.

## M2 close-out (plan items 2, 4, 5, 6, 9 and the role tests)
- `/dashboard/customers` (list, search by name/phone/email/student number, 25-per-page pagination, status line) and `/dashboard/customers/[id]` (details, staff notes, booking history when the role has `bookings.read`). Read-only, as the plan lists. Someone else's customer and a malformed id both answer 404.
- `/dashboard/settings`: read-only company profile (profile is managed by the platform team; there is no tenant write path for it) + `company_settings` form for `settings.write` (owner, manager); read-only view for operations and booking staff. Server action `updateSettingsFormAction`; company comes from the session; DB check constraints still enforce ranges and the locale rule.
- `/dashboard/trips/new` is now the dedicated trip page (needs `trips.write`); `/dashboard/trips` is the list with an "Add a trip" link.
- Business-rule messages: the exclusion constraints for bus/driver overlap apply when a trip is SCHEDULED (drafts may overlap), so that is where conflicts surface. The status-change action used to throw into an error page; it now redirects with a fixed code and the page shows a clear alert (bus conflict, driver conflict, inactive bus/driver, capacity, bus and driver required). Codes are a whitelist, URL text is never echoed.
- Navigation: Customers and Settings entries, shown by permission. Verified per role (owner, manager, operations, booking, driver): exact menu, and the server guard refuses direct URLs the menu hides.
- Tests: SQL suite 22 (37 checks: customers read/write by role, Company B denial, settings read/write by role and Company B denial, check constraints, billing owner-only, driver sees only assigned trips and cannot write, capacity/inactive-bus/arrival/cross-company route rules); `tests/e2e/dashboard-pages.mjs` (74 checks incl. axe on the new pages, 320 px reflow, role matrix, REST isolation attempts).
- Fixed along the way: trip status change no longer crashes into an error page on a rule violation.

## Limitations
- `max_users` is enforced when an invitation is ACCEPTED, not when created; the page shows the allowance and blocks sending at the limit, the database remains the boundary.
- Not possible yet: removing a member, linking a login to a driver record.
- Customers are read-only in the dashboard (the plan lists list/search/pagination/detail); edit/create need their own write-path tests.
- No billing page exists, so "manager cannot reach billing" is proven at the data layer (RLS) and by menu/guard checks, not by a billing page.
- Master-Phase-9 pages loading on STAGING for each role has not been run (no staging access was authorized).
- Hosted Supabase, real auth email, custom domains: not exercised.
