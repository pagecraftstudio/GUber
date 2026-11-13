# Phase 6b report: admin leftovers, sign-in and account-state pages

Status: **built and tested, awaiting your review.** Off by default (`DS_SURFACES=admin`, `auth`, `system` or `all`). No change to queries, server actions, validation, permissions or routes.

## What changed

| Screen | How |
|---|---|
| Admin overview, plans, subscriptions, audit log list, audit entry | New views in `components/admin/masar/PlatformMasarViews.tsx`, chosen by `isSurfaceScoped('admin')` after the page has loaded its data and passed its guard, exactly like the companies pages |
| Forgot password, reset password, invite, operator sign-in | `AuthCard` flips on the **`auth`** surface. `Field`, `Alert` and `SubmitButton` follow the flag, so every form keeps its action, hidden fields, names, autocomplete and length limits |
| No access, suspended | Same card on the **`system`** surface |
| Passenger sign-in, sign-up, reset (dialog and `/login`, `/register`) | `AuthModal` keeps all state, validation and service calls; when the marketplace flag is on it draws `AuthModalMasarView`. Phone and student ID use the digit-normalising input (plan 5.7 rule 5) |
| `/dev/admin-preview` | Added `overview`, `plans`, `subs`, `audit`, `entry` views with fake data for the browser pass |

Design notes: metrics state what needs attention in words ("Locked out until reactivated", "Needs follow-up"), never colour alone. Subscription "state" (live, stale, expiring) has icon + text. Audit tables render text only (a test proves a hostile actor name is not markup). Instants stay in UTC with the zone written out, Latin digits (admin is English-only). Pagination keeps every filter. Footer on the card pages is the quiet "Powered by MALAKY Studio" (assumption A1 / O3, please confirm).

## Verification

| Check | Result |
|---|---|
| `tsc --noEmit` | clean |
| `vitest run` | **65 files, 1330 tests pass** (was 62 / 1305) |
| `next build` with `DS_SURFACES=all` | pass |
| `tests/bundle-scan.sh` | pass |
| New tests | 12 admin (figures, flags in words, empty and error states, read-only role has no expire button, expire needs confirmation and calls the same action, chips keep filters, XSS, redacted entry, axe); 4 auth card (off by default, on, `auth` vs `system`, `all`, fields and hidden inputs unchanged, axe); 7 sign-in dialog (axe in en and ar for login, register, reset; same `signIn`/`signUp`/`resetPassword` calls; same empty-form message; Arabic-keyboard phone arrives as ASCII; one dialog when switching) |

## Not checked

- **No browser pass.** This environment has no browser and cannot download one, so there is no screenshot or overflow check at 320 to 1440 in this batch. `/dev/admin-preview?view=overview|plans|subs|audit|entry` (with `DS_GALLERY=1`, development or preview) is ready for you. Auth pages: open `/company/login`, `/forgot-password`, `/suspended` with `DS_SURFACES=auth,system`.
- axe in jsdom runs with colour contrast off (jsdom cannot compute it); contrast comes from the token table.
- The auth dialog's validation messages are the existing ones. Native browser validation is replaced by those messages in the MASAR look (`noValidate`), so an empty required field now shows the app's own message instead of the browser's.
- Arabic text added: none new (the dialog reuses the existing dictionary and the existing inline Arabic strings).

## Still open for 6d (not part of 6b)

Six 6a form files still carry their own raw colours: `StopsEditor` 54, `TripDraftForm` 30, `TemplateForm` 27, `UsersPanel` 19, `WebsiteForm` 17, `DriverLogin` 14 (plus `RouteForm` 13, `TemplateActions` 8, `SettingsForm` 11, `CreateForms` 7, which rely on shared parts but still contain classes). Counts today: whole `src` 2,287 raw colour classes or hex values; `src/ui` 1,106; `components/{ui,dashboard,admin}` 315 (excluding `masar`); `features/dashboard` 321; `app` 360. 6c (my-bookings, tenant public site) and 6d (delete legacy, remove bridge, CI guard) still to do. The admin `ConfirmDialog`, `StatCard`, `StateViews`, `AuditTable`, `AdminPagination` are now unused when the surface is flipped and go in 6d.
