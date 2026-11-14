# MASAR design system (`src/ds`)

One component library. Tokens in `src/styles/tokens.css`; components use only semantic utilities (`bg-surface-card`, `text-ink-secondary`, `border-line-strong`, `bg-action`, `text-status-error-fg`, `rounded-ds-md`). `guard.test.ts` fails on raw hex, `slate-`/`blue-`, large radii, weights above 600, uppercase labels, physical left/right, and any `Intl`/`toLocale*` outside `format/`.

## Rules
1. **Language.** Shells provide it with `DsLangProvider`. Any component also takes `lang` where it formats. Built-in chrome text is in `messages.ts`; anything contextual is a prop. Arabic in `messages.ts` and `status-map.ts` is **unreviewed** until the named reviewer signs (D10).
2. **Numbers.** Never call `toLocaleString`. Use `formatNumber`, `formatMoney`, `formatDate`, `formatTime`, `formatDuration`, `formatPercent`. Identifiers (reference, phone, email, slug, student ID) go through `<Identifier>`.
3. **Input.** Phone, amount, seats, student ID, reference search use `<DigitInput kind=…>`. The server normalises again (`normalizeDigits`) and is the authority.
4. **Fields.** `<Field label hint error required>` wraps one control and wires id, `aria-describedby`, `aria-invalid`. Controls work alone too.
5. **Status.** `<StatusBadge domain value>` from `data/status-map.ts`. Add a backend status there first; `status-map.test.ts` fails at compile time until you do.
6. **Dialogs** are native `<dialog>`; use `ConfirmDialog` only for decisions that need an interruption. Destructive tone focuses Cancel.
7. **Autosave** controls (`AutoSelect`, `AutoSwitch`, `AutoInput`) are optimistic and roll back on refusal. Pass `labels` for Saving / Saved / error text.
8. **Tenant colour** reaches CSS only as `--tenant-accent` / `--tenant-on-accent`, set from server-derived values. Used by `Ticket` today.
9. **RouteLine** renders only from real stop data (2 or more).

## Shells (`shell/`)
`ShellFrame` (sidebar 264/72, 36px rows, topbar, drawer, skip link) is shared by `DashboardShellMasar` and `AdminShellMasar`. `DriverShellMasar` is a top bar only. `MarketplaceHeaderMasar` + `QuietFooter` serve the marketplace.

## Try it
`/dev/design` (dev and preview only) renders every component and state in English and Arabic (`gallery/Gallery.tsx`). The same gallery is what `a11y.test.tsx` runs axe on.

## Not wired yet
Existing pages still use their old components (D9). `src/components/dashboard/*`, `src/features/dashboard/InlineControls.tsx` and `src/ui/*` are replaced screen by screen in Phases 4 to 6.
