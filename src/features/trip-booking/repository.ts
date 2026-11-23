import type { SupabaseClient } from '@supabase/supabase-js';
import { mapDbError } from '@/lib/db/map-error';
import type { BookTripInput } from './schema';
import { toBooked, toPayment, toQuote, toStop, toTripDetail, type BookedTrip, type BookingRow, type PaymentInfo, type PaymentRow, type Quote, type QuoteRow, type StopRow, type TripDetail, type TripDetailRow, type TripStop } from './types';

/** Every call runs as the signed-in student's own client: the database derives the customer from auth.uid() and the company from the trip. */
export type BookingDb = { readonly db: SupabaseClient };

export const tripBookingRepository = {
  async detail({ db }: BookingDb, tripId: string): Promise<TripDetail | null> {
    const { data, error } = await db.rpc('public_trip_detail', { p_trip_id: tripId });
    if (error) throw mapDbError(error);
    const row = Array.isArray(data) ? (data[0] as TripDetailRow | undefined) : undefined;
    return row ? toTripDetail(row) : null;
  },
  async stops({ db }: BookingDb, tripId: string): Promise<TripStop[]> {
    const { data, error } = await db.rpc('public_trip_stops', { p_trip_id: tripId });
    if (error) throw mapDbError(error);
    return (Array.isArray(data) ? (data as StopRow[]) : []).map(toStop).sort((a, b) => a.order - b.order);
  },
  async quote({ db }: BookingDb, tripId: string, seats: number): Promise<Quote> {
    const { data, error } = await db.rpc('quote_my_booking', { p_trip_id: tripId, p_seats: seats });
    if (error) throw mapDbError(error);
    return toQuote(data as QuoteRow);
  },
  async payment({ db }: BookingDb, bookingId: string): Promise<PaymentInfo> {
    const { data, error } = await db.rpc('my_booking_payment', { p_booking_id: bookingId });
    if (error) throw mapDbError(error);
    return toPayment(data as PaymentRow);
  },
  /** Which of these trips the signed-in student rides free (own subscription, same company, plan route or its return, free seat of that day still unused). */
  async coverage({ db }: BookingDb, tripIds: string[]): Promise<Record<string, { planName: string; leg: 'go' | 'return'; available: boolean }>> {
    const { data, error } = await db.rpc('my_trip_coverage', { p_trip_ids: tripIds });
    if (error) throw mapDbError(error);
    const out: Record<string, { planName: string; leg: 'go' | 'return'; available: boolean }> = {};
    for (const r of Array.isArray(data) ? (data as { trip_id: string; plan_name: string; leg: 'go' | 'return'; available: boolean }[]) : []) out[r.trip_id] = { planName: r.plan_name, leg: r.leg, available: r.available };
    return out;
  },
  /** One free seat covered by the caller's subscription. The database re-checks coverage, validity, the daily limit and capacity. */
  async bookFree({ db }: BookingDb, i: BookTripInput): Promise<BookedTrip> {
    const { data, error } = await db.rpc('create_my_subscriber_trip_booking', { p_trip_id: i.tripId, p_pickup_stop_id: i.pickupStopId ?? null, p_dropoff_stop_id: i.dropoffStopId ?? null });
    if (error) throw mapDbError(error);
    return toBooked(data as BookingRow);
  },
  async book({ db }: BookingDb, i: BookTripInput): Promise<BookedTrip> {
    const { data, error } = await db.rpc('create_my_booking', {
      p_trip_id: i.tripId, p_seats: i.seats, p_full_name: i.fullName, p_phone: i.phone, p_email: i.email ?? null, p_university: i.university ?? null,
      p_student_id: i.studentId ?? null, p_pickup_stop_id: i.pickupStopId ?? null, p_dropoff_stop_id: i.dropoffStopId ?? null,
      p_idempotency_key: i.idempotencyKey, p_notes: i.notes ?? null,
    });
    if (error) throw mapDbError(error);
    return toBooked(data as BookingRow);
  },
};
export type TripBookingRepository = typeof tripBookingRepository;
