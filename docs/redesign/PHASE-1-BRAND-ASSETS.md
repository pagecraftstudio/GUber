# Redesign Phase 1: Brand assets. Status report

**Status: PARTIAL. Cannot exit.** Exit needs a named designer (O6), a named Arabic logo reviewer (O1), an approved vector master and the variant set. None exists yet.

## Done in this drop
| File | What |
|---|---|
| `src/ds/brand/Logo.tsx` | Interim wordmark: "MASAR", IBM Plex Sans 500, tracking 0.32em, three sizes, three tones. No Arabic. Matches plan "interim until approval" |
| `src/ds/brand/Logo.test.ts` | 5 tests: accessible name, no Arabic glyphs, stays LTR in RTL, brand colours only, no shadow/gradient |
| `docs/redesign/DECISIONS.md` | Appendix F decision log, reviewer lines blank |
| This file | Measurements, designer brief, exit checklist |

Not run: the repo's `vitest`, `tsc`, `next build`. I had no `node_modules`. Run `npx vitest run src/ds/brand` and `npx tsc --noEmit` before merging. Test config includes `src/**/*.test.ts`, so the test is `.ts` and uses `createElement`.

## Not done (blocked, not skipped)
- Vector master, all variants, SVG/PNG/ICO/apple-touch/manifest/OG exports, stroke-draw animation, clear-space and minimum-size tests. All need real artwork.
- I did not trace the Arabic. Auto-tracing an AI raster would produce a file that looks like final art and is not reviewed. Brief section 9 forbids that.

## Measurements from the reference PNG (provisional)
Source: `Minimalist Masar Bilingual Logo.png`, 1536x1024, raster, AI-generated. Use as a starting point for the designer only.

| Measure | Value | Ratio |
|---|---|---|
| Arabic height / width | 482 / 448 px | tall, w/h 0.93 |
| English cap height | 38 px | 0.079 of Arabic height |
| English width | 395 px | 0.88 of Arabic width |
| Gap Arabic to English | 45 px | 0.093 of Arabic height |
| English ink gaps (M-A-S-A-R) | 61, 56, 54, 59 px | about 1.5x cap height |

Candidate clear-space unit (proposal): the English cap height `x` (38 px = 0.079 of Arabic height). Suggest 4x on all sides for the stacked lockup. Designer confirms or replaces from the vector.

Caveat: the English gaps are very wide for header use. I set 0.32em for the interim UI wordmark. The designer records the stacked-lockup tracking separately.

## Brief for the designer (O6)
1. Redraw the Arabic from the reference as clean vector paths. Reconcile the differences in plan 2.1 (flat cut terminals vs rounded hooked, tail length) and pick one construction.
2. Reviewer checks in writing: spelling م س ا ر, joins, dot count and placement, no accidental extra stroke, legible at small size.
3. Derive everything from that one set of paths: stacked, Arabic-only, English-only, horizontal (LTR and RTL), compact mark, app icon with safe area, favicon, black / white / deep-green versions, "Powered by MALAKY Studio" lockup.
4. Compact mark and favicon: test at 16, 24, 32, 48, 64 px. If the Arabic crop fails, use a documented typographic fallback.
5. English line: IBM Plex Sans, record weight, tracking, live text or outlined.
6. Flat artwork only. Colours `#0B3D2E`, `#14C88A` (accent only), `#FFFFFF`, `#000000`, `#F5F5F5`. No glow, gradient, shadow.
7. Exports: outlined SVG, PNG, ICO, apple-touch-icon, manifest icons, OG image. Stroke-draw animation as a separate file.

## Exit checklist
- [ ] Designer named (O6)
- [ ] Logo reviewer named (O1), written approval with date
- [ ] Approved SVG master and variant set filed
- [ ] English wordmark settings recorded in DECISIONS.md
- [ ] Clear space and minimum sizes measured from real artwork
- [ ] Small-size tests recorded (16/32 favicon)
- [ ] `Logo` renders from real paths, interim body removed
- [ ] Copy reviewer named (O1) for Phase 0 terminology

## Risks
- Only one blocker: no named people. Everything else waits on them.
- Phase 2 needs `--font-latin` set by `next/font`. Until then the wordmark falls back to system-ui.
- Existing dashboard shell still shows "MALAKY." and "BUS MANAGEMENT". Swapping to `Logo` is Phase 2/4 (Appendix E).

## Open question
Who is the designer and who is the Arabic reviewer? One name unblocks the rest.

## Addendum, 12 Nov 2026: provisional asset set
Built from the uploaded images so development is not blocked. See `docs/brand-source/README.md` for the file list, limits and the metadata snippet. Still open: approved vector master, reviewer sign-off, 16 px favicon fallback, "Powered by MALAKY Studio" lockup (needs the MALAKY logo). The exit checklist above is unchanged: **Phase 1 still cannot exit.**
