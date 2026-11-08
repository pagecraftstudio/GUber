export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show';
export type PaymentStatus = 'unpaid' | 'partial' | 'paid' | 'refunded';
/** Derived by the booking_list view from the passenger tickets: voided tickets are ignored. */
export type BoardingStatus = 'not_boarded' | 'partial' | 'boarded';

/** One row of the `booking_list` view (migration 0032). SECURITY INVOKER: the caller's RLS applies to every joined table. */
export type BookingRow = {
  id: string;
  reference: string;
  trip_id: string;
  customer_id: string;
  seats_count: number;
  unit_price: number;
  total_amount: number;
  amount_paid: number;
  currency: string;
  status: BookingStatus;
  payment_status: PaymentStatus;
  source: 'web' | 'staff';
  notes: string | null;
  created_at: string;
  trip_departure_at: string | null;
  trip_status: string | null;
  route_id: string | null;
  route_name: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  customer_student_id: string | null;
  customer_university: string | null;
  tickets_total: number;
  tickets_boarded: number;
  boarding_status: BoardingStatus;
};

export type Booking = {
  id: string;
  reference: string;
  tripId: string;
  customerId: string;
  seatsCount: number;
  unitPrice: number;
  totalAmount: number;
  /** Money received so far. payment_status is derived from it by the database. */
  amountPaid: number;
  currency: string;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  source: 'web' | 'staff';
  notes: string | null;
  createdAt: string;
  /** Non-void tickets, and how many of them have boarded. */
  ticketsTotal: number;
  ticketsBoarded: number;
  boardingStatus: BoardingStatus;
  /** null when the caller's role cannot read trips (the view still returns the booking row). */
  trip: { departureAt: string; status: string | null; routeId: string | null; routeName: string | null } | null;
  /** null when the caller's role cannot read customers (for example operations staff). */
  customer: { id: string; fullName: string; phone: string; email: string | null; studentId: string | null; university: string | null } | null;
};

export const BOOKING_SELECT =
  'id,reference,trip_id,customer_id,seats_count,unit_price,total_amount,amount_paid,currency,status,payment_status,source,notes,created_at,trip_departure_at,trip_status,route_id,route_name,customer_name,customer_phone,customer_email,customer_student_id,customer_university,tickets_total,tickets_boarded,boarding_status';

// numeric columns can arrive as strings depending on the client: always normalise.
export const toBooking = (r: BookingRow): Booking => ({
  id: r.id,
  reference: r.reference,
  tripId: r.trip_id,
  customerId: r.customer_id,
  seatsCount: r.seats_count,
  unitPrice: Number(r.unit_price),
  totalAmount: Number(r.total_amount),
  amountPaid: Number(r.amount_paid),
  currency: r.currency,
  status: r.status,
  paymentStatus: r.payment_status,
  source: r.source,
  notes: r.notes,
  createdAt: r.created_at,
  ticketsTotal: r.tickets_total,
  ticketsBoarded: r.tickets_boarded,
  boardingStatus: r.boarding_status,
  trip: r.trip_departure_at ? { departureAt: r.trip_departure_at, status: r.trip_status, routeId: r.route_id, routeName: r.route_name } : null,
  customer: r.customer_name !== null && r.customer_phone !== null
    ? { id: r.customer_id, fullName: r.customer_name, phone: r.customer_phone, email: r.customer_email, studentId: r.customer_student_id, university: r.customer_university }
    : null,
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
export type BookingAmountPaidChanged = { id: string; amountPaid: number; paymentStatus: PaymentStatus; totalAmount: number };

export type CreatedRpc = {
  id: string; reference: string; status: BookingStatus; trip_id: string; customer_id: string; seats_count: number;
  unit_price: number; total_amount: number; currency: string; idempotent_replay: boolean;
};
export const toBookingCreated = (r: CreatedRpc): BookingCreated => ({
  id: r.id, reference: r.reference, status: r.status, tripId: r.trip_id, customerId: r.customer_id, seatsCount: r.seats_count,
  unitPrice: Number(r.unit_price), totalAmount: Number(r.total_amount), currency: r.currency, idempotentReplay: r.idempotent_replay,
});
