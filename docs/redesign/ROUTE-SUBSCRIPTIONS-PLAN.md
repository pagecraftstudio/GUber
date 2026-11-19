# Route subscriptions: handoff plan (Phases B to E)

Repo `pagecraftstudio/GUber` (Next.js, Supabase, RLS). Project rules apply: architecture and security first, tenant isolation in the DB,
no "production-ready" claim without tests, one phase at a time, stop for approval after each phase, ask when an ambiguity affects DB design.

## State at handoff
- Phase A is done and pushed on branch `feat/route-subscriptions-phase-a` (commit ca60126). NOT merged. NOT applied to the live DB.
  Migration `supabase/migrations/0034_route_subscriptions.sql`, tests `supabase/tests/30_route_subscriptions_tests.sql` (suite total 1932 pass, 0 fail, local Postgres 16).
- First step in the new chat: review and merge the branch, then apply 0034 with `scripts/db/apply-migrations.sh` (live Supabase project `GUber`, id `zsclpwcehqqggoenlshq`).
  ALWAYS apply a migration before deploying code that reads it (route pairs incident, 0033).

## Product rules (decided with the owner)
1. MASAR ID is issued by the platform at signup, for ANY user (not only students). Format `MSR-XXXX-XXXX`, immutable.
2. A company creates plans per route (price + validity: N months from approval, or a fixed date range). A plan on a route also covers its paired return route.
3. Any user can request a plan. Staff (bookings.write) approve or reject. Approval = paid (manual, no payment gateway yet). One user may hold several subscriptions; one open request/active row per user per plan.
4. Subscribers STILL book a seat. Booking is paid, price 0, tagged with `bookings.subscription_id`; the UI shows a "Subscriber" marker.
5. When booking a go trip the subscriber is asked "returning today?". Yes = must pick a return trip (same company day, after the go arrives, seats left) and BOTH seats are reserved atomically. Cancelling one leg cancels the other.
6. One scan per direction per company-local day (go, return). Enforced by unique key `(subscription_id, service_date, direction)`.

## Phase A objects (already in the DB)
Tables: `route_plans`, `route_subscriptions`, `route_subscription_scans`; columns `profiles.masar_id`, `bookings.subscription_id`.
RPCs: `create_route_plan`, `update_route_plan` (name, price, active only), `archive_route_plan`, `public_route_plans(company)`, `request_route_subscription`,
`decide_route_subscription(id, approve, note)`, `cancel_my_route_subscription`, `subscriber_return_options(subscription, outbound_trip)`,
`create_my_subscriber_booking(subscription, outbound, return?, stops...)`, `scan_route_subscription(masar_id, trip)`.
Entitlement `max_route_plans` (starter 3, professional 20, enterprise unlimited). No client writes to the tables; read-only RLS.

## Phase B: company dashboard (plans + requests)
- Feature module `src/features/route-plans/` (types, zod schema, repository, service; no business logic in components), following `src/features/routes`.
- Pages under `/dashboard`: plans list + create/edit/archive form (validity type switch: months vs date range), requests inbox (pending first, approve/reject with note), active subscribers list per plan.
- Permissions: plans need `routes.write`, inbox needs `bookings.write`. Hide nav items by permission, DB still enforces.
- Add plans to `my_plan_usage` (new migration 0035, `create or replace`, keep existing keys) and show the limit in the UI.
- Add a staff "Subscriber" marker to the bookings list (`booking_list` view exposes `is_subscriber`: new migration, security INVOKER stays).
- i18n: en + ar strings in `messages.ts`; RTL check. MASAR design system tokens only (`src/ds`), motion tokens only.
- Tests: unit (schema), SQL for any new migration, one Puppeteer e2e (`tests/e2e`, create plan, approve request). Stop for approval.

## Phase C: member side (any signed-in user)
- Show the member's MASAR ID (profile page) with copy button. Require a valid phone on the profile before requesting (RPC already refuses with 22023): inline prompt.
- Public plan browse per company/route (`public_route_plans`), "Request plan" button, my subscriptions page (status pending/active/rejected/cancelled/expired, dates, cancel).
- Booking flow: when the user has an active subscription for the trip's route, offer "Book with subscription"; ask "Returning today?"; if yes load `subscriber_return_options` and require a choice; call `create_my_subscriber_booking`. Show Subscriber marker on my bookings.
- Handle errors by code: 23505 already booked that day, 23514 not valid on that date / no seats, P0002 not found.
- Open question to settle first: a subscriber whose first leg is the RETURN route (lives at the destination). Phase A only treats the plan's own route as "go". Options: allow either side as the first leg (needs a small RPC change) or keep as is.
- Tests: unit, e2e (request, book go+return, cancel).

## Phase D: scanning
- Rotating QR token for the member (like ticket tokens in 0014: store hash only, short TTL, `ticket.qr` style rate limit). New RPC `member_subscription_token(subscription)` and `scan_route_subscription_token(token, trip)`; keep the MASAR ID scan as manual fallback.
- Driver/staff scan screen (assigned trips): shows daily state per member (go done / return done), clear errors (already scanned, no booking, expired).
- Mark the booking's ticket boarded on scan (reuse the boarding RPC/rules from 0014, `boarding_events` append-only). Decide: scan = boarding (recommended).
- Security tests: replayed token, token for another company, driver not assigned, expired subscription, concurrent double scan (lock oracle style).

## Phase E: operations and reporting
- Expiry: `status = expired` is lazy today; add a scheduled job (pg_cron or Edge Function) to flip lapsed rows and send reminders (notifications module).
- Renewal request from the member page; staff revoke of an active subscription (new RPC, audit, what happens to future bookings).
- Reports: active subscribers per plan, scans per day, no-shows (booked, not scanned), revenue per plan; return-intent counts per trip for capacity planning.
- Payment gateway hook point: `route_subscriptions.paid_at` is the single flag; design the provider integration separately.
- Platform admin: usage per company in the MALAKY admin; audit filters already know the new namespaces (`route_plan`, `route_subscription`).

## Known gaps carried from Phase A
- A bare MASAR ID scan is replayable until Phase D token ships.
- Scan does not yet board the ticket.
- Plans are not in `my_plan_usage` yet (Phase B).
- Staff cannot revoke an active subscription (Phase E).
- Cannot add a return seat to an existing outbound booking.
- Booking retry is safe (daily limit) but not an idempotent replay.
- Archiving a route leaves its plans; they disappear from the public list because the route is inactive.
- `route_subscriptions.member_phone` is visible to staff with `bookings.read`.
- Arabic strings for all new UI need native review.

## Working rules for the next chat
- Branch per phase, small commits, end commit messages with the attribution lines from the session.
- Local test run: `tests/run-all-local.sh` (Postgres 16 + PostgREST) and `npx vitest run src`; do not claim live validation.
- Never expose service-role keys; derive company from rows or membership, never from client input.

## Phase C status: DONE (branch feat/route-subscriptions-phase-c)
- Migration `0036_member_subscription_reads.sql` (4 read RPCs, authenticated only). **Apply to live before deploying the code.**
- Pages: `/my-subscriptions`, `/my-subscriptions/plans`, `/my-subscriptions/[id]/book`; link added on `/my-bookings`.
- Tests: SQL suite 32 (1975 pass total), 14 unit tests, e2e `tests/e2e/member-subscriptions.mjs` (17 pass).
- Known gaps: Arabic text is a draft; trip times show in the browser timezone; a member needs a profile phone before requesting; staff revoke (E); rotating QR scan token (D).

## Phase D status: DONE (branch feat/route-subscriptions-phase-d), NOT yet applied to live
- Design change vs. the plan: no separate member token. A subscriber booking already has a ticket whose QR rotates (my_ticket_qr). Migration `0037_subscription_scan_boarding.sql` makes board_ticket also record the daily scan, and makes the MASAR ID fallback (scan_route_subscription) board the ticket under the same window, rate limit and locks.
- Fixed a bug found by tests: a member with two active plans of one company could be matched to the wrong one on a MASAR scan.
- Driver app: subscriber name and direction on success; MASAR ID accepted in the manual field; new messages (subscription not active, already scanned, no subscription, no booking).
- Tests: SQL suite 33 (2001 pass in total), unit 1504, e2e `tests/e2e/subscription-boarding.mjs` (15 pass). Suites 30 and 32 adapted: scanning now needs a trip inside the boarding window.
- Gaps: no staff screen for the MASAR scan (only the driver page); a scan on a trip whose subscription was cancelled is refused but cancelling does not cancel future bookings (Phase E).

## Phase E1 status: DONE (branch feat/route-subscriptions-phase-e), NOT yet applied to live
- Migration `0038_subscription_revoke_and_expiry.sql`: status `revoked` (+ revoked_at/by/reason), `subscription_future_bookings`, `revoke_route_subscription(sub, booking_ids, reason)`, `app_private.expire_route_subscriptions()` scheduled nightly by pg_cron when the extension is available (enable it in Supabase first, otherwise the migration only prints the command to run).
- Revoke rule (decided with the product owner): staff see the member's upcoming bookings and choose per booking: cancel (seat freed) or keep (seat stays held, but cannot be scanned as a subscriber trip). Boarded legs cannot be cancelled. All-or-nothing validation; audited with counts only.
- Dashboard: Revoke button on active rows opens a checklist dialog. Member: Revoked and Expired states, Renew button (re-requests the same plan).
- Tests: SQL suite 34 (2031 pass in total), unit 1512, e2e `tests/e2e/subscription-revoke.mjs` (13 pass).
- Not done (E2): reports (active per plan, scans per day, no-shows, revenue, return intent), platform-admin usage, expiry reminders (no sending channel exists yet), renewal before the end date.

## Phase E2 status (reports and platform usage)

- Migration `0039_subscription_reports.sql` (NOT yet applied to live): `subscription_plan_report`, `subscription_daily_report`, `subscription_trip_demand` (company, need `analytics.read`) and `platform_subscription_usage` (platform staff only).
- Definitions: revenue = price of subscriptions paid (approved) in the range, not refunded on revoke; active = valid today; scans = one boarding per direction per company-local day; no-show = subscriber booking never boarded after departure; return intent = subscribers who chose to return the same day.
- App: `src/features/subscription-reports/*`, page `/dashboard/subscriptions/report`, usage panel on the admin company page.
- Tests: SQL suite 35 (2061 pass, 0 fail), unit 1524+. No e2e script for E2 yet.

## Phase E2 follow-up (gap fixes)

- Trip times on the member screens and the staff report now show in the COMPANY time zone (migration `0040_member_subscription_timezones.sql`, applied to live; member "today" for booking is the company-local day).
- The report's default range is the last 30 days on the company's clock, not the server's UTC date.
- e2e `tests/e2e/subscription-report.mjs` (9 checks: owner report, bad range, booking staff blocked).
- Still open, need a product decision: Arabic review, phone requirement, staff MASAR-ID scan screen, cancel vs future bookings, expiry reminders, renewal before expiry.

## Phase E3 status (renewal before expiry, expiry notices, expiring list)

- Migration `0041_subscription_renewal_and_expiry_notices.sql` (NOT yet applied to live). Rules: a duration plan can be renewed in the last 7 days (`app_private.subscription_notice_days()`); approval starts the new period the day after the current one ends (a second, future-dated active row; fixed-window plans cannot be renewed early). One pending request per plan and member replaces "one open row".
- Member notices: nightly `notify-expiring-subscriptions` (06:00 UTC) writes one in-app notification per ending subscription (member language, once only, skipped if a renewal is pending or queued). Read through `my_notices()` / `mark_my_notices_read()`; shown on /my-subscriptions. "Renew now" shows only when `my_renewable_subscriptions()` says so.
- Staff: "Expiring soon" tab on /dashboard/subscriptions (`subscriptions_expiring()`, bookings.read) with a WhatsApp link carrying a ready message in the member's language. Nothing is sent by the platform.
- Phone before a request: stays required (decision). Arabic text: approved (decision). Driver MASAR-ID scan: already on the driver boarding page (field accepts a ticket code or MASAR ID).
- Tests: SQL suite 36 (2101 pass, 0 fail), unit 1539 pass, e2e `subscription-renewal.mjs` 13/13.
