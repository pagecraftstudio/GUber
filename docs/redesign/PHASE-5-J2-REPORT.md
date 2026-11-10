# Phase 5, journey 2: company (overview, trips, bookings)

Status: built and tested in code, **awaiting your approval**. Not viewed in a browser (the dashboard needs a login). Off by default: set `DS_SURFACES=dashboard` (or `all`), or `DS_PILOT_COMPANIES=<uuid>` for one company. Unset = the old screens, unchanged.

## What changed
| Screen | New look | Same as before |
|---|---|---|
| Overview | `OverviewMasarView`: 3 metrics (trips today, seats booked today, unpaid upcoming bookings), next 5 departures, modules the role can open | Permissions: a metric the role cannot read is absent, never a made-up zero |
| Trips | `TripsMasarView`: period tabs, URL filters, quick date ranges, chips, day groups, DataTable, status badges, pagination | Same query, same filter validation, same `TripActions` server actions (advance, cancel, delete) |
| Bookings | `BookingsMasarView`: period tabs, URL filters, trip groups, DataTable, boarding badge | Same query, same `autosave-actions` (amount paid, paid in full, refund, cancel) |
| Shared | `UrlFilterBar` (plain GET form, works without JS, chips are links), `TripActionsMasar`, `BookingCellsMasar`, `PageHeaderMasar`, `text.ts` | Pages branch on `isSurfaceScoped('dashboard', companyId)` after all data work, so no query, guard or permission changed |

Cancel booking, cancel trip and delete draft now use the one `ConfirmDialog` (destructive tone focuses Keep first). Autosave uses the ds `AutoInput` / `SaveStatus` with the existing error wording.

Two small edits to old files: `SaveStatus.tsx` exports `EXTRA` and `BookingParts.tsx` exports `TXT`, so the new screens reuse the existing wording instead of copying it.

## Verified
- `tsc` clean. `vitest`: 58 files, **1205 tests** pass (+28: 20 in `masar.test.tsx`, plus the earlier set).
- New tests, English and Arabic with axe (serious/critical = none): clock shows company-time in the language's digits; plates, references and phones stay Latin left-to-right; one next-step button per trip; read-only roles see no actions; cancel trip asks first, Keep does nothing, Yes submits the same action with the trip id; cancel booking likewise; amount autosaves on blur and Arabic-Indic digits arrive as Latin ("١٥٠" saves "150"); paid in full calls the payment action; restricted customer data shows "Restricted"; filters are a GET form that keeps the view, a chip removes exactly one filter; overview hides unreadable metrics and shows a real zero as zero.
- `next build` with `DS_SURFACES=all` passes; `tests/bundle-scan.sh` PASS.

## Not verified
- **Nothing was seen in a browser.** The dashboard is behind login and there is no mock auth here. Layout at 320 to 1440, RTL, sticky headers, the dialog on a phone: unchecked.
- **Real Supabase**: the data code is the old code, but the new overview queries (today's trips, upcoming unpaid count) have not run against a real project.
- Rendered colour contrast (jsdom cannot).
- Row actions inside the dashboard shell with a real session.

## Decisions and deviations
1. **No trend chart on the overview.** The plan asks for one. No aggregate query exists, and a chart from 100 loaded rows would mislead. Needs a small read-only SQL view first (your call: add it, or drop the chart).
2. **Overview figures are capped.** "Trips today" and "seats today" read at most 100 trips of today; a company with more would under-count. Unlikely, but not guarded.
3. **"Unpaid" counts upcoming trips only** (labelled). A lifetime count would be a different, larger number.
4. **Row actions are rendered twice in the DOM** (table and stacked card list; CSS shows one) because of how the Phase 3 `DataTable` works. Each copy has its own state. Harmless, but heavy for pages with many rows. Worth fixing in `DataTable` before journey 3.
5. **Filters are a form with an Apply button**, not instant. The old filters were also submit-based; this keeps URL state simple.
6. **Trip prices shown as plain numbers**, as before; the trip record carries no currency.
7. **Arabic is a draft** for the reviewer (O1/D10), in `masar/text.ts`. Filter labels "Bus", "Driver", "Source", "Booked via" and the trip status names in the filter are English only in the Arabic view, because the old pages had no Arabic for them either. Fix with the reviewer.
8. Customers, routes, buses, drivers, users, website, settings are **not** part of this journey. They stay on the old look (bridged colours only).

## Needs your decision
- Chart: add the SQL view, or drop it?
- Fix `DataTable` double rendering now?
- Who looks at this in a browser, and on which company?
