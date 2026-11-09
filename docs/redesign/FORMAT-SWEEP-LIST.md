# Format sweep list (D6, plan 5.7)

Produced in Phase 3 by searching for `toLocale*`, `Intl.*`, `en-US`, `en-GB`, `ar-EG`. **Not swept yet on purpose**: changing these on an unflipped surface would switch its digits before its look (D9). Each is replaced when its surface or route is migrated. Stored values never change.

| # | File | What it does now | Becomes | Phase |
|---|---|---|---|---|
| 1 | `components/dashboard/T.tsx` `Dt` | date/time, Arabic uses `nu-latn` on purpose | `formatDate` / `formatDateTime`. **Test that asserts Latin digits is updated, with the reason** | 4 (dashboard) |
| 2 | `features/dashboard/DayHeading.tsx:12` | weekday heading, `ar-EG-u-nu-latn` | `formatDate` long style plus weekday (add `weekday` option when migrating) | 5 (trips) |
| 3 | `features/dashboard/UsersPanel.tsx:55` | invite expiry | `formatDateTime` | 6 |
| 4 | `features/dashboard/DriverLogin.tsx:25` | pending expiry | `formatDateTime` | 6 |
| 5 | `features/driver/DriverBoarding.tsx:9` | boarded-at, browser locale | `formatDateTime` | 5 (driver) |
| 6 | `components/admin/StatCard.tsx:13` | metric number | `formatNumber` | 4 (admin) |
| 7 | `components/admin/AdminPagination.tsx:23` | total and page numbers, `en-US` | `Pagination` + `formatNumber` | 4 (admin) |
| 8 | `app/admin/plans/page.tsx:17,49,50` | limits, prices | `formatNumber`, `formatMoney` | 5 (admin) |
| 9 | `app/admin/audit-logs/page.tsx:58` | summary count | `formatNumber` | 6 |
| 10 | `ui/components/superadmin/SubscriptionsManager.tsx:51` | monthly fee | `formatMoney` | 6 |
| 11 | `ui/components/superadmin/PlatformOverview.tsx:85` | MRR | `formatMoney` | 6 |
| 12 | `ui/components/customer/CustomerPortal.tsx:822` | account created date | `formatDate` | 6 |
| 13 | `ui/components/public/DigitalTicketView.tsx:245` | boarded time | `formatTime` | 5 (ticket) |
| 14 | `ui/lib/demoDefaults.ts:26-29` | demo day labels | `formatDate`, or drop with the demo | 5 |
| 15 | `ui/lib/mock/transportService.mock.ts:568` | mock text | delete with the mock | 6 |

**Stay as they are (they compute, they do not display):** `ui/lib/real/adapters.ts:22` (`en-CA` date parts), `features/trips/day-groups.ts:6` (`en-CA` grouping) and `:57` (`en-GB` HH:mm used as a value; check whether it is shown before keeping), `features/companies/schema.ts:9` (time-zone validity check). The Phase 6 CI guard needs an allow-list for these four, each with its reason.

Not in this list because they are not number formatting: `normalizePhone`, booking-reference search, QR payload.
