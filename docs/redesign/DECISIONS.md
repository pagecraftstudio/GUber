# MASAR redesign: decision log

Source: redesign plan, Appendix F. Reviewer and designer lines are blank on purpose.
Phase 0 and Phase 1 cannot exit while they are empty.

| Item | Value | Date | Recorded by |
|---|---|---|---|
| D1 Product name | Rename to MASAR. "Powered by MALAKY Studio" quiet footer only | 9 Nov 2026 | Owner |
| D2 Logo master | Stacked bilingual lockup, reference `Minimalist Masar Bilingual Logo.png` | 9 Nov 2026 | Owner |
| D3 Fonts | IBM Plex Sans Arabic + IBM Plex Sans | 9 Nov 2026 | Owner |
| D4 Dark mode | After light-mode approval | 9 Nov 2026 | Owner |
| D5 Company branding | Public site, company tile, ticket accent only. MASAR chrome stays MASAR | 9 Nov 2026 | Owner |
| D6 Numerals | Localised by language, identifiers stay Latin | 9 Nov 2026 | Owner |
| D7 Browsers | Evergreen (current and previous major) | 9 Nov 2026 | Owner |
| D8 Route line | Keep, functional only | 9 Nov 2026 | Owner |
| D9 Rollout | Per-route migration | 9 Nov 2026 | Owner |
| D10 Arabic reviewer | Named human required | 9 Nov 2026 | Owner |
| **Arabic copy reviewer (O1)** | **Name: ____________  Scope: UI terminology and strings** | | |
| **Arabic logo and type reviewer (O1)** | **Name: ____________  Scope: spelling, joins, dots of vector master** | | |
| Logo designer (O6) | Name: ____________ | | |
| Approved vector master | File and version: ____________ | | |
| English wordmark final settings | Family IBM Plex Sans, weight ____, tracking ____, live text or outlined ____ | | |
| O2 to O5, O7 | Answers: ____________ | | |
| Font verification (5.5) | Pass, or fallback and why | | |
| Gate G1 (light approved) | Signed by: ____________ | | |
| Phase 2 deviations (naming `--ds-*`, `brand-*`; bridge via `--bridge-*`; marketplace flag at build time) | Pending owner approval, see PHASE-2-REPORT.md | | |
| Phase 3 validation change (5.7 rule 6): `normalizeDigits` into amount, seats, student ID, plate, search, form `num()`; phone and amount reuse it | Applied on the instruction "Start Phase 3". Owner to confirm. Files listed in PHASE-3-REPORT.md | 9 Nov 2026 | Claude |
| Phase 3 `next.config.ts` change: `env.DS_GALLERY` build-time switch so the gallery is not compiled into production | Pending owner approval | 9 Nov 2026 | Claude |
| Phase 3 dev dependencies: jsdom, @testing-library/react, @testing-library/dom, @testing-library/user-event, axe-core | Pending owner approval (dev only, nothing ships) | 9 Nov 2026 | Claude |
| Phase 4: old shells kept (not deleted) and chosen per surface by `isSurfaceScoped`; old class-name tests in `rtl.test.ts` left as they are | They still test code that still ships. Convert or delete with the old shells in Phase 6 | 10 Nov 2026 | Claude |
| Phase 4: fake search box dropped from the dashboard topbar (the product has no search); theme toggle kept on dashboard and marketplace so nobody is stuck in unsigned dark (D4/O4) | Owner to confirm | 10 Nov 2026 | Claude |
| Phase 4 Arabic footer wording "بدعم من MALAKY Studio" and shell chrome Arabic | Unreviewed until O1 reviewer signs (D10) | 10 Nov 2026 | Claude |
