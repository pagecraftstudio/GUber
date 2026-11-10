# Phase 5, journey 3: driver (assigned trips and boarding)

Status: built, tested, **awaiting your approval** and the real-phone field test. Off by default: `DS_SURFACES=driver` (or `all`), or `DS_PILOT_COMPANIES=<uuid>`. Unset = the old screen, unchanged.

## What changed
| Area | Change |
|---|---|
| `features/driver/masar/DriverBoardingMasarView.tsx` | New screen. Trip picker as 64px cards (hidden when there is one trip), trip detail with the real route line and times, three large figures plus a progress meter in the brand colour, one big result panel (success / already boarded / error), camera, manual code field, scan button pinned at the bottom (56px). Opening the camera scrolls it into view. A short vibration marks each result where the phone has a motor |
| `DriverBoarding.tsx` | All behaviour stays here and is shared by both looks. Rendering branches on `useDsFlipped()` after every hook. Added: reload after a load failure, last-code memory for Try again, online/offline listener |
| `driverApi.ts` | New error class `network` (no database code and a fetch-failure message): "No connection. Check your signal, then try again. This scan was not recorded." Coded errors classify exactly as before |
| `app/driver/layout.tsx`, `PageTitle.tsx` | Layout gives the flag to client components; the page heading is drawn once (old: by the page, new: by the view) |
| `ds/domain` `OccupancyBar` | Optional `tone="action"` (brand colour) for progress |
| `/dev/driver-preview` | Dev and Vercel-preview page with FAKE data and a state switcher (trips, loading, empty, load error, offline). Type `dup`, `bad` or `net` as the code to see those results. The camera is real. Bundle scan checks that it is absent from production |

Not changed: `board_ticket` and the other RPCs, what is sent to them, the QR scanner code, auth, RLS. The driver id and company id are still never sent by the client.

## Verified
- `tsc` clean. `vitest`: 59 files, **1225 tests** pass (J2: 1205). 20 new: 13 behaviour tests of the screen on a faked API, 7 on error classification.
- Behaviour tests cover: skeleton then trips, selection and stats, good scan (message, figures, meter, vibration, field cleared), already-boarded warning, invalid ticket as an assertive error with no retry, no signal then Try again re-sends the same code, **no double submit while a scan is in flight**, camera hit boards through the same path, offline notice on and off, load failure retry, empty list, single trip, old screen unchanged when not flipped, e2e hooks kept (`#manual-code`, `stat-*`, `scan-outcome`), axe (no serious or critical) with a result and the offline banner showing.
- `next build` passes; `tests/bundle-scan.sh` PASS (new check for the preview marker).
- **Real browser** (Playwright, Chromium headless, on `/dev/driver-preview`): 375, 320 and 1280 wide; no horizontal scroll; no console errors; every real control is 44px or taller (scan 56, fields and buttons 48; only the preview's own state switcher is 36); camera opens and scrolls into view with a fake video feed. I reviewed the screenshots and fixed four things they showed (destination truncated, grey progress bar, retry squeezed beside the message, date and status shown twice).

## Not verified
- **Real phone, sunlight, throttled connection** (the plan's exit for this journey). Nothing here replaces it. Use `/dev/driver-preview` on a Vercel preview for the first look.
- **A real QR scan.** The browser test used a fake camera feed that carries no QR code. Decoding (BarcodeDetector and jsQR on iOS Safari) is unchanged code and was not exercised.
- **Real Supabase and the real `/driver` page** behind a driver login. The real component is tested with a faked API; the preview renders the same view with fake data.
- iOS Safari (safe-area padding, sticky bar, camera permission prompt), vibration (iOS does not support it), rendered colour contrast outside jsdom.
- Arabic: not applicable, see below.

## Decisions and notes
1. **No offline queue.** The plan asks for offline and poor-network messaging, not offline boarding. A scan that does not reach the server is not saved, and the screen says so. A queue would be a separate task and a security question (tokens held on the phone).
2. **Driver screens are English only**, as today (no Arabic copy exists), so digits are Latin. Arabic needs copy and your reviewer (O1).
3. **Times show in the phone's time zone**, as the old screen did. The trip row has no company time zone. If a driver travels or a phone clock is wrong, the time is wrong; say if you want company time.
4. **Vibration is new behaviour** (60 ms on success, a double pulse otherwise). Easy to remove.
5. **Camera auto-scroll** is new behaviour: opening the camera scrolls it to the middle of the screen.
6. The shell's page padding and sticky offsets were not changed. The J2 `DataTable` double rendering is still open (the driver screens do not use it).

## Needs your decision
- Approve J3, or list what you saw on the phone.
- Company time zone for driver times: yes or no?
- Fix the `DataTable` double rendering before journey 4, or leave it for Phase 6?
