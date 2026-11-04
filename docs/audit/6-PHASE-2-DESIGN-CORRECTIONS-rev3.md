# Phase 2 — Design corrections (rev 3). DESIGN ONLY. Base main db5f394.
Supersedes report 4 only where stated. No repo code, migration, branch, staging, production or GitHub object was touched.
One local experiment was run to check PostgreSQL semantics (§1.4): a throw-away database on the audit sandbox's own Postgres 16, plain PL/pgSQL stubs, dropped afterwards. It is NOT repo code, NOT Supabase, NOT Realtime, and proves nothing about security.
Verification status in this document: nothing about Realtime security has been verified (see report 7, NOT RUN).

## Summary of exact changes versus rev 2 (report 4)
| # | Rev 2 text | Rev 3 text | Why |
|---|---|---|---|
| 1 | §3.1 step 3: `begin perform realtime.send(...); perform set_config('app.mkt_inval','1',true); exception ...` (marker inside the exception block) | Marker is set BEFORE the exception block, at the enclosing level; failed send rolls back only the send | Rev 2 allowed a retry (and a ledger row, and a subtransaction) on every later trigger in the same transaction; reproduced locally (§1.4 case A: 3 attempts, 3 ledger rows) |
| 1b | handler: ledger insert, then warning | handler: ledger insert nested in its own exception block; warning always emitted; double failure documented (§4) | the ledger write can fail too |
| 1c | "`when others` swallows everything" implied | explicit: `WHEN OTHERS` does NOT catch `query_canceled` (statement timeout) or `assert_failure`; a stalled send can still abort the booking (§1.5, measured locally case G) | rev 2 over-promised "can never fail a booking" |
| 3 | §2.3: optional `meta.at` field to skip the catch-up fetch | `meta.at` dropped. Flow: subscribe -> ONE uncached catch-up fetch -> process invalidations (dirty flag) -> poll (§3) | skip rate is at most ~1/6 with a 30 s TTL, adds a schema field and clock-skew handling |
| 4 | §3.2 failure ledger + log | both-fail behaviour, Postgres-log inspection step, log-level precondition, no external call in the booking transaction (§4) | gap |
| 5 | §3.2 canary: `bookings>0 => messages>0` | canary with explicit preconditions and distinct statuses; intentional disablement is SUPPRESSED, not ALARM (§5) | false alarms |
| 6 | report 5 PoC | report 7 (rev 2): stronger T3/T4, evidence list, parity rule, safety review, narrower cleanup (report 7) | PoC rigor |

## 1. Transaction deduplication — corrected design

### 1.1 What was wrong
Rev 2 set the transaction-local marker inside the same `BEGIN ... EXCEPTION` block as `realtime.send()`. A PL/pgSQL block with an `EXCEPTION` clause runs inside an implicit subtransaction (a savepoint taken on entry). If anything in the block raises, PostgreSQL rolls back to that savepoint, undoing every effect made since block entry: table writes, `set_config(..., is_local => true)` changes, and so on. So a marker placed in the block is either never reached (failure before it) or undone (failure after it). The next trigger execution in the same transaction sees no marker and tries again: another send, another failure, another ledger row, another subtransaction.

### 1.2 PostgreSQL subtransaction behaviour relied on (and what was verified)
| Property | Consequence for the design | Verified locally? |
|---|---|---|
| `BEGIN..EXCEPTION` = subtransaction per entry; on error, rolled back to its savepoint | a failed send leaves no `realtime.messages` row | yes (case B: `sent=0`) |
| `set_config(name, value, true)` is transactional AND subtransaction-aware: undone if the (sub)transaction that set it aborts | the marker must live OUTSIDE the block that can fail | yes (case A shows the retry; case B shows the fix) |
| Statements in the exception HANDLER run in the enclosing level, not in the rolled-back subtransaction | ledger row and marker written there/before survive | yes (case B: `ledger=1`) |
| Sequences (`nextval`) are not transactional | usable in tests to count attempts even when the attempt rolled back | yes (`attempts` column) |
| A subtransaction gets its own XID only when it writes; more than 64 subtransaction XIDs in one top-level transaction overflow the per-backend cache and slow other sessions' visibility checks | per-transaction dedupe bounds this to one exception block entry per transaction | documented PostgreSQL behaviour; not measured |
| Marker and message are always at nested depth marker <= message, so any rollback that undoes the marker also undoes the message | an outer savepoint/booking sub-transaction rollback leaves marker and message consistent | yes (case F: marker undone with the savepoint, second emit sent; case E: rolled-back booking leaves nothing) |
| `WHEN OTHERS` matches every error EXCEPT `query_canceled` (57014) and `assert_failure` | a statement/lock timeout inside `realtime.send` is NOT swallowed | yes (case G: error escaped, whole transaction rolled back) |

### 1.3 Corrected function (design text, NOT created anywhere)
```sql
-- app_private.emit_marketplace_invalidation(p_kind text)   SECURITY DEFINER, set search_path = '' ; revoked from public, anon, authenticated
begin
  -- 1. kill switch (no marker: a disabled switch must not consume the attempt)
  if not app_private.runtime_flag('marketplace_realtime') then return; end if;
  -- 2. Realtime absent (local DB / tests): no-op, no marker, no ledger
  if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is null then return; end if;
  -- 3. ONE ATTEMPT PER TRANSACTION. Marker set at THIS level, before the block that may fail.
  if current_setting('app.mkt_inval', true) = '1' then return; end if;
  perform set_config('app.mkt_inval', '1', true);
  -- 4. the only code allowed to fail
  begin
    perform realtime.send('{}'::jsonb, 'invalidate', 'marketplace:v1', true);
  exception when others then
    declare v_state text := sqlstate;                 -- capture first: sqlerrm is NOT used anywhere (it can echo input)
    begin
      begin                                            -- ledger write must never escape
        insert into app_private.realtime_emit_failures(kind, sqlstate) values (p_kind, v_state);
      exception when others then
        raise warning 'marketplace_invalidate_ledger_failed kind=% sqlstate=%', p_kind, v_state;
      end;
      raise warning 'marketplace_invalidate_failed kind=% sqlstate=%', p_kind, v_state;
    end;
  end;
end;
```
Semantics: the marker means "an attempt was made in this transaction", not "a send succeeded". After a failed attempt, later triggers in the same transaction deliberately do NOT retry (one failure record, one subtransaction, no repeated cost). Any later change is still covered because every invalidation is equivalent and clients poll every 60 s. A marker is also undone with its transaction/savepoint, so it can never suppress signals for a different transaction.

### 1.4 Local pattern experiment (actual results; stub functions, PostgreSQL 16.15, throw-away DB, dropped)
Stubs: `rt.send()` increments a sequence (attempt counter), raises when GUC `t.fail_send='1'`, otherwise inserts a row into a stand-in for `realtime.messages`. v2 = rev 2 pattern, v3 = §1.3 pattern.
| Case | Setup | Expected (design) | Actual (this experiment) |
|---|---|---|---|
| A | v2, failing send, 3 emits in one transaction | demonstrates the reported bug: retries | `attempts=3 sent=0 ledger=3 biz=1` -> bug reproduced |
| B | v3, failing send, 3 emits in one tx | 1 attempt, 0 sent, 1 ledger row, marker survives, business write commits | `attempts=1 sent=0 ledger=1 biz=1`, in-tx marker `1`, one `WARNING marketplace_invalidate_failed kind=a sqlstate=XX000` |
| C | v3, healthy send, 3 emits | 1 attempt, 1 sent, 0 ledger | `attempts=1 sent=1 ledger=0 biz=1` |
| D | v3, send fails AND ledger insert fails, 2 emits | no error escapes, 1 attempt, 0 ledger rows, business write commits, two warnings | `attempts=1 sent=0 ledger=0 biz=1`; warnings `marketplace_invalidate_ledger_failed` and `marketplace_invalidate_failed` |
| E | v3, tx 1 rolled back after an emit, tx 2 normal with 2 emits | tx 1 leaves nothing; tx 2 sends once | `attempts=2 sent=1 ledger=0 biz=1` |
| F | v3, emit, `ROLLBACK TO` the savepoint, emit again, commit | marker undone with the savepoint, second emit sends; exactly 1 committed message | `attempts=2 sent=1 ledger=0 biz=1` |
| G | v3, send sleeps 1 s under `statement_timeout=200ms` | characterisation: timeout is NOT swallowed | `ERROR: canceling statement due to statement timeout`; transaction aborted (`biz=0`, `sent=0`) |

### 1.5 Residual risk found by case G (new, must be owned)
A `realtime.send` that blocks longer than the booking statement's timeout raises `query_canceled`, which `WHEN OTHERS` cannot catch; the booking would fail. Realtime emission is expected to be a single local insert, so this should be rare, but it contradicts the rev 2 claim "can never fail a booking". Mitigations (none verified): (a) measure `realtime.send` latency in staging (report 7 step P0 / §6 plan); (b) function-level `SET lock_timeout = '100ms'` bounds lock waits with a catchable error (55P03) — UNTESTED, add as test T-D10 with two sessions; (c) kill switch (§4.3 of report 4); (d) if staging latency or lock behaviour is poor, move to an outbox (enqueue a row inside the transaction, send from a separate job) — more moving parts, adopt only on evidence.

### 1.6 Test specification for the repo SQL suite (NOT written, NOT run)
Requires a test stub for `realtime.send` in `supabase/tests/00_supabase_stub.sql` that (1) increments sequence `t.send_attempts`, (2) raises if GUC `t.fail_send='1'`, (3) otherwise inserts into `t.sent_messages`; and a ledger-guard trigger that raises if `t.fail_ledger='1'`. Suite number assigned at implementation.
| ID | Scenario | Expected |
|---|---|---|
| T-D1 | healthy; call emit 3x in one tx (and via 3 real seat updates in one tx) | attempts +1, sent +1, ledger +0 |
| T-D2 | failing send; emit 3x in one tx | attempts +1, sent +0, ledger +1 (kind, sqlstate only), marker = '1', tx commits, business row persists |
| T-D3 | failing send AND failing ledger | no error escapes, ledger +0, business row persists; log contains both `marketplace_invalidate_ledger_failed` and `marketplace_invalidate_failed` (assert by grepping the suite log; SQL cannot read server log) |
| T-D4 | flag off | attempts +0, marker unset |
| T-D5 | `realtime.send` absent | attempts +0, ledger +0, marker unset |
| T-D6 | booking tx rolled back, then a clean tx | rolled-back tx leaves 0 messages/0 ledger rows; clean tx sends 1 |
| T-D7 | emit; `ROLLBACK TO` savepoint; emit | 1 committed message total, attempts +2 |
| T-D8 | first attempt fails (transient), same tx later would succeed | no retry in that tx (attempts +1) — documents the semantics |
| T-D9 | failing send then rollback of the whole tx | ledger +0 (it rolls back with the tx); the Postgres log line still exists |
| T-D10 | send stalls under `statement_timeout` / lock held by a second session with function-level `lock_timeout` | characterisation: timeout -> error escapes (T-D10a); lock wait -> caught, ledger +1, booking commits (T-D10b, only if (b) is adopted) |
| T-D11 | payload keys | empty object only; no ids |
| T-D12 | existing suites + lock oracle + idempotency integration | unchanged results |
Case mapping: A->(bug), B->T-D2, C->T-D1, D->T-D3, E->T-D6, F->T-D7, G->T-D10a. Actual column for T-D* in §8 is empty on purpose.

## 2. (unchanged from report 4) Invalidation-only payloads, no client seat patching, `/api/public/live/trips` no-store route, topic and sharding plan.

## 3. Catch-up fetch — revised
Decision: drop `meta.at`. Client sequence:
1. Render first paint from the existing cached `GET /api/public/trips` (unchanged headers; CDN absorbs it).
2. Subscribe to `marketplace:v1`. On the first `SUBSCRIBED` (and on every later reconnect to `SUBSCRIBED`) run ONE uncached catch-up fetch to `/api/public/live/trips` (same query). Because the request starts after the subscription is established, any commit before it is in the response and any commit after it produces a message — no gap.
3. Process invalidations: coalesce with 500–1500 ms jitter, at most one live fetch per 2 s; if an invalidation arrives while a fetch is in flight set `dirty`, and when that fetch finishes run exactly one follow-up (the in-flight snapshot may predate the commit). Latest-request-wins for applying responses.
4. Poll the live route every 60 s while the tab is visible; refetch on `online` and on becoming visible if the last fetch is older than 15 s.
Why `meta.at` is not justified: with a 30 s CDN TTL the cached object's age is roughly uniform on 0–30 s (up to 90 s with SWR), so a "skip catch-up if age <= 5 s" rule avoids at most about 1 visit in 6; it adds a response field, makes the client trust a server timestamp (clock skew) and a second code path. No measured evidence supports it. Revisit only if staging measurement shows the catch-up cost over budget; the next step would then be Option B of report 4 §2.4, not `meta.at`.
Expected origin-load cost (arithmetic, not measured; V = visits per second, S = concurrent visible tabs, K = distinct cached query keys):
| Source | Origin requests/s |
|---|---|
| today (CDN only) | about K / 30 |
| catch-up fetch (new) | about V (one uncached request per visit and per reconnect) |
| 60 s poll (new) | S / 60 = 1.7 / 16.7 / 166.7 for S = 100 / 1,000 / 10,000 |
| invalidation refetches (new) | bounded by S / 2 under continuous events (50 / 500 / 5,000) — see report 4 §4.2 |
Unknown inputs: V, S, K, events per second, RPC p95. Measurement plan unchanged (report 4 §4.5); add the catch-up and poll terms to the origin ladder.

## 4. Failure observability — both-failure case, logs, no external dependency
Failure ladder (each level is independent and never raises into the booking):
| Level | Event | Result |
|---|---|---|
| 0 | send succeeds | message row exists; nothing else |
| 1 | send fails | send rolled back; ledger row (kind, sqlstate) + `WARNING marketplace_invalidate_failed`; booking continues |
| 2 | send fails AND ledger insert fails | no ledger row; ONLY `WARNING marketplace_invalidate_ledger_failed` then `WARNING marketplace_invalidate_failed` in the Postgres log; booking continues (local experiment case D); the canary then reports `ALARM: ... no failures recorded` (silent) because messages < bookings and the ledger is empty |
| 3 | the log line is also lost (log level above WARNING, log sink full, retention elapsed) | no in-database trace; only the canary and client telemetry (refetch failures, poll-only behaviour) reveal it. The canary's black-box check is therefore a required control, not optional |
| 4 | `query_canceled` inside send | not caught; booking fails (§1.5) |
Ledger durability caveat: a ledger row is written in the booking transaction, so if that transaction later rolls back the ledger row rolls back with it (the log line remains). That is acceptable: no booking committed, nothing to signal.
No external dependency in the booking transaction: only `realtime.send` (an insert into a Postgres table in the same database), the ledger insert, `set_config`, `raise warning`. No `pg_net`, no HTTP, no webhook, no extension call. Monitoring (canary, log search, client telemetry) runs outside the transaction.
Preconditions to confirm (unverified): `log_min_messages` on the project includes WARNING (the PoC adds a probe, report 7 step P0); Postgres log retention for the plan; Logs Explorer query syntax.
Runbook additions (extends report 4 §3.3):
1. Disable the flag (`update app_private.runtime_flags set enabled=false ...`), note the time.
2. Inspect the ledger: `select at, kind, sqlstate, count(*) over () from app_private.realtime_emit_failures order by at desc limit 50;` and group by `sqlstate`.
3. Inspect Postgres logs: Supabase Dashboard > Logs > Postgres logs, search `marketplace_invalidate_failed` and `marketplace_invalidate_ledger_failed`, same time window as the incident and the flag change. In Logs Explorer: `select timestamp, event_message from postgres_logs where event_message like '%marketplace_invalidate_%' order by timestamp desc limit 100` (syntax to be confirmed in your project). Absence of lines proves nothing unless the log-level probe passed.
4. Look for `ledger_failed` lines: they mean the ledger itself is unhealthy (disk, permissions, constraint) — fix that first.
5. Compare with the canary output (§5) and with `realtime.messages` volume.
6. Fix cause, re-enable on staging, run canary, then production; purge old ledger rows (`delete from app_private.realtime_emit_failures where at < now() - interval '30 days'`).

## 5. Canary — corrected
The check "bookings > 0 implies messages > 0" is valid only when ALL preconditions hold; otherwise the result must be a suppression/other status, never ALARM.
| Precondition | Why | How checked |
|---|---|---|
| P1 flag `marketplace_realtime` is enabled AND `changed_at` is older than the window W | if it was off (or flipped on inside W) bookings legitimately produced no messages; `changed_at` is the last change so `enabled and changed_at < now()-W` means enabled for the whole window | read `app_private.runtime_flags` |
| P2 the migration is older than W | triggers/flag seed row did not exist before | seed row `changed_at` (set when the migration seeds it); also `app_private.schema_ledger.applied_at` where the runner was used |
| P3 all expected triggers exist and are enabled | a dropped or disabled trigger is a real alarm, distinct from "disabled on purpose" | `pg_trigger.tgenabled = 'O'` for the expected trigger names (exact names fixed at implementation) |
| P4 `realtime.send` exists | absent locally | `to_regprocedure` |
| P5 W < half of `realtime.messages` retention R | purged rows would look like missing messages | R measured in the PoC (oldest `inserted_at`); unknown today |
| P6 only real traffic counted | synthetic and PoC messages must neither hide nor create alarms | count only `topic = 'marketplace:v1'`; load tests and PoC use other topics (`loadtest:*`, `poc:*`); never run load tests on `marketplace:v1` |
| P7 count the right bookings | any booking creation or cancellation moves the seat counter and must emit | `created_at > now()-W or cancelled_at > now()-W` |
Operational rule: ALWAYS set the flag to false BEFORE dropping or disabling triggers or rolling the migration back; otherwise the canary correctly reports `ALARM: trigger missing`.
Design text (read-only; table/column names for `realtime.messages` unverified, to be confirmed by PoC step P0):
```sql
with w as (select interval '1 hour' as w),   -- owner parameter, must satisfy P5
flag as (select enabled, changed_at from app_private.runtime_flags where key = 'marketplace_realtime'),
trg  as (select count(*) filter (where t.tgenabled = 'O') as ok, count(*) as seen
           from pg_trigger t where not t.tgisinternal and t.tgname = any (array[/* expected names */])),
bk   as (select count(*) as n from public.bookings b, w where b.created_at > now() - w.w or b.cancelled_at > now() - w.w),
msg  as (select count(*) as n from realtime.messages m, w where m.topic = 'marketplace:v1' and m.inserted_at > now() - w.w),
led  as (select count(*) as n from app_private.realtime_emit_failures f, w where f.at > now() - w.w)
select case
  when not (select enabled from flag)                                  then 'SUPPRESSED: flag off (intentional)'
  when (select changed_at from flag) > now() - (select w from w)        then 'SUPPRESSED: flag/migration younger than window'
  when (select ok from trg) < cardinality(array[/* expected names */])  then 'ALARM: expected trigger missing or disabled'
  when (select n from bk) = 0                                           then 'OK-IDLE: no bookings in window'
  when (select n from msg) > 0                                          then 'OK'
  when (select n from led) > 0                                          then 'ALARM: sends failing (ledger rows present)'
  else                                                                       'ALARM: bookings but no messages and no recorded failures (silent failure)'
end as canary;
```
Limits: it proves messages are being WRITTEN, not that clients RECEIVE them. Delivery is checked by an owner-run synthetic subscriber against staging (outside any booking transaction). Intentional Realtime disablement (flag or `NEXT_PUBLIC_LIVE_SEATS=0`) is SUPPRESSED; an unplanned stop is ALARM. Alert thresholds and schedule are owner decisions.

## 6. PoC safety review — see report 7 §4 (operations list, blast radius, narrowed cleanup, stop conditions).

## 7. Unresolved blockers (nothing here is closed by this document)
| # | Blocker | Needs |
|---|---|---|
| B1 | Realtime private-channel behaviour unproven (anon receive, no publish, no foreign topics, customer <= anon, no new table access) | owner runs report 7 on a real staging project and supplies the evidence files |
| B2 | `realtime.send` signature, post-commit delivery, policy syntax, `realtime.messages` columns and retention unconfirmed | PoC steps 1a/1b/P0 |
| B3 | Whether staging/production carry the old `0022.sql` (function drift and/or ledger orphan) | report 2 SQL, owner |
| B4 | Owner decisions: adopt stricter `is_trip_public` or not; offset-cap timing; numbering plan (report 4 §6) | owner |
| B5 | Budgets, traffic, Realtime plan limits | owner; measurement plan |
| B6 | Vercel: query string in cache key, Firewall rate-limit availability, `no-store` observed as no cache hit | verify on the real project |
| B7 | Phase 1.1 patches not pushed; this session cannot push | owner |
| B8 | Phase 1 live acceptance items (auth/roles, Vercel env/headers/cookies/Firewall) | owner |
| B9 | NEW: Postgres `log_min_messages`, log retention and Logs Explorer syntax unverified | PoC step P0 |
| B10 | NEW: `realtime.send` latency and lock behaviour inside a booking transaction unknown; `query_canceled` is not catchable (case G) | staging measurement; decision on lock_timeout / outbox |
| B11 | NEW: role `statement_timeout` values used by Supabase for anon/authenticated/authenticator unverified | read from the staging project |
| B12 | NEW: expected trigger names and exact flag/ledger table definitions are fixed only at implementation | implementation phase after approval |
| B13 | NEW: HTTP broadcast endpoint shape (`/realtime/v1/api/broadcast`) used by PoC T3 is unverified | PoC result (INCONCLUSIVE if 404) |
| B14 | NEW: pre-existing staging policies on `realtime.messages` unknown (a broad `using (true)` policy would invalidate the PoC) | PoC baseline step 1a with stop condition |

## 8. Test matrix — expected and actual are separate; empty/NOT RUN means nothing was executed
### 8A. Local PostgreSQL pattern experiment (executed here; stubs only; see §1.4 for full rows)
| Case | Expected | Actual |
|---|---|---|
| A bug reproduction | retries | attempts 3, ledger 3 |
| B v3 failing send | 1 attempt, 1 ledger | attempts 1, ledger 1, marker 1, biz committed |
| C v3 healthy | 1 attempt, 1 sent | attempts 1, sent 1 |
| D double failure | no escape, 0 ledger, 2 warnings | as expected |
| E rollback then clean | 1 sent | sent 1, ledger 0 |
| F savepoint rollback | 1 committed | sent 1, attempts 2 |
| G statement timeout | not swallowed | not swallowed; tx aborted |
### 8B. Repo suite tests T-D1..T-D12
| ID | Expected | Actual |
|---|---|---|
| all | see §1.6 | NOT WRITTEN, NOT RUN |
### 8C. Staging PoC (report 7)
| ID | Expected | Actual |
|---|---|---|
| P0, T1-T8, REST diffs, fingerprints | see report 7 §3 | NOT RUN (owner evidence required) |
### 8D. Client/cache tests (report 4 §2)
| Test | Expected | Actual |
|---|---|---|
| live route headers, no Set-Cookie, strict schema, `x-vercel-cache` | see report 4 §2.2 | NOT WRITTEN, NOT RUN |

No implementation will start until the owner explicitly approves.
