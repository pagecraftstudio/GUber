# Continuous Shuttle — S0 audit close-out

Repo `pagecraftstudio/GUber` @ `58303be`. Read-only. Resolves the `[?]` items of `CONTINUOUS-SHUTTLE-PLAN.md` §3.3. Suggested path: `docs/plans/SHUTTLE-S0-AUDIT-ADDENDUM.md`.

## 1. Resolved items

| Plan item | Result | Evidence |
|---|---|---|
| `scan_identity` body | **Trip-bound.** Starts with `app_private.scan_trip(p_trip_id,false)` (needs a `trips` row, status in `scheduled/boarding/in_progress`, boarding-open window, `bookings.write` or assigned driver via `is_my_driver`), then `company_day(company, trip.departure_at)`. Looks up bookings by `trip_id`, subscriptions by `plan.route_id / routes.return_route_id`, scans in `route_subscription_scans`. **Cannot be reused for shuttle.** | `0052` |
| Code formats | Ticket: `MALAKY:TICKET:<token>`, token 20–200 chars `[A-Za-z0-9_-]`, stored as `sha256(token)` via `app_private.ticket_token_hash` (immutable, `0014`). Identity: `MQ1.…` verified by `app_private.verify_masar_qr`; typed `MSR-XXXX-XXXX` accepted as **unverified**. | `0014`, `0052` |
| `board_ticket` | Public wrapper does `rate_limit_hit('ticket.board')` then calls `app_private.board_ticket_impl`. Same wrapper/`_impl` split for `create_my_booking`, `cancel_my_booking`, `my_ticket_qr`. | `0020`, `0057` (captcha on `create_my_booking`) |
| Rate limits | Data, not code: `app_private.rate_limit_policies` + `rate_limit_counters`; new buckets are inserted rows (`ticket.board` = 60 / 180). | `0020` |
| Customer identity | `customers.user_id` exists, unique `(company_id,user_id)` where not null and not deleted. `claim_my_customer(company)` links a signed-in user. Shuttle requests can reuse this path. | `0012` |
| Tenant guard | Installed by a loop on **every** table with a `company_id` column, named `000_tenant_guard` so it fires first. `app_private.tenant_guard_problems()` lists tables missing it. New shuttle tables get coverage by running the same loop/test. | `0008` |
| Audit helper | `app_private.write_audit(actor_type, company, action, entity_type, entity_id, metadata)`, redefined in `0065` for acting-as. | `0004`, `0065` |
| Limits | `enforce_limit(<entitlement key>, <where sql>)` trigger pattern. | `0004` |
| Notification producer | `app_private.enqueue_notification(event_key, user, company, params jsonb, entity_type, entity_id, dedupe_key, …)` (8 args). | `0053` |
| Delivery worker | **None.** No web-push, email provider or `supabase/functions` directory found. In-app inbox only, so S-D8 (in-app only in V1) is a fact, not a choice. | grep |
| Marketplace pages | Only `my-bookings`, `my-bookings/book/[tripId]`, `my-subscriptions`, `my-subscriptions/plans`, `my-subscriptions/[id]/book`, login, register, home. No shuttle pages. | `src/app/(marketplace)` |
| Feature modules | `src/features/<domain>/` per domain (`bookings`, `driver`, `trips`, `my-subscriptions`, `notifications`, …) plus `services.test.ts`. Shuttle follows with `src/features/shuttle`. | repo |
| Next numbers | Next migration **`0074`**. Next SQL suite **`69`** (highest is `68_analytics_site_event_tests.sql`). | repo |
| Acting-as | `acting_allows(company,key)` is inside `has_permission`; read mode = `*.read` keys only. New `shuttle.read` works automatically; write keys only in acting write mode. | `0065` |

## 2. Corrections to the main plan

1. **Ticket prefix.** Shuttle tickets must use a distinct prefix, e.g. `MALAKY:SHUTTLE:<token>`, so the existing `board_ticket` / `scan_identity` can never act on a shuttle token. Hash helper is reused.
2. **Scan context.** Add `app_private.shuttle_scan_context(session_id)` (equivalent of `scan_trip`): authorises `shuttle.operate` or current-session driver, checks session state `loading`, rate-limits `shuttle.board`.
3. **Wrapper pattern.** Every public shuttle RPC = thin wrapper (rate limit, captcha where needed) + `app_private.*_impl`. Follow `0020` / `0057`.
4. **New rate-limit buckets** (S1 data rows): `shuttle.request`, `shuttle.decide`, `shuttle.board`, `shuttle.collect`, `shuttle.depart`.
5. **`customers.user_id` already exists**, so shuttle bookings link by `customer_id` and subscriptions by `user_id` through the existing customer row.
6. **Day key.** `app_private.company_day(company, ts)` exists (`0034`), but shuttle entitlements use the **operating day's `service_date`**, not this function applied to now().
7. Plan §21 stays: in-app + polling only.

## 3. Not done in S0

- **Baseline test run not performed.** The sandbox has no `psql` or `postgrest`, so `tests/run-all-local.sh` cannot run here. Owner (or CI) should run it on `58303be` and record the result as the S1 baseline. Command: `PSQL=psql POSTGREST=/path/to/postgrest bash tests/run-all-local.sh`.
- Production/hosted Supabase state not inspected.
- `board_ticket_impl` and `my_ticket_qr_impl` bodies not read line by line (only wrapper and header). Not needed for the shuttle design, but read before S5.

## 4. Decisions needed before S1

| # | Decision | Recommended |
|---|---|---|
| S-D1 | Reuse `route_plans`/`route_subscriptions` + one additive column `route_plans.model default 'daily_pair'` | Yes |
| S-D2 | Outbound = run direction away from the university (`shuttle_services.outbound_direction`) | Yes |
| S-D3 | Request targets a specific vehicle run; manager can move it | Yes |
| S-D4 | Fares = station-pair matrix | Yes |
| S-D5 | No entitlement at boarding → block, manager may authorise cash fare | Yes |
| S-D9 | Include emergency in-transit replacement (manager only) in S7 | Yes |
| Q1 | Route-level operating day, one session per vehicle | Yes |

Remaining Q2–Q15 may be answered later; defaults are in the main plan §25.

## 5. S0 acceptance

| Criterion | Status |
|---|---|
| All `[?]` items resolved or explicitly deferred | Done (3 items deferred above) |
| Reusable helpers named with real signatures | Done |
| Plan corrected | Done (§2) |
| Baseline suite result | **Open**, needs a machine with Postgres |
| Owner answers to §4 | **Open** |

S1 does not start until the last two rows are closed.
