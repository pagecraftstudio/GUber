'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Cloudflare Turnstile, rendered explicitly. Shown only when the caller says enforcement is on (see useCaptchaGate).
 * Keyboard: the challenge iframe is natively focusable; the retry control is a real <button>. Arabic: `language` follows `lang`, the wrapper
 * carries dir. Fallback: if the script cannot load, the widget errors, or nothing is solved within FALLBACK_MS, a visible message and a
 * retry button replace silence. The token is one-time: the parent resets the widget after every submit.
 */
type TurnstileApi = {
  render(el: HTMLElement, o: Record<string, unknown>): string;
  reset(id?: string): void;
  remove(id?: string): void;
};
declare global { interface Window { turnstile?: TurnstileApi } }

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const FALLBACK_MS = 12000;
let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.turnstile) return Promise.resolve();
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT_SRC; s.async = true; s.defer = true;
    s.onload = () => (window.turnstile ? resolve() : reject(new Error('turnstile missing')));
    s.onerror = () => { scriptPromise = null; s.remove(); reject(new Error('turnstile blocked')); };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

const TEXT = {
  en: { label: 'Security check', failed: 'The security check did not load. Check your connection or disable content blockers for this site, then retry.', retry: 'Retry security check' },
  ar: { label: 'التحقق الأمني', failed: 'تعذر تحميل التحقق الأمني. تحقق من اتصالك أو عطّل مانع المحتوى لهذا الموقع ثم أعد المحاولة.', retry: 'إعادة التحقق الأمني' },
} as const;

export type TurnstileHandle = { reset: () => void };

export function TurnstileWidget({ siteKey, action, lang, onToken, handleRef }: {
  siteKey: string; action: string; lang: 'en' | 'ar'; onToken: (token: string | null) => void; handleRef?: React.MutableRefObject<TurnstileHandle | null>;
}) {
  const box = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const t = TEXT[lang];

  const reset = useCallback(() => { onToken(null); if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current); }, [onToken]);
  useEffect(() => { if (handleRef) handleRef.current = { reset }; return () => { if (handleRef) handleRef.current = null; }; }, [handleRef, reset]);

  useEffect(() => {
    let cancelled = false;
    let solved = false;
    setFailed(false);
    const timer = setTimeout(() => { if (!solved && !cancelled) setFailed(true); }, FALLBACK_MS);
    loadScript().then(() => {
      if (cancelled || !box.current || !window.turnstile) return;
      widgetId.current = window.turnstile.render(box.current, {
        sitekey: siteKey, action, language: lang === 'ar' ? 'ar' : 'en', theme: 'auto', 'refresh-expired': 'auto', appearance: 'always',
        callback: (token: string) => { solved = true; clearTimeout(timer); setFailed(false); onToken(token); },
        'expired-callback': () => { solved = false; onToken(null); },
        'timeout-callback': () => { solved = false; onToken(null); },
        'error-callback': () => { solved = false; onToken(null); setFailed(true); return true; },
      });
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => {
      cancelled = true; clearTimeout(timer);
      if (widgetId.current && window.turnstile) { try { window.turnstile.remove(widgetId.current); } catch { /* already gone */ } }
      widgetId.current = null; onToken(null);
    };
  }, [siteKey, action, lang, attempt, onToken]);

  return (
    <div role="group" aria-label={t.label} dir={lang === 'ar' ? 'rtl' : 'ltr'} className="space-y-2">
      <div ref={box} />
      {failed ? (
        <div role="alert" className="space-y-2 text-sm">
          <p className="font-medium text-status-error-fg">{t.failed}</p>
          <button type="button" onClick={() => setAttempt((n) => n + 1)} className="rounded-md border border-line-default px-3 py-1.5 font-medium focus-visible:outline focus-visible:outline-2">{t.retry}</button>
        </div>
      ) : null}
    </div>
  );
}
