'use client';
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { captchaEnforcedAction } from '@/features/captcha/actions';
import { TurnstileWidget, type TurnstileHandle } from './TurnstileWidget';
import type { CaptchaPurpose } from '@/lib/captcha/proof';

/**
 * One gate per protected button.
 *   enforced === false -> widget hidden, `ready` is true, `token` is null (the server ignores it)
 *   enforced === true  -> widget shown, `ready` becomes true only once a token exists
 * After EVERY submit (success or not) call `spent()`: the token is one-time and a fresh challenge is needed for the next attempt.
 * If enforcement is on but NEXT_PUBLIC_TURNSTILE_SITE_KEY is missing, `misconfigured` is true and `ready` stays false (fail closed).
 */
export function useCaptchaGate(purpose: CaptchaPurpose, lang: 'en' | 'ar') {
  const [enforced, setEnforced] = useState<boolean | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const handle = useRef<TurnstileHandle | null>(null);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';

  useEffect(() => { let live = true; captchaEnforcedAction().then((v) => { if (live) setEnforced(v); }); return () => { live = false; }; }, []);

  const onToken = useCallback((t: string | null) => setToken(t), []);
  const spent = useCallback(() => { setToken(null); handle.current?.reset(); }, []);
  const misconfigured = enforced === true && siteKey === '';
  const ready = enforced === false || (enforced === true && !misconfigured && token !== null);

  const widget: ReactElement | null = enforced === true && !misconfigured
    ? <TurnstileWidget siteKey={siteKey} action={purpose} lang={lang} onToken={onToken} handleRef={handle} />
    : null;
  return { enforced, ready, token, spent, widget, misconfigured };
}
