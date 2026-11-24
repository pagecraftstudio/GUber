/**
 * verifyCaptcha(token, action): the only place that talks to a captcha provider. Server-side only.
 * Implementations: Cloudflare Turnstile (production) and a deterministic test double.
 */
export type CaptchaFailure = 'missing_token' | 'rejected' | 'action_mismatch' | 'unavailable';
export type CaptchaVerdict = { ok: true } | { ok: false; reason: CaptchaFailure };
export interface CaptchaVerifier { verifyCaptcha(token: string | undefined | null, action: string, remoteIp?: string): Promise<CaptchaVerdict> }

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

export function createTurnstileVerifier(secretKey: string, fetchImpl: FetchLike = fetch as unknown as FetchLike, timeoutMs = 5000): CaptchaVerifier {
  return {
    async verifyCaptcha(token, action, remoteIp) {
      // Turnstile tokens are at most 2048 chars; anything else is refused before a network call.
      if (!token || token.length > 2048) return { ok: false, reason: 'missing_token' };
      const body = new URLSearchParams({ secret: secretKey, response: token });
      if (remoteIp) body.set('remoteip', remoteIp);
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), timeoutMs);
      try {
        const res = await fetchImpl(SITEVERIFY, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: body.toString(), signal: ctl.signal });
        if (!res.ok) return { ok: false, reason: 'unavailable' };
        const j = (await res.json()) as { success?: unknown; action?: unknown };
        if (j.success !== true) return { ok: false, reason: 'rejected' };
        // the widget is rendered with data-action; a token minted for the login form cannot be replayed for a booking
        if (j.action !== action) return { ok: false, reason: 'action_mismatch' };
        return { ok: true };
      } catch {
        return { ok: false, reason: 'unavailable' };   // network error / timeout: fail closed
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/** Test double: accepts exactly the tokens in `valid`, records every call. Never used outside tests. */
export function createFakeVerifier(valid: readonly string[] = ['pass']): CaptchaVerifier & { calls: { token: string | null | undefined; action: string }[] } {
  const calls: { token: string | null | undefined; action: string }[] = [];
  return {
    calls,
    async verifyCaptcha(token, action) {
      calls.push({ token, action });
      if (!token) return { ok: false, reason: 'missing_token' };
      return valid.includes(token) ? { ok: true } : { ok: false, reason: 'rejected' };
    },
  };
}
