import { formatNumber } from '@/ds/format';
import { RATING_TEXT } from '@/features/ratings/text';
import type { SiteLocale } from './text';

/** What the public site knows about the company's rating (company_public_ratings): `average` is null until the database says the company has enough ratings. */
export interface SiteRating { ratings: number; average: number | null }

/**
 * The company rating in the site header, same wording and rule as the marketplace card: an average only when the database returned one (from 5 ratings),
 * otherwise "New" (home page only, so it is not repeated on every page). Pure presentation: no fetching, nothing to click.
 * The star is decoration; the accessible name carries the whole sentence ("Rated 4.6 out of 5").
 */
export function SiteRatingBadge({ rating, locale, showNew }: { rating: SiteRating | null | undefined; locale: SiteLocale; showNew: boolean }) {
  if (!rating) return null;
  const t = RATING_TEXT[locale].company;
  if (rating.average === null) {
    return showNew ? <span className="text-sm text-ink-secondary">{t.newLabel}</span> : null;
  }
  const avg = formatNumber(rating.average, locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-ink-secondary tabular-nums" role="img" aria-label={`${t.aria(rating.average, locale)}, ${t.count(rating.ratings, locale)}`}>
      <span aria-hidden="true">★</span>
      <span aria-hidden="true" className="font-medium text-ink-primary">{avg}</span>
      <span aria-hidden="true">· {t.count(rating.ratings, locale)}</span>
    </span>
  );
}
