export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show';
export type PaymentStatus = 'unpaid' | 'partial' | 'paid' | 'refunded';

export type BookingRow = {
  id: string;
  reference: string;
  trip_id: string;
  customer_id: string;
  pickup_stop_id: string | null;
  dropoff_stop_id: string | null;
  seats_count: number;
  unit_price: number;
  total_amount: number;
  currency: string;
  status: BookingStatus;
  payment_status: PaymentStatus;
  source: 'web' | 'staff';
  notes: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;
  trip: { departure_at: string; route: { name: string } | null } | null;
  customer: { id: string; full_name: string; phone: string } | null;
};

export type Booking = {
  id: string;
  reference: string;
  tripId: string;
  customerId: string;
  pickupStopId: string | null;
  dropoffStopId: string | null;
  seatsCount: number;
  unitPrice: number;
  totalAmount: number;
  currency: string;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  source: 'web' | 'staff';
  notes: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  createdAt: string;
  updatedAt: string;
  /** null when the caller's role cannot read customers / trips (for example operations staff see no customer). */
  trip: { departureAt: string; routeName: string | null } | null;
  customer: { id: string; fullName: string; phone: string } | null;
};

export const BOOKING_SELECT =
  'id,reference,trip_id,customer_id,pickup_stop_id,dropoff_stop_id,seats_count,unit_price,total_amount,currency,status,payment_status,source,notes,cancelled_at,cancellation_reason,created_at,updated_at,trip:trips(departure_at,route:routes(name)),customer:customers(id,full_name,phone)';

export const toBooking = (r: BookingRow): Booking => ({
  id: r.id,
  reference: r.reference,
  tripId: r.trip_id,
  customerId: r.customer_id,
  pickupStopId: r.pickup_stop_id,
  dropoffStopId: r.dropoff_stop_id,
  seatsCount: r.seats_count,
  unitPrice: r.unit_price,
  totalAmount: r.total_amount,
  currency: r.currency,
  status: r.status,
  paymentStatus: r.payment_status,
  source: r.source,
  notes: r.notes,
  cancelledAt: r.cancelled_at,
  cancellationReason: r.cancellation_reason,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  trip: r.trip && { departureAt: r.trip.departure_at, routeName: r.trip.route?.name ?? null },
  customer: r.customer && { id: r.customer.id, fullName: r.customer.full_name, phone: r.customer.phone },
});

/** What create_booking returns. `idempotentReplay` = this call was a retry and nothing new was written. */
export type BookingCreated = {
  id: string;
  reference: string;
  status: BookingStatus;
  tripId: string;
  customerId: string;
  seatsCount: number;
  unitPrice: number;
  totalAmount: number;
  currency: string;
  idempotentReplay: boolean;
};
export type BookingCancelled = { id: string; status: 'cancelled'; alreadyCancelled: boolean; seatsReleased: number };
export type BookingStatusChanged = { id: string; status: BookingStatus; changed: boolean };
export type BookingPaymentChanged = { id: string; paymentStatus: PaymentStatus };

export type CreatedRpc = {
  id: string; reference: string; status: BookingStatus; trip_id: string; customer_id: string; seats_count: number;
  unit_price: number; total_amount: number; currency: string; idempotent_replay: boolean;
};
export const toBookingCreated = (r: CreatedRpc): BookingCreated => ({
  id: r.id, reference: r.reference, status: r.status, tripId: r.trip_id, customerId: r.customer_id, seatsCount: r.seats_count,
  unitPrice: Number(r.unit_price), totalAmount: Number(r.total_amount), currency: r.currency, idempotentReplay: r.idempotent_replay,
});
