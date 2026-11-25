import { AppError } from '@/lib/errors';
import { mapDbError } from '@/lib/db/map-error';
import type { RatingsDb } from './repository';
import { RATINGS_PAGE, toPlatformRating, type PlatformRatingRow, type RatingsListQuery, type RatingsPage } from './admin-types';

/**
 * Platform moderation of ratings. Both calls run as the signed-in platform user's own client; the database allows only a super_admin
 * (platform_list_ratings / set_trip_rating_hidden, 0061 + 0063), so the role check in the page and the action is the first lock, not the only one.
 */
export const adminRatingsService = {
  /** Newest first. Asks for one row more than a page to know whether an "Older" link is needed, and builds its cursor from the last row shown. */
  async list({ db }: RatingsDb, q: RatingsListQuery): Promise<RatingsPage> {
    const { data, error } = await db.rpc('platform_list_ratings', {
      p_company_id: q.company ?? null, p_visibility: q.show, p_before: q.before ?? null, p_before_id: q.beforeId ?? null, p_limit: RATINGS_PAGE + 1,
    });
    if (error) throw mapDbError(error);
    const all = (Array.isArray(data) ? (data as PlatformRatingRow[]) : []).map(toPlatformRating);
    const rows = all.slice(0, RATINGS_PAGE);
    const last = rows[rows.length - 1];
    return { rows, next: all.length > RATINGS_PAGE && last ? { before: last.createdAt, beforeId: last.ratingId } : null };
  },
  /** Reversible and audited in the database; hiding an already hidden rating changes nothing. */
  async setHidden({ db }: RatingsDb, ratingId: string, hidden: boolean): Promise<void> {
    if (!/^[0-9a-f-]{36}$/i.test(ratingId)) throw new AppError('validation', { detail: 'invalid_rating' });
    const { error } = await db.rpc('set_trip_rating_hidden', { p_rating_id: ratingId, p_hidden: hidden });
    if (error) throw mapDbError(error);
  },
};
