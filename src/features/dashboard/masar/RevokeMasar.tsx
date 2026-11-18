'use client';
import { useRef, useState } from 'react';
import { formatDateTime, formatNumber } from '@/ds/format';
import { useDsLang } from '@/ds/lang';
import { Button } from '@/ds/primitives/Button';
import { SaveStatus, viewOfInline } from '@/ds/feedback/SaveStatus';
import { useInlineSave } from '@/ds/hooks/useInlineSave';
import type { FutureBooking, RouteSubscription } from '@/features/route-plans/types';
import { loadSubscriptionBookingsAction, revokeSubscriptionAction } from '../autosave-actions';
import { saveLabels } from './text';
import { JP } from './textPlans';

/** Revoke an ACTIVE subscription. Staff first see the member's upcoming bookings and tick the ones to cancel; unticked ones are kept. */
export function RevokeCell({ s }: { s: RouteSubscription }) {
  const lang = useDsLang();
  const t = JP[lang];
  const { pending, result, run } = useInlineSave();
  const dialog = useRef<HTMLDialogElement>(null);
  const [rows, setRows] = useState<FutureBooking[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState('');

  const open = async () => {
    setRows(null); setLoadError(false); setReason('');
    dialog.current?.showModal();
    const r = await loadSubscriptionBookingsAction(s.id);
    if (!r.ok) { setLoadError(true); return; }
    setRows(r.data);
    setPicked(new Set(r.data.filter((b) => b.canCancel).map((b) => b.bookingId)));   // default: cancel everything that can be cancelled
  };
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const cancellable = (rows ?? []).filter((b) => b.canCancel);

  return (
    <div className="flex flex-col gap-1">
      <Button variant="secondary" disabled={pending} onClick={() => { void open(); }} aria-label={`${t.revoke} ${s.memberName}`} className="!h-8 !px-3 text-[13px]">{t.revoke}</Button>
      <SaveStatus view={viewOfInline(result, pending)} labels={saveLabels(lang)} />
      <dialog ref={dialog} aria-labelledby={`rv-${s.id}`} className="w-[min(94vw,34rem)] rounded-2xl border border-line-default bg-surface-card p-5 text-ink-primary backdrop:bg-black/40">
        <h2 id={`rv-${s.id}`} className="font-bold">{t.revokeTitle}</h2>
        <p className="mt-1 text-sm text-ink-secondary">{s.memberName} · {s.planName}</p>
        <p className="mt-2 text-sm text-ink-secondary">{t.revokeText}</p>
        {loadError ? <p role="alert" className="mt-3 text-sm font-medium text-status-error-fg">{t.loadFailed}</p>
          : rows === null ? <p role="status" className="mt-3 text-sm text-ink-secondary">{t.loadingTrips}</p>
          : rows.length === 0 ? <p className="mt-3 text-sm text-ink-secondary">{t.noFuture}</p> : (
            <fieldset className="mt-3">
              <legend className="sr-only">{t.revokeText}</legend>
              <div className="mb-2 flex gap-2">
                <Button variant="ghost" onClick={() => setPicked(new Set(cancellable.map((b) => b.bookingId)))} className="!h-8 !px-2 text-[13px]">{t.selectAll}</Button>
                <Button variant="ghost" onClick={() => setPicked(new Set())} className="!h-8 !px-2 text-[13px]">{t.selectNone}</Button>
              </div>
              <ul className="max-h-64 overflow-y-auto rounded-ds-md border border-line-default">
                {rows.map((b) => (
                  <li key={b.bookingId} className="flex items-start gap-3 border-t border-line-default p-2 first:border-t-0">
                    <input type="checkbox" id={`bk-${b.bookingId}`} checked={picked.has(b.bookingId)} disabled={!b.canCancel} onChange={() => toggle(b.bookingId)} className="mt-1 h-4 w-4" />
                    <label htmlFor={`bk-${b.bookingId}`} className="text-sm">
                      <span className="me-2 rounded-ds-sm bg-surface-muted px-1.5 py-0.5 text-[12px]">{b.direction === 'go' ? t.go : t.ret}</span>
                      {b.originName} → {b.destinationName}
                      <span className="block text-[13px] text-ink-secondary"><span dir="ltr">{formatDateTime(b.departureAt, lang)}</span> · <span dir="ltr">{b.reference}</span>{b.canCancel ? '' : ` · ${t.cannotCancel}`}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <p role="status" className="mt-2 text-sm">{t.cancelChosen(formatNumber(picked.size, lang))}</p>
              <p className="mt-1 text-[13px] text-ink-secondary">{t.keepNote}</p>
            </fieldset>)}
        <label className="mt-3 block text-sm font-medium">{t.reason}
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={2} className="mt-1 w-full rounded-ds-md border border-line-default bg-surface-card p-2 text-sm" />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => dialog.current?.close()}>{t.cancel}</Button>
          <Button disabled={rows === null || loadError} onClick={() => { dialog.current?.close(); run(() => revokeSubscriptionAction(s.id, [...picked], reason)); }}>{t.confirmRevoke}</Button>
        </div>
      </dialog>
    </div>
  );
}
