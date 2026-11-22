'use server';
import { revalidatePath } from 'next/cache';
import { requireCustomer } from '@/lib/auth/guards';
import { toClientError } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { tripBookingService } from './service';
import type { BookedTrip, PaymentInfo, Quote } from './types';

export type BookResult = { ok: true; booking: BookedTrip } | { ok: false; code: string; detail?: string };
const isNextSignal = (e: unknown) => typeof e === 'object' && e !== null && 'digest' in e && String((e as { digest: unknown }).digest).startsWith('NEXT_');

/** The student comes from the session; the company from the trip. Nothing about either is read from the form. */
export async function bookTripAction(input: unknown): Promise<BookResult> {
  let booking: BookedTrip;
  try {
    const auth = await requireCustomer();
    booking = await tripBookingService.book({ db: await createClient(), userId: auth.userId }, input);
  } catch (e) {
    if (isNextSignal(e)) throw e;
    const c = toClientError(e);
    return { ok: false, code: c.code, ...(c.detail ? { detail: c.detail } : {}) };
  }
  revalidatePath('/my-bookings');
  return { ok: true, booking };
}

export type QuoteResult = { ok: true; quote: Quote } | { ok: false; code: string; detail?: string };
export async function quoteBookingAction(tripId: unknown, seats: unknown): Promise<QuoteResult> {
  try {
    const auth = await requireCustomer();
    return { ok: true, quote: await tripBookingService.quote({ db: await createClient(), userId: auth.userId }, tripId, seats) };
  } catch (e) {
    if (isNextSignal(e)) throw e;
    const c = toClientError(e);
    return { ok: false, code: c.code, ...(c.detail ? { detail: c.detail } : {}) };
  }
}

export type PaymentResult = { ok: true; payment: PaymentInfo } | { ok: false; code: string; detail?: string };
export async function bookingPaymentAction(bookingId: unknown): Promise<PaymentResult> {
  try {
    const auth = await requireCustomer();
    return { ok: true, payment: await tripBookingService.payment({ db: await createClient(), userId: auth.userId }, bookingId) };
  } catch (e) {
    if (isNextSignal(e)) throw e;
    const c = toClientError(e);
    return { ok: false, code: c.code, ...(c.detail ? { detail: c.detail } : {}) };
  }
}
