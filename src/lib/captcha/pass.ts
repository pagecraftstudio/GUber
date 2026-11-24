import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '@/lib/errors';
import { mapDbError } from '@/lib/db/map-error';
import { readCaptchaConfig, type CaptchaServerConfig } from './config';
import { signProof, type CaptchaPurpose } from './proof';
import { createTurnstileVerifier, type CaptchaVerifier } from './verify';

export type CaptchaDeps = { verifier?: CaptchaVerifier; config?: CaptchaServerConfig | null; now?: () => number; remoteIp?: string };

/** Whether the database currently demands a pass (public.captcha_enforced, callable by anon and signed-in users). */
export async function isCaptchaEnforced(db: SupabaseClient): Promise<boolean> {
  const { data, error } = await db.rpc('captcha_enforced');
  if (error) throw mapDbError(error);   // cannot tell: refuse rather than assume "off"
  return data === true;
}

/**
 * Makes sure the signed-in caller holds a one-time pass for `purpose`, BEFORE the protected RPC runs.
 *   enforcement off  -> nothing to do (the token is ignored; the database consumes nothing)
 *   enforcement on   -> verify token with the provider, sign a short proof, redeem it (the RPC consumes it once)
 * The user id signed into the proof is the one the caller was authenticated as; the database re-checks it against auth.uid().
 */
export async function ensureCaptchaPass(db: SupabaseClient, userId: string, purpose: CaptchaPurpose, token: string | null | undefined, deps: CaptchaDeps = {}): Promise<void> {
  if (!(await isCaptchaEnforced(db))) return;
  const config = deps.config === undefined ? readCaptchaConfig() : deps.config;
  if (!config) throw new AppError('internal', { detail: 'captcha_unavailable', message: 'Captcha is not configured.' });   // fail closed
  if (!token) throw new AppError('forbidden', { detail: 'captcha_required' });
  const verifier = deps.verifier ?? createTurnstileVerifier(config.turnstileSecret);
  const verdict = await verifier.verifyCaptcha(token, purpose, deps.remoteIp);
  if (!verdict.ok) {
    throw verdict.reason === 'unavailable'
      ? new AppError('internal', { detail: 'captcha_unavailable', message: 'Captcha could not be checked. Try again.' })
      : new AppError('forbidden', { detail: 'captcha_invalid' });
  }
  const proof = signProof(config.passSecret, purpose, userId, deps.now?.());
  const { error } = await db.rpc('redeem_captcha_proof', { p_purpose: proof.purpose, p_exp: proof.exp, p_nonce: proof.nonce, p_sig: proof.sig });
  if (error) throw mapDbError(error);
}
