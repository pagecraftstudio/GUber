# Redesign Phase 2: Foundation. Status report

**Status: PARTIAL. Code done and verified; three exit items need a browser or a person (see "Not verified").**

## Verified here
| Check | Result |
|---|---|
| `tsc --noEmit` | clean |
| `vitest run` | 49 files, 843 tests pass (baseline 787, +5 Phase 1, +51 Phase 2) |
| `next build` | passes, run with dummy Supabase vars |
| `tests/bundle-scan.sh` | PASS, including the new check that the design page is absent from the client bundle |
| Dev smoke, `DS_SURFACES=marketplace` | `/` and `/login` render `data-ds="masar"`, no Google Fonts request, title "MASAR - Book university bus trips" |
| `/dev/design` | 200 in dev; contrast pairs failing: 0. Returns 404 in a production deployment (code path, not exercised on a hosted build) |
| Compiled CSS | `bg-slate-100/70` now compiles to `color-mix(... var(--color-slate-100) ...)`, so the bridge reaches 79 opacity-modified uses |

## What changed
| Area | Files |
|---|---|
| Tokens (light + dark column, `@theme`) | `src/styles/tokens.css`, `src/ds/tokens.ts` |
| Scoped bridge (generated) | `src/styles/bridge.css`, `scripts/ds/gen-bridge.mjs` |
| Base styles (focus ring, reduced motion, selection, scrollbar, RTL helpers), scoped | `src/styles/base.css` |
| Self-hosted fonts, 400/500/600 both families | `src/ds/fonts/*` (OFL), `fonts.ts`; `@fontsource` added to dependencies |
| Allow-list + scope component | `src/ds/scope.ts`, `src/ds/shell/DsScope.tsx` |
| Layout wiring | root, marketplace, dashboard, admin, driver layouts; `globals.css`, `ui.css` |
| Contrast helper + tests | `src/ds/contrast.ts`, `contrast.test.ts` (reproduces Appendix A) |
| Design page, dev/preview only | `src/app/dev/design/page.tsx` |
| Bundle scan, browserslist, README | `tests/bundle-scan.sh`, `package.json`, `README.md` |
| English rename sweep | AuthCard, MarketplaceHeader, admin layout and pages, CompanyForms, audit catalog, suspended page, `i18n.ts` (English side), titles |

## Deviations from the plan, and why
1. **Semantic variables are `--ds-*`, not `--surface-page` etc.** `ui.css` already defines `--surface-page`, `--surface-card`, `--text-primary`, `--text-secondary`, `--text-muted`, `--border-strong`. The plan's names would have restyled unflipped surfaces. A test now fails if `tokens.css` redeclares any name from `ui.css`.
2. **Primitives are `brand-green-*`, `brand-mint-*`, `ds-neutral-*`.** Tailwind ships its own `green-*`; overriding it would change every existing green class.
3. **Bridge goes through `--bridge-*` variables.** Plan 5.3 assumed assigning `--color-slate-*` inside the scope is enough. It is not: Tailwind bakes a literal colour into opacity utilities, so `bg-slate-100/70` ignored the scope (79 uses). Now `@theme` points at a bridge variable; `:root` keeps Tailwind's original value, the scope overrides it. Unflipped output is the same colour, expressed as `color-mix`; the plan's byte-identical screenshot check still has to be run.
4. **Marketplace allow-list is evaluated at build time.** `/` is statically rendered, so `DS_SURFACES` is read when it is built. Dashboard, admin and driver are dynamic and read it per request. Forcing the marketplace dynamic would cost caching on the public page; I did not do that. Your call.
5. **Legacy Google Fonts link stays while the marketplace is unflipped.** Removing it unconditionally would change an unflipped surface. It, and the CSP allowance (`security-headers.test.ts` still asserts it), go at the end of Phase 6.
6. **Page background.** `<body className="bg-slate-50">` in the root layout is outside the scope, so the page behind a flipped surface keeps the old tint unless the surface paints its own. Dashboard does; check the others in the screenshot pass.

## Not verified (needs a browser, a person, or hosted infra)
- **Font verification (5.5):** `/dev/design` has the manual checks (Latin ID inside Arabic, both digit systems, tabular figures) but I could not render it. All weights 400/500/600 exist for both families. Open `/dev/design` in dev and check (a) to (d); log pass or fallback in `DECISIONS.md`.
- **Screenshot diff** of unflipped surfaces vs the Phase 0 baseline, and a readability pass of flipped surfaces. Phase 0 baselines were not in the upload.
- **Production 404** of `/dev/design` on a real deployment.
- **Favicon replacement:** waits for the approved vector (Phase 1). Not done.
- **Public tenant site and auth/system surfaces** are not wrapped yet. `DsSurface` has `public`, `auth`, `system`, but only marketplace (which includes login/register), dashboard, admin and driver layouts call `DsScope`. The tenant site lives inside the marketplace tree, so it follows the marketplace flag for now.

## Arabic strings left for the named reviewer (D10)
I changed English only. These still say MALAKY or the old Arabic name, so the product name currently differs between languages on flipped surfaces:
- `src/ui/lib/i18n.ts`: Arabic `platformName`, `superAdmin`, `poweredByMalaky`, `operatorsProvisionedNotice`
- `src/features/dashboard/messages.ts`: lines 16-17, 187/190, 313 (English text and its Arabic dictionary key are coupled to a source-scan test, so not touched)
- `src/app/dashboard/settings/page.tsx`: "Ask MALAKY support" (same coupling)
- `src/ui/components/superadmin/SuperAdminLayout.tsx`: bilingual "MALAKY SaaS Control"
- `src/components/dashboard/DashboardShell.tsx`: "MALAKY." wordmark and "BUS MANAGEMENT" label (swap to `Logo` in Phase 4)
- `src/features/driver/DriverBoarding.tsx` and `lib/log/redact.ts`: `MALAKY:TICKET:` is the QR payload format, a bearer credential. **Do not rename** without a migration.

## Risks
- The allow-list is styling only and grants no access. It must stay that way.
- Dark values exist but are unsigned (D4). Hide the toggle on flipped surfaces if a public checkpoint ships before Phase 7 (O4).
- Two Tailwind builds (`globals.css`, `ui.css`) both import the bridge; keep them in sync via the generator.

## Open questions
1. Marketplace build-time flag, or force it dynamic (deviation 4)?
2. Approve the `--ds-*` and `brand-*` naming (deviations 1 and 2)?
3. Who runs the font check and screenshot diff, and where are the Phase 0 baselines?
