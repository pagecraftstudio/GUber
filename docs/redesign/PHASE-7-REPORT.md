# Phase 7 report: dark mode

## What was already right
The dark token column passed WCAG 2.2 AA once checked. `src/ds/dark.test.ts` now parses `tokens.css` and enforces it: all text pairs (primary/secondary/muted/link on page, card, sunken; button text on action and hover; destructive; selection; every status colour on its tint, card and page) at 4.5:1, and borders, focus ring and action colour at 3:1. 39 checks.

## Changes
- **No flash of light.** `src/ds/theme/themeScript.ts` runs in `<head>` before first paint and applies the saved choice. The dashboard reads `malaky-dashboard-theme`; every other page reads `malaky_theme_mode` (light, dark or system). Admin, driver and sign-in pages have no toggle and follow the same saved choice. Blocked storage leaves the page light. 5 tests. `<html>` has `suppressHydrationWarning` because the script changes its class.
- **Admin platform band** was a bright white strip in dark; it is now a quiet dark band with a hairline (light mode unchanged).
- Decision record D4 updated.

## Checked
`tsc` clean, full suite 1,371 passing, `next build` OK, `bundle-scan.sh` PASS. Dark screenshots reviewed in mock mode: marketplace, public site, portal sign-in prompt, trip dialog, sign-in dialog, admin preview, driver preview, at 1440 and 375 px.

## Not checked
- Real dashboard pages (forms, tables, shells with data) in dark: they need the live backend. Please open the dashboard in dark on the preview deployment.
- Booking flow and ticket in dark with a signed-in demo user (login in mock mode navigates away in my script).
- Arabic in dark, and tenant accent colours in dark (a very dark tenant accent on the dark page has little contrast against its surroundings; the accent only fills the company tile and ticket header, with guaranteed text contrast).
- Designer sign-off on the dark palette is still a human gate.
