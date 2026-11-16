# Route + return route: Phase A (database and service), 16 Nov 2026

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

## Not done yet (Phase B and open questions)
1. Dashboard form: return section, the "return is the same as go, reversed" checkbox, editing a pair. `create_route_with_stops` (0025) still exists and still creates a lone route; Phase B switches the form to `create_route_pair` and then revokes it.
2. Plan limit: each side of a pair counts against `max_routes`, so a Starter company (5) fits two pairs. Recommendation: count a pair once.
3. Archiving: archiving one side does not archive the other yet.
4. Backfill cannot be undone cleanly (the reversed copies would have to be deleted by hand). Run on staging first.
5. e2e dashboard scripts that create routes through the form will need the Phase B form.
