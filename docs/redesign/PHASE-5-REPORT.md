# Phase 5, journey 1: passenger (search, compare, book, ticket)

Status: built, tested, **awaiting your approval** before journey 2. Nothing is flipped by default: set `DS_SURFACES=marketplace` (or `all`) to see it. Unset = old UI, unchanged.

## What changed
| Area | Change |
|---|---|
| `ds/format` | `formatClock`, `formatDay`, `localDigits` (stored "08:30" and "YYYY-MM-DD", Arabic digits in Arabic, no time-zone shift) |
| `ds/contrast` | `tenantAccent(hex)`: strict 6-digit hex only, white or black text at 4.5:1. Anything else returns null (no CSS injection) |
| `ds/feedback` | `Modal` (native dialog, scrolling body, sticky footer) |
| `ds/domain` | `Ticket`: optional `details`, `footer`, optional `paymentStatus`. `TripCard`: optional operator tile/click, preformatted times, note, price note, low-seats |
| `ui/components/masar/` | `MarketplaceMasarView`, `BookingMasarView`, `TicketMasarView` |
| Wiring | `MasterMarketplace`, `BookingFlowModal`, `DigitalTicketView` each branch on `useDsFlipped()` after all hooks. Booking logic, validation, idempotency key, round-trip, auth gate, ticket fetching and the QR payload are the same code in both looks |

## Verified
- `tsc` clean. `vitest`: 57 files, 1177 tests pass (new: contrast guardrail, clock/day format, three views in en and ar with axe, sold-out blocked, Arabic digits normalised in phone, bad tenant colour never reaches the DOM).
- Real `next build` (real mode, `DS_SURFACES=marketplace`) passes. `tests/bundle-scan.sh`: PASS.
- Real browser (Playwright, mock mode in dev): English and Arabic desktop, English mobile. Full flow results, booking dialog, ticket. No console errors. Screenshots were reviewed by me only.

## Not verified
- axe colour-contrast does not run in jsdom. Token pairs are tested, but pixel contrast in browser was only eyeballed.
- Real mode against Supabase was not run (no project here). Only the build and the shared code path.
- Native date and range inputs show digits per browser locale; the app cannot control it.
- Arabic strings are unreviewed (D10).
- Mock ticket shows the booking reference instead of a QR (old mock showed a fake icon).

## Known gaps
- No hero image (O5). Operator profile modal (`CompanyProfileModal`) is still the old look.
- Price slider is a native range; no tick marks.

## Needs your decision
O5 hero photo, O7 tenant accent, O1 reviewer name.
