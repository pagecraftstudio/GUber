# MILESTONE M2 (remaining work) - REPORT

Scope: route-stops UI, plan-limit messages, retire mock-era dashboard, browser tests + accessibility pass.
No deploy, no hosted Supabase, no production migration. No new migration was needed (0024 already in the repo). Stopped before M3.

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
Not covered: **users / staff invitations** - there is no company-users page yet, so there is no form to annotate.

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

## Limitations
- Route create is two calls (route, then stops); a failed stop save leaves a route without stops and shows a warning. An atomic `create_route_with_stops` RPC would need a new migration (recommended, not done).
- No users/invitations page or limit message yet.
- Hosted Supabase, real auth email, custom domains: not exercised.
