import type { SupabaseClient } from '@supabase/supabase-js';
import { mapDbError } from '@/lib/db/map-error';
import { toCompanyRating, toDriverRating, toRateable, type CompanyRating, type CompanyRatingRow, type DriverRating, type DriverRatingRow, type RateableBooking, type RateableRow } from './types';
import type { SubmitRatingInput } from './schema';

/** Every call runs as the signed-in user's own client: the database derives the rider, the trip's company and the boarded driver itself. */
export type RatingsDb = { readonly db: SupabaseClient };
const list = <T,>(d: unknown): T[] => (Array.isArray(d) ? (d as T[]) : []);

export const ratingsRepository = {
  async mine({ db }: RatingsDb): Promise<RateableBooking[]> {
    const { data, error } = await db.rpc('my_rateable_bookings');
    if (error) throw mapDbError(error);
    return list<RateableRow>(data).map(toRateable);
  },
  async submit({ db }: RatingsDb, i: SubmitRatingInput): Promise<void> {
    const { error } = await db.rpc('submit_trip_rating', { p_booking_id: i.bookingId, p_trip_stars: i.tripStars, p_driver_stars: i.driverStars });
    if (error) throw mapDbError(error);
  },
  async companies({ db }: RatingsDb, ids: string[]): Promise<CompanyRating[]> {
    if (ids.length === 0) return [];
    const { data, error } = await db.rpc('company_public_ratings', { p_company_ids: ids.slice(0, 100) });
    if (error) throw mapDbError(error);
    return list<CompanyRatingRow>(data).map(toCompanyRating);
  },
  async drivers({ db }: RatingsDb): Promise<DriverRating[]> {
    const { data, error } = await db.rpc('company_driver_ratings');
    if (error) throw mapDbError(error);
    return list<DriverRatingRow>(data).map(toDriverRating);
  },
};
