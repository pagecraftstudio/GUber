# MALAKY BUS SaaS — PHASE 5A REPORT

Phase completed: **Backend Phase 5A** = F1 fix, phone policy, booking RPCs + concurrency tests, trip status machine.
Phases 1–4 untouched in design. Everything below was proven on **local PostgreSQL 16 + PostgREST 12 only.**
**No live Supabase validation was done. Nothing here is claimed production-ready.**

## Migrations (new: 0008–0011; 0001–0007 unchanged)
| # | Content |
|---|---|
| 0008 | **F1 fix.** `000_tenant_guard` first-firing BEFORE INSERT/UPDATE trigger on all 34 tenant tables |
| 0009 | Phone policy: `normalize_phone`, trigger `010_normalize_phone`, E.164 CHECKs (NOT VALID, auto-validated when legacy rows are clean), Egypt-only backfill for companies with country EG |
| 0010 | `create_booking`, `cancel_booking`, `set_booking_status`, `set_booking_payment_status`; seat counter by trigger; booking state machine; no client writes to bookings/booking_payments; monthly booking limit; `seat_drift()` |
| 0011 | Trip state machine (triggers), `transition_trip`, `delete_draft_trip`, monthly trip limit, status/delete no longer client-writable, **fixed constraint bug** `trips_assigned_when_live` |

## Code (TypeScript)
New: `src/lib/validation/phone.ts` (libphonenumber-js, default country EG), booking service/repository/schema/types write side, trip `transition` / `deleteDraft`, error mapping for all new DB messages (`map-error.ts`).
Changed: `common.ts` (`phoneSchema` now E.164), trips repository (no `status` on insert).
Dependency added: `libphonenumber-js` (approved).

## Tests executed (all local) — `tests/run-all-local.sh`, exit code 0
| Suite | Result |
|---|---|
| Unit + `tsc --noEmit` | 152 passed (was 117) |
| SQL 02 Phase 2 | 127 (2 tests rewritten: trip delete now via RPC) |
| SQL 03 auth RPCs | 58 |
| SQL 04 F1 regression | 75 (incl. "red run": same suite FAILS on a DB without 0008; POWER CHECK with guard disabled) |
| SQL 05 booking RPCs | 74 |
| SQL 06 trip machine | 72 |
| SQL total | **406 passed, 0 failed** |
| `lock-oracle.sh` | PASS: A cannot touch/wait on B's advisory lock |
| Integration (PostgREST, real parallel HTTP) | 55 passed (27 Phase 4 + 28 new); run 4 times, stable |

Real concurrency proven: 12 parallel bookings on 5 seats → exactly 5 win; 8 parallel cancels → seats released once; 6 parallel same-key requests → 1 booking; 5 parallel schedule attempts on one bus → exactly 1 wins; random create/cancel storm → counter == sum of live bookings.

## Security findings
| ID | Finding | Status |
|---|---|---|
| F1 | BEFORE triggers leaked another tenant's plan/subscription/bus/driver state through error differences | **Fixed (0008)**, regression tests, lock channel closed |
| F3 (new) | Platform admin could UPDATE bookings / seats directly via API → counter drift | **Fixed**: grants revoked, trigger-level invariants |
| F4 (new) | Clients could set `trips.status` directly, skipping the machine and booking cancellation | **Fixed**: column grant removed, DB trigger graph |
| F5 (new) | Phase 2 CHECK made a draft without bus impossible to cancel | **Fixed** in 0011 |
| F6 (new) | Phone only loosely validated | **Fixed**: E.164 at app layer + DB |
Booking RPCs answer "not yours" and "does not exist" identically (`P0002`).

## Decisions I took that need your approval
1. **Seat counter = all non-cancelled bookings** (also completed/no_show). Differs from Phase 1 text (pending+confirmed only).
2. Staff booking rules: trip `scheduled`, not departed, seats ≤ `max_seats_per_booking`. Customer-facing rules (`booking_enabled`, cutoff, guest flag) arrive with Phase 8.
3. Trip completion: `confirmed → completed`, `pending → no_show`. Completion only after departure time. `scheduled → in_progress` allowed (boarding optional).
4. `scheduled → draft` only with zero live bookings. Draft deletable only with zero booking history.
5. Monthly limits: trips counted by month of departure (cancelled excluded); bookings by creation month (cancelled included).
6. Trip cancel does not refund; `payment_status` stays manual.
7. Existing customer's name is never overwritten by a new booking; empty optional fields are filled.

## Not done / not proven
- **No live Supabase run.** Needs a Supabase *branch* (not `main`). Then run `tests/` SQL files and report back.
- Boarding scan time rule (60 min) and student discount: Phase 7 / 8.
- Trip-time edit rules when bookings exist, stop reorder/delete, role change/suspend RPCs, customer anonymise: still deferred.
- Rate limiting / captcha: Phase 8.
- Frontend impact so far: none required; backend ignores any price/operator/driver fields.

## Next: Phase 6 (customer identity) on your word.
