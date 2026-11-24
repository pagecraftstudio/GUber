# P7b slice C: driver screens (NOT RUN)

Stacks on slice A (migration 0060: `driver_trip_manifest`, `driver_end_trip`, `driver_my_profile`) and slice B (Arabic shell, `driver-text.ts`, language cookie). Apply A, then B, then this.

## Screens

| Route | Screen | Data |
|---|---|---|
| `/driver` | **Today**: "still open" (past days, not ended), today, upcoming | `driver_my_trips` (existing) |
| `/driver/trips/[id]` | **Trip manifest** + **End trip** (confirm dialog) | `driver_trip_manifest`, `driver_end_trip` |
| `/driver/boarding` | Boarding (moved from `/driver`; `?trip=<uuid>` preselects an assigned trip) | existing |
| `/driver/profile` | **My profile** with licence-expiry warning (expired, 0-30 days, none on file) | `driver_my_profile` |
| `/driver/inbox` | **Inbox** tab, full page version of the bell | `my_inbox`, `mark_my_notices_read` (0053) |

Bottom tab bar (`DriverNav`): Today, Boarding, Inbox, Profile. Arabic default, RTL, digits and dates via `ds/format`, all wording in `driver-screens-text.ts`.

## Rules kept

* No company id, driver id or user id leaves the browser. A trip id is only a target; the database answers "not your trip" identically for unknown and foreign ids.
* The End button mirrors the server rules (open status, after departure) only to save a tap. The server decides; its refusal is shown in the driver's language.
* The manifest shows name, seats, boarded count, subscriber marker, stops, booking reference. No phone, email, price or payment (and the RPC does not return them).
* Ending is one call. A repeat tap on an ended trip is answered "already ended" (`changed: false`).

## Changed files that are not new

* `src/app/driver/layout.tsx`: tab bar + room under the content.
* `src/app/driver/page.tsx`: now Today (the boarding screen moved to `/driver/boarding`).
* `src/features/driver/DriverBoarding.tsx`: optional `initialTripId` (used only if it is one of the driver's own trips).

## Known gaps / decisions for you

1. **Boarding moved** from `/driver` to `/driver/boarding`. Anything that links to `/driver` expecting the scanner (e2e tests, QR/bookmark instructions given to drivers) now lands on Today. Check `homePathFor`, the proxy/middleware allow-list and e2e for `/driver/*` sub-paths: not visible to me.
2. **No failure telemetry** for the new calls: `reportOperationFailure` takes a closed `Operation` list that the server schema pins. Adding `driver.*` there is a separate change.
3. **Photo** (`photo_media_id`) is not shown: no media URL resolution for drivers exists yet.
4. **Rating** is absent by design (P7c).
5. **Inbox tab has no unread badge** (the header bell has one). Easy add once you want it.
6. **Arabic wording unreviewed** by a native reviewer (same status as slices B and D10/O1).
7. **Offline**: screens show an offline banner (Today) and error states; cached read-only manifest is slice D.

## Verification status

Written without a checkout: **not type-checked, tests not run.** Done here: TS/TSX syntax check of every file, and the pure logic (copy functions incl. Arabic plurals, `licenseState`, `classifyScreenError`, `groupTrips`) executed in Node against a stand-in for `ds/format`. Run before approving:

```
npm run typecheck
npx vitest run src/features/driver src/ds/shell
```
