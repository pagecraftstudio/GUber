# M2 - RTL (Arabic) company dashboard - REPORT

Base: `GUber-clean-M2-final_1.zip`. No SQL, no migration, no hosted Supabase, no deploy. Stopped before M3.

## Problems found in the M2 dashboard (Arabic)
| # | Problem | Fix |
|---|---|---|
| 1 | Sidebar side and content offset chosen with `left-0/right-0`, `border-l/r`, `ml-/mr-[264px]` | logical: `start-0 border-e`, `lg:ms-[264px]` / `lg:ms-[88px]` (drawer slide sign still picked from the language) |
| 2 | Table `text-left`; header cells actually centred (UA default for `th`) | `text-start` on table and `th` |
| 3 | Page headers, table headers, empty states, status pills, buttons and options on server pages were English-only | `<T>` (dictionary `PAGE_AR`), `<Bi en ar>` for dynamic text; PageHeader and DataTable translate themselves |
| 4 | Phones, emails, plates, references, coordinates reordered by the bidi algorithm | `<Ltr>` island and `dir="ltr"` on those inputs |
| 5 | Dates in server locale | `<Dt>` (language locale, Latin digits, `dir=ltr`) |
| 6 | Language applied after hydration, so Arabic users saw an LTR flash | language cookie; `dashboard/layout.tsx` passes `initialLang` to the shell; `DashboardShell` writes the cookie |
| 7 | Direction-sensitive icons not mirrored; arrow `→` in trips; `ArrowUpRight` on home cards; collapse icon | `rtl:-scale-x-100`, `rtl:rotate-180` |
| 8 | Some shell controls had English `aria-label`, collapsed-sidebar toggle had none | bilingual labels |
| 9 | Role shown as `company owner` | role labels in both languages |
| 10 | Nav list inline in the shell | `components/dashboard/nav.ts` (list + visibility + active rule), unit tested |

## Tests
- `src/features/dashboard/rtl.test.ts` (new, 48 tests): every dashboard source file is free of physical-direction classes (a new `ml-`/`text-left`/`border-r` fails the build); drawer logic; cookie wiring; every `<T>` literal, table label and header prop in `src/app/dashboard` has an Arabic entry; no English in the Arabic column; `T`, `Bi`, `Dt`, `Ltr`, `PageHeader`, `DataTable`, `StatusPill` rendered in both languages; nav visibility and active rule.
- Real Chromium (Playwright), scratch preview page with the real `DashboardShell`, `PageHeader`, `DataTable` (page removed afterwards, not in the zip): LTR sidebar x 0-264; RTL desktop sidebar x 1016-1280 and content 0-1016; RTL 390px drawer starts off-canvas right (x 390) and slides to the right edge; `th` text-align `start`; plates/phones `dir=ltr`; Arabic title/nav; no horizontal scroll; cookie gives `rtl` on first paint.
- `tests/e2e/dashboard-rtl.mjs` (new, wired into `tests/run-all-local.sh`): same checks on the real pages for 11 routes, 320px RTL drawer, persistence, axe in Arabic on 6 pages.

## Gate (this sandbox)
| Command | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npx vitest run` | 39 files, 711 tests passed |
| `next build` (3 `NEXT_PUBLIC_*` vars) | exit 0 |
| `bash tests/bundle-scan.sh` | PASS |
| `npm audit --omit=dev` | 0 vulnerabilities |
| `bash tests/e2e/dashboard-rtl.mjs` + full `run-all-local.sh` | **NOT RUN here**: no PostgREST/GoTrue stub in this sandbox (release download 404). Run on your machine: `SKIP_BUILD=0 PSQL=... POSTGREST=... E2E_TOOLS=... bash tests/run-all-local.sh` (optional `CHROME_PATH`). Existing e2e suites assume English default; unchanged for a fresh context (no cookie = English). |

## Known gaps (honest)
- `aria-label` attributes built from English template strings in server one-liner pages (e.g. `Status for <plate>`, `Save status for ...`, `Change status of trip ...`) stay English. Visible text is translated.
- Route/customer/driver names and other user data are shown as typed.
- Browser-pane screenshots checked by me for Arabic desktop only; no screen-reader or Arabic axe run yet (script exists, not executed).
- Arabic wording is mine; have a native reviewer read `PAGE_AR`, `USER_UI`, `SETTINGS_UI`.
