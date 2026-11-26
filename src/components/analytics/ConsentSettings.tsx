'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { InlineAlert } from '@/ds/feedback/InlineAlert';
import { cx, FOCUS } from '@/ds/primitives/cx';
import { sendConsent } from '@/lib/analytics/client';
import { ANALYTICS_COPY, type AnalyticsLocale } from '@/lib/analytics/copy';
import type { ConsentState } from './AnalyticsClient';

const BTN = cx('min-h-11 rounded-ds-md border border-line-default bg-surface-card px-4 text-base font-medium text-ink-primary', FOCUS);

/** Lives on /privacy: shows the current choice and lets the person change or withdraw it. Withdrawing deletes their recorded data in the database. */
export function ConsentSettings({ locale, state }: { locale: AnalyticsLocale; state: ConsentState }) {
  const t = ANALYTICS_COPY[locale];
  const router = useRouter();
  const [msg, setMsg] = useState<'saved' | 'failed' | null>(null);
  const [busy, setBusy] = useState(false);

  async function change(granted: boolean) {
    setBusy(true);
    const ok = await sendConsent(granted);
    setBusy(false);
    setMsg(ok ? 'saved' : 'failed');
    if (ok) router.refresh();
  }

  const current = state === 'granted' ? t.stateGranted : state === 'denied' ? t.stateDenied : t.stateUnset;
  return (
    <div className="space-y-3 rounded-ds-md border border-line-default bg-surface-card p-4">
      <h2 className="text-base font-semibold text-ink-primary">{t.settingsTitle}</h2>
      <p className="text-sm text-ink-secondary">{current}</p>
      <div className="flex flex-wrap gap-2">
        {state !== 'granted' ? <button type="button" className={BTN} disabled={busy} onClick={() => change(true)}>{t.changeToGranted}</button> : null}
        {state !== 'denied' ? <button type="button" className={BTN} disabled={busy} onClick={() => change(false)}>{t.changeToDenied}</button> : null}
      </div>
      {msg ? <InlineAlert tone={msg === 'saved' ? 'info' : 'error'}>{msg === 'saved' ? t.saved : t.failed}</InlineAlert> : null}
    </div>
  );
}
