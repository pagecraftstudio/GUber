# Phase 6c report: tenant public site and passenger portal

Built on 6b. Queries, services, auth, booking logic, permissions and routes are unchanged. Each screen keeps its old component for state and data and draws a new view when the marketplace flag is on (`useDsFlipped`).

## Changed
- Tenant public site (`PublicWebsite`): new header, hero search, trip cards, popular routes, how to book, perks, FAQ and footer (`masar/PublicSiteMasarView.tsx`). The company colour appears only on the logo tile, and only when `tenantAccent` accepts it (D5). Surfaces and buttons stay MASAR.
- Trip details dialog (`TripDetailsModal` -> `masar/TripDetailsMasarView.tsx`): stops on the route line, coach, driver, amenities, one booking action.
- Passenger portal (`CustomerPortal` -> `masar/CustomerPortalMasarView.tsx`): header with trips and spent, tabs for bookings, profile, saved passengers and security, cancel dialog, add-passenger dialog, sign-in prompt. Real and mock cancellation wording is unchanged.
- Strings: `masar/text6c.ts`. Everything else reuses the existing `t()` keys.

## Verification
- `tsc` clean. Full suite passes, including 19 new tests (`masar/site-portal.test.tsx`): axe in English and Arabic, no raw colour classes in the new views, book/details/search/cancel/ticket/profile/companion/sign-out callbacks, read-only cancel rule, sold-out trip, empty and loading states.
- Browser (mock data, dev server): no overflow at 320, 375, 768, 1440 on the public site in English; portal checked signed in at 375 and 1440. Screenshots reviewed: public site 1440 en, portal 1440 and 375 en.

## Not checked
- Arabic screenshots of the public site and portal (overflow numbers for Arabic are polluted by the dev-only preview bar).
- Dark mode (Phase 7). Real-backend data. The booking flow dialog and ticket were done earlier.

## Decisions to confirm
- The company site footer credits "Powered by MASAR" (plan 5.4/O3: company sites credit MASAR only; MASAR's own pages credit MALAKY Studio). Arabic wording is a draft.
- Legacy `t()` strings are still Title Case ("Book Seat", "Find Scheduled Trips") and the plural "1 Seats". They need the Appendix C wording pass.
- The six 6a leftover forms are still unrestyled and go to 6d unless you say otherwise.
