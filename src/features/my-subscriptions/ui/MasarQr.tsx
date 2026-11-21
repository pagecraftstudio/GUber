'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabaseBrowser } from '@/ui/lib/real/supabaseBrowser';
import { TicketQrImage } from '@/ui/components/public/TicketQrImage';
import { MT } from './text';

const REFRESH_MS = 50_000;   // the token lives 90 s on the server (0052); redrawing every 50 s always leaves a valid one on screen

/**
 * The student's MASAR QR: a short-lived signed token from my_masar_qr(), redrawn every ~50 s while the page is visible. The token text is
 * only ever put into the QR image, never printed. Without a connection the plain ID above still works as the unverified fallback.
 */
export function MasarQr({ lang }: { lang: 'en' | 'ar' }) {
  const t = MT[lang];
  const [token, setToken] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const validUntil = useRef(0);

  const load = useCallback(async () => {
    try {
      const { data, error } = await getSupabaseBrowser().rpc('my_masar_qr');
      const tok = (data as { token?: string; ttl_seconds?: number } | null)?.token;
      if (error || !tok) throw new Error('no token');
      validUntil.current = Date.now() + ((data as { ttl_seconds?: number }).ttl_seconds ?? 90) * 1000;
      setToken(tok); setFailed(false);
    } catch { setFailed(true); }
  }, []);

  useEffect(() => {
    void load();
    const tick = setInterval(() => { if (!document.hidden) void load(); }, REFRESH_MS);
    // coming back to the tab: only reload if what is on screen is about to run out (no request storm on every tab switch)
    const onVisible = () => { if (!document.hidden && validUntil.current - Date.now() < 20_000) void load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(tick); document.removeEventListener('visibilitychange', onVisible); };
  }, [load]);

  return (
    <div className="mt-4 flex flex-col items-start gap-2">
      {token ? <TicketQrImage payload={token} label={t.qrAlt} /> : failed ? null : <div className="h-36 w-36 animate-pulse rounded-lg bg-surface-sunken" aria-hidden="true" />}
      {failed ? (
        <p role="alert" className="text-sm font-medium text-status-error-fg">{t.qrError}{' '}
          <button type="button" onClick={() => void load()} className="underline underline-offset-2">{t.qrRetry}</button></p>
      ) : <p className="text-sm text-ink-secondary">{t.qrHint}</p>}
    </div>
  );
}
