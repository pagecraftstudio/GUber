'use client';
import { useCallback, useRef, useState, type ReactElement } from 'react';
import { authCaptchaConfig, type AuthCaptchaAction } from '@/lib/captcha/auth-captcha';
import { TurnstileWidget, type TurnstileHandle } from './TurnstileWidget';

/**
 * Same contract as useCaptchaGate, for the auth forms. Off -> `ready` is true and nothing renders. On with a site key -> `ready` only once a token exists.
 * On WITHOUT a site key -> `misconfigured`, never ready (fail closed: a login that Supabase would refuse anyway is not offered).
 * Call `spent()` after every attempt: Turnstile tokens are one-time.
 */
export function useAuthCaptcha(action: AuthCaptchaAction, lang: 'en' | 'ar') {
  const cfg = authCaptchaConfig();
  const [token, setToken] = useState<string | null>(null);
  const handle = useRef<TurnstileHandle | null>(null);
  const onToken = useCallback((t: string | null) => setToken(t), []);
  const spent = useCallback(() => { setToken(null); handle.current?.reset(); }, []);
  const misconfigured = cfg.on && cfg.siteKey === null;
  const ready = !cfg.on || (!misconfigured && token !== null);
  const widget: ReactElement | null = cfg.on && cfg.siteKey !== null
    ? <TurnstileWidget siteKey={cfg.siteKey} action={action} lang={lang} onToken={onToken} handleRef={handle} />
    : null;
  return { on: cfg.on, ready, token, spent, widget, misconfigured };
}
