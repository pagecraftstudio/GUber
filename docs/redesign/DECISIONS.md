# MASAR redesign: decision log

Source: redesign plan, Appendix F. Reviewer and designer lines are blank on purpose.
Phase 0 and Phase 1 cannot exit while they are empty.

| Item | Value | Date | Recorded by |
|---|---|---|---|
| D1 Product name | Rename to MASAR. "Powered by MALAKY Studio" quiet footer only | 9 Nov 2026 | Owner |
| D2 Logo master | Stacked bilingual lockup, reference `Minimalist Masar Bilingual Logo.png` | 9 Nov 2026 | Owner |
| D3 Fonts | IBM Plex Sans Arabic + IBM Plex Sans | 9 Nov 2026 | Owner |
| D4 Dark mode | After light-mode approval. Built in Phase 7 (14 Nov 2026), owner to review | 9 Nov 2026 | Owner |
| D5 Company branding | Public site, company tile, ticket accent only. MASAR chrome stays MASAR | 9 Nov 2026 | Owner |
| D6 Numerals | Localised by language, identifiers stay Latin | 9 Nov 2026 | Owner |
| D7 Browsers | Evergreen (current and previous major) | 9 Nov 2026 | Owner |
| D8 Route line | Keep, functional only | 9 Nov 2026 | Owner |
| D9 Rollout | Per-route migration | 9 Nov 2026 | Owner |
| D10 Arabic reviewer | Named human required | 9 Nov 2026 | Owner |
| **Arabic copy reviewer (O1)** | **Name: ____________  Scope: UI terminology and strings** | | |
| **Arabic logo and type reviewer (O1)** | **Name: ____________  Scope: spelling, joins, dots of vector master** | | |
| Logo designer (O6) | Name: ____________ | | |
| Approved vector master | File and version: ____________ | | |
| English wordmark final settings | Family IBM Plex Sans, weight ____, tracking ____, live text or outlined ____ | | |
| O2 to O5, O7 | Answers: ____________ | | |
| Font verification (5.5) | Pass, or fallback and why | | |
| Gate G1 (light approved) | Signed by: ____________ | | |
| Phase 2 deviations (naming `--ds-*`, `brand-*`; bridge via `--bridge-*`; marketplace flag at build time) | Pending owner approval, see PHASE-2-REPORT.md | | |
| Phase 3 validation change (5.7 rule 6): `normalizeDigits` into amount, seats, student ID, plate, search, form `num()`; phone and amount reuse it | Applied on the instruction "Start Phase 3". Owner to confirm. Files listed in PHASE-3-REPORT.md | 9 Nov 2026 | Claude |
| Phase 3 `next.config.ts` change: `env.DS_GALLERY` build-time switch so the gallery is not compiled into production | Pending owner approval | 9 Nov 2026 | Claude |
| Phase 3 dev dependencies: jsdom, @testing-library/react, @testing-library/dom, @testing-library/user-event, axe-core | Pending owner approval (dev only, nothing ships) | 9 Nov 2026 | Claude |
| Phase 4: old shells kept (not deleted) and chosen per surface by `isSurfaceScoped`; old class-name tests in `rtl.test.ts` left as they are | They still test code that still ships. Convert or delete with the old shells in Phase 6 | 10 Nov 2026 | Claude |
| Phase 4: fake search box dropped from the dashboard topbar (the product has no search); theme toggle kept on dashboard and marketplace so nobody is stuck in unsigned dark (D4/O4) | Owner to confirm | 10 Nov 2026 | Claude |
| Phase 4 Arabic footer wording "بدعم من MALAKY Studio" and shell chrome Arabic | Unreviewed until O1 reviewer signs (D10) | 10 Nov 2026 | Claude |
| Phase 5 J1: flipped views are drawn by new `ui/components/masar/*` components; data loading, validation, idempotency keys and the QR payload stay in the old components and are shared. No logic was copied | Owner to confirm | 10 Nov 2026 | Claude |
| Phase 5 J1: no hero photograph on the marketplace (O5 open); the search card sits on a plain surface | Add the image when O5 is answered | 10 Nov 2026 | Claude |
| Phase 5 J1: tenant colour only on the company tile and ticket header, through `tenantAccent` (strict hex, 4.5:1). Buttons stay MASAR (the old per-company Book button colour is dropped in the flipped view) | Owner to confirm (D5) | 10 Nov 2026 | Claude |
| Phase 5 J1: ds `Ticket`/`TripCard` got optional props only; `paymentStatus` on `Ticket` is now optional | Existing tests unchanged | 10 Nov 2026 | Claude |
| Phase 5 J1 Arabic strings reuse existing keys; a few new inline Arabic strings (pagination, quick-date label) | Unreviewed until O1 reviewer signs (D10) | 10 Nov 2026 | Claude |
| Phase 5 J3: new `network` error class in `driverApi` (message: scan was not recorded) and a Try again that re-sends the same code | Additive; coded database errors classify exactly as before. Owner to confirm wording | 10 Nov 2026 | Claude |
| Phase 5 J3: `/dev/driver-preview` (fake data, dev and Vercel preview only) so the boarding screen can be judged on a real phone without a login | Gated like /dev/design; bundle scan checks the marker | 10 Nov 2026 | Claude |
| Phase 5 J3: driver screens stay English (no Arabic copy exists), so digits are Latin | Arabic driver UI needs copy and the reviewer (O1) | 10 Nov 2026 | Claude |
| Phase 5 J4: admin dates shown as "5 October 2026, 09:00 UTC" (long month, explicit UTC), not dd/mm/yyyy | Platform staff read dates across locales; 05/10 is ambiguous. The old admin used ISO | 11 Nov 2026 | Claude |
| Phase 5 J4: `buttonClass` moved to `ds/primitives/button-class.ts`; `Pagination` takes `hrefBase` + `hrefParams` | A helper exported from a client file crashed server components; a function prop cannot cross server to client. Guard tests added | 11 Nov 2026 | Claude |
| Phase 5 J4: J2 filter chips now say "Remove filter: X" (was "Clear all: X") | One-chip removal was announced as clear-all | 11 Nov 2026 | Claude |
| Phase 5 J4: `/dev/admin-preview` (fake data, dev and Vercel preview only) | Same gating as the other dev pages; bundle scan checks the marker | 11 Nov 2026 | Claude |
| Phase 0 (done late, 12 Nov 2026): safety baseline recorded from the pre-redesign build: `tsc` clean, 45 test files / **787 tests pass**, `next build` passes (27 pages) | See PHASE-0-REPORT.md | 12 Nov 2026 | Claude |
| Phase 0: "before" screenshots, 158 images, `docs/redesign/baseline/` (README lists what is and is not covered) | Stored | 12 Nov 2026 | Claude |
| Phase 0: copy and terminology sheet, 907 EN/AR rows, `MASAR-Terminology-Sheet.md` and `.csv` | **NOT APPROVED**: needs the named Arabic reviewer (D10) | 12 Nov 2026 | Claude |
| N2 footer placement, N5 admin English-only, N6 interim dark toggle | Built as the plan recommended (Phase 4, Phase 5 J4, Phase 4). Owner to confirm | 12 Nov 2026 | Claude |
| **N4 Arabic reviewer name (hard gate)** | **STILL BLANK. Phase 0 and Phase 1 cannot exit until filled** | | |
| Brand assets (12 Nov 2026): provisional set derived from the uploaded PNGs: SVG (auto-traced), transparent PNG in 3 tones, favicon/PWA/maskable/apple icons, 2 OG images, manifest. In `public/brand`, originals in `docs/brand-source`. favicon, icon, apple-icon wired by Next file convention only | **Not the approved master.** Designer (O6) and Arabic reviewer (O1) still unnamed. 16 px favicon does not read | 12 Nov 2026 | Claude |
