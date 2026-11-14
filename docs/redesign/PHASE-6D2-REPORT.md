# Phase 6d-2 report: the old look is gone

Every company, the marketplace, admin, auth, system and driver pages now use the MASAR look. There is no flag.

## Removed
- `DS_SURFACES`, `DS_PILOT_COMPANIES`, `isSurfaceScoped`, `useDsFlipped`, `DsFlagProvider`, `DsScope`, `skin.ts` branches.
- `bridge.css`, `gen-bridge.mjs`, `ui.css` (legacy variables), the old dashboard shell, the legacy marketplace/public/dialog/superadmin components and the `common/*` leftovers that nothing used.
- The raw-colour baseline. The test now requires zero.

## Changed
- `<body data-ds="masar">` in the root layout carries the base styles and fonts for every page.
- About 600 raw colours in forms, tables, admin and dashboard files were converted to semantic tokens (script mapping slate/blue/red/green/amber to `surface/ink/line/action/status`; `dark:` variants dropped because tokens switch themselves).
- Exempt from the colour guard: `tokens.css`, dev bar, gallery, tests, tenant default brand colours (data in `types.ts`, `TenantContext`, `adapters`, `mockData`) and the QR image's white backing (QR needs a light background).

## Checks
- `tsc` clean, full vitest suite passes, `next build` OK, `tests/bundle-scan.sh` PASS, raw colours: 0.
- Tests that asserted the old look or the flag were rewritten or deleted (`scope.test`, `bridge.test`, the old halves of `auth-masar`, `lists`, `masar` driver, `rtl`, `tokens`).
- Browser sweep in mock mode, 320/375/768/1440, English and Arabic: marketplace, public site, portal sign-in prompt, admin preview, driver preview, sign-in. No horizontal overflow (dev bar excluded), one h1 per page.

## Not verified
- The real dashboard forms (routes, trips, users, website, settings) after the colour conversion were not opened in a browser: they need the live backend. Check them on the preview deployment.
- The e2e suite was not run.
- Arabic strings remain a draft for the named reviewer.

## After merging
- Delete `DS_SURFACES` from Vercel (now ignored).
- Next: Phase 7, dark mode.
