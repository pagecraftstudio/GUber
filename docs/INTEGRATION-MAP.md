# Integration Map (frontend <-> backend)

Status: UI mounted at `/` (client-only; real backend, mock only in dev). Backend = Phase 5A (migrations 0001-0011). NOT wired yet. Nothing tested on live Supabase.

## Layout
- `src/ui/` Vite SPA, mock `localStorage` (`lib/transportService.ts`, `lib/authService.ts`)
- `src/app/(marketplace)` mounts it at `/`, `/login`, `/register`, `/my-bookings`. `/app/*` redirects to `/`. `ENABLE_UI_PREVIEW` is no longer used: in real mode the super-admin view renders NotAvailableYet and mock data is refused at build time. The company dashboard exists only as the Next.js area `src/app/dashboard` (real services + RLS); the old mock-era client dashboard (`src/ui/components/dashboard/*`) was deleted in M2 and the client app's `dashboard` view now just links to `/dashboard`.
- Backend: `supabase/migrations`, `src/lib`, `src/app` (company/login, dashboard, admin, driver)

## Model mismatches (fix when wiring)
| Frontend | Backend | Action |
|---|---|---|
| trip `in_transit` | `in_progress` | map in adapter |
| booking `boarded`, `cancellation_requested` | not in 5A | Phase 6/7 RPCs |
| plan `growth` | `professional` | rename/map |
| `canonicalLocation` | no table | decide |
| seat numbers | count only (Q1) | drop UI seat picker |
| marketplace cross-tenant list | none | needs public RPC |
| client 15% discount | server fare authoritative | server computes |
| mock tokens | backend opaque tokens | use RPC |
| ticket / boarding / website publish RPCs | not in 5A | later phases |

## Next
Replace mock services with Supabase repositories/RPCs, one module at a time. Phase 6 not started.

## Update: customer slice (migrations 0013 + 0013b) and tickets/boarding (0014)
Legend: **L** = SQL + HTTP tested locally (real PostgreSQL/PostgREST). **B** = also driven in a real browser against the local backend (Auth = GoTrue STUB). **Live** = live Supabase (nothing has been).

| UI operation | Backend | Status |
|---|---|---|
| sign in / up / out / reset | Supabase Auth (browser client, cookie session) | B against the stub only; **Live: not tested**. Reset/email delivery not exercised. |
| trip search | `public_search_trips`, `public_trip_stops` | L + B |
| create booking | `create_my_booking` (0013b: idempotent, lock-ordered) | L + B (parallel HTTP retries, over-capacity race) |
| my bookings | `my_booking_details` (incl. `can_cancel`) | L + B (isolation, refresh) |
| cancel booking | `cancel_my_booking` — **immediate** inside the window, no pending state; UI "Cancel Booking" | L + B (window, repeat, release-once) |
| profile read/update | `customers` own_select, `update_my_customer` | code only |
| my tickets + QR | `my_tickets`, `my_ticket_qr` (0014; fresh hash-only token per open) | L + B |
| driver trips / stats / boarding | `driver_my_trips`, `driver_trip_boarding`, `board_ticket` (0014), page `/driver` | L + B (camera path not exercised) |
| staff manual boarding, offline sync, GPS | none | NOT IMPLEMENTED |
| operator-reviewed cancellation request | none | NOT IMPLEMENTED (would need new status + staff RPCs) |
| website drafts / publish | none | NOT IMPLEMENTED |
| company dashboard: routes + stops, buses, drivers, trips | `save_route_stops`, `my_plan_usage` (0024) + existing RLS/CRUD, pages under `src/app/dashboard` | L + B (`e2e/dashboard-m2.mjs`, SQL suite 20) |
| plan-limit messages in dashboard forms | `my_plan_usage` (read) + DB triggers (enforcement) | L + B |
| company users page: members, role change, suspend / reactivate, invitations | `set_member_role`, `set_member_status` (0025), `create_invite`, `revoke_invite` (0007), RLS reads; page `/dashboard/users` | L + B (`e2e/dashboard-users.mjs`, SQL suite 21). Invite link is shown once; email delivery is not exercised. |
| Drivers <-> Team sync: invite a login for a driver record, link an existing member, role/status kept in step | `invite_driver`, `link_driver_login`, triggers `driver_invite_needs_record` / `link_driver_on_member_insert` / `keep_driver_in_step` (0026); pages `/dashboard/drivers` (Login column) and `/dashboard/users` | L + B (SQL suite 23, `e2e/dashboard-drivers-team.mjs`). Email delivery of the invite link is not exercised. |
| Trips: one next-step button (draft → scheduled → boarding → on the road → completed), separate Cancel, Delete for drafts, no overlapping trips for a bus or driver (drafts included, 30 min turnaround) | `transition_trip`, `delete_draft_trip` (0011); exclusion constraints `trips_bus_no_overlap` / `trips_driver_no_overlap` now cover drafts (0027); page `/dashboard/trips` | L + B (SQL suites 06 and 23, `e2e/dashboard-trips.mjs`). Delete is only for drafts that never had a booking (database rule); other trips are cancelled. |
| route create with stops | `create_route_with_stops` (0025): route + stops in one transaction | L + B (SQL suite 21, `e2e/dashboard-users.mjs`) |
| customers (list/search/detail), company settings, trips/new | existing RLS on `customers` / `company_settings` / `trips`, `transition_trip` (rule messages on status change) | L + B (`e2e/dashboard-pages.mjs`, SQL suite 22) |
| team-size limit message | `my_plan_usage` (read); `max_users` is enforced when an invite is ACCEPTED (insert into `company_users`), not when it is created | L + B |
| super admin, other pages | none | real mode throws `NotIntegratedError` (never mock data) |

Blocked by external config: live Supabase project/keys, Auth email + redirect URLs, SMS provider for phone claim, custom domains, Vercel.


## Phase 7.1 - platform security foundation (migration 0015)
- Platform staff (incl. super_admin) can no longer INSERT/UPDATE `companies`, `subscriptions`, `invoices`, `payments`,
  `platform_users`, `plans`, `plan_entitlements`, `entitlement_definitions`, `company_notes` through the API
  (policies dropped AND privileges revoked). Reads (`platform_select`) are unchanged. Changes arrive as audited
  SECURITY DEFINER RPCs in 7.3/7.4. Platform roles are still granted only by `supabase/bootstrap/first_super_admin.sql`.
- Known, accepted gap until Phase 12: direct super_admin writes to `domains` remain.
- The last active super_admin cannot be demoted, deactivated or deleted (trigger on `platform_users` and `profiles.is_active`).
- A subscription counts as live only while `current_period_end > now()` (`app_private.live_subscription`).
  Expired = no NEW users/buses/drivers/routes/trips/bookings; reads keep working; only suspension locks a company out.
- Helpers for admin RPCs: `app_private.assert_platform(roles[])`, `app_private.audit_platform(...)`.
- `companies.contact_name` = responsible person (not exposed through `my_company`).
