# Phase 6d plan: remove the old look

Decision (owner): two steps.

## 6d-1 (this branch): stop the bleeding, no behaviour change
- `scripts/ds/raw-colors.mjs` counts raw palette classes and hex literals per file. `scripts/ds/raw-colors.baseline.json` records today's count: 2,414 in 105 files.
- `src/ds/rawcolors.test.ts` (runs with `npm test`) fails when a file gains raw colours, when a new file has any, or when the baseline is stale after a fix. It also requires `src/ds` and every `masar/` view to have zero.
- Allowed to name colours: `tokens.css`, generated `bridge.css`, `ds/tokens.ts`, `ds/contrast.ts`, `ds/brand`, the dev bar and preview pages, tests. Modal scrims (`backdrop:bg-black/NN`) are exempt.
- Nothing visible changes for any company. The six leftover forms stay as they are: while the old look exists, restyling them would change it for companies outside the pilot. They are rewritten in 6d-2.
- No dead code worth deleting was found (every non-test file is imported or is a Next entry point).

## 6d-2 (after you have reviewed the Test company)
Remove the flag and every old branch, so all companies get the new look.
1. Delete the old branches and files, then collapse `useDsFlipped` / `isSurfaceScoped` / `DsFlagProvider`, the `DS_SURFACES` and `DS_PILOT_COMPANIES` settings, and `skin.ts`.
2. Delete legacy `src/ui` components that the masar views replace (`MarketplaceHeader`, `MarketplaceSearch`, `MarketplaceFilters`, `MarketplaceTripCard`, `PublicHeader`, `HeroTripSearch`, `RouteCardGrid`, `PublicFooter`, the old halves of the booking, ticket, portal and auth dialogs, `common/*`, `superadmin/*`), `src/components/{ui,admin}`, `ui.css`.
3. Rewrite what has no masar view yet with tokens: `DashboardShell`, `StopsEditor`, `TripDraftForm`, `TemplateForm`, `UsersPanel`, `WebsiteForm`, `DriverLogin`, `BookingFilters`, `TripFilters`, `BookingParts`, `TripActions`, `DriverBoarding`, the dashboard and admin pages.
4. Delete `bridge.css` and `gen-bridge.mjs`; set the baseline to empty and make the test require zero.
5. Run the full suite, `next build`, `bundle-scan.sh`, a browser sweep at 320 to 1440 in English and Arabic, then stop for approval. Dark mode (Phase 7) follows.

## Where the 2,414 are
| Area | Raw colours | Files |
|---|---|---|
| `src/ui/components` (old marketplace, public site, dialogs, superadmin) | 1,212 | 31 |
| `src/features/dashboard` | 352 | 17 |
| `src/app/admin` | 205 | 10 |
| `src/app/dashboard` | 197 | 14 |
| `src/components/dashboard` | 178 | 5 |
| `src/components/admin` | 148 | 10 |
| everything else | 122 | 18 |

Most of the first row disappears by deleting files, not editing them.
