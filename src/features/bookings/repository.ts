import { rangeFor, type Page } from '@/lib/db/pagination';
import { asRow, asRows, expectMaybe, expectPage } from '@/lib/db/query';
import { ilikeAny } from '@/lib/db/search';
import type { TenantServiceContext } from '@/lib/service/context';
import { AppError } from '@/lib/errors';
import { mapDbError } from '@/lib/db/map-error';
import type { BookingListQuery, CancelBookingInput, CreateBookingInput, SetBookingStatusInput, SetPaymentStatusInput } from './schema';
import { BOOKING_SELECT, toBooking, toBookingCreated, type Booking, type BookingCancelled, type BookingCreated, type BookingPaymentChanged, type BookingRow, type BookingStatusChanged, type CreatedRpc } from './types';

/**
 * Reads go through RLS. Writes are ONLY the SECURITY DEFINER RPCs of migration 0010: the seat counter moves in the
 * same transaction as the booking row, under a trip row lock. There is deliberately no insert/update here.
 */
export type BookingRepository = {
  list(ctx: TenantServiceContext, q: BookingListQuery): Promise<Page<Booking>>;
  get(ctx: TenantServiceContext, id: string): Promise<Booking | null>;
  create(ctx: TenantServiceContext, input: CreateBookingInput): Promise<BookingCreated>;
  cancel(ctx: TenantServiceContext, input: CancelBookingInput): Promise<BookingCancelled>;
  setStatus(ctx: TenantServiceContext, input: SetBookingStatusInput): Promise<BookingStatusChanged>;
  setPaymentStatus(ctx: TenantServiceContext, input: SetPaymentStatusInput): Promise<BookingPaymentChanged>;
};

function rpcResult<T>(res: { data: unknown; error: Parameters<typeof mapDbError>[0] | null }): T {
  if (res.error) throw mapDbError(res.error);
  if (res.data == null) throw new AppError('internal', { cause: new Error('rpc returned no data') });
  return res.data as T;
}

export const bookingRepository: BookingRepository = {
  async list(ctx, q) {
    let query = ctx.db.from('bookings').select(BOOKING_SELECT, { count: 'exact' }).eq('company_id', ctx.companyId);
    if (q.status) query = query.eq('status', q.status);
    if (q.paymentStatus) query = query.eq('payment_status', q.paymentStatus);
    if (q.tripId) query = query.eq('trip_id', q.tripId);
    if (q.customerId) query = query.eq('customer_id', q.customerId);
    if (q.createdFrom) query = query.gte('created_at', q.createdFrom);
    if (q.createdTo) query = query.lt('created_at', q.createdTo);
    const search = ilikeAny(['reference'], q.q);
    if (search) query = query.or(search);
    const { from, to } = rangeFor(q);
    return expectPage<BookingRow, Booking>(asRows(await query.order('created_at', { ascending: q.dir === 'asc' }).order('id').range(from, to)), toBooking, q);
  },

  async get(ctx, id) {
    return expectMaybe<BookingRow, Booking>(
      asRow(await ctx.db.from('bookings').select(BOOKING_SELECT).eq('company_id', ctx.companyId).eq('id', id).maybeSingle()),
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
};
