# P7c follow-up: company rating on its own site + rating moderation UI (NOT RUN)

Base: `main` at `770be65` (P7c, migrations up to 0062). Closes the two "not built" items of P7c.

## 1. Company rating on the company's own public site

* `getSiteRating(companyId)` (`features/site/rating-data.ts`) calls the existing anonymous `company_public_ratings` through `ratingsService.companies`. The database already decides "live company" and "at least 5 ratings".
* `SiteRatingBadge` (`features/site/SiteRatingBadge.tsx`) shows `★ 4.6 · 12 ratings` in the site header, same wording as the marketplace card (`RATING_TEXT.company`). No average yet = "New", on the home page only.
* `SiteView` takes an optional `rating` prop. The dashboard preview does not pass it, so the preview shows no badge (it would show live data in a draft canvas).
* `render.tsx` resolves the tenant once per render (it used to resolve it separately for trips and for plans) and fetches the rating last. **A failed rating read never breaks the page**: no badge.
* No migration.

## 2. Platform UI to hide / restore a rating

* Migration `0063_platform_ratings_moderation.sql`: `platform_list_ratings(company, visibility, before, before_id, limit)`. Super admin only (same as `set_trip_rating_hidden`), keyset paging, limit clamped 1..100, shares the `rating.read` rate limit. **The rater is never returned**; suite 58 pins that.
* `/admin/ratings` (super admin only; nav item hidden from other roles): list newest first, filter All / Visible / Hidden, "Only this company", Hide / Restore buttons (plain form posts to `setRatingHiddenAction`, work without JavaScript), notice banner, "Older ratings" link.
* Hiding reverses the rating's part of the company and driver aggregates and writes an audit row (existing RPC, 0061). Hiding twice is a no-op.
* Runner note: **apply 0063 before deploying the code.**

## Decisions / gaps

1. The badge is in the header on every page when there is an average; "New" shows on the home page only. Say if you want a different placement (hero, footer).
2. The moderation list has no company picker (no way to list companies from this feature without new coupling); filter by company comes from the row link. Search by driver or text is not built.
3. No reason field or note on hide (the audit row records who and when, not why).
4. Support / other platform roles cannot even read the list (database refuses). If support should see ratings read-only, that is a one-line change in 0063 plus the page guard.
5. `render.tsx` change touches tenant resolving: if a test counts `resolveTenantBySlug` calls it will now see fewer.

## Verification status

Written without a checkout: **not type-checked, vitest and pgTAP-style suites not run.** Done here: syntax check of every TS/TSX file; schema + service logic executed in Node with zod and stubs; the three edited files were rebuilt from GitHub and match blob SHAs. Suite 58 builds its fixtures from whatever bookings suite 01 leaves for companies A and B and asserts at least two exist: if the fixture set differs it fails in setup, not silently.

```
npm run typecheck
npx vitest run src/features/site src/features/ratings src/app/admin
# database: apply 0063, then run suite 58 with the others
```
