# Redesign Phase 4: Shells

**Status: PARTIAL. All four shells are built, wired behind `DS_SURFACES`, and pass unit, behaviour and axe (jsdom) tests, typecheck, build and bundle scan. Nothing was viewed in a real browser, and no surface is switched on by default.**

## Verified here
| Check | Result |
|---|---|
| `tsc --noEmit` | clean |
| `vitest run` | 56 files, 1158 tests pass (Phase 3: 55 files, 1087). The existing 843 are untouched and green |
| `next build` + `tests/bundle-scan.sh` (with `DS_SURFACES=all`) | pass |
| Dev SSR, `DS_SURFACES=marketplace` | `/` returns 200 and carries `data-ds="masar"` |
| Dev SSR, nothing flipped | `/` returns 200 and has no `data-ds` (old path unchanged) |
| axe on all shells (dashboard en/ar, admin, driver, marketplace header en/ar) | no serious or critical violations (colour-contrast off in jsdom) |

## What was built (`src/ds/shell`)
| File | Purpose |
|---|---|
| `ShellFrame.tsx` | Sidebar 264, collapses to 72; 36px rows; active row = surface step plus 2px start-edge bar; topbar 56; mobile drawer (native dialog); skip link; `--shell-band` offset for the admin band |
| `DashboardShellMasar.tsx` | Same contract as the old shell: cookie and `localStorage` language (`malaky-dashboard-language`), theme (`malaky-dashboard-theme`), `<html lang dir dark>`, permission-driven nav (`visibleNav`), `FlashNotice`, `#main-content`. Topbar: company and current section, language, theme, account menu |
| `AdminShellMasar.tsx` | Same frame plus a dark full-width **Platform** band ("Changes here affect every company."). English, no language toggle (the admin has no Arabic) |
| `DriverShellMasar.tsx` | Top bar only, no sidebar, 44px sign-out, safe-area aware |
| `MarketplaceHeaderMasar.tsx` | Lockup, existing links, language, **one** button (Register), log in as a text link, account menu when signed in, mobile drawer. `QuietFooter`: one line |
| `AccountMenu.tsx`, `SkipLink.tsx`, `flag.tsx`, `text.ts` | Disclosure menu (Escape closes and restores focus, outside click closes); skip link; server-to-client flag; shell strings |

**Wiring:** `app/dashboard|admin|driver/layout.tsx` choose the shell with `isSurfaceScoped`. `MarketplaceHeader` and `MasterMarketplace` branch on `useDsFlipped()` (set by the marketplace layout). Unflipped = the old components, as before.

**Footer (O3 as proposed):** MASAR pages end with "© year MASAR · Powered by MALAKY Studio". The mock-mode demo notice is kept. Year uses the new `formatYear` (no thousands separator, Arabic digits in Arabic). Company-site footer ("Powered by MASAR") belongs to the public tenant site, Phase 6.

## Deviations and decisions that need you
1. **Old shells are not deleted and their class-name tests are not rewritten.** The plan assumed the old shell is replaced. It still ships for unflipped surfaces, so `rtl.test.ts` (`start-0 border-e`, `lg:ms-[264px]`, PHYSICAL regex) still tests real code and passes. New behaviour tests assert nav, permissions, direction, language switching, focus and drawer. Convert or delete the old ones with the old shells in Phase 6.
2. **Search box removed** from the dashboard topbar. The old one was a non-working placeholder. The plan says "only if search exists".
3. **Theme toggle stays** on the dashboard and marketplace so nobody is trapped in an unsigned dark theme (D4, O4). Dark on migrated shells is not signed off.
4. **Sign out moved** into the account menu on the dashboard and admin (it was a sidebar button / header button).
5. **Admin and driver chrome is English only**, matching what they are today. Arabic for them is not in the plan so far.
6. **Interim logo.** The Arabic wordmark is not available (Phase 1), so Arabic pages show the Latin MASAR lockup.
7. The new dashboard shell imports `labels` and `ROLES` from the old `DashboardShell.tsx` (now exported) to avoid copying strings. Move them when the old shell is deleted.
8. Collapsed sidebar state is not persisted (same as before).

## Not verified (needs a browser or a person)
- **Layouts at 320 / 375 / 768 / 1024 / 1440, LTR and RTL.** This is the stated Phase 4 exit and it is not met: nobody has seen the shells render. Sticky band plus sticky topbar offsets, the drawer on a real phone, and the collapsed 72px state are the likeliest places for visual bugs.
- Keyboard and screen-reader walkthrough in a browser; rendered contrast.
- The marketplace header and footer are client-rendered after data loads, so SSR HTML does not contain them. They are covered by jsdom tests only.
- `DashboardShellMasar`, `AdminShellMasar`, `DriverShellMasar` inside the real authenticated layouts (needs a login). The layout code compiles and the components are tested in isolation.
- The existing dashboard pages inside the new shell rely on the Phase 2 scoped bridge to look right. Not viewed.

## To turn it on (internal first)
Preview or staging: `DS_SURFACES=marketplace,dashboard,admin,driver`, or a single company with `DS_PILOT_COMPANIES=<uuid>`. Roll back by clearing the variable. Nothing is on by default.

## Arabic for the reviewer (O1 still blank)
`ds/shell/text.ts` (`ar`, except the strings already shipped in the old shell), footer line, and the Arabic nav labels reuse the old dashboard wording.

## Next
Phase 5, journey 1 (passenger: search, book, pay, ticket). Needs O5 (hero photograph source and licence) and O7 (tenant accent) answered, and a real-browser look at these shells first.
