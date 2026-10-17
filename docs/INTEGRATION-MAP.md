# Integration Map (frontend <-> backend)

Status: UI mounted at `/app` (client-only, mock data). Backend = Phase 5A (migrations 0001-0011). NOT wired yet. Nothing tested on live Supabase.

## Layout
- `src/ui/` Vite SPA, mock `localStorage` (`lib/transportService.ts`, `lib/authService.ts`)
- `src/app/app/[[...slug]]` mounts it. Production: 404 unless `ENABLE_UI_PREVIEW=true` (UI has fake super-admin).
- Backend: `supabase/migrations`, `src/lib`, `src/app` (login, dashboard, admin)

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
