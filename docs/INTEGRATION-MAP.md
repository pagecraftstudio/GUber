# Integration Map (frontend <-> backend)

Status: UI mounted at `/` (client-only; real backend, mock only in dev). Backend = Phase 5A (migrations 0001-0011). NOT wired yet. Nothing tested on live Supabase.

## Layout
- `src/ui/` Vite SPA, mock `localStorage` (`lib/transportService.ts`, `lib/authService.ts`)
- `src/app/(marketplace)` mounts it at `/`, `/login`, `/register`, `/my-bookings`. `/app/*` redirects to `/`. `ENABLE_UI_PREVIEW` is no longer used: in real mode the dashboard/super-admin views render NotAvailableYet and mock data is refused at build time.
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
| dashboard, super admin, other pages | none | real mode throws `NotIntegratedError` (never mock data) |

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
