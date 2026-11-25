'use server';
import { revalidatePath } from 'next/cache';
import { requireCustomer } from '@/lib/auth/guards';
import { toClientError } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { ensureCaptchaPass } from '@/lib/captcha/pass';
import { ratingsService } from './service';

export type RatingResult = { ok: true } | { ok: false; code: string; detail?: string };
const isNextSignal = (e: unknown) => typeof e === 'object' && e !== null && 'digest' in e && String((e as { digest: unknown }).digest).startsWith('NEXT_');

/** The rider comes from the session; the company and the driver from the booking's trip and ticket. Nothing about them is read from the form. */
export async function submitRatingAction(input: unknown, captchaToken?: string | null): Promise<RatingResult> {
  try {
    const auth = await requireCustomer();
    const db = await createClient();
    await ensureCaptchaPass(db, auth.userId, 'rating', captchaToken);   // no-op while enforcement is off; the rating RPC consumes the pass
    await ratingsService.submit({ db }, input);
  } catch (e) {
    if (isNextSignal(e)) throw e;
    const c = toClientError(e);
    return { ok: false, code: c.code, ...(c.detail ? { detail: c.detail } : {}) };
  }
  revalidatePath('/my-bookings');
  return { ok: true };
}

export type CompanyRatingsResult = { ok: true; ratings: Record<string, { ratings: number; average: number | null }> } | { ok: false };
/** Public (the marketplace is public): the database returns a company's average only from 5 ratings, only for live companies, and at most 100 ids per call. */
export async function loadCompanyRatingsAction(ids: unknown): Promise<CompanyRatingsResult> {
  try {
    const list = Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string' && /^[0-9a-f-]{36}$/i.test(x)).slice(0, 100) : [];
    const rows = await ratingsService.companies({ db: await createClient() }, [...new Set(list)]);
    return { ok: true, ratings: Object.fromEntries(rows.map((r) => [r.companyId, { ratings: r.ratings, average: r.average }])) };
  } catch { return { ok: false }; }   // a failed read means no badge, never an error on the marketplace
}
