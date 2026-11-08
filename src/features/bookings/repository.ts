import { rangeFor, type Page } from '@/lib/db/pagination';
import { asRow, asRows, expectMaybe, expectPage } from '@/lib/db/query';
import type { TenantServiceContext } from '@/lib/service/context';
import { AppError } from '@/lib/errors';
import { mapDbError } from '@/lib/db/map-error';
import { bookingSearchFilter } from './search';
import type { BookingListQuery, CancelBookingInput, CreateBookingInput, SetAmountPaidInput, SetBookingStatusInput, SetPaymentStatusInput } from './schema';
import { BOOKING_SELECT, toBooking, toBookingCreated, type Booking, type BookingAmountPaidChanged, type BookingCancelled, type BookingCreated, type BookingPaymentChanged, type BookingRow, type BookingStatusChanged, type CreatedRpc } from './types';

/**
 * Reads go through the `booking_list` view (0032, SECURITY INVOKER) so RLS of every joined table still applies to the
 * caller. Writes are ONLY the SECURITY DEFINER RPCs of migrations 0010 / 0032: the seat counter moves in the same
 * transaction as the booking row, under a trip row lock. There is deliberately no insert/update here.
 */
export type BookingRepository = {
  list(ctx: TenantServiceContext, q: BookingListQuery): Promise<Page<Booking>>;
  get(ctx: TenantServiceContext, id: string): Promise<Booking | null>;
  create(ctx: TenantServiceContext, input: CreateBookingInput): Promise<BookingCreated>;
  cancel(ctx: TenantServiceContext, input: CancelBookingInput): Promise<BookingCancelled>;
  setStatus(ctx: TenantServiceContext, input: SetBookingStatusInput): Promise<BookingStatusChanged>;
  setPaymentStatus(ctx: TenantServiceContext, input: SetPaymentStatusInput): Promise<BookingPaymentChanged>;
  setAmountPaid(ctx: TenantServiceContext, input: SetAmountPaidInput): Promise<BookingAmountPaidChanged>;
};

function rpcResult<T>(res: { data: unknown; error: Parameters<typeof mapDbError>[0] | null }): T {
  if (res.error) throw mapDbError(res.error);
  if (res.data == null) throw new AppError('internal', { cause: new Error('rpc returned no data') });
  return res.data as T;
}

export const bookingRepository: BookingRepository = {
  async list(ctx, q) {
    let query = ctx.db.from('booking_list').select(BOOKING_SELECT, { count: 'exact' }).eq('company_id', ctx.companyId);
    if (q.status) query = query.eq('status', q.status);
    if (q.paymentStatus) query = query.eq('payment_status', q.paymentStatus);
    if (q.boarding) query = query.eq('boarding_status', q.boarding);
    if (q.source) query = query.eq('source', q.source);
    if (q.tripId) query = query.eq('trip_id', q.tripId);
    if (q.routeId) query = query.eq('route_id', q.routeId);
    if (q.customerId) query = query.eq('customer_id', q.customerId);
    if (q.tripFrom) query = query.gte('trip_departure_at', q.tripFrom);
    if (q.tripTo) query = query.lt('trip_departure_at', q.tripTo);
    if (q.createdFrom) query = query.gte('created_at', q.createdFrom);
    if (q.createdTo) query = query.lt('created_at', q.createdTo);
    const search = bookingSearchFilter(q.q);
    if (search) query = query.or(search);

    // Trip sorts keep one trip's bookings together (departure, then trip id, then booking time). `id` makes paging stable.
    switch (q.sort) {
      case 'trip_asc':
        query = query.order('trip_departure_at', { ascending: true, nullsFirst: false }).order('trip_id').order('created_at', { ascending: true });
        break;
      case 'trip_desc':
        query = query.order('trip_departure_at', { ascending: false, nullsFirst: false }).order('trip_id').order('created_at', { ascending: true });
        break;
      case 'oldest':
        query = query.order('created_at', { ascending: true });
        break;
      case 'name':
        query = query.order('customer_name', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false });
        break;
      default:
        query = query.order('created_at', { ascending: false });
    }
    const { from, to } = rangeFor(q);
    return expectPage<BookingRow, Booking>(asRows(await query.order('id').range(from, to)), toBooking, q);
  },

  async get(ctx, id) {
    return expectMaybe<BookingRow, Booking>(
      asRow(await ctx.db.from('booking_list').select(BOOKING_SELECT).eq('company_id', ctx.companyId).eq('id', id).maybeSingle()),
      toBooking,
    );
  },

  async create(ctx, i) {
    const r = rpcResult<CreatedRpc>(
      await ctx.db.rpc('create_booking', {
        p_trip_id: i.tripId, p_customer_name: i.customerName, p_customer_phone: i.customerPhone, p_seats: i.seats,
        p_customer_email: i.customerEmail ?? null, p_university: i.university ?? null, p_student_id: i.studentId ?? null,
        p_pickup_stop_id: i.pickupStopId ?? null, p_dropoff_stop_id: i.dropoffStopId ?? null,
        p_idempotency_key: i.idempotencyKey ?? null, p_notes: i.notes ?? null, p_status: i.status,
      }),
    );
    return toBookingCreated(r);
  },

  async cancel(ctx, i) {
    const r = rpcResult<{ id: string; status: 'cancelled'; already_cancelled: boolean; seats_released: number }>(
      await ctx.db.rpc('cancel_booking', { p_booking_id: i.bookingId, p_reason: i.reason ?? null }),
    );
    return { id: r.id, status: r.status, alreadyCancelled: r.already_cancelled, seatsReleased: r.seats_released };
  },

  async setStatus(ctx, i) {
    const r = rpcResult<{ id: string; status: BookingStatusChanged['status']; changed: boolean }>(
      await ctx.db.rpc('set_booking_status', { p_booking_id: i.bookingId, p_status: i.status }),
    );
    return { id: r.id, status: r.status, changed: r.changed };
  },

  async setPaymentStatus(ctx, i) {
    const r = rpcResult<{ id: string; payment_status: BookingPaymentChanged['paymentStatus'] }>(
      await ctx.db.rpc('set_booking_payment_status', { p_booking_id: i.bookingId, p_payment_status: i.paymentStatus }),
    );
    return { id: r.id, paymentStatus: r.payment_status };
  },

  async setAmountPaid(ctx, i) {
    const r = rpcResult<{ id: string; amount_paid: number; payment_status: BookingPaymentChanged['paymentStatus']; total_amount: number }>(
      await ctx.db.rpc('set_booking_amount_paid', { p_booking_id: i.bookingId, p_amount: i.amount }),
    );
    return { id: r.id, amountPaid: Number(r.amount_paid), paymentStatus: r.payment_status, totalAmount: Number(r.total_amount) };
  },
};
