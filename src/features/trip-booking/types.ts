export type TripDetailRow = {
  trip_id: string; company_id: string; company_name: string; company_slug: string; route_id: string; origin_name: string; destination_name: string;
  departure_at: string; arrival_at: string; price: number | string; currency: string; capacity: number; seats_available: number; max_seats_per_booking: number; timezone: string;
};
export type TripDetail = {
  tripId: string; companyName: string; companySlug: string; originName: string; destinationName: string; departureAt: string; arrivalAt: string;
  price: number; currency: string; seatsAvailable: number; maxSeats: number; timeZone: string;
};
export const toTripDetail = (r: TripDetailRow): TripDetail => ({
  tripId: r.trip_id, companyName: r.company_name, companySlug: r.company_slug, originName: r.origin_name, destinationName: r.destination_name,
  departureAt: r.departure_at, arrivalAt: r.arrival_at, price: Number(r.price), currency: r.currency, seatsAvailable: r.seats_available,
  maxSeats: Math.max(1, Math.min(r.max_seats_per_booking, r.seats_available)), timeZone: r.timezone,
});

export type StopRow = { stop_id: string; name: string; address: string | null; stop_order: number; stop_type: 'pickup' | 'dropoff' | 'both'; offset_minutes: number };
export type TripStop = { id: string; name: string; address: string | null; order: number; kind: 'pickup' | 'dropoff' | 'both' };
export const toStop = (r: StopRow): TripStop => ({ id: r.stop_id, name: r.name, address: r.address, order: r.stop_order, kind: r.stop_type });

export type BookingRow = { id: string; reference: string; status: string; seats_count: number; total_amount: number | string; currency: string; idempotent_replay?: boolean };
export type BookedTrip = { id: string; reference: string; seats: number; total: number; currency: string };
export const toBooked = (r: BookingRow): BookedTrip => ({ id: r.id, reference: r.reference, seats: r.seats_count, total: Number(r.total_amount), currency: r.currency });
