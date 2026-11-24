'use server';
import { revalidatePath } from 'next/cache';
import { requireCustomer } from '@/lib/auth/guards';
import { toClientError } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { ensureCaptchaPass } from '@/lib/captcha/pass';
import { tripBookingService } from './service';
import type { BookedTrip, PaymentInfo, Quote } from './types';

export type BookResult = { ok: true; booking: BookedTrip } | { ok: false; code: string; detail?: string };
const isNextSignal = (e: unknown) => typeof e === 'object' && e !== null && 'digest' in e && String((e as { digest: unknown }).digest).startsWith('NEXT_');

/** The student comes from the session; the company from the trip. Nothing about either is read from the form. */
export async function bookTripAction(input: unknown, captchaToken?: string | null): Promise<BookResult> {
  let booking: BookedTrip;
  try {
    const auth = await requireCustomer();
    const db = await createClient();
    await ensureCaptchaPass(db, auth.userId, 'booking', captchaToken);   // no-op while enforcement is off; the booking RPC consumes the pass
    booking = await tripBookingService.book({ db, userId: auth.userId }, input);
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

export type CoverageResult = { ok: true; coverage: Record<string, { planName: string; leg: 'go' | 'return'; available: boolean }> } | { ok: false };
/** Marketplace labels: which listed trips are free for the signed-in student. Never redirects (the marketplace is public): signed out or failing means "no labels". */
export async function loadTripCoverageAction(tripIds: unknown): Promise<CoverageResult> {
  try {
    const auth = await requireCustomer();
    return { ok: true, coverage: await tripBookingService.coverage({ db: await createClient(), userId: auth.userId }, tripIds) };
  } catch {
    return { ok: false };
  }
}
