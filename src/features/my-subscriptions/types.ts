export type MemberStatus = 'pending' | 'active' | 'rejected' | 'cancelled' | 'expired' | 'revoked';

export type MySubscriptionRow = {
  id: string; company_id: string; company_name: string; plan_id: string; plan_name: string; route_id: string;
  origin_name: string; destination_name: string; status: MemberStatus; price: number | string; currency: string;
  valid_from: string | null; valid_to: string | null; requested_at: string; masar_id: string;
};
export type MySubscription = {
  id: string; planId: string; companyName: string; planName: string; originName: string; destinationName: string; status: MemberStatus;
  price: number; currency: string; validFrom: string | null; validTo: string | null; requestedAt: string; masarId: string;
  /** IANA zone of the company, so trip times show as the company's clock reads. */
  timeZone: string;
};
export const toMySubscription = (r: MySubscriptionRow, timeZone = 'Africa/Cairo'): MySubscription => ({
  id: r.id, planId: r.plan_id, companyName: r.company_name, planName: r.plan_name, originName: r.origin_name, destinationName: r.destination_name,
  status: r.status, price: Number(r.price), currency: r.currency, validFrom: r.valid_from, validTo: r.valid_to, requestedAt: r.requested_at, masarId: r.masar_id, timeZone,
});

export type PublicPlanRow = {
  plan_id: string; company_id: string; company_name: string; route_id: string; origin_name: string; destination_name: string; name: string;
  price: number | string; currency: string; validity_type: 'duration' | 'range'; duration_months: number | null; starts_on: string | null; ends_on: string | null;
};
export type PublicPlan = {
  planId: string; companyName: string; originName: string; destinationName: string; name: string; price: number; currency: string;
  validityType: 'duration' | 'range'; durationMonths: number | null; startsOn: string | null; endsOn: string | null;
};
export const toPublicPlan = (r: PublicPlanRow): PublicPlan => ({
  planId: r.plan_id, companyName: r.company_name, originName: r.origin_name, destinationName: r.destination_name, name: r.name,
  price: Number(r.price), currency: r.currency, validityType: r.validity_type, durationMonths: r.duration_months, startsOn: r.starts_on, endsOn: r.ends_on,
});

export type TripOptionRow = { trip_id: string; route_id: string; departure_at: string; arrival_at: string; seats_available: number; origin_name?: string; destination_name?: string };
export type TripOption = { tripId: string; departureAt: string; arrivalAt: string; seatsAvailable: number; originName: string; destinationName: string };
export const toTripOption = (r: TripOptionRow): TripOption => ({
  tripId: r.trip_id, departureAt: r.departure_at, arrivalAt: r.arrival_at, seatsAvailable: r.seats_available, originName: r.origin_name ?? '', destinationName: r.destination_name ?? '',
});

export type DayState = { goBooked: boolean; returnBooked: boolean };

export type SubscriberBookingRow = {
  booking_id: string; reference: string; trip_id: string; trip_leg: 'outbound' | 'return' | null; direction: 'go' | 'return';
  departure_at: string; arrival_at: string; origin_name: string; destination_name: string; status: string; scanned: boolean;
};
export type SubscriberBooking = {
  bookingId: string; reference: string; tripLeg: 'outbound' | 'return' | null; direction: 'go' | 'return'; departureAt: string; arrivalAt: string;
  originName: string; destinationName: string; status: string; scanned: boolean;
};
export const toSubscriberBooking = (r: SubscriberBookingRow): SubscriberBooking => ({
  bookingId: r.booking_id, reference: r.reference, tripLeg: r.trip_leg, direction: r.direction, departureAt: r.departure_at, arrivalAt: r.arrival_at,
  originName: r.origin_name, destinationName: r.destination_name, status: r.status, scanned: r.scanned,
});

export type MemberProfile = { masarId: string; phone: string | null; fullName: string };
