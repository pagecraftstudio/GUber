import { z } from 'zod';

/** One rating as a moderator sees it (platform_list_ratings, 0063). The rater is deliberately absent: the database does not return it. */
export interface PlatformRating {
  ratingId: string; companyId: string; companyName: string; driverId: string; driverName: string; tripId: string;
  originName: string; destinationName: string; departureAt: string; tripStars: number; driverStars: number; createdAt: string; hiddenAt: string | null;
}
export interface PlatformRatingRow {
  rating_id: string; company_id: string; company_name: string; driver_id: string; driver_name: string; trip_id: string;
  origin_name: string; destination_name: string; departure_at: string; trip_stars: number; driver_stars: number; created_at: string; hidden_at: string | null;
}
export const toPlatformRating = (r: PlatformRatingRow): PlatformRating => ({
  ratingId: r.rating_id, companyId: r.company_id, companyName: r.company_name, driverId: r.driver_id, driverName: r.driver_name, tripId: r.trip_id,
  originName: r.origin_name, destinationName: r.destination_name, departureAt: r.departure_at, tripStars: r.trip_stars, driverStars: r.driver_stars, createdAt: r.created_at, hiddenAt: r.hidden_at,
});

export const RATINGS_PAGE = 50;
export const RATING_VISIBILITY = ['all', 'visible', 'hidden'] as const;
export type RatingVisibility = (typeof RATING_VISIBILITY)[number];

/** The moderation page's query string. Anything invalid falls back to the defaults at the page; nothing here is trusted by the database (it validates again). */
export const ratingsListSchema = z.object({
  company: z.string().uuid().optional(),
  show: z.enum(RATING_VISIBILITY).default('all'),
  before: z.string().datetime({ offset: true }).optional(),
  beforeId: z.string().uuid().optional(),
}).refine((q) => (q.before === undefined) === (q.beforeId === undefined), { message: 'before and beforeId go together' });
export type RatingsListQuery = z.infer<typeof ratingsListSchema>;

export const setHiddenSchema = z.object({
  ratingId: z.string().uuid(),
  hidden: z.enum(['true', 'false']).transform((v) => v === 'true'),
  company: z.string().uuid().optional(),
  show: z.enum(RATING_VISIBILITY).default('all'),
});

export interface RatingsPage { rows: PlatformRating[]; next: { before: string; beforeId: string } | null }
