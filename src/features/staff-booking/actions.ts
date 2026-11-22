'use server';
import { revalidatePath } from 'next/cache';
import { normalizeDigits, parseAmountInput } from '@/ds/format/normalize-digits';
import { requireTenant } from '@/lib/auth/guards';
import { toClientError } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { createTenantServiceContext } from '@/lib/service/context';
import { staffBookingService } from './service';
import { toE164Eg } from './schema';

export type StaffBookingActionResult =
  | { ok: true; id: string; reference: string; status: string; total: number; currency: string; amountRecorded: number; amountError?: string; replay: boolean }
  | { ok: false; code: string; detail?: string };

const isNextSignal = (e: unknown) => typeof e === 'object' && e !== null && 'digest' in e && String((e as { digest: unknown }).digest).startsWith('NEXT_');
const s = (f: FormData, k: string) => String(f.get(k) ?? '').trim();

/** Company comes from the session; trip, customer and amount are validated again by the service and the RPC. */
export async function createStaffBookingAction(f: FormData): Promise<StaffBookingActionResult> {
  try {
    const ctx = createTenantServiceContext(await createClient(), await requireTenant());
    const rawAmount = s(f, 'amountReceived');
    const amount = rawAmount ? parseAmountInput(rawAmount) : undefined;
    if (rawAmount && amount === null) return { ok: false, code: 'validation', detail: 'amount_invalid' };
    const r = await staffBookingService.create(ctx, {
      tripId: s(f, 'tripId'), customerName: s(f, 'customerName'), customerPhone: toE164Eg(normalizeDigits(s(f, 'customerPhone'))),
      seats: s(f, 'seats'), customerEmail: s(f, 'customerEmail') || undefined, notes: s(f, 'notes') || undefined,
      idempotencyKey: s(f, 'idempotencyKey') || undefined, ...(amount ? { amountReceived: amount } : {}),
    });
    revalidatePath('/dashboard/bookings'); revalidatePath('/dashboard/trips');
    const b = r.booking;
    return { ok: true, id: b.id, reference: b.reference, status: b.status, total: b.totalAmount, currency: b.currency, amountRecorded: r.amountRecorded, amountError: r.amountError, replay: b.idempotentReplay };
  } catch (e) {
    if (isNextSignal(e)) throw e;
    const c = toClientError(e);
    return { ok: false, code: c.code, detail: c.detail };
  }
}
