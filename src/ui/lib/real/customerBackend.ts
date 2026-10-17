import type { SupabaseClient } from '@supabase/supabase-js';

/** Rows exactly as the database RPCs return them (snake_case). Mapped to UI types in adapters.ts. */
export interface PublicTripRow {
  trip_id: string; company_id: string; company_name: string; company_slug: string;
  route_id: string; origin_name: string; destination_name: string;
  departure_at: string; arrival_at: string;
  price: number | string; currency: string; capacity: number; seats_available: number;
  max_seats_per_booking: number; timezone: string;
}
export interface PublicStopRow {
  stop_id: string; name: string; address: string | null; stop_order: number; stop_type: 'pickup' | 'dropoff' | 'both'; offset_minutes: number;
}
export interface BookingDetailRow {
  id: string; company_id: string; company_name: string; company_slug: string; reference: string; trip_id: string;
  seats_count: number; total_amount: number | string; currency: string; status: string; payment_status: string;
  created_at: string; cancelled_at: string | null;
  origin_name: string; destination_name: string; departure_at: string; arrival_at: string; trip_status: string;
  pickup_stop_name: string | null; dropoff_stop_name: string | null; can_cancel: boolean;
}
/** my_ticket_qr row. qr_payload is a FRESH one-time-issued token (the database keeps only its hash); null for a ticket that already boarded. */
export interface TicketQrRow { ticket_id: string; ticket_index: number; status: 'valid' | 'boarded'; qr_payload: string | null }
export interface CreatedBooking {
  id: string; reference: string; status: string; trip_id: string; seats_count: number;
  unit_price: number | string; total_amount: number | string; currency: string; idempotent_replay: boolean;
}
export interface CreateBookingInput {
  tripId: string; seats: number; fullName: string; phoneE164: string; email?: string;
  university?: string; studentId?: string; pickupStopId?: string; dropoffStopId?: string;
  idempotencyKey: string; notes?: string;
}
export interface SearchInput { origin?: string; destination?: string; date?: string; companyId?: string; limit?: number; offset?: number }

export type BackendErrorCode =
  | 'auth_required' | 'trip_unavailable' | 'seats_unavailable' | 'seats_per_booking' | 'phone_registered'
  | 'invalid_input' | 'invalid_phone' | 'cancel_window_closed' | 'booking_closed' | 'booking_not_found'
  | 'idempotency_conflict' | 'plan_limit' | 'tickets_unavailable' | 'unknown';

export class BackendError extends Error {
  constructor(readonly code: BackendErrorCode, message: string, readonly pgCode?: string, readonly hint?: string) {
    super(message);
    this.name = 'BackendError';
  }
}

const MESSAGES: Record<BackendErrorCode, { en: string; ar: string }> = {
  auth_required: { en: 'Please sign in to continue.', ar: 'يرجى تسجيل الدخول للمتابعة.' },
  trip_unavailable: { en: 'This trip is no longer available for booking.', ar: 'هذه الرحلة لم تعد متاحة للحجز.' },
  seats_unavailable: { en: 'Not enough seats are left on this trip.', ar: 'لا توجد مقاعد كافية في هذه الرحلة.' },
  seats_per_booking: { en: 'You requested more seats than allowed per booking.', ar: 'عدد المقاعد المطلوب يتجاوز الحد المسموح للحجز الواحد.' },
  phone_registered: { en: 'This phone number is already registered with this company. Verify your phone to link it.', ar: 'رقم الهاتف مسجل بالفعل لدى هذه الشركة. قم بتأكيد رقمك لربطه.' },
  invalid_input: { en: 'Some of the details are invalid. Please check and try again.', ar: 'بعض البيانات غير صالحة. يرجى المراجعة والمحاولة مرة أخرى.' },
  invalid_phone: { en: 'Enter a valid phone number.', ar: 'أدخل رقم هاتف صالحاً.' },
  cancel_window_closed: { en: 'The free cancellation period for this trip has ended.', ar: 'انتهت فترة الإلغاء المتاحة لهذه الرحلة.' },
  booking_closed: { en: 'This booking can no longer be changed.', ar: 'لا يمكن تعديل هذا الحجز بعد الآن.' },
  booking_not_found: { en: 'Booking not found.', ar: 'الحجز غير موجود.' },
  idempotency_conflict: { en: 'This request conflicts with an earlier one. Please start again.', ar: 'يتعارض هذا الطلب مع طلب سابق. يرجى البدء من جديد.' },
  plan_limit: { en: 'This company cannot accept more bookings right now.', ar: 'لا تستطيع هذه الشركة قبول المزيد من الحجوزات حالياً.' },
  tickets_unavailable: { en: 'Tickets are not available for this booking (it may be cancelled or the trip has closed).', ar: 'التذاكر غير متاحة لهذا الحجز (قد يكون ملغى أو أُغلقت الرحلة).' },
  unknown: { en: 'Something went wrong. Please try again.', ar: 'حدث خطأ ما. يرجى المحاولة مرة أخرى.' },
};

/** Map a PostgREST/Postgres error (SQLSTATE + message from the RPCs in 0010/0012/0013) to a stable code. */
export function classifyError(pgCode: string | undefined, message: string): BackendErrorCode {
  const m = message.toLowerCase();
  if (pgCode === '28000' || m.includes('not authenticated') || pgCode === 'PGRST301') return 'auth_required';
  if (pgCode === '42501') return m.includes('permission denied') || m.includes('jwt') ? 'auth_required' : 'unknown';
  if (pgCode === 'P0002') return m.includes('booking') ? 'booking_not_found' : 'trip_unavailable';
  if (pgCode === '53400') return 'plan_limit';
  if (pgCode === '23505') return m.includes('phone already registered') ? 'phone_registered' : 'idempotency_conflict';
  if (pgCode === '23514') {
    if (m.includes('not enough seats')) return 'seats_unavailable';
    if (m.includes('seats per booking')) return 'seats_per_booking';
    if (m.includes('tickets are not available')) return 'tickets_unavailable';
    if (m.includes('cancellation window')) return 'cancel_window_closed';
    if (m.includes('trip is not open') || m.includes('already departed')) return 'trip_unavailable';
    if (m.includes('cannot be cancelled') || m.includes('trip is closed')) return 'booking_closed';
    return 'invalid_input';
  }
  if (pgCode === '22023') return m.includes('phone') ? 'invalid_phone' : 'invalid_input';
  return 'unknown';
}

export function describeBackendError(err: unknown, locale: 'ar' | 'en'): string {
  if (err instanceof BackendError) return MESSAGES[err.code][locale];
  if (err instanceof Error && err.message) return err.message;
  return MESSAGES.unknown[locale];
}

interface RpcError { code?: string; message: string; hint?: string }

async function rpc<T>(client: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = (await client.rpc(fn, args)) as { data: T | null; error: RpcError | null };
  if (error) {
    const code = classifyError(error.code, error.message);
    throw new BackendError(code, MESSAGES[code].en, error.code, error.hint);
  }
  return data as T;
}

/**
 * Thin, typed wrappers over the database RPCs. NOTHING here sends a company id, customer id or user id for
 * authorization: the database derives them from the trip and from auth.uid().
 */
export function createCustomerBackend(client: SupabaseClient) {
  return {
    searchTrips: (i: SearchInput = {}) =>
      rpc<PublicTripRow[]>(client, 'public_search_trips', {
        p_origin: i.origin ?? null, p_destination: i.destination ?? null, p_date: i.date || null,
        p_company_id: i.companyId ?? null, p_limit: i.limit ?? 100, p_offset: i.offset ?? 0,
      }),
    tripStops: (tripId: string) => rpc<PublicStopRow[]>(client, 'public_trip_stops', { p_trip_id: tripId }),
    createBooking: (i: CreateBookingInput) =>
      rpc<CreatedBooking>(client, 'create_my_booking', {
        p_trip_id: i.tripId, p_seats: i.seats, p_full_name: i.fullName, p_phone: i.phoneE164,
        p_email: i.email ?? null, p_university: i.university ?? null, p_student_id: i.studentId ?? null,
        p_pickup_stop_id: i.pickupStopId || null, p_dropoff_stop_id: i.dropoffStopId || null,
        p_idempotency_key: i.idempotencyKey, p_notes: i.notes ?? null,
      }),
    cancelBooking: (bookingId: string, reason?: string) =>
      rpc<{ id: string; status: string; already_cancelled: boolean; seats_released: number }>(client, 'cancel_my_booking', {
        p_booking_id: bookingId, p_reason: reason ?? null,
      }),
    /** Issues a fresh QR token per boardable ticket (older screenshots stop working). Call on demand, never on a list render. */
    ticketQr: (bookingId: string) => rpc<TicketQrRow[]>(client, 'my_ticket_qr', { p_booking_id: bookingId }),
    myBookings: (companyId?: string) => rpc<BookingDetailRow[]>(client, 'my_booking_details', { p_company_id: companyId ?? null }),
    updateMyCustomer: (companyId: string, f: { fullName?: string; email?: string; university?: string; studentId?: string }) =>
      rpc<{ customer_id: string }>(client, 'update_my_customer', {
        p_company_id: companyId, p_full_name: f.fullName ?? null, p_email: f.email ?? null,
        p_university: f.university ?? null, p_student_id: f.studentId ?? null,
      }),
  };
}
export type CustomerBackend = ReturnType<typeof createCustomerBackend>;
