'use server';
import { parseAmountInput } from '@/ds/format/normalize-digits';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireTenant } from '@/lib/auth/guards';
import { AppError, toClientError } from '@/lib/errors';
import { createTenantServiceContext, type TenantServiceContext } from '@/lib/service/context';
import { routeService } from '@/features/routes/service';
import { busService } from '@/features/buses/service';
import { driverService } from '@/features/drivers/service';
import { bookingService } from '@/features/bookings/service';
import { routePlanService } from '@/features/route-plans/service';
import type { FutureBooking } from '@/features/route-plans/types';

/**
 * Autosave actions: each applies ONE change and returns a small result. No redirect, so the page never navigates or
 * flashes; revalidatePath refreshes the server data in the same round trip. Authorization is unchanged
 * (requireTenant + the service's permission check + RLS); no company id is read from the client.
 */
export type AutoResult = { ok: true } | { ok: false; code: string; detail?: string };

const isNextSignal = (e: unknown) => typeof e === 'object' && e !== null && 'digest' in e && String((e as { digest: unknown }).digest).startsWith('NEXT_');

async function run(paths: string[], work: (c: TenantServiceContext) => Promise<unknown>): Promise<AutoResult> {
  try {
    const c = createTenantServiceContext(await createClient(), await requireTenant());
    await work(c);
  } catch (e) {
    if (isNextSignal(e)) throw e; // redirect (signed out) / notFound must keep flowing
    const c = toClientError(e);
    return { ok: false, code: c.code, ...(c.detail ? { detail: c.detail } : {}) };
  }
  for (const p of paths) revalidatePath(p);
  return { ok: true };
}

export async function setBusStatusAction(id: string, status: string): Promise<AutoResult> {
  return run(['/dashboard/buses'], (c) => busService.update(c, id, { status: status as 'active' | 'maintenance' | 'inactive' }));
}

export async function setDriverStatusAction(id: string, status: string): Promise<AutoResult> {
  return run(['/dashboard/drivers'], (c) => driverService.update(c, id, { status: status as 'active' | 'inactive' }));
}

export async function setRouteActiveAction(id: string, isActive: boolean): Promise<AutoResult> {
  return run(['/dashboard/routes'], (c) => routeService.update(c, id, { isActive: isActive === true }));
}

/** Staff-entered amount received. Accepts "50", "50.5", "50,5" and Arabic-Indic digits. The database bounds it by the booking total. */
export async function setAmountPaidAction(id: string, rawAmount: string): Promise<AutoResult> {
  const amount = parseAmountInput(String(rawAmount));
  if (amount === null) return { ok: false, code: 'validation', detail: 'amount_invalid' };
  return run(['/dashboard/bookings'], async (c) => {
    try { await bookingService.setAmountPaid(c, { bookingId: id, amount }); }
    catch (e) {
      if (e instanceof AppError && (e.code === 'validation' || e.code === 'business_rule'))
        throw new AppError(e.code, { detail: e.detail === 'amount_exceeds_total' || e.detail === 'booking_not_cancellable' ? e.detail : 'amount_invalid' });
      throw e;
    }
  });
}

export async function setPaymentStatusAction(id: string, paymentStatus: string): Promise<AutoResult> {
  return run(['/dashboard/bookings'], (c) => bookingService.setPaymentStatus(c, { bookingId: id, paymentStatus }));
}

/** Cancel a booking (releases its seats exactly once; repeating is a harmless no-op). */
export async function cancelBookingAction(id: string): Promise<AutoResult> {
  return run(['/dashboard/bookings'], (c) => bookingService.cancel(c, { bookingId: id }));
}

/** Approve (starts the subscription, recorded as paid) or reject a member's request. The company is derived by the RPC from the request row. */
export async function decideSubscriptionAction(id: string, approve: boolean, note?: string): Promise<AutoResult> {
  const n = typeof note === 'string' ? note.trim() : '';
  return run(['/dashboard/subscriptions'], (c) => routePlanService.decide(c, id, { approve: approve === true, ...(n ? { note: n } : {}) }));
}

/** The member's future bookings, for the warning shown before a revoke. Read-only; the RPC checks bookings.write and tenant. */
export async function loadSubscriptionBookingsAction(id: string): Promise<{ ok: true; data: FutureBooking[] } | { ok: false; code: string; detail?: string }> {
  try {
    const c = createTenantServiceContext(await createClient(), await requireTenant());
    return { ok: true, data: await routePlanService.futureBookings(c, id) };
  } catch (e) {
    if (isNextSignal(e)) throw e;
    const c = toClientError(e);
    return { ok: false, code: c.code, ...(c.detail ? { detail: c.detail } : {}) };
  }
}

/** End an active subscription and cancel exactly the chosen future bookings (the others stay). */
export async function revokeSubscriptionAction(id: string, cancelBookingIds: string[], reason?: string): Promise<AutoResult> {
  const r = typeof reason === 'string' ? reason.trim() : '';
  return run(['/dashboard/subscriptions', '/dashboard/bookings'], (c) => routePlanService.revoke(c, id, { cancelBookingIds, ...(r ? { reason: r } : {}) }));
}

/** Plan on/off. The RPC takes the whole editable set, so the current name and price travel with the switch. */
export async function setPlanActiveAction(id: string, name: string, price: number, isActive: boolean): Promise<AutoResult> {
  return run(['/dashboard/plans'], (c) => routePlanService.updatePlan(c, id, { name, price, isActive: isActive === true }));
}

export async function archivePlanAction(id: string): Promise<AutoResult> {
  return run(['/dashboard/plans'], (c) => routePlanService.archivePlan(c, id));
}
