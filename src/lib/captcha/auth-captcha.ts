/**
 * Captcha on the AUTH endpoints (login, sign-up, password reset), P6c.
 *
 * Why this is not the F3 "pass" model used for bookings: Supabase Auth is called with the public anon key, so a client can skip our
 * server actions and our UI entirely. The ONLY control that cannot be skipped is Supabase's own CAPTCHA protection
 * (Dashboard > Authentication > Attack Protection > Turnstile), which then demands `options.captchaToken` on every password sign-in,
 * sign-up and reset. The app's job is to obtain and send that token. This module only decides whether the UI shows the widget.
 *
 * NEXT_PUBLIC_AUTH_CAPTCHA=on  -> widgets shown, tokens sent. Set it ONLY together with the dashboard switch (DEPLOYMENT.md 2.2).
 * Both references below are literal on purpose: Next.js inlines NEXT_PUBLIC_* only when written as process.env.NAME.
 */
export type AuthCaptchaConfig = { on: boolean; siteKey: string | null };

export function authCaptchaConfig(): AuthCaptchaConfig {
  const on = process.env.NEXT_PUBLIC_AUTH_CAPTCHA === 'on';
  const key = (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '').trim();
  return { on, siteKey: on && key !== '' ? key : null };
}

export type AuthCaptchaAction = 'login' | 'signup' | 'reset';

/** Options for supabase.auth calls: the token only when there is one (an empty token is refused by Supabase when captcha is on). */
export const captchaOptions = (token: string | null | undefined): { captchaToken?: string } => (token ? { captchaToken: token } : {});
