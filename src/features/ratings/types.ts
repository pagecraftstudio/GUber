export type RatingState = 'not_open_yet' | 'open' | 'closed' | 'rated';

/** One boarded booking of a finished trip, as the rider sees it (my_rateable_bookings, 0061). */
export interface RateableBooking {
  bookingId: string; tripId: string; companyName: string; originName: string; destinationName: string;
  departureAt: string; endedAt: string; state: RatingState; opensAt: string; closesAt: string;
  myTripStars: number | null; myDriverStars: number | null;
}
export interface RateableRow {
  booking_id: string; trip_id: string; company_name: string; origin_name: string; destination_name: string;
  departure_at: string; ended_at: string; state: RatingState; opens_at: string; closes_at: string; my_trip_stars: number | null; my_driver_stars: number | null;
}
export const toRateable = (r: RateableRow): RateableBooking => ({
  bookingId: r.booking_id, tripId: r.trip_id, companyName: r.company_name, originName: r.origin_name, destinationName: r.destination_name,
  departureAt: r.departure_at, endedAt: r.ended_at, state: r.state, opensAt: r.opens_at, closesAt: r.closes_at, myTripStars: r.my_trip_stars, myDriverStars: r.my_driver_stars,
});

/** Public company rating (company_public_ratings): `average` is null until the company has enough ratings ("New"). */
export interface CompanyRating { companyId: string; ratings: number; average: number | null }
export interface CompanyRatingRow { company_id: string; ratings: number; average: number | string | null }
export const toCompanyRating = (r: CompanyRatingRow): CompanyRating => ({ companyId: r.company_id, ratings: r.ratings, average: r.average === null ? null : Number(r.average) });

/** A manager's view of one driver (company_driver_ratings). */
export interface DriverRating { driverId: string; fullName: string; ratings: number; average: number | null; distribution: number[] }
export interface DriverRatingRow { driver_id: string; full_name: string; ratings: number; average: number | string | null; distribution: number[] }
export const toDriverRating = (r: DriverRatingRow): DriverRating => ({ driverId: r.driver_id, fullName: r.full_name, ratings: r.ratings, average: r.average === null ? null : Number(r.average), distribution: r.distribution });
