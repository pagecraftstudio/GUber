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

export type BookingRow = { id: string; reference: string; status: string; seats_count: number; total_amount: number | string; currency: string; payment_due_at?: string | null; idempotent_replay?: boolean };
/** `pending` = seats held until `paymentDueAt` (the company asks for payment first); `confirmed` = ticket ready. */
export type BookedTrip = { id: string; reference: string; status: 'pending' | 'confirmed'; seats: number; total: number; currency: string; paymentDueAt: string | null };
export const toBooked = (r: BookingRow): BookedTrip => ({
  id: r.id, reference: r.reference, status: r.status === 'pending' ? 'pending' : 'confirmed', seats: r.seats_count, total: Number(r.total_amount), currency: r.currency, paymentDueAt: r.payment_due_at ?? null,
});

export type QuoteRow = { unit_price: number | string; total: number | string; currency: string; seats: number; seats_available: number; max_seats: number; requires_payment: boolean; deadline_hours: number | null;
  subscription?: { id: string; plan_name: string; leg: 'go' | 'return'; free: boolean; day_limit_reached: boolean } | null };
/** The caller's own subscription for this trip's company and route (decided by the database). `free` = this seat costs nothing; `dayLimitReached` = the free go/return of that day is already used. */
export type QuoteSubscription = { planName: string; leg: 'go' | 'return'; free: boolean; dayLimitReached: boolean };
export type Quote = { unitPrice: number; total: number; currency: string; seats: number; requiresPayment: boolean; deadlineHours: number | null; subscription: QuoteSubscription | null };
export const toQuote = (r: QuoteRow): Quote => ({ unitPrice: Number(r.unit_price), total: Number(r.total), currency: r.currency, seats: r.seats, requiresPayment: r.requires_payment, deadlineHours: r.deadline_hours,
  subscription: r.subscription ? { planName: r.subscription.plan_name, leg: r.subscription.leg, free: r.subscription.free, dayLimitReached: r.subscription.day_limit_reached } : null });

export type PaymentRow = {
  reference: string; status: string; payment_status: string; total: number | string; amount_paid: number | string; currency: string; payment_due_at: string | null; timezone: string;
  instructions: { vodafone_cash_number: string | null; vodafone_cash_holder: string | null; instapay_address: string | null; instapay_holder: string | null; whatsapp: string | null; note_en: string | null; note_ar: string | null } | null;
};
export type PaymentInfo = {
  reference: string; status: string; paymentStatus: string; total: number; amountPaid: number; currency: string; dueAt: string | null; timeZone: string;
  vodafoneNumber: string | null; vodafoneHolder: string | null; instapayAddress: string | null; instapayHolder: string | null; whatsapp: string | null; noteEn: string | null; noteAr: string | null; hasInstructions: boolean;
};
export const toPayment = (r: PaymentRow): PaymentInfo => ({
  reference: r.reference, status: r.status, paymentStatus: r.payment_status, total: Number(r.total), amountPaid: Number(r.amount_paid), currency: r.currency, dueAt: r.payment_due_at, timeZone: r.timezone,
  vodafoneNumber: r.instructions?.vodafone_cash_number ?? null, vodafoneHolder: r.instructions?.vodafone_cash_holder ?? null, instapayAddress: r.instructions?.instapay_address ?? null,
  instapayHolder: r.instructions?.instapay_holder ?? null, whatsapp: r.instructions?.whatsapp ?? null, noteEn: r.instructions?.note_en ?? null, noteAr: r.instructions?.note_ar ?? null, hasInstructions: r.instructions !== null,
});

/** The WhatsApp link the student taps to send the transfer proof; the text names the booking so staff can match it. Digits only in the number (wa.me form). */
export const proofWhatsappUrl = (whatsappE164: string, text: string): string => `https://wa.me/${whatsappE164.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
