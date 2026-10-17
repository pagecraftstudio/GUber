# MALAKY BUS SaaS — PHASE 4: BACKEND FOUNDATION

Status: implemented and tested. Typecheck clean, production build OK, 117 unit tests pass, 25 integration tests pass
against real Postgres 16 + PostgREST 12 + RLS (plus 1 expected-fail that documents a security finding, see F1).
NOT run against a live Supabase project (local `auth` stub, as in Phases 2-3).

## Architecture
Layers, per feature (`src/features/<name>/`): `types.ts` (row + domain types + mapper) -> `schema.ts` (zod, strict) ->
`repository.ts` (only place that touches Supabase) -> `service.ts` (authorize -> validate -> repository).
Shared plumbing in `src/lib/`: `errors.ts` (AppError, one error type), `db/map-error.ts` (Postgres error -> AppError),
`db/pagination.ts`, `db/search.ts`, `db/columns.ts` (write whitelist), `service/{context,authorize,server}.ts`,
`auth/permission-keys.ts`, `validation/common.ts`.

Rules enforced in code and tests:
- `companyId` comes from `my_context()` via `TenantServiceContext`. No input schema has a company field (strict objects reject it);
  repositories stamp `ctx.companyId` and scope every read/write with `.eq('company_id')`. RLS stays the second lock.
- Role names never appear in features. Services call `requirePermission(ctx, PERMISSIONS.x)` -> `can()`. A test compares
  `PERMISSIONS` with the SQL seed so they cannot drift.
- Write columns are whitelisted twice (zod strict + `mapColumns`). `status`, `seats_booked`, `blocked_until`, `buffer_minutes`,
  `template_id`, `user_id`, `is_published`, media ids are not writable from this layer.
- Soft-deleted routes/customers are filtered by the repository (RLS does not hide them).
- Search text is sanitised before entering a PostgREST `or()` filter (no filter injection).
- Raw DB errors never reach clients: `toClientError()` returns code + stable `detail` only.
- No service-role key anywhere.

## Modules
| Module | Read | Write | Deferred |
|---|---|---|---|
| routes | list/get | create/update | archive rule (Phase 5) |
| stops | list by route/get | create (append or explicit order)/update | delete, reorder RPC (5) |
| buses | list/get | create/update (deactivate = status) | "has upcoming trips" check (5) |
| drivers | list/get | create/update (deactivate = status) | link to login account, photo (5/13) |
| trips | list/get (+route/bus/driver names) | create DRAFT/update fields | status machine, delete draft, monthly limit (5) |
| customers | list/get | create/update | delete/anonymise (5) |
| bookings | list/get | none | create/cancel RPCs (5), public booking (8) |
| companies | own profile, settings; platform list/get | settings update | company create/edit/suspend RPCs (10) |
| users | members, invites, roles | create/revoke invite (Phase 3 RPCs) | role change/suspend/remove RPCs (5/9) |
| subscriptions | tenant current; platform current/plans | none | plan assignment, renewal (10/11) |
| website | settings (defaults if unsaved) | update draft settings | publish, pages, sections (6/7) |

## Findings
**F1 (SECURITY, Phase 2 DB, needs your approval): tenant oracle through BEFORE INSERT triggers.**
Postgres runs BEFORE ROW triggers before the RLS WITH CHECK. `enforce_limit()` is SECURITY DEFINER and counts rows of
`new.company_id`. Company A can insert a row carrying B's `company_id` and read from the error whether B is at a plan
limit (`53400`) or has no subscription (`42501 no active subscription`) instead of plain `forbidden`. Nothing is written
or returned; impact is limited to leaking B's plan state (and taking B's advisory lock). `trips_before_write` has the same
shape (reads B's bus/driver status, needs a guessable id). Proof: integration test `it.fails(...)`.
Proposed fix (migration 0008, not applied): a first-firing BEFORE INSERT trigger on every tenant table that raises `42501`
when `auth.uid() is not null and new.company_id not in (select app_private.current_company_ids()) and not app_private.is_platform_user()`.
**F2:** `audit_logs` has no client write path, so Phase 4 CRUD is not audited (only invite RPCs are). Phase 16 should use DB triggers.
**F3:** non-owners cannot read their plan limits (`subscriptions` needs `billing.read`). DB still enforces. Needs `my_entitlements()` RPC (Phase 11).
**F4:** no booking RPC exists and no trigger maintains `trips.seats_booked`, so bookings are read-only until Phase 5.
**F5:** `route_stops_order_uq` is deferrable but PostgREST runs one statement per transaction, so swapping orders is impossible without an RPC.

## Decisions (confirm or change)
D1 Services throw `AppError`; Server Actions wrap with `toClientError()` in Phase 5/9. D2 Offset pagination, max 100, exact count (revisit bookings in Phase 19).
D3 Phones stored normalised (digits, optional +, 7-15). Country rules unresolved. D4 Hand-written row types; replace with `supabase gen types` once linked.
D5 `getTenantServiceContext()` reuses Phase 3 guards (redirect when not allowed). D6 Trips are created as drafts only.

## Not done / not proven
Live Supabase run. Concurrency tests (parallel stop appends, parallel bookings). App-level rate limiting. Generated DB types.

## How to test
`npm run typecheck && npm test && npm run build`. Integration: see `tests/integration/README.md` (`reset-db.sh`, PostgREST, `npm run test:integration`).

## Open questions
Q1 Approve migration 0008 (F1)? Q2 Phone format policy (Egypt-only or international)? Q3 Should Phase 5 start with the booking RPC migration (create/cancel/seat counter), then the status machine?
STOP. Awaiting approval for Phase 5.
