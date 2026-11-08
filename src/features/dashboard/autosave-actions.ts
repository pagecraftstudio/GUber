'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireTenant } from '@/lib/auth/guards';
import { AppError, toClientError } from '@/lib/errors';
import { createTenantServiceContext, type TenantServiceContext } from '@/lib/service/context';
import { routeService } from '@/features/routes/service';
import { busService } from '@/features/buses/service';
import { driverService } from '@/features/drivers/service';
import { bookingService } from '@/features/bookings/service';

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
  const raw = String(rawAmount).trim().replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace('٫', '.').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) return { ok: false, code: 'validation', detail: 'amount_invalid' };
  return run(['/dashboard/bookings'], async (c) => {
    try { await bookingService.setAmountPaid(c, { bookingId: id, amount: Number(raw) }); }
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
