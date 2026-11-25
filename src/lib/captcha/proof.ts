import { createHmac, randomBytes } from 'node:crypto';

/**
 * Signed captcha proof (P6a, migration 0057). The database cannot call Cloudflare, so the server verifies the Turnstile token and signs
 * 'v1|<purpose>|<user id>|<expiry epoch seconds>|<nonce>' with CAPTCHA_PASS_SECRET. redeem_captcha_proof recomputes the same HMAC-SHA256 (hex)
 * with the secret stored by set_captcha_enforcement and stores a ONE-TIME pass. The secret never reaches the browser or a log.
 */
export type CaptchaPurpose = 'booking' | 'subscription' | 'rating';
export type CaptchaProof = { purpose: CaptchaPurpose; exp: number; nonce: string; sig: string };

/** The database refuses an expiry more than 600 s ahead; 120 s is plenty for one RPC round trip. */
export const PROOF_TTL_SECONDS = 120;
export const MIN_SECRET_LENGTH = 32;

export function signProof(secret: string, purpose: CaptchaPurpose, userId: string, nowMs: number = Date.now(), nonce: string = randomBytes(18).toString('base64url')): CaptchaProof {
  if (secret.length < MIN_SECRET_LENGTH) throw new Error('captcha pass secret too short');
  const exp = Math.floor(nowMs / 1000) + PROOF_TTL_SECONDS;
  const sig = createHmac('sha256', secret).update(`v1|${purpose}|${userId}|${exp}|${nonce}`, 'utf8').digest('hex');
  return { purpose, exp, nonce, sig };
}
