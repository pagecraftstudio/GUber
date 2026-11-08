# Bookings page upgrade — report

Scope: dashboard `/dashboard/bookings` only. No deploy, no hosted Supabase, no production change. Milestones M3+ untouched.

## What changed (your 5 points)
1. **Edit amount paid** — new `bookings.amount_paid`. Staff type the amount in the Payment cell. DB derives status: 0 = unpaid, between = partial, total = paid. Quick buttons: "Paid in full", "Refund" (refund sets amount 0, status refunded).
2. **Advanced filtering** — URL-based (shareable, back button works): view (upcoming/past/all), payment, boarding, booking status, route, booked via (web/staff), trip date range, one-trip-only, removable filter chips.
3. **Sort by trip and time** — default: trip departure time, bookings of one trip grouped under a trip header (route, time, trip status). Other sorts: trip latest first, booked newest/oldest, passenger name.
4. **Search** — one box: reference / ticket no. (dash optional), passenger name, phone (spaces, local `01…` or `+20…` all match), e-mail, student ID, university, route, notes.
5. **Indicators** — Payment pill + `paid / total` + progress bar + remaining. Separate Boarding badge: Boarded n/n, Partly boarded, Not boarded (from passenger tickets; void tickets ignored).

## Files
- `supabase/migrations/0032_booking_amount_paid_and_list.sql` (column + CHECK, `set_booking_amount_paid`, `set_booking_payment_status` kept consistent, `booking_list` SECURITY INVOKER view, rollback documented)
- `supabase/tests/28_booking_amount_list_tests.sql`, `tests/integration/bookings-list.int.test.ts`, `src/features/bookings/search.test.ts`
- `src/features/bookings/{types,schema,repository,service,search,filter-url}.ts`
- `src/features/dashboard/{BookingFilters,BookingParts}.tsx`, `actions.ts`, `messages.ts`
- `src/app/dashboard/bookings/page.tsx`, `src/components/dashboard/FlashNotice.tsx`, `src/lib/db/map-error.ts`, `src/features/audit/catalog.ts`
- `src/app/dashboard/customers/[id]/page.tsx` (passes `sort: 'newest'`, keeps old order)
- `tests/run-all-local.sh` (adds suite 24–28 + new integration step)

## Security
- RLS unchanged. View is `security_invoker`: every joined table's RLS applies to the caller. Anon has no access.
- Amount: staff-only (`bookings.write`), company derived from the booking row, bounded `0..total_amount` (immutable), 2 decimals, CHECK constraint as backstop, cancelled bookings take no money, audit entry `booking.amount_paid` (from/to amount + status).
- Search text sanitized; sort/filter values whitelisted by zod; return-URL from forms validated (no open redirect).
- Operations role: sees booking rows, no passenger data (as before).

## Tests run (local scratch Postgres 16 + PostgREST 12.2.12, not live Supabase)
- `tsc --noEmit`: clean
- `vitest run src`: 45 files, 783 tests pass
- SQL suites 02–28: 1788 checks, 0 failed (28 = 32 new checks: amount rules, tenant isolation, boarding counts, role access)
- Integration `bookings-list`: 23 pass (search variants, injection string, tenant B cannot find A, sorts, window, amount flow, ops no passenger data). Baseline services + booking integration still pass on a pristine DB.
- `next build`: OK (dummy env)
- NOT run: browser e2e suites (no Chrome here), `bundle-scan.sh`, live Supabase.

## Heads-up / decisions for you
- **Old "partial" bookings**: no amount was ever recorded, so after migration they stay `partial` with `amount_paid = 0`. Staff must enter the real amount. Old "paid" became amount = total.
- Single editable amount, not a payment ledger. `booking_payments` table still unused. Ledger later = separate decision (history of each payment, who took it).
- Search over joined columns uses `ilike` without a trigram index: fine at current scale, revisit at tens of thousands of bookings per company.
- Group header shows route/time/trip status only (no per-trip totals), because a trip can straddle two pages.
- Apply with `scripts/db/apply-migrations.sh` to staging first. Not applied anywhere.
