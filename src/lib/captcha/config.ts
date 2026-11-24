import { MIN_SECRET_LENGTH } from './proof';

/** Server-only captcha settings. Fails closed: with enforcement ON and a missing secret, protected actions are refused, never waved through. */
export type CaptchaServerConfig = { turnstileSecret: string; passSecret: string };

export function readCaptchaConfig(env: Record<string, string | undefined> = process.env): CaptchaServerConfig | null {
  const turnstileSecret = env.TURNSTILE_SECRET_KEY?.trim();
  const passSecret = env.CAPTCHA_PASS_SECRET?.trim();
  if (!turnstileSecret || !passSecret || passSecret.length < MIN_SECRET_LENGTH) return null;
  return { turnstileSecret, passSecret };
}
