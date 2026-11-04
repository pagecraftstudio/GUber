# Phase 2 — Live seat availability: technical design (DESIGN ONLY, nothing implemented)
Base: main db5f394. Status: awaiting approval.

## 1. What the repository does today (inspected, not assumed)
| Fact | Evidence |
|---|---|
| Seat truth = `trips.seats_booked`, moved only by trigger `app_private.bookings_seat_counter` (AFTER INSERT / UPDATE OF status on bookings), same transaction; CHECK `trips_seats_valid` (0 <= seats_booked <= capacity) is the overbooking backstop; booking RPC locks the trip row `FOR UPDATE` | 0003 l.122/135, 0010 l.5-8, 76-80, 0013b l.101 |
| Marketplace reads `public_search_trips()` (SECURITY DEFINER, allow-listed columns, `seats_available = capacity - seats_booked`, filters: scheduled, cutoff, booking_enabled, published, active company, live subscription since 0021) via same-origin `GET /api/public/trips` | 0013, 0021, `src/app/api/public/trips/route.ts` |
| That route is cached: `Cache-Control: public, max-age=0, s-maxage=30` plus `Vercel-CDN-Cache-Control: max-age=30, stale-while-revalidate=60` (browser never SWR; learned from the portal test "Fully Booked" bug) | `src/lib/public-search/handler.ts` l.28-35 |
| Query schema is STRICT (unknown param -> 400, anti cache-key-flooding); MAX_LIMIT 100, MAX_OFFSET 500 | `src/lib/public-search/schema.ts` |
| UI fetches once per search change (`MasterMarketplace.tsx` effect on `searchParams`); NO polling, no Realtime, no `visibilitychange` refresh. Result: after a booking elsewhere the page shows stale seats until reload, plus up to ~90 s CDN staleness | `MasterMarketplace.tsx` l.75-103; grep for realtime/subscribe/setInterval found nothing |
| `anon` has NO select on `trips` (RLS `tenant_select ... to authenticated`); the only anon reads are the two RPCs + 3 catalog tables | 0006 l.162, 0021 l.67-80 |
| Browser Supabase client already exists (`src/ui/lib/real/supabaseBrowser.ts`) for customer auth. CSP (Report-Only) `connect-src` already lists the Supabase origin and its `ws(s)` origin | `src/lib/security-headers.ts` l.24-27 |
| No `realtime` schema in the local test stub (`supabase/tests/00_supabase_stub.sql`): Realtime cannot run locally | stub + run-all-local.sh |
| Server-side error on a lost race is already correct: capacity check -> error with hint `available=N`; mapped to a UI error | 0010 l.195, 0013 l.147 |

## 2. Options compared
| | Postgres Changes on `trips` | Broadcast from DB triggers (`realtime.send`) | `pg_notify` / LISTEN | Hybrid (recommended) |
|---|---|---|---|---|
| How | Realtime tails WAL, filters by RLS per subscriber | trigger writes a small message to a topic; Realtime fans it out | needs a long-lived server connection | Broadcast as a HINT + existing RPC/API as truth + polling fallback |
| Security | RLS applies, but anon has no SELECT on trips. To work, we would have to grant anon SELECT (+ policy) on `trips`, exposing every column (bus_id, driver_id, notes, price rules, draft/cancelled rows) to the REST API too. Rejected. Views are not supported by Postgres Changes. | Payload is chosen by us (allow-list: ids + seats_available). Private channel + RLS on `realtime.messages` controls who may receive; no insert policy = clients cannot send | n/a for browsers (Vercel serverless cannot hold LISTEN; browsers cannot connect to Postgres) | same as Broadcast; DB stays the only source of truth, so a wrong/lost/forged message can only cause an extra refetch |
| Scalability | per-change authorization per subscriber, row-by-row; Supabase itself recommends Broadcast for scale (docs page, summary; single-thread detail NOT confirmed from the page I could read) | fan-out cost only; DB cost = one small insert per event | n/a | as Broadcast, plus client-side coalescing so N events -> 1 refetch |
| Complexity | lowest client code, highest security/scale risk | new trigger fns + realtime policy + client | needs new server infra | Broadcast complexity + polling fallback (small) |
| Failure behaviour | missed events silently lost | missed events silently lost | n/a | lost events healed by poll/reconnect refetch |
**Recommendation: Hybrid.** Database-triggered Broadcast on a PRIVATE channel carries only invalidation hints; the client answers every hint by refetching authoritative data from the existing `/api/public/*` route (which already enforces eligibility, RLS-equivalent filtering and the subscription rule). Seat numbers in the hint are display hints only, never trusted for booking (the booking RPC re-checks under row lock).

## 3. Architecture
```
bookings INSERT / status->cancelled
   -> (existing) bookings_seat_counter updates trips.seats_booked      [unchanged]
   -> NEW AFTER UPDATE trigger on trips (column-filtered)
        if company is publicly listed: realtime.send({id, k, a, v}, 'trip', 'marketplace:v1', private:=true)
company/subscription/website/settings change
   -> NEW triggers: realtime.send({c, k:'listing'}, 'company', 'marketplace:v1', true)
Realtime (private channel, SELECT-only policy for anon+authenticated, no INSERT policy)
   -> browser: liveAvailability.ts
        coalesce 500-1500 ms jitter -> GET /api/public/trips (same query as screen) -> replace list if response newer than last applied
        fallback: poll every 60 s while visible; refetch on reconnect, on tab visible, on online
Authority: DB. Booking RPC still locks trip row, checks capacity, idempotency key, subscription.
```
Why the message is sent from a trigger and not the app: a booking can come from any path (RPC, admin, cancellation by customer, staff status change, driver no-show). The trigger on the data is the only place that sees all of them. `realtime.send` inserts into `realtime.messages` inside the same transaction, so a rolled-back booking sends nothing and no phantom event exists.

### 3.1 Event model
| Event | Topic `marketplace:v1`, payload (≤ ~120 B) | Emitted when | Client reaction |
|---|---|---|---|
| `trip` k=`seats` | `{id, k:"seats", a:<seats_available>, v:<updated_at ms>}` | `seats_booked` changed on a trip whose company is listed and status='scheduled' | patch hint immediately (so "Sold out" flips at once), then debounced refetch verifies |
| `trip` k=`new` | `{id, k:"new", v}` | INSERT or status draft->scheduled and company listed | debounced refetch (list membership by filter is server-side) |
| `trip` k=`changed` | `{id, k:"changed", v}` | departure/arrival/price/capacity/route changed while scheduled | refetch |
| `trip` k=`gone` | `{id, k:"gone", v}` | scheduled -> cancelled/in_progress/boarding/completed/draft, or DELETE, and company listed | drop id locally at once, refetch to confirm |
| `company` k=`listing` | `{c, k:"listing", v}` | company status, subscription status/period, website `is_published`, `booking_enabled`, cutoff changed | refetch whole current query (cannot know which trips) |
Rules that keep it private: trip events are emitted ONLY when the company is currently listed (new helper `app_private.company_is_listed(uuid)` = active ∧ published ∧ booking_enabled ∧ live subscription). Drafts, unpublished/suspended/expired companies never put a trip id on the wire. The `company` event carries a company id (already public via marketplace data) and no trip ids. No customer, booking, passenger, driver, bus or price-by-customer data is ever in a payload. No subscription to `bookings`, `customers`, `tickets`, `trips` tables themselves.

### 3.2 Requirement coverage
| # | Requirement | How |
|---|---|---|
| 1 | DB is truth | hints only; every state shown comes from the RPC/API refetch; booking RPC unchanged |
| 2 | targeted refetch/invalidation | `trip` events refetch the active query once per burst (coalesced); `company` events same |
| 3 | booking & cancellation update UI w/o refresh | both move `seats_booked` -> trigger -> event |
| 4 | sold-out | `a=0` hint flips card at once; confirmed by refetch; `seats_available=0` rows stay listed as "Fully booked" exactly as today |
| 5 | new / modified / cancelled / unpublished | `new`, `changed`, `gone`, `company.listing` |
| 6 | expired / suspended hidden | `listing` event on status/subscription/publish changes; expiry by TIME has no row change -> bounded by 60 s poll + CDN TTL (documented limit; optional later: pg_cron job that emits `listing` when a period ends) |
| 7 | reconnect / missed / duplicate / stale | see §3.3 |
| 8 | no private data | payload allow-list; emission gated by `company_is_listed`; topic is global and contains nothing per-user |
| 9 | no sensitive table subscriptions | one topic, trigger-fed |
| 10 | keep idempotency, locking, RLS | trigger is AFTER, adds no lock beyond an INSERT into `realtime.messages`; wrapped in `exception when others then null` so a Realtime problem can NEVER fail or slow a booking; idempotent replay (0013b), `FOR UPDATE`, CHECK constraint and all RLS untouched |

### 3.3 Client algorithm (`src/ui/lib/real/liveAvailability.ts`)
- State: `appliedSeq` (monotonic request counter); only the response of the LATEST request is applied (out-of-order/stale responses dropped).
- Duplicate events: refetch is idempotent; events for the same id within the coalescing window collapse; `v` (updated_at ms) lets the hint patch ignore older-than-known values.
- Missed events: on channel status `SUBSCRIBED` after any `CLOSED/CHANNEL_ERROR/TIMED_OUT` -> immediate refetch; `visibilitychange` to visible and `online` -> refetch if last refresh > 15 s; poll every 60 s only while visible (stops when hidden).
- Backoff + cap: max 1 refetch per 2 s per tab; on 429/5xx exponential backoff; if Realtime is down the page still refreshes by poll, i.e. never worse than today.
- Spoof/abuse: private channel, no client publish. Even so, hints never bypass server checks.
- Thundering herd: all viewers refetch the same URL. CDN currently serves up to 30 s (+60 s SWR) stale data, which would make the refetch return old seats. Decision D1 below.

### 3.4 Decisions needed from the owner
| ID | Question | Options | Recommendation |
|---|---|---|---|
| D1 | Refetch must beat the CDN cache | (a) add optional `rev` (digits) query param, strict schema extended, so event-triggered refetches use a new cache key and collapse at the CDN per rev; risk: a caller can vary `rev` to bypass the CDN -> origin load, mitigated by existing Firewall limits + RPC cost cap (limit<=100); (b) lower `s-maxage` to ~5 s and drop SWR for trips; (c) accept staleness | (a), with `rev` bounded to a 10-digit integer and Firewall rule; reassess (b) if load tests dislike it |
| D2 | Channel privacy | private channel + SELECT-only policy for `anon, authenticated` on topic `marketplace:v1` (anti-spoof) vs public channel (needs Realtime "allow public access" setting, lets any client publish fake hints) | private. UNVERIFIED: the docs page I could fetch did not say whether `anon` may be granted select on `realtime.messages` or that a missing INSERT policy blocks client sends. Must be proven on a staging project before build sign-off |
| D3 | Include `a` (seats_available) in hints? | yes (instant sold-out) / no (pure invalidation) | yes; same number is already public |
| D4 | Topic granularity | single global topic (simple; every tab receives every event) vs per-company topics | single topic for v1 with tiny payloads; measure message rate in staging; shard (`marketplace:v1:<hash 0-15>`) if needed |
| D5 | Where do 0022-type decisions land? | independent. Phase 2 must not depend on 0022 (design uses `company_is_listed`, not `is_trip_public`) |

## 4. Exact changes Phase 2 would make (nothing done yet)
### 4.1 Database (ONE new migration, number = next free after the owner resolves the two "0022" proposals; name e.g. `00NN_realtime_marketplace_hints.sql`, with ROLLBACK header)
| Object | Purpose |
|---|---|
| `app_private.company_is_listed(uuid) returns boolean` (STABLE, SECURITY DEFINER, search_path '', revoked from public/anon/authenticated) | single definition of "publicly listed company" reused by all triggers |
| `app_private.emit_marketplace_hint(event text, payload jsonb) returns void` (SECURITY DEFINER; guards `to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null`; `begin ... exception when others then null`) | one choke point for sending; no-op where Realtime is absent (local DB, tests) |
| `app_private.trips_marketplace_hint()` + `trips_marketplace_hint` AFTER INSERT/UPDATE OF seats_booked,status,departure_at,arrival_at,price,capacity,route_id / DELETE FOR EACH ROW triggers on `public.trips` | trip events |
| `app_private.company_listing_hint()` + AFTER UPDATE triggers on `companies(status)`, `subscriptions(status,current_period_end)`, `website_settings(is_published)`, `company_settings(booking_enabled, booking_cutoff_minutes)` | company events |
| Policy on `realtime.messages`: `for select to anon, authenticated using (realtime.topic() = 'marketplace:v1' and extension = 'broadcast')`; NO insert/update/delete policy | private topic, read-only for clients (needs staging proof, D2) |
| (optional later) pg_cron job emitting `listing` at subscription period end | closes the time-based expiry gap |
No new tables. No change to RLS on business tables, to `public_search_trips`, `create_my_booking`, `cancel_my_booking`, or to the seat counter trigger.

### 4.2 Application
| File | Change |
|---|---|
| `src/ui/lib/real/liveAvailability.ts` (NEW) | channel subscribe/teardown, coalescing, sequence guard, reconnect/visibility/online/poll logic |
| `src/ui/lib/real/liveAvailability.test.ts` (NEW) | fake channel + fake timers: dup/out-of-order/missed/backoff |
| `src/ui/lib/real/supabaseBrowser.ts` | expose a realtime-capable client (publishable key only; no session needed) |
| `src/ui/components/marketplace/MasterMarketplace.tsx` | subscribe in an effect; `fetchMarketplaceTrips({silent:true})` (no loading flash); apply seat hint |
| `src/ui/components/marketplace/MarketplaceTripCard.tsx`, `src/ui/components/public/BookingFlowModal.tsx` | re-render on seat change; modal clamps seats to the new `seatsAvailable`; on `available=N` booking error show fresh count |
| `src/ui/lib/real/customerBackend.ts`, `src/lib/public-search/schema.ts`, `handler.ts` | only if D1(a): optional `rev` param (bounded digits), CDN key per rev |
| `src/lib/security-headers.ts` | none expected (CSP already allows ws origin); add a test pinning it |
| `supabase/tests/00_supabase_stub.sql` | add `realtime.send` stub that records into a test table, so SQL suites can assert emitted messages |
| `supabase/tests/18_realtime_hints_tests.sql` (NEW) + `tests/run-all-local.sh` | trigger assertions (see §5) |
| `tests/e2e/*` | new `live.mjs`: two browsers; booking in one updates the other (uses a fake Realtime in the e2e stack, see risks) |
| `docs/` | RUNBOOK section: how to disable (drop 4 triggers / set a kill-switch), monitoring |
Kill switch: `emit_marketplace_hint` reads a setting row/flag (or simply `create or replace` to a no-op) so Realtime can be turned off without touching booking code; client keeps polling.

## 5. Test plan and acceptance criteria
### Database (local PG + stub)
1. Booking by customer -> exactly one `trip/seats` hint with `a = capacity - seats_booked`; cancel -> hint with larger `a`; rollback of the booking tx -> NO hint.
2. Last seat -> `a=0`. Capacity violation attempt (overbooking) -> error, no hint, `seats_booked` unchanged.
3. Parallel booking test (existing real-HTTP suites `booking.int`, `customer-idempotency.int`) still pass unchanged; replays of the same idempotency key emit no second hint.
4. Draft insert/update, trip of unpublished/suspended/expired company, cancelled-company trip -> NO hint (no id leakage). Company status/subscription/publish/booking_enabled change -> one `listing` hint.
5. `emit_marketplace_hint` swallows errors: with `realtime.send` forced to raise, booking still succeeds (test).
6. Payload allow-list test: JSON keys exactly {id,k,a,v} / {c,k,v}.
7. Tenant isolation suites 04 etc. unchanged; anon still cannot select `trips`, `bookings`; anon cannot execute any new `app_private` function; `realtime.messages` policy is select-only.
8. Lock oracle unchanged (guard fires before advisory lock).
### App
9. Unit: sequence guard (stale response dropped), duplicate events, coalescing (50 events -> 1 fetch), reconnect -> fetch, hidden tab -> no poll, 429 backoff, teardown unsubscribes.
10. E2E: browser A sees "3 seats", browser B books 3 -> A shows "Sold out" without reload (<= 3 s locally); B cancels -> A shows seats again; unpublish company -> trips disappear.
### Staging (cannot be proven locally; owner-run)
11. Real Realtime: anon JWT can receive on private topic; cannot publish; payload size/latency; message volume per minute at expected booking rates; fallback when Realtime is paused; CDN `rev` behaviour on Vercel; Firewall rule for `/api/public/trips?rev=`.
### Acceptance criteria
- AC1 Seat change visible in other open tabs within 3 s p95 (staging), within 60 s worst case with Realtime disabled.
- AC2 No Realtime failure can fail, delay (>20 ms added) or roll back a booking.
- AC3 No payload contains anything outside the allow-list; no event for a non-listed company.
- AC4 All 1458 SQL assertions, 638 unit tests, integration and e2e suites still green; new suites green.
- AC5 Clients cannot publish to the topic (proven on staging).
- AC6 Realtime off -> UX identical to today plus 60 s polling.
- AC7 Production build + bundle-scan pass; no new secrets; CSP report-only shows no new violations.

## 6. Recommended implementation sequence (each step stops for approval)
0. Housekeeping first: resolve the 0022 numbering/decision (report 2); fix the date-flaky integration test; untrack `tsconfig.tsbuildinfo`.
1. Staging spike (owner credentials, no repo change): prove D2 (anon receive on private topic, no send) and measure `realtime.send` cost. Go/no-go gate.
2. Client-only value, zero DB risk: `liveAvailability.ts` with polling + visibility + reconnect hooks (feature works without Realtime); unit tests; marketplace wiring.
3. DB migration + stub + suite 18 (local), no client subscription yet; run all suites; apply to staging via runner.
4. Wire the Broadcast subscription; e2e with fake Realtime; staging verification (§5.11).
5. D1 cache decision implemented and load-checked.
6. Production rollout behind a client flag (env `NEXT_PUBLIC_LIVE_SEATS=1`, default off), kill switch documented, monitor Realtime message count and `/api/public/trips` origin rate.

## 7. Risks
| Risk | Mitigation |
|---|---|
| Private-channel anon access may not behave as assumed (unverified) | Step 1 spike; fallback = polling only (already useful) |
| Event volume with one global topic | tiny payloads, coalescing, sharding option D4 |
| CDN staleness hides updates | D1 |
| Expiry by time emits no event | 60 s poll, optional pg_cron |
| Realtime absent locally -> behaviour untestable end to end | stub + fake channel in e2e; staging acceptance |
| Trigger adds work inside booking transaction | one small insert, exception-safe, measured in step 1/3, kill switch |
| Spoofed hints | private channel w/o insert policy; hints never trusted |
