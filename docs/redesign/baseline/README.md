# Baseline screenshots ("before")

Captured 12 Nov 2026 from the **pre-redesign code** (the autosave build, before any MASAR change), production build, old UI, real local PostgreSQL + PostgREST with RLS, GoTrue-compatible stub (not live Supabase). Seed: `tests/integration/seed-customer-web.sql` + `tests/e2e/seed-e2e.sql`. Full-page PNG, 1440 and 375 wide, English (LTR) and Arabic (RTL). `marketplace-home` also at 320, 768 and 1024. Re-create with `tests/visual/baseline-capture.cjs`.

Google Fonts was blocked in the capture environment, so the old UI is shown in the fallback system font, not Inter. Compare layout and structure, not letterforms.

| Group | Screen | Widths x language | Files |
|---|---|---|---|
| admin | admin-overview | 375, 1440 x ar, en | 4 |
| admin | audit-logs | 375, 1440 x ar, en | 4 |
| admin | companies | 375, 1440 x ar, en | 4 |
| admin | companies-new | 375, 1440 x ar, en | 4 |
| admin | company-detail | 375, 1440 x ar, en | 4 |
| admin | company-edit | 375, 1440 x ar, en | 4 |
| admin | plans | 375, 1440 x ar, en | 4 |
| admin | subscriptions | 375, 1440 x ar, en | 4 |
| company | bookings | 375, 1440 x ar, en | 4 |
| company | bookings-filtered-empty | 375, 1440 x ar, en | 4 |
| company | buses | 375, 1440 x ar, en | 4 |
| company | customers | 375, 1440 x ar, en | 4 |
| company | customers-detail | 375, 1440 x ar, en | 4 |
| company | drivers | 375, 1440 x ar, en | 4 |
| company | overview | 375, 1440 x ar, en | 4 |
| company | routes | 375, 1440 x ar, en | 4 |
| company | routes-detail | 375, 1440 x ar, en | 4 |
| company | routes-new | 375, 1440 x ar, en | 4 |
| company | settings | 375, 1440 x ar, en | 4 |
| company | trips | 375, 1440 x ar, en | 4 |
| company | trips-new | 375, 1440 x ar, en | 4 |
| company | trips-regular | 375, 1440 x ar, en | 4 |
| company | users | 375, 1440 x ar, en | 4 |
| company | website | 375, 1440 x ar, en | 4 |
| driver | driver-home | 375, 1440 x ar, en | 4 |
| passenger | my-bookings | 375, 1440 x ar, en | 4 |
| public | booking-dialog | 375, 1440 x ar, en | 4 |
| public | company-login | 375, 1440 x ar, en | 4 |
| public | forgot-password | 375, 1440 x ar, en | 4 |
| public | invite-invalid | 375, 1440 x ar, en | 4 |
| public | login | 375, 1440 x ar, en | 4 |
| public | marketplace-home | 320, 375, 768, 1024, 1440 x ar, en | 10 |
| public | no-access | 375, 1440 x ar, en | 4 |
| public | not-found-404 | 375, 1440 x ar, en | 4 |
| public | register | 375, 1440 x ar, en | 4 |
| public | reset-password | 375, 1440 x ar, en | 4 |
| public | suspended | 375, 1440 x ar, en | 4 |

Total: 154 images.

## Not captured, and why

| Screen | Why |
|---|---|
| Tenant public website (`slug.domain`) | Needs host-based tenant routing; no tenant domain exists locally. Capture on staging. |
| Reset password with a valid token | Needs a real recovery link from email. Without a token it redirects to login (captured as `reset-password`). |
| Invite acceptance with a valid token | Needs a real invite token. The invalid-token state is captured. |
| Roles other than owner, driver, super admin, passenger, suspended and deactivated users | Role differences are navigation and permission only; plan section 10.2 lists them for the QA pass in Phase 7. |
| Second tenant with a poor-contrast colour | Tenant accent does not exist in the old UI. Belongs to Phase 5 and 7. |
| Dark theme | Old UI is light only; dark is Phase 7 (D4). |
| Widths 320, 768, 1024 for every route | Captured for the marketplace home only. The rest at 375 and 1440. Add if a regression suspect appears. |
| Loading skeletons, error boundaries, toast and dialog states beyond the booking dialog | Not reachable on demand. Phase 7 states pass. |

## Findings from the baseline (bugs in the OLD UI)

1. **Horizontal overflow on phones.** The marketplace home, login, register, reset-password and the booking dialog render 483 to 488 px wide at a 375 px viewport (997 px at 768). The page scrolls sideways. Must be gone after the redesign: check `marketplace-home` at 320, 375 and 768 in the new look.
2. Old shells show a search box that searches nothing (dropped in Phase 4).
3. Mixed digit styles in Arabic: Arabic text with Latin digits for dates, money and counts (fixed by the formatter in Phase 2).
