# P7b slice D: installable driver app + offline passenger list

Stacks on slice C. Verified here: `tsc` clean, `vitest` 121 files / 2181 tests, `next build`, and the three static files probed on a production server (200, no redirect, no Set-Cookie, correct content types). **Not verified: an install on a real phone, a real offline start, iOS.** Do those before approving.

## What was added

| File | Purpose |
|---|---|
| `public/driver.webmanifest` | Installable app: `start_url` and `scope` `/driver`, standalone, Arabic RTL, the four existing brand icons, two shortcuts (Today, Boarding). |
| `public/driver-sw.js` | Service worker, scope `/driver`. Offline page + icons precached; `/_next/static` and `/brand` cache-first; a navigation inside `/driver` with **no network** gets the offline page. Nothing else. |
| `public/driver-offline.html` | Static, bilingual, no script, no network. |
| `src/features/driver/DriverPwa.tsx` | Registers the worker (production only, silent on failure). |
| `src/features/driver/manifest-cache.ts` | Offline copy of ONE trip's passenger list: per user id, 12 h, one entry, only drawn fields, wiped on sign-out and when the trip ends. |
| `src/features/driver/ClearOfflineOnSignOut.tsx` | Wipes the copy when the sign-out form is submitted. |
| `DriverTripManifest.tsx` | Saves the copy after a live load of an OPEN trip; on a **network** failure shows the copy read-only with a warning banner; End trip disabled while showing a copy. |
| `src/proxy.ts` | Matcher now also skips the three static files (no session refresh, no cookies on a worker or manifest). |
| `src/app/driver/layout.tsx` | Manifest link, Apple web-app meta, theme colour (from the token mirror), `<DriverPwa />`. |

## Rules kept

* **The worker never caches HTML, RSC payloads, Supabase or API responses, and never answers a scan, boarding or end-trip call.** Boarding stays online-only on purpose.
* The three files live at **root-level paths**: everything under `/driver` needs a session and a manifest/worker fetch has none.
* A server refusal (not your trip, signed out) **never** falls back to a copy; only "the request never reached the server" does.
* Passenger data at rest: names, seats, stops, booking reference only; keyed to the signed-in user; 12 h; one trip.

## Known gaps / decisions for you

1. **No custom install button.** Android Chrome shows its own prompt; iOS needs Share, Add to Home Screen. A small hint on the profile screen is easy to add.
2. **The offline copy is in `localStorage`, readable by anything running on this origin.** Chosen over `sessionStorage` because an installed app that is killed in a tunnel loses `sessionStorage`. If you prefer the stricter option, change `browserStore()` in one place.
3. **Signed-out start of the installed app** lands on `/company/login`, which is outside the app scope, so some phones show a browser bar there. Fine functionally.
4. **A worker update applies the next time the app is opened** (no `skipWaiting`, so a screen is never swapped mid-scan). Bump `VERSION` in `driver-sw.js` when it changes.
5. **Manifest name is Arabic only** (a static file cannot follow the language cookie).
6. **Web push is out of scope** (waits for the notification work). The inbox and bell already cover in-app notices.
7. The manifest `<link>` and Apple meta are emitted by the signed-in driver layout; I could only confirm them by type-check and build, not by loading a signed-in page.
