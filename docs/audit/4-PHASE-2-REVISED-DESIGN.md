# Phase 2 — Revised design (rev 2). DESIGN ONLY. Base main db5f394. Nothing implemented, applied, pushed or written to staging/production.
Supersedes report 3 where they differ. Deliverable map: §1 architecture · §2 cache · §3 error handling/observability · §4 scalability · §5 Phase 1.1 patch · §6 migration numbering · §7 blockers. Security PoC = report 5.

## 0. Facts used (checked, with source)
| Fact | Source |
|---|---|
| Public list route today: `GET /api/public/trips`, `Cache-Control: public, max-age=0, s-maxage=30` + `Vercel-CDN-Cache-Control: max-age=30, stale-while-revalidate=60`; strict query schema (unknown param -> 400) | `src/lib/public-search/handler.ts` l.28-35, `schema.ts` |
| `/api/public/*` bypasses session refresh, so responses carry no cookies | `src/proxy.ts` l.18-19 |
| Vercel: `Vercel-CDN-Cache-Control` has top priority, then `CDN-Cache-Control`, then `Cache-Control`; `private` is never CDN-cached; `no-store` = never cached; default `public, max-age=0, must-revalidate` = not cached; `Pragma: no-cache` only forces SYNCHRONOUS revalidation of a stale entry, it does not bypass a fresh one; no documented client-controlled cache bypass | vercel.com/docs/headers/cache-control-headers (fetched 2026-11-01) |
| NOT confirmed by that page: whether the query string is part of the CDN cache key (assumed yes, standard), Firewall rate-limit availability on this account's plan | to verify on the real project |
| `transition_trip(...,'cancelled')` cancels every pending/confirmed booking in the same transaction; each one moves the seat counter | 0011 l.12, 73-74 |
| Seat counter is a trigger on bookings; booking RPC locks the trip row | 0010 l.70-85, 0013b l.101 |

## 1. Revised architecture
### 1.1 Change 1 — Broadcast is an invalidation signal ONLY (no seat numbers, no ids)
Event: topic `marketplace:v1`, event name `invalidate`, payload `{}` in v1 (Option B of §2 adds one integer `g`). No trip id, no seat count, no company id, no price, no status.
Client rule: on `invalidate` -> coalesce -> refetch the CURRENT query from the live route -> render only what that response says. There is NO local patching of seat numbers.

Why this is simpler and safer:
| Concern | Patching hints (rev 1) | Invalidation only (rev 2) |
|---|---|---|
| Ordering | needed per-trip version `v`, compare against fetched rows, decide who wins | irrelevant: the last fetch result wins; hints carry no state to order |
| Stale / duplicate / out-of-order events | needed dedupe + ignore-older logic | harmless: an extra or reordered signal = one extra idempotent refetch |
| Missed events | hint state could diverge until next fetch | nothing to diverge; next fetch (poll/reconnect) fully heals |
| Trust boundary | numbers from the Realtime channel (a second, weaker pipeline) shown to users | every displayed number comes from the one existing pipeline: RPC -> zod allow-list -> JSON; Realtime cannot lie about seats, only cause a refetch |
| Forged message (if channel policy is ever wrong) | could display false "sold out" | cannot change any displayed value; worst case is extra load (bounded by client throttle) |
| Privacy | ids on the wire (needed gating to avoid leaking draft ids) | no identifiers on the wire at all; gating of drafts is only noise reduction, not a privacy control |
| Code | ~2x client logic + tests | one refetch path, already tested |
Cost: seat counts update after jitter (0.5-1.5 s) + one RTT instead of instantly. Accepted for v1. UI may show a neutral "updating" state; it never shows an unverified number.

### 1.2 Flow
```
(any tx that changes seats_booked / trip status / listing eligibility)
  -> AFTER trigger -> app_private.emit_marketplace_invalidation()      [flag check, once per transaction, exception-safe, observable: §3]
  -> realtime.send('{}', 'invalidate', 'marketplace:v1', private := true)   (row in realtime.messages, delivered only after COMMIT)
Browser (liveAvailability):
  1 subscribe  2 AFTER 'SUBSCRIBED': one catch-up fetch (§2.3)  3 on 'invalidate': jitter 500-1500 ms, max 1 fetch / 2 s, latest-request-wins
  fallback: on reconnect/online/visible refetch; poll 60 s while visible; Realtime down => still correct within 60 s
Fetch path: GET /api/public/live/trips (uncached, §2)  ->  public_search_trips()  [authoritative, unchanged]
Booking: create_my_booking unchanged: trip row FOR UPDATE, capacity check, idempotency key replay, CHECK trips_seats_valid.
```
Subscribe-before-fetch ordering closes the gap where a commit happens between an initial fetch and the subscription.

### 1.3 Requirement check (unchanged goals)
Booking/cancel update without refresh (seat counter -> trigger -> signal -> refetch). Sold-out flips only after refetch. New/modified/cancelled/unpublished trips and expired/suspended companies: any committed change that can alter the list emits the same signal; purely time-based expiry (a subscription period simply passing, a trip passing its cutoff) emits nothing and is bounded by the 60 s poll. No customer/booking data on the wire; no subscription to any business table; locking, idempotency and RLS untouched.

## 2. Cache strategy
### 2.1 Threat being solved
`/api/public/trips` can legitimately serve data up to 30 s fresh + 60 s stale (CDN) -> a refetch triggered by an event could return pre-event data. Requirement: event-triggered requests must never be answered from the CDN.

### 2.2 Recommended v1: dedicated uncached live route (Option A)
New route `GET /api/public/live/trips` (same strict query schema, NO new parameter, same RPC, same allow-list). Different path from the cached one, so the two never share a cache entry. Path chosen under `/api/public/` so `proxy.ts` keeps it cookie-free; `live/` (not `trips/live`) avoids ambiguity with `trips/[tripId]`.
Exact headers on 200 responses:
```
Cache-Control: no-store
Vercel-CDN-Cache-Control: no-store
CDN-Cache-Control: no-store
```
(Per Vercel docs the first two both stop CDN storage; all three set so other CDNs and the browser also obey; no `Set-Cookie`, no `Vary: Cookie`.) Error responses already send `Cache-Control: no-store` (handler `NO_STORE`). Client: `fetch(url, { cache: 'no-store' })`.
Tests to require: header snapshot test; test that no `Set-Cookie`; test that strict schema still rejects `rev`/`g`/unknown params (so cache-key abuse via junk params stays impossible); `x-vercel-cache` must be `MISS`/absent on staging for 20 consecutive calls (owner-run).
What stays cached: the normal marketplace initial request `GET /api/public/trips` keeps exactly today's headers (`public, max-age=0, s-maxage=30` + CDN `max-age=30, stale-while-revalidate=60`). First paint uses it. Nothing about it changes, so the CDN keeps absorbing cold visitors and crawlers.

### 2.3 Cost of Option A, stated honestly
| Origin work | Before | With Option A |
|---|---|---|
| steady state | O(distinct query keys / 30 s) | + O(visitors) catch-up fetches + O(subscribers x events) invalidation fetches |
Mitigations built into v1: (1) catch-up fetch after SUBSCRIBED only if the initial (cached) response may be stale: add `meta.at` (origin render time, additive JSON field) to the cached route so the client can skip the catch-up when `now - at <= 5 s` (small effect while TTL=30 s: most visitors will still catch up; the alternative is to accept it); (2) client throttle 1 fetch / 2 s / tab, jitter, no polling while hidden; (3) Vercel Firewall rate-limit rule on `/api/public/live/*` per IP (owner-configured; value unknown, see §4 plan; availability on plan UNVERIFIED); (4) RPC already hard-capped (limit<=100, offset clamp pending 0022-offset); (5) RPC cost measured before launch (§4). There is NO per-user limiter possible for anonymous traffic.
Without a cache the origin sees up to S/2 req/s per active-event stream (S = concurrent tabs) — arithmetic upper bound in §4.

### 2.4 Alternative held in reserve: generation-keyed shared cache (Option B) — NOT v1
Goal: let the CDN collapse N identical refetches into 1 origin hit per event, without trusting an unrestricted client parameter.
- DB: sequence `app_private.marketplace_gen`; the emitting trigger calls `nextval` ONCE per transaction (same per-tx dedupe as §3) and sends `{g: n}`. `nextval` takes no row locks.
- Route `GET /api/public/live/trips?...&g=<digits>` (only on the live route; strict schema accepts one extra key `g`).
- Validation INSIDE a new RPC `public_search_trips_live(..., p_gen bigint)`: `current := last_value of the sequence`; reject (400 class, NOT cached) unless `current - W <= p_gen <= current` (W = small window, e.g. 20, a tuning constant). So an attacker can only ever create at most W+1 distinct cache entries per query combination, can only use the one public number everyone already receives, and any out-of-window request costs one cheap origin hit but is never stored.
- Headers on 200: `Cache-Control: no-store` for browsers + `Vercel-CDN-Cache-Control: max-age=60` (key includes `g`). Correctness argument: a client holding event `g` requests `g`; the entry for `g` can only be created by a request that arrived after event `g` was committed, so it is at least as fresh as that event; later events carry a larger `g` and a different key. Staleness relative to the event the client knows is impossible; entries are never reused across events.
- Abuse analysis: keyspace per query = W+1 (bounded), not unbounded; origin load from abusers = distinct (query-combinations x (W+1)) at worst, same order as today's cache-key space (strict schema already limits combinations); the validation read happens on misses only. Vercel specifics UNVERIFIED: query string in cache key; behaviour of `stale-while-revalidate` omitted; Firewall rules.
- Cost/complexity: new sequence + new RPC variant (must include the offset clamp from 0022-offset; hence ordering rule in §6), more tests. Adopt only if §4 measurements show Option A's origin load or cost exceeds budget.
Rejected: plain `?rev=<anything>` (unbounded keyspace -> cache-key flooding -> origin load; nothing ties it to a real event).

## 3. Error handling and observability (replaces `exception when others then null`)
Principles: Realtime can NEVER fail, roll back or noticeably slow a booking; failure is NEVER silent; no payload/identifiers in any log; no external dependency inside the booking transaction.

### 3.1 Emission function (design; not created)
`app_private.emit_marketplace_invalidation(kind text)` — SECURITY DEFINER, `set search_path = ''`, revoked from public/anon/authenticated:
1. `if not app_private.runtime_flag('marketplace_realtime') then return;` (kill switch, §3.3)
2. Per-transaction dedupe: `if current_setting('app.mkt_inval', true) = '1' then return;` — at most ONE message and ONE subtransaction per transaction (a trip cancellation that cancels 40 bookings = 1 message, not 41; also keeps the transaction under the 64-subtransaction cache limit).
3. `begin perform realtime.send('{}'::jsonb, 'invalidate', 'marketplace:v1', true); perform set_config('app.mkt_inval','1', true);`
4. `exception when others then` -> record + warn (§3.2); swallow so the business statement succeeds.
Guards: skip entirely where the `realtime` schema/function does not exist (local DB): `to_regprocedure('realtime.send(jsonb,text,text,boolean)') is null` -> return. Gate for non-seat changes with `company_is_listed(company)` (noise only, not privacy); skip the gate when `seats_booked` changed (the booking RPC already proved the trip public in the same transaction).
Note: `realtime.send` inserts a row into `realtime.messages` inside the caller's transaction, so a rolled-back booking sends nothing. Exact `realtime.send` signature, and that Broadcast rows are delivered post-commit, are to be confirmed in the PoC (report 5).

### 3.2 Making failure visible without payloads
| Layer | Mechanism | Leak / dependency check |
|---|---|---|
| In-DB ledger | `app_private.realtime_emit_failures(id identity, at timestamptz default now(), kind text, sqlstate text)`; row inserted in the exception handler; NO message text, NO payload (`sqlerrm` deliberately dropped: it can echo input). Index on `at`. Nested `begin/exception` around the insert so a full disk cannot break the booking. Retention via the existing purge pattern (0020 `rate_limit_purge`) or manual. Failure path only — the success path writes nothing (no hot row, no contention) | stays inside Postgres |
| Postgres log | `raise warning 'marketplace_invalidate_failed kind=% sqlstate=%', kind, sqlstate;` -> Supabase Postgres logs (searchable) | no payload; no external service |
| Black-box canary (detects failures that raise nothing, e.g. flag mistakes, trigger dropped, Realtime not delivering) | read-only SQL run on a schedule by the owner/monitor: `select (select count(*) from public.bookings where created_at > now() - interval '1 hour') as bookings, (select count(*) from realtime.messages where topic = 'marketplace:v1' and inserted_at > now() - interval '1 hour') as messages;` Expectation: `bookings > 0 => messages > 0` and `messages <= bookings + other changes`. Retention of `realtime.messages` and column names must be confirmed in the PoC | read-only |
| Client | counter of refetch attempts, failures, Realtime status transitions, via the existing failure-telemetry route (`/api/telemetry/failure`) — counts only | existing endpoint, origin-checked |
| Alert | owner chooses thresholds: >0 failures in `realtime_emit_failures` in 10 min, or canary violated | thresholds are owner decisions (not invented here) |
Circuit breaker NOT auto-writing in the hot path (a flag write inside booking transactions would create a lock hotspot during a failure storm). Manual kill switch instead.

### 3.3 Kill switch and recovery
Switch: single-row-per-key table `app_private.runtime_flags(key text primary key, enabled boolean not null, note text, changed_at timestamptz not null default now(), changed_by uuid)`, seed `marketplace_realtime = true`; read by PK on every emission (cheap, no cache invalidation delay, unlike `ALTER DATABASE SET` which affects only new sessions behind a pooler). RLS enabled, no grants to anon/authenticated.
Disable (owner, SQL editor, takes effect for the next transaction): `update app_private.runtime_flags set enabled=false, note='<why>', changed_at=now() where key='marketplace_realtime';`
Layers: (1) DB flag: stop emitting; (2) client build flag `NEXT_PUBLIC_LIVE_SEATS=0` + redeploy: stop subscribing; polling every 60 s continues in both cases, so the marketplace degrades to "refresh within 60 s" and never to "broken"; (3) hard off: drop the trigger(s) (documented rollback in the migration header).
Recovery runbook: 1 disable flag; 2 confirm `realtime.messages` stops growing and booking RPC latency/error rates normal; 3 read `realtime_emit_failures` (sqlstates) and Postgres logs; 4 fix cause (permissions, missing function, plan limit); 5 re-enable in staging first and run the canary; 6 enable in production; 7 NO data repair needed: DB is the source of truth and every client refetches on reconnect/poll; 8 post-incident: purge old failure rows.

## 4. Global topic: justification, fan-out, sharding, measurement
### 4.1 Messages per operation (deterministic from the design)
| Operation | Trigger fires | Messages sent |
|---|---|---|
| Customer books (1 booking, any seats) | trips.seats_booked update | 1 |
| Customer cancels | seat counter update | 1 |
| Staff cancels a trip with K bookings | K seat updates + 1 status change in one tx | 1 (per-tx dedupe) |
| Trip created/scheduled/edited/unscheduled (listed company only) | trips trigger | 1 per transaction |
| Company status / subscription / publish flag / booking_enabled / cutoff changed | company triggers | 1 per transaction |
| Idempotent replay of a booking (no write) | none | 0 |
| Booking rolled back | message row rolled back with it | 0 |
### 4.2 Fan-out arithmetic (design parameters only; NOT measurements)
Let S = concurrent subscribed tabs, E = invalidation messages per second (unknown). Deliveries per second = S x E. Per single event: every subscriber receives it and may refetch.
| S (concurrent visitors) | deliveries per event | refetch requests per event (upper bound) | peak origin rate if one event hits a quiet system, spread by 1.5 s jitter | upper bound under continuous events (client cap 1 fetch / 2 s) |
|---|---|---|---|---|
| 100 | 100 | 100 | ~67 req/s | 50 req/s |
| 1,000 | 1,000 | 1,000 | ~667 req/s | 500 req/s |
| 10,000 | 10,000 | 10,000 | ~6,667 req/s | 5,000 req/s |
These are ceilings implied by the parameters (jitter 1.5 s, 2 s cap), valid only if EVERY tab refetches on EVERY event. Real numbers depend on unknowns below. Option A sends all of them to the origin; Option B (§2.4) would reduce origin hits per event to roughly the number of distinct active query keys.
### 4.3 UNKNOWNS (to be filled by the owner / measured)
Production bookings per hour and peak; concurrent visitors (S) now and in 12 months; share of visitors with an origin+destination filter; Supabase Realtime limits on this project's plan (concurrent connections, messages/s, channels per client, payload size); delivery latency p50/p95; `realtime.send` cost inside a booking transaction; `public_search_trips` p95 at 100 rows; Vercel function concurrency/cost; Firewall availability.
### 4.4 Is one global topic justified?
For v1 yes, conditionally: payload is empty, so per-message cost is minimal, the topic has no per-user data, and sharding adds client and trigger complexity that is unjustified before measurement. It is retained ONLY IF the staging measurement (§4.5) stays within budgets the owner sets. The client takes topics from one function `topicsFor(query)` so sharding later is a trigger + client change, not a redesign.
### 4.5 Measurement plan (staging only; owner-run; no production)
1. Fix budgets first (owner): max origin req/s on `/api/public/live/trips`, max DB CPU/connections, max Realtime msgs/s, target p95 event->render latency.
2. Single-connection baseline: one subscriber, send 100 test messages with `realtime.send` from SQL (test topic), record send->receive latency (timestamp in the TEST payload only).
3. Fan-out ladder: synthetic WebSocket subscribers (k6 or a Node script) S = 100, 500, 1,000 (and 10,000 only if plan limits allow), each step E = 0.1, 1, 5 events/s for 5 min. Record: deliveries/s, drops/disconnects, latency percentiles, Realtime/DB CPU (dashboard), connection counts.
4. Origin ladder: same S, synthetic clients doing the real refetch (jitter + 2 s cap) against staging Vercel; record function invocations, duration, 429/5xx, RPC p95, `x-vercel-cache` (must be absent/MISS).
5. Option B dry run (only if step 4 breaches budget): implement behind a flag in staging and repeat step 4; compare origin hits per event.
6. Relevance ratio: client counter of refetches whose response is byte-identical to the previous one; high ratio = events mostly irrelevant to what visitors see = sharding signal.
### 4.6 When to shard, and how
Shard when ANY holds on staging projections: origin RPS at projected peak > budget even with Option B; Realtime msgs/s or per-connection delivery near plan limits; relevance ratio above an owner-chosen threshold (suggest deciding after seeing data).
Preference if needed:
| Scheme | Fit | Verdict |
|---|---|---|
| per-company topics | an unfiltered marketplace subscribes every tab to every company (N channels per tab; per-client channel cap unknown); topic count grows with tenants | no |
| hash(company) % K | stable, simple trigger; unfiltered view needs K topics, company-filtered view needs 1 | acceptable fallback |
| hash(normalized origin,destination) % K | matches how visitors actually search (origin+destination); trigger derives from the trip's route; unfiltered view subscribes to all K | preferred if filtered searches dominate (unknown, measure) |
Company-level changes are rare: broadcast them on a separate low-volume topic `marketplace:v1:listing` that every tab always joins, instead of K copies.

## 5. Phase 1.1 housekeeping — patch proposal (prepared, NOT applied to main, NOT pushed)
Location: `/home/claude/reports/phase-1.1-patches/` (2 patches on top of main db5f394, built in a scratch worktree on local branch `phase-1.1/housekeeping`; origin/main untouched).
| Patch | Change |
|---|---|
| 0001 `test(int): draw services.int.test days from the future` | `tests/integration/services.int.test.ts` only: `day()` = `today + 30 + rand(20_000)` instead of `20_000 + rand(20_000)`. Old base is 2024-10-04, so 37,946 of 1,000,000 simulated draws were already in the past on 2026-11-01 (3.8%); new base: 0 of 1,000,000. 4 added lines, 2 removed |
| 0002 `chore: stop tracking tsconfig.tsbuildinfo` | `git rm --cached tsconfig.tsbuildinfo`; the `*.tsbuildinfo` ignore rule is untouched and still matches (`git check-ignore` confirmed); file stays on disk |
Validation on the patched tree: `tsc` PASS; `vitest` 638/638; services+booking integration 55/55 on 5 consecutive fresh databases; `git status` clean after `tsc`.
Not in scope, noted: `booking.int.test.ts` uses `300 + rand(4000)` days FROM TODAY (safe); `.DS_Store` files are tracked in 3 places (`.DS_Store`, `supabase/.DS_Store`, `supabase/migrations/.DS_Store`) and `.gitignore` has no `.DS_Store` rule — optional separate cleanup.
Apply on your machine: `git checkout -b phase-1.1/housekeeping origin/main && git am phase-1.1-patches/*.patch && git push -u origin phase-1.1/housekeeping`, then open the PR yourself.
Checksums: 0001 `a0ac4942aa1849ab2f8cc0e3da1d48d177adeb669859679c2628b2de34a33c09`, 0002 `285f560521eff6241217b5a6cf8d9b17bd9ac964e4f1c16ead26873dc0afa5b1`.

## 6. Migration numbering (no file renamed, nothing applied)
### 6.1 Dependency inspection
| Proposal | Objects it replaces/creates | Depends on | Conflicts with |
|---|---|---|---|
| A `0022_cap_public_search_offset.sql` (+ `18_offset_cap_tests.sql`) | replaces whole `public.public_search_trips` (clamps offset 0..1000), same signature/grants | 0021 body of that function | none functionally; any LATER migration that copies/rewrites `public_search_trips` (e.g. Phase 2 Option B live RPC) must include the clamp or it regresses it |
| B `unreviewed_is_trip_public_live_subscription.sql` (formerly `migrations/0022.sql`) | replaces `app_private.is_trip_public` (adds `has_live_subscription`) | 0013 body, 0021 helper `has_live_subscription` | changes booking error contract; suite 17 line 57 expectation (`42501 no active subscription`) would break; idempotent replay gated behind it (0013b l.69 precedes replay) |
| C Phase 2 realtime migration (future) | new functions, flags table, failure table, triggers on trips/companies/subscriptions/website_settings/company_settings; optional sequence + live RPC | 0021 (`has_live_subscription`, for `company_is_listed`); trigger infrastructure of 0004/0010 | none with A or B (disjoint objects); Option B live RPC must follow A |
A and B touch DIFFERENT functions, so their relative order does not matter functionally. The repo enforces two rules (`src/lib/db/migrations.test.ts`): names match `NNNN[a-z]?_name.sql` and numbers are CONTIGUOUS from 0001, so numbers cannot be reserved ahead; the number is the merge order.
### 6.2 Recommended plan
| Order | Number | Content | Condition |
|---|---|---|---|
| 1 | **0022** | `0022_cap_public_search_offset.sql` + suite `18_offset_cap_tests.sql` | adopt first: already specified as 0022 in docs/STAGING-PREP-8C.md and RATE-LIMITING.md; independent; low risk; needed before any rewrite of `public_search_trips` |
| 2 | **0023** | `is_trip_public` live-subscription gate (renamed `0023_trip_public_requires_live_subscription.sql`) | ONLY if the owner adopts the stricter gate AFTER report-2 queries; requires header ROLLBACK, edit of suite 17 expectation, a replay-after-expiry test; separate suite `19_...` |
| 3 | **0023 or 0024** | Phase 2 realtime migration + suite (`19_` or `20_realtime_invalidation_tests.sql`) | only after the PoC passes (report 5) and PoC/budget decisions are made; takes 0023 if step 2 is not adopted |
If B is rejected, it stays unnumbered in `docs/proposals/` (as now) and numbers 0023+ go to whatever merges next.
### 6.3 Prerequisite that can block the plan whatever the numbers are
If staging's ledger already contains a row `0022.sql` (applied by the runner while that file existed on main), `apply-migrations.sh` aborts with `MISSING 0022.sql (applied but not in the repository)` before applying anything, because the file was removed (22dd3c8). If staging got it by hand-pasted SQL there is no ledger row but the function differs from the repo (drift). Either case must be diagnosed with report-2 queries and reconciled by the OWNER (decide keep/revert the function, then deal with the orphan ledger row deliberately). This audit does neither.

## 7. Explicit remaining blockers (implementation stays blocked until these are closed)
| # | Blocker | Owner action |
|---|---|---|
| B1 | Realtime private-channel security UNPROVEN (anon receive, no publish, no foreign topics, authenticated = anon, no new table access) | run report-5 PoC on a staging Supabase project; paste results |
| B2 | Exact `realtime.send` signature, post-commit delivery, `realtime.messages` retention/columns, and policy syntax unverified (docs page fetched did not cover them) | confirmed by the PoC |
| B3 | Whether staging/production carry the old `0022.sql` (function drift and/or ledger orphan) | run report-2 SQL on staging, then production, read-only |
| B4 | Decision: adopt B (stricter `is_trip_public`) or not; decide timing of A (offset cap) | owner |
| B5 | Budgets/SLOs and traffic unknowns (§4.3); Supabase Realtime plan limits | owner supplies; staging measurement §4.5 |
| B6 | Cache path decision: Option A for v1 (recommended) vs B; Vercel specifics unverified (query string in cache key, Firewall rate-limit rule availability, `no-store` observed in `x-vercel-cache`) | verify on the real Vercel project |
| B7 | Approval of the numbering plan (§6) and of Phase 1.1 patches (§5) | owner pushes/opens PR (this session cannot push) |
| B8 | Phase 1 live acceptance items still open (live auth/roles, Vercel env/headers/cookies/Firewall) | per earlier reports |
Nothing in this document was executed against staging or production.
