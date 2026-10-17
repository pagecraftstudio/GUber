# Phase 6 — Customer identity (local PostgreSQL only, NOT live Supabase)

Migration `0012_customer_identity.sql`; tests `supabase/tests/07_customer_identity_tests.sql` (added to `tests/run-all-local.sh`); stub `auth.users` gained `phone`, `phone_confirmed_at` (test-only; real Supabase has them).

## Design (defaults I chose — please confirm)
- Customer = `customers.user_id = auth.uid()`; no role, no `company_users` row. One auth account, one `customers` row per company (unique per company).
- `claim_my_customer(company)`: links an existing guest row only when the Auth phone is VERIFIED and equals the row's E.164 phone. Never creates rows (no spam into tenants). Same `P0002` for missing/inactive company/no row.
- `update_my_customer`: name/email/university/student_id only; phone is the identity key, not editable.
- `my_bookings(company?)`: safe columns only (no staff notes/created_by/idempotency key). No direct customer SELECT on `bookings`.
- `customers.user_id` not client-writable (column grants); staff cannot link accounts.
- Suspended company => customer loses access.

## Results
SQL suites 430/430 (23 new), integration 55/55, lock-oracle run. Local only.

## Open decisions for you
1. Login method: phone OTP needs an SMS provider in Supabase (untestable locally). Email-only users cannot claim.
2. Claim by phone only. Recycled numbers: a new owner of an old number could claim the old guest row's history. Mitigation option: also require email match, or claim-by-booking-reference.
3. Customer cancellation, tickets/QR, web booking RPC (consumes allow_guest_booking/cutoff) are Phase 7/8, not done.
4. Frontend still mock; not wired.

---

# Phase 6B — Customer booking web slice (migrations 0013, 0013b) — closing report

Nothing below was run against live Supabase. "Local" = throw-away PostgreSQL 16.15 + PostgREST 12.2.3 + a GoTrue-compatible **stub** (`tests/e2e/auth-stub.mjs`) + headless Chromium against `next build && next start`.

## Decisions
| Topic | Decision | Why |
|---|---|---|
| Idempotency | 0013 is already applied, so it is **not rewritten**. `0013b_create_my_booking_idempotency.sql` replaces the function: advisory lock per (company,key) -> replay check -> trip row lock -> replay check again -> insert; late `bookings_idempotency_uq` violation re-reads the winner. | Same re-check-after-lock pattern as 0010. Lock order advisory -> trip -> booking, no new deadlock cycle. |
| Replay equality | trip, seats, pickup stop, dropoff stop, notes. Other customer's key or any difference -> neutral `23505 idempotency key reused with a different request`. | Name/phone/email belong to the customers row (never overwritten), so they are not booking inputs. |
| Cancellation | **Immediate, customer-initiated, inside the company window.** No pending state exists in the database, so none is shown. Real-mode UI says "Cancel Booking", "Cancellation is immediate and final", "no operator review", button only while server `can_cancel` is true, else "Cancellation period has ended". Reason optional. | `cancel_my_booking` cancels at once; an operator-review flow would need a new status, staff approve/reject RPCs and dashboard wiring — not built, not faked. Mock (dev-only) mode keeps its demo request flow. |
| Bundle | Hard-coded demo scan tokens removed from `DriverScannerModal.tsx` (they shipped in the client bundle and the bundle scan caught them); now in `src/ui/lib/mock/sampleScanTokens.ts`, imported behind `NODE_ENV !== 'production'`. | Mock data must not ship. |
| Test boolean | `psql` prints `t`/`f`; e2e now reads rows with `row_to_json` (`L.sqlRow`) and compares real booleans. | The old `=== 'true'` assertion could not pass reliably. |

## Implemented and tested locally (SQL + HTTP, real PostgreSQL/PostgREST)
- SQL suites 02..09 on one DB: cumulative **543 passed / 0 failed**; suite 09 covers replay, changed payloads, key ownership, cancel authorization, window, repeat cancel, release-once. Lock oracle exit 0.
- PostgREST integration: services+booking 55, customer-web 8, **customer-idempotency 16** (10 parallel identical retries -> 1 booking/9 replays/seats taken once; exact-capacity parallel retries never see "not enough seats"; replay on a now-full trip; same key different seats; same key on two trips; foreign key probe; 6 parallel cancels release once; in-window rejection).
- Unit: 177 Vitest tests (incl. new `can_cancel` adapter test).

## Tested in a real browser against the local backend (Auth is the STUB)
- `flow.mjs` 24 checks: search, sign-up (confirmation required), sign-in, booking persisted, no fake QR.
- `portal.mjs` 35 checks: portal navigation after sign-in; Customer A cannot see/cancel Customer B's bookings (UI + direct RPC); cancel inside window (DB row, reason, audit row once); rejection outside window shown in UI with localized message; repeat cancel is a no-op; capacity released exactly once (3 -> 1); over-capacity race error; history/status/totals correct after refresh; no booking data in localStorage; no page errors.

## Tested against live Supabase
**None.** No live Auth (email confirm, password reset, sessions, SMTP), no live RLS/PostgREST, no live Storage.

## Not implemented
Passenger tickets, QR/opaque ticket tokens, driver boarding (migration 0014); operator-reviewed cancellation requests; payment/refund on cancel; profile read/update UI wiring (code only); website publish; company dashboard and super-admin wiring (real mode throws `NotIntegratedError`, never mock data).

## Blocked by missing external configuration
Live Supabase project + keys, Auth email provider/redirect URLs, phone OTP SMS provider (claim-by-phone), custom domains/DNS, Vercel project. Production build here used placeholder public env values only.

## Final regression (see commands/results in the task hand-off)
`npm ci`, `tsc --noEmit`, `vitest run`, `bash tests/run-all-local.sh` (with `E2E_TOOLS`, `CHROME_PATH`), fresh `rm -rf .next && next build`, `bash tests/bundle-scan.sh` on that exact build.

### Final regression results (run after the last code edit, from a clean `node_modules`/`.next`)
| Command | Result |
|---|---|
| `npm ci` | 0 vulnerabilities |
| `npx tsc --noEmit` | exit 0 |
| `npx vitest run` | 14 files, 177 tests passed |
| `PSQL=psql POSTGREST=/tmp/pgr/postgrest E2E_TOOLS=/tmp/e2etools CHROME_PATH=<chromium> bash tests/run-all-local.sh` | OVERALL PASS: SQL 543/0, lock-oracle 0, services+booking 55, customer-web 8, customer-idempotency 16, e2e flow 24, e2e portal 35 |
| `rm -rf .next && NEXT_PUBLIC_SUPABASE_URL=… (placeholders) npx next build` | exit 0, build id kQ-HkVd1NZRxIbuzGfVjJ |
| `bash tests/bundle-scan.sh` (same build, nothing changed in between) | PASS, fingerprint 026a1b04ed44bb62 |


---

# Phase 6C — Tickets, hashed QR tokens, driver boarding (migration 0014)

Local only (PostgreSQL 16 + PostgREST 12 + GoTrue **stub** + headless Chromium). **Nothing here ran against live Supabase.**

## Design (as decided by the product owner)
| Topic | Implementation |
|---|---|
| Ticket per seat | `tickets` row per seat, created by trigger `300_tickets` on `bookings` in the SAME transaction as confirmation (`create_my_booking`, staff `create_booking`, pending->confirmed all covered). `unique(booking_id, ticket_index)` + `on conflict do nothing`: retries and re-confirms cannot duplicate. A ticket is an entitlement, not a seat number. Existing confirmed bookings are backfilled. |
| Cancel | Booking cancelled (customer, staff, or trip cancelled) => its `valid` tickets become `void` in the same transaction. A boarded ticket stays boarded. |
| QR token | 3 x `gen_random_uuid()` (366 random bits) base64url, 64 chars, payload `MALAKY:TICKET:<token>`. Only `sha256(token)` is stored (`token_hash`, column not readable by any client role). No personal data in the QR. |
| Showing the QR (hash-only consequence) | The token cannot be recovered from its hash, so `my_ticket_qr(booking)` **issues a fresh token for every still-valid ticket on each call** and returns it once. Opening a ticket therefore invalidates earlier screenshots/other tabs of that ticket. The portal list never calls it; only opening the boarding pass does. |
| Boarding | `board_ticket(trip, token)`: every call re-derives from `auth.uid()`: active profile, active company, membership with `trips.read_assigned`, active driver record linked to the user AND assigned to that trip, else `trip not found` (same answer for other drivers, customers, other companies, disabled drivers). Trip row lock, boarding window (`scheduled` trips open 2h before departure; also `boarding`/`in_progress`), token hash lookup `for update`, other company's/unknown token => `invalid ticket`, other trip => `ticket is for another trip`, void/cancelled => `ticket is cancelled`, boarded => `already_boarded` (no second event). First successful scan moves the trip scheduled->boarding. |
| History | `boarding_events` (ticket, trip, driver, auth user, time), unique per ticket, append-only triggers, plus an audit row. |
| Driver auth | Supabase Auth + existing `drivers.user_id`; no new auth system. `/driver` is server-gated (`requireDriver`, permission-driven) and drivers (permission `trips.read_assigned` without `trips.read`) land there after sign-in. |
| Stats | `driver_my_trips` / `driver_trip_boarding`: expected, boarded, remaining (voided tickets excluded). |

## Implemented and tested locally (SQL + HTTP)
- SQL suite 10: issuance, retries, void-on-cancel, customer visibility, hash-only storage, staff/tenant isolation, driver authorization, validation, boarding, duplicates, stats, append-only history, revocation (inactive driver, disabled profile, suspended membership, suspended company), closed trips. Cumulative SQL 641 passed / 0 failed when first run (final numbers in the regression table below).
- HTTP `tickets.int.test.ts` (9 tests): 6 parallel booking retries -> 2 tickets; 8 parallel scans of one ticket -> 1 boarding, 7 `already_boarded`; stale token rejected after re-issue; re-issue-vs-scan race stays consistent; neutral errors for other drivers/customers/anon; no table access.
- Unit: driver error classification, `/driver` routing, ticket adapter, error mapping.

## Tested in a real browser against the local backend (Auth = STUB)
`tests/e2e/tickets.mjs` (29 checks): QR image rendered from a server-issued payload, raw token never in the DOM or storage, portal list issues no tokens, driver lands on `/driver` at phone width without horizontal scroll, invalid/valid/duplicate/other-trip/cancelled scans, stats 2/0/2 -> 2/1/1, DB event row, driver 2 sees only their trip, direct RPC attempts by driver 2 and a customer refused, anonymous and customer account cannot open `/driver`, a driver disabled mid-session is refused on the next scan.

## Behaviour to know
- Customers cannot cancel once boarding has opened (`trip is closed`); staff cancel still voids tickets.
- Camera scanning uses `BarcodeDetector` when present, otherwise `jsqr`. **The camera path itself was not exercised** (headless browser has no camera); manual code entry and the server path were. Needs a real-phone check.
- Passenger names per ticket are not collected (tickets show the booking reference).

## Tested against live Supabase
None.

## Not implemented
Offline boarding sync, GPS, payroll, manual staff boarding/unboarding, ticket transfer, driver invites UI (drivers are linked by admins/seed), staff dashboard wiring, ticket PDF/print layout for real mode beyond browser print, rate limiting on `board_ticket`/`my_ticket_qr` (relies on token entropy and Supabase platform limits).

## Blocked by external configuration
Live Supabase project, Auth email/redirects, SMS provider, HTTPS (camera access requires a secure context in production), custom domains, Vercel.

### Final regression for 0014 (run after the last code edit, clean `node_modules`/`.next`)
| Command | Result |
|---|---|
| `npm ci` | 0 vulnerabilities |
| `npx tsc --noEmit` | exit 0 |
| `npx vitest run` | 15 files, 189 tests passed |
| `PSQL=psql POSTGREST=/tmp/pgr/postgrest E2E_TOOLS=/tmp/e2etools CHROME_PATH=<chromium> bash tests/run-all-local.sh` | OVERALL PASS: SQL cumulative 641/0 (suites 02..10), lock-oracle 0, services+booking 55, customer-web 8, customer-idempotency 16, tickets 9, e2e flow 24, e2e tickets 29, e2e portal 35 |
| `rm -rf .next && npx next build` (placeholder public env) | exit 0, build id z_WbPJ8SCSZvK2onRoveV, `/driver` route present |
| `bash tests/bundle-scan.sh` (same build) | PASS, fingerprint 9db421d3897dde95 |

Note: the literal text `MALAKY:TICKET:` appears in the client bundle only as the driver input placeholder (a format hint), not a token.
