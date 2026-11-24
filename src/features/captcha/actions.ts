'use server';
import { z } from 'zod';
import { requireCustomer } from '@/lib/auth/guards';
import { toClientError } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { ensureCaptchaPass, isCaptchaEnforced } from '@/lib/captcha/pass';

const isNextSignal = (e: unknown) => typeof e === 'object' && e !== null && 'digest' in e && String((e as { digest: unknown }).digest).startsWith('NEXT_');
const purposeSchema = z.enum(['booking', 'subscription']);
export type CaptchaResult = { ok: true } | { ok: false; code: string; detail?: string };

/** Whether the challenge must be shown. Public information (the database answers anon too); never redirects. */
export async function captchaEnforcedAction(): Promise<boolean> {
  try { return await isCaptchaEnforced(await createClient()); } catch { return true; }   // cannot tell -> show the widget (fails safe)
}

/**
 * For the wizard booking, which calls create_my_booking from the browser: verify the token here, redeem the signed proof for the caller,
 * then the browser's RPC consumes the one-time pass. The user id comes from the session, never from the request.
 */
export async function obtainCaptchaPassAction(purpose: unknown, token: unknown): Promise<CaptchaResult> {
  try {
    const p = purposeSchema.parse(purpose);
    const auth = await requireCustomer();
    await ensureCaptchaPass(await createClient(), auth.userId, p, typeof token === 'string' ? token : null);
    return { ok: true };
  } catch (e) {
    if (isNextSignal(e)) throw e;
    const c = toClientError(e instanceof z.ZodError ? new Error('invalid purpose') : e);
    return { ok: false, code: c.code, ...(c.detail ? { detail: c.detail } : {}) };
  }
}
