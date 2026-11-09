# Redesign Phase 3: Component library, formatting, input normalisation

**Status: PARTIAL. Code, unit tests, axe (jsdom), typecheck, build and bundle scan pass. Real-browser checks were not possible here (see "Not verified").**

## Verified here
| Check | Result |
|---|---|
| `tsc --noEmit` | clean |
| `vitest run` | 55 files, 1087 tests pass (Phase 2: 49 files, 843). +244: format 25, status map 10, guard 156, components and keyboard 36, axe 2 (en, ar), digit validators 9, rest existing |
| `next build` (dummy env) | passes |
| `tests/bundle-scan.sh` | PASS, including a new check that the component gallery is absent from the client bundle |
| `next dev` smoke | `/dev/design` returns 200 and server-renders the gallery (`EGP 150`, `١٥٠ ج.م`, `١٬٢٣٤٬٥٦٧`, `MB-7K3Q9X`) |
| Tailwind output | the new utilities (`rounded-ds-md`, `bg-action`, `focus-visible:outline-focus`, `bg-destructive`, ...) are in the compiled CSS |
| axe-core on the gallery, en and ar | no serious or critical violations (colour-contrast rule off in jsdom) |

## What was built (`src/ds`)
| Area | Files |
|---|---|
| Format | `format/index.ts` (formatNumber, Money, Percent, Date, Time, DateTime, Duration), `format/normalize-digits.ts`, `format/Identifier.tsx` |
| Primitives | `Button` (+ IconButton, SubmitButton), `Field`, `Input` (+ DigitInput, Textarea, Select, DatePicker, TimePicker), `Choice` (Checkbox, RadioGroup, Switch), `FileUpload`, `auto` (AutoSelect, AutoSwitch, AutoInput) |
| Feedback | `SaveStatus`, `InlineAlert`, `Toast`, `Dialog` (ConfirmDialog, Drawer), `Tooltip`, `States` (EmptyState, ErrorState, Skeleton*) |
| Data | `status-map` + `StatusBadge`, `DataTable`, `Pagination`, `Layout` (FilterBar, MetricCard, KeyValue, Breadcrumbs, Tabs) |
| Domain | `RouteLine` + `OccupancyBar`, `TripCard`, `Booking` (BookingSummary, PaymentSummary, PassengerForm, VehicleDriverCard, ManifestRow), `Ticket` |
| Support | `lang.tsx`, `messages.ts`, `hooks/useInlineSave.ts`, `gallery/Gallery.tsx`, `README.md`, `index.ts` |
| Docs | `docs/redesign/FORMAT-SWEEP-LIST.md`, `DECISIONS.md` rows |

## The validation change (plan 5.7 rule 6) — please confirm
I took "Start Phase 3" as approval. Behaviour that changed:
| Input | Before | After |
|---|---|---|
| Phone | own Arabic-digit map | `normalizeDigits` (same result, plus Arabic separators) |
| Amount paid (`setAmountPaidAction`) | inline replace | `parseAmountInput`; table test shows identical accept/reject results |
| Form numbers (`num()` in form-actions) | `Number(raw)` | `Number(normalizeDigits(raw))` |
| Booking `seats` | number only | number, or digit string in either system |
| `studentId` (bookings, customers) | stored as typed | stored with Latin digits |
| Bus `plateNumber` | upper-cased | digits also Latin, so uniqueness cannot be dodged |
| Booking search box | as typed | digits normalised first |
Files: `lib/validation/{phone,common}.ts`, `features/{bookings/schema,bookings/search,customers/schema,buses/schema}.ts`, `features/dashboard/{autosave-actions,form-actions}.ts`. Tests: `lib/validation/digits.test.ts`. No auth, RLS, tenant or DB code touched.
Also moved: `useInlineSave` now lives in `ds/hooks` and `useAutosave.ts` re-exports it (same code).

## Deviations and decisions that need you
1. **Existing pages are not rewired.** New components use semantic tokens that exist everywhere, so swapping them into an unflipped page would restyle it (D9). Old `SaveStatus`, `InlineControls`, `SubmitButton`, two ConfirmDialogs stay until Phases 4 to 6.
2. **The 15 `Intl`/`toLocale*` call sites are listed, not swept** (`FORMAT-SWEEP-LIST.md`). Sweeping now would switch Arabic digits on unflipped surfaces. The `Dt` Latin-digit test changes with its migration.
3. **`next.config.ts` change:** `env.DS_GALLERY` build-time switch. Without it the gallery shipped in the production client chunk (the scan caught it). Needs your OK.
4. **New dev dependencies:** jsdom, @testing-library/{react,dom,user-event}, axe-core. Dev only.
5. **Destructive colour tokens** added (`--ds-action-destructive`, hover, on). White on `#B03535` is 6.16:1, on hover `#922B2B` about 8:1. Dark values unsigned (D4).
6. **Native `<dialog>`** for ConfirmDialog and Drawer, and **native date/time inputs**. Digits inside native pickers follow the browser/OS locale, not the app. If that conflicts with D6, a custom picker is a separate task.
7. **Real bug found and fixed:** React `autoFocus` does nothing in a closed `<dialog>`, so default-tone confirm would have focused Cancel. Now `data-autofocus` is focused after `showModal()`.
8. Control sizes (6.5): 36 and 44 used as proposed; confirm.

## Not verified (needs a browser or a person)
- **Keyboard and screen-reader walkthrough** (plan exit). Keyboard behaviour is unit-tested (tabs, switch, radios, sort, dialog, toast, tooltip) but not driven in a real browser. VoiceOver/NVDA not run.
- **Colour contrast in rendered pages.** Every token pair is tested (`contrast.test.ts`); rendered combinations (e.g. muted text on sunken rows, tenant band) were not measured. axe contrast is off in jsdom.
- **Font verification 5.5 (a to d)** and **tabular figures for Arabic-Indic digits**: the gallery renders both, nobody has looked at it. Open `/dev/design`.
- **Visual quality** of every component at 320/375/768/1024/1440 and RTL mirroring. Not screenshotted.
- Hover/active states, `Tooltip` edge clipping near viewport edges, `FileUpload` visual focus (label uses `has-[:focus-visible]`).
- `/dev/design` returning 404 on a real production deployment (code path only).

## Arabic left for the reviewer (O1 still blank)
`ds/messages.ts` (all `ar`), `ds/data/status-map.ts` (all `ar` except نشط / متوقف, which already shipped), and the Arabic sample text in `Gallery.tsx`. Not for release before sign-off.

## Next
Phase 4 (shells) once you confirm items 3 to 5 and the validation change. Blockers still open: O1 reviewer name, O2 to O4, O7.
