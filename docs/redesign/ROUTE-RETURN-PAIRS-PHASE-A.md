# Route + return route: database, service and dashboard form, 16 Nov 2026

Decided with the product owner: linked pair, existing routes backfilled automatically.

## What changed
- `routes.return_route_id` (migration 0033): mutual link, one return per route, same company only (composite FK), enforced at commit by a deferred trigger.
- `create_route_pair(...)`: a route and its return route in one transaction. The return is either "the go, reversed" (stops in reverse order, offsets measured from the other end, pickup and dropoff swapped) or its own stops. A missing return choice is refused. A bad return rolls the go route back too.
- Clients can no longer insert into `routes` (insert policy dropped) and cannot change `return_route_id` with a direct update. Only the definer functions can.
- Backfill (`app_private.backfill_route_returns`, run by the migration): routes that are already each other's reverse are paired; every other live route gets a reversed copy named "<name> (return)". The plan-limit trigger is off during the backfill and back on after.
- Service: `routeService.createPair`, `routeReturnSchema`, `returnRouteId` on `Route`. The old direct `routeService.create` is removed.

## Tests
- SQL: 1833 assertions pass on local Postgres 16 (new suite `29_route_return_pairs_tests.sql`: reversed stops and offsets, own return, obligatory return, rollback, permissions, tenant isolation, direct insert/update refused, mutual constraint, backfill). Three older tests changed because direct route insert is no longer allowed.
- Integration (PostgREST): services + booking suites pass (56). Other integration suites were not re-run.
- Unit: `src` suite passes, plus `return-schema.test.ts`.
- NOT live Supabase.

## Added after review (16 Nov 2026)
- A pair counts ONCE against `max_routes` (limit trigger and `my_plan_usage`). The return side's insert is exempt; the go side's insert is what is checked.
- Archiving or restoring one side archives or restores its partner (trigger `170_archive_pair`).
- SQL: 1843 assertions pass.

## Phase B: dashboard form
- `/dashboard/routes/new`: a required Return route section. The checkbox "The return is the same as the go, reversed" is ON by default; unticking it shows a second stops editor for the return's own stops, plus an optional return name. English and Arabic.
- Creating goes through `routeService.createPair`. `create_route_with_stops` is retired (execute revoked in 0033; service and repository methods removed).
- The edit page of a route shows a link to its return route. Editing a route does NOT change its return route (a manual edit of the go leaves the return as it is).
- Tests: SQL 1844 pass; unit 1457 pass; e2e `dashboard-return-routes.mjs` 10 pass (real browser, local Postgres + PostgREST + auth stub); `dashboard-users.mjs` runs again (29 pass, 1 fail that was already failing: "role change saved from the UI").

## Not done / open
1. Editing a pair: changing the go route's stops does not offer to update the return. A future "regenerate the return from the go" action would reuse `app_private.reversed_stops`.
2. Backfill cannot be undone cleanly (the reversed copies would have to be deleted by hand). Run on staging first.
3. The Arabic wording of the new form texts has not had a native review.
4. Other e2e scripts still have the pre-existing drift listed in `E2E-RUN-2026-11-16.md`.
